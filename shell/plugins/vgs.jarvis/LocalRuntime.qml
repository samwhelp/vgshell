import QtQuick
import Quickshell
import Quickshell.Io
import "SetupGate.js" as Gate

// One readiness reader. Every completed setup run and every requirement scan
// triggers a fresh check. While the last scan misses a command of `requires`,
// the published value withholds the setup step (SetupGate.setupValue). A
// reader's `shape` turns that value into the one it publishes. Each
// published check emits `refreshed`.
Item {
    id: root
    property var shell: null
    property string statusKey: "localRuntime"
    property string tuiName: "setup-local"
    property var command: ["python3", "-I", program, "status"]
    // The declared requirement commands the setup TUI needs.
    property var requires: []
    property var shape: value => value
    property bool pending: false
    property bool timedOut: false
    property int code: -1
    property string output: ""
    readonly property string setupCause: timedOut ? "setup=probe-timeout" : ""
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
        probe.running = true;
        probeDeadline.restart();
    }
    function publish() {
        let value = { tone: "warning", text: "Setup check failed", action: true };
        try {
            if (timedOut) {
                const problem = Gate.startCause(setupCause);
                value = { tone: "warning", text: problem.title, hint: problem.action, action: true, lines: [problem.lines[0]] };
            }
            else if (code === 0) value = JSON.parse(output);
        } catch (error) {
            value = { tone: "warning", text: "Setup check returned invalid status", action: true };
        }
        const missing = shell.requirements.missing;
        if (shell.status.set(statusKey, shape(Gate.setupValue(value, requires, missing))) !== "ok"
                && shell.status.set(statusKey, shape(Gate.setupValue({ tone: "warning", text: "Setup check returned invalid status", action: true }, requires, missing))) !== "ok")
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
            probeDeadline.stop();
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
        repeat: false
        onTriggered: {
            root.timedOut = true;
            // Quickshell.Io Process owns this probe child. Setting running
            // false ends the child before the Setup page can wait forever.
            probe.running = false;
            root.publish();
        }
    }
}
