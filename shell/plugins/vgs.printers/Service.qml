import QtQuick
import Quickshell
import Quickshell.Io
import "PrintersLogic.js" as Logic

// The Printers service: the one owner of the `lpstat` reads, the change
// watcher bin/printers-watch and the calls to the CUPS D-Bus helper
// (PrintersLogic.js decides; this runs the processes). The pane asks it
// through the plugin's own IPC, which `vgshell ipc call vgs.printers
// invoke <name> <arg>` reaches too:
//   default NAME    make printer NAME the default
//   remove NAME     remove printer NAME
//   add URI         add the found device URI, driverless only
//   address TEXT    add the printer at the address TEXT
//   find            ask CUPS for the devices it can reach
//   retry           read the printers again, and start the watcher again
//                   after it ended
// Each answers `ok`, `busy` while a change runs, or a refusal; a change's
// end is published, never answered.
//
// It publishes the status `printing`, the Settings page's line, with the
// service-cups step's Turn on printing action while CUPS is not running
// and the step applies, and `printers`, the data the pane draws: the
// scheduler's state, the printers, the watcher, the change and the found
// devices.
//
// The list is never polled. The service reads `lpstat` when it starts,
// after the watcher's `ready` and after each CUPS notification it prints,
// a read that comes while one runs read once more after it, and after
// each requirement scan, a system step run that leaves the step ready and
// `retry`, while it has not read the printers. A change's own end reads
// nothing: the list follows CUPS's notification of it.
Item {
    id: root

    // The core assigns the plugin's scoped shell object after creation.
    property var shell: null
    // Whether the IPC handlers are registered, so a settings change that
    // hands over a new object registers nothing twice.
    property bool registered: false
    // Set while the service is destroyed, so the watcher's end it causes
    // is not taken for a failure.
    property bool closing: false

    readonly property var missing: shell === null ? [] : shell.requirements.missing
    readonly property bool lpstatMissing: missing.indexOf("lpstat") !== -1
    readonly property bool watchMissing: missing.indexOf("ipptool") !== -1 || missing.indexOf("dbus-monitor") !== -1
    readonly property bool helperMissing: missing.indexOf("gdbus") !== -1 || missing.indexOf(Logic.HELPER) !== -1
    readonly property int scans: shell === null ? 0 : shell.requirements.revision
    readonly property string step: {
        if (shell === null) return "";
        const found = shell.system.state["service-cups"];
        return found === undefined ? "" : found.state;
    }

    // lpstat's last reading: { state: "unread" }, or lpstatReading's answer.
    property var reading: ({ state: "unread" })
    // The watcher: off, starting, ready, or ended once it exited.
    property string watch: "off"
    property var op: Logic.opIdle()
    // The last find: { state: idle|finding|found|failed, devices }.
    property var found: ({ state: "idle", devices: [] })

    readonly property var printers: reading.state === "read" ? reading.printers : []
    readonly property var printing: Logic.printingView(reading, lpstatMissing, step)
    readonly property var view: ({
        cups: lpstatMissing ? "missing" : reading.state,
        printers: printers,
        watch: watch,
        op: Logic.opView(op),
        found: found,
        helper: helperMissing ? "missing" : "present"
    })

    onShellChanged: {
        if (shell === null || registered) return;
        registered = true;
        shell.ipc.handle("default", arg => root.change("default", arg));
        shell.ipc.handle("remove", arg => root.change("remove", arg));
        shell.ipc.handle("add", arg => root.addFound(arg));
        shell.ipc.handle("address", arg => root.addAddress(arg));
        shell.ipc.handle("find", () => root.begin("find", "", Logic.findSteps()));
        shell.ipc.handle("retry", () => root.retry());
        read();
        publish();
    }
    onViewChanged: publish()
    onPrintingChanged: publish()
    onScansChanged: if (reading.state !== "read") read()
    onStepChanged: if (step === "ready" && reading.state === "down") read()
    Component.onDestruction: closing = true

    function publish() {
        if (shell === null) return;
        const line = shell.status.set("printing", printing);
        if (line !== "ok") console.error("printers: status printing " + line);
        const data = shell.status.set("printers", view);
        if (data !== "ok") console.error("printers: status printers " + data);
    }

    function read() {
        if (shell === null || lpstatMissing) return;
        if (reader.running) {
            reader.again = true;
            return;
        }
        reader.completion = null;
        reader.running = true;
    }

    function retry() {
        if (!watcher.running) watch = "off";
        read();
        return "ok";
    }

    function startWatch() {
        watch = "starting";
        watcher.completion = null;
        watcher.running = true;
    }

    // NAME's printer of the last reading, or undefined.
    function printerNamed(name) { return printers.find(p => p.name === name); }

    function change(kind, name) {
        if (printerNamed(name) === undefined) return "refused: printer=" + JSON.stringify(name) + " reason=unknown";
        return begin(kind, name, kind === "default" ? Logic.defaultSteps(name) : Logic.removeSteps(name));
    }

    function addFound(uri) {
        const device = found.devices.find(d => d.uri === uri);
        if (device === undefined) return "refused: device=" + JSON.stringify(uri) + " reason=unknown";
        if (!device.driverless) return "refused: device=" + JSON.stringify(uri) + " reason=driver";
        const name = Logic.queueName(device.info, printers.map(p => p.name));
        return begin("add", name, Logic.addSteps(name, device.uri, device.info));
    }

    function addAddress(text) {
        const device = Logic.addressDevice(text);
        if (!device.ok) return "refused: address=" + device.problem;
        const name = Logic.queueName(device.host, printers.map(p => p.name));
        return begin("add", name, Logic.addSteps(name, device.uri, device.host));
    }

    // Start a change of KIND on TARGET that makes the helper calls STEPS.
    function begin(kind, target, steps) {
        if (op.phase === "running") return "busy";
        if (helperMissing) return "refused: helper=missing";
        op = Logic.opBegin(kind, target, steps);
        if (kind === "find") found = { state: "finding", devices: found.devices };
        runStep();
        return "ok";
    }

    function runStep() {
        helper.completion = null;
        helper.command = op.steps[op.index];
        helper.running = true;
    }

    function stepEnded(code) {
        const reply = Logic.helperReply(code, helperOutput.text, helperErrors.text);
        if (!reply.ok) console.warn("printers: " + op.kind + " " + JSON.stringify(op.target) + " problem=" + reply.problem + " " + reply.detail);
        op = Logic.opAdvance(op, reply);
        if (op.phase === "running") {
            runStep();
            return;
        }
        if (op.kind === "find")
            found = op.phase === "done" ? { state: "found", devices: Logic.foundDevices(reply.value[1], printers) } : { state: "failed", devices: [] };
    }

    // Each child gets PATH, HOME, which holds the user's lpoptions, CUPS's
    // own server variable and the system bus address, with the C locale, so
    // lpstat prints the lines lpstatReading reads. Under clearEnvironment a
    // null value passes the shell's own value through (Quickshell 0.3.1,
    // Process.clearEnvironment).
    readonly property var childEnvironment: ({ PATH: null, HOME: null, CUPS_SERVER: null, DBUS_SYSTEM_BUS_ADDRESS: null, LC_ALL: "C" })

    // A command that fails to start emits only runningChanged, so each end
    // is read there: no exit recorded is a failed start.
    Process {
        id: reader
        property var completion: null
        property bool again: false
        command: Logic.LPSTAT_ARGV
        clearEnvironment: true
        environment: root.childEnvironment
        stdout: StdioCollector { id: readOutput }
        stderr: StdioCollector { id: readErrors }
        onExited: (code, status) => { reader.completion = { code: code }; }
        onRunningChanged: {
            if (running) return;
            const code = reader.completion === null ? -1 : reader.completion.code;
            const reading = Logic.lpstatReading(code, readOutput.text);
            if (reading.state === "failed") console.warn("printers: lpstat reason=" + reading.reason + " " + readErrors.text.trim());
            root.reading = reading;
            if (reading.state === "read" && root.watch === "off" && !root.watchMissing) root.startWatch();
            if (reader.again) {
                reader.again = false;
                root.read();
            }
        }
    }

    // Quickshell ends a removed service's child with SIGKILL; setpriv's
    // pdeathsig also ends the watcher if the shell dies, and its stdin,
    // held open and never written, ends it once the shell is gone. The
    // watcher's own second process cancels the subscription in each case.
    Process {
        id: watcher
        property var completion: null
        stdinEnabled: true
        command: ["setpriv", "--pdeathsig", "TERM", "--", String(Qt.resolvedUrl("bin/printers-watch")).replace(/^file:\/\//, "")]
        clearEnvironment: true
        environment: root.childEnvironment
        stdout: SplitParser {
            onRead: line => {
                const event = Logic.watchLine(line);
                if (event.kind === "ready") {
                    root.watch = "ready";
                    root.read();
                } else if (event.kind === "event") {
                    root.read();
                } else {
                    console.warn("printers: watcher line unknown: " + line);
                }
            }
        }
        stderr: StdioCollector { id: watchErrors }
        onExited: (code, status) => { watcher.completion = { code: code }; }
        onRunningChanged: {
            if (running || root.closing) return;
            const code = watcher.completion === null ? "not-started" : watcher.completion.code;
            console.warn("printers: watcher ended exit=" + code + " " + watchErrors.text.trim().split("\n")[0]);
            root.watch = "ended";
            root.read();
        }
    }

    Process {
        id: helper
        property var completion: null
        clearEnvironment: true
        environment: root.childEnvironment
        stdout: StdioCollector { id: helperOutput }
        stderr: StdioCollector { id: helperErrors }
        onExited: (code, status) => { helper.completion = { code: code }; }
        onRunningChanged: {
            if (running || root.closing) return;
            root.stepEnded(helper.completion === null ? -1 : helper.completion.code);
        }
    }
}
