import QtQuick
import Quickshell
import Quickshell.Io
import "SetupGate.js" as Gate

// One readiness reader. Every completed setup run and every requirement scan
// triggers a fresh check. While the last scan misses a command of `requires`,
// the published value withholds the setup step (SetupGate.setupValue). A
// reader with a `stepKey` also publishes its optional Setup step from that
// value (SetupGate.optionalStep). Each published check emits `refreshed`.
Item {
    id: root
    property var shell: null
    property string statusKey: "localRuntime"
    property string tuiName: "setup-local"
    property var command: ["python3", "-I", program, "status"]
    // The declared requirement commands the setup TUI needs.
    property var requires: []
    // The Setup group's step this reader's value sets, "" for none.
    property string stepKey: ""
    property bool pending: false
    property bool timedOut: false
    property double startedAt: 0
    property int code: -1
    property string output: ""
    readonly property var tuiState: shell === null ? null : shell.tui.state[tuiName]
    readonly property var endedAt: tuiState === null || tuiState === undefined ? null : tuiState.endedAt
    // Rises after every scan, so an installed or removed command is read again.
    readonly property var requirementsRevision: shell === null ? -1 : shell.requirements.revision
    property string program: String(Qt.resolvedUrl("setup-local")).replace(/^file:\/\//, "")
    onShellChanged: refresh()
    onEndedAtChanged: if (endedAt !== null) refresh()
    onRequirementsRevisionChanged: refresh()
    signal refreshed()

    function refresh() {
        if (shell === null) return;
        if (probe.running) { pending = true; return; }
        pending = false;
        timedOut = false;
        code = -1;
        output = "";
        startedAt = Date.now();
        probe.running = true;
    }
    function publish() {
        let value = { tone: "warning", text: "Setup check failed", action: true };
        try {
            if (timedOut) {
                const problem = Gate.startCause("jarvis: setup=probe-timeout");
                value = { tone: "warning", text: problem.title, hint: problem.action, action: true, lines: [problem.lines[0]] };
            }
            else if (code === 0) value = JSON.parse(output);
        } catch (error) {
            value = { tone: "warning", text: "Setup check returned invalid status", action: true };
        }
        const missing = shell.requirements.missing;
        let published = Gate.setupValue(value, requires, missing);
        if (shell.status.set(statusKey, published) !== "ok") {
            published = Gate.setupValue({ tone: "warning", text: "Setup check returned invalid status", action: true }, requires, missing);
            if (shell.status.set(statusKey, published) !== "ok") throw new Error("jarvis-setup: status=refused");
        }
        if (stepKey !== "" && shell.status.set(stepKey, Gate.optionalStep(stepKey, published)) !== "ok")
            throw new Error("jarvis-setup: status=refused");
        refreshed();
    }
    Process {
        id: probe
        command: root.command
        clearEnvironment: true
        environment: ({
            PATH: Quickshell.env("PATH"), HOME: Quickshell.env("HOME"),
            XDG_STATE_HOME: Quickshell.env("XDG_STATE_HOME"),
            XDG_DATA_HOME: Quickshell.env("XDG_DATA_HOME"),
            XDG_RUNTIME_DIR: Quickshell.env("XDG_RUNTIME_DIR"), LC_ALL: "C.UTF-8"
        })
        stdout: StdioCollector { onStreamFinished: root.output = text }
        stderr: StdioCollector {}
        onExited: (code, status) => root.code = status === 0 ? code : -1
        onRunningChanged: {
            if (running) return;
            root.publish();
            if (root.pending) Qt.callLater(root.refresh);
        }
    }
    Timer {
        id: probeDeadline
        // setup-local status was measured on this machine on 2026-10-10:
        // python3 -I shell/plugins/vgs.jarvis/setup-local status, five
        // runs, median 58.8 ms and max 72.1 ms. The 10000 ms bound leaves
        // room for a slow disk without letting Setup wait forever.
        interval: 10000
        repeat: true
        running: true
        onTriggered: {
            if (!probe.running || root.timedOut || Date.now() - root.startedAt < interval) return;
            root.timedOut = true;
            // Quickshell.Io Process owns this probe child. Setting running
            // false ends the child before the Setup page can wait forever.
            probe.running = false;
            root.publish();
        }
    }
}
