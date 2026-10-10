import QtQuick
import Quickshell
import Quickshell.Io
import "SetupGate.js" as Gate

// The Local voice setting's one reader and writer. `setup-local choices`
// runs when the shell is first set, after every requirement scan and after
// every local setup run ends; its offers become the `localTiers` choices.
// A change of `localTier` starts the wanted tier's download in the floating
// TUI (SetupGate.tierRun); after a run ends, the setting follows the tier
// it left ready (SetupGate.tierAfterRun). A start and the service's own
// write start no run.
Item {
    id: root
    property var shell: null
    // { pick, ready, choices } from the last read, null before one and
    // after a failed one: no run starts and no setting is written then.
    property var reading: null
    // The setting value last acted on, null before the shell is set.
    property var decided: null
    property bool pending: false
    // A run ended and the read that follows it has not answered yet.
    property bool afterRun: false
    property int code: -1
    property string output: ""
    readonly property string wanted: shell === null ? "" : shell.settings.localTier
    readonly property var tuiState: shell === null ? null : shell.tui.state["setup-local"]
    readonly property var endedAt: tuiState === null || tuiState === undefined ? null : tuiState.endedAt
    readonly property var requirementsRevision: shell === null ? -1 : shell.requirements.revision
    property string program: String(Qt.resolvedUrl("setup-local")).replace(/^file:\/\//, "")
    property var command: ["python3", "-I", program, "choices"]
    onShellChanged: {
        if (shell === null || decided !== null) return;
        decided = wanted;
        refresh();
    }
    onWantedChanged: decide()
    onEndedAtChanged: {
        if (endedAt === null) return;
        afterRun = true;
        refresh();
    }
    onRequirementsRevisionChanged: refresh()

    function refresh() {
        if (shell === null) return;
        if (reader.running) { pending = true; return; }
        pending = false;
        code = -1;
        output = "";
        reader.running = true;
    }

    // Start the run a change of the setting asks for, judged on a read that
    // answered after the last run's end.
    function decide() {
        if (shell === null || decided === null || reading === null || afterRun || wanted === decided) return;
        decided = wanted;
        const args = Gate.tierRun(wanted, reading.pick, reading.ready);
        if (args === null) return;
        const answer = shell.tui.run("setup-local", args);
        if (answer !== "ok") console.warn("jarvis-tier: run=" + answer);
    }

    function answered() {
        let value = null;
        try { if (code === 0) value = JSON.parse(output); } catch (error) {}
        const shaped = value !== null && typeof value === "object" && typeof value.pick === "string"
            && (value.ready === null || typeof value.ready === "string") && Array.isArray(value.choices);
        if (!shaped) console.warn("jarvis-tier: choices=" + (code === 0 ? "invalid" : "exit code=" + code));
        reading = shaped ? value : null;
        if (shell.status.set("localTiers", shaped ? value.choices : []) !== "ok") throw new Error("jarvis-tier: status=refused");
        // A read that started before the run ended answers for the state
        // before it; the read after it judges the end.
        if (pending) return;
        const ended = afterRun;
        afterRun = false;
        const next = ended && reading !== null ? Gate.tierAfterRun(wanted, reading.pick, reading.ready) : null;
        if (next === null) decide();
        // The written tier is ready, so the setting it delivers starts no run.
        else if (shell.configure.set("localTier", next) !== "ok") console.warn("jarvis-tier: setting=refused");
    }

    Process {
        id: reader
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
            root.answered();
            if (root.pending) Qt.callLater(root.refresh);
        }
    }
}
