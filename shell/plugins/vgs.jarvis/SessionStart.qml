import QtQuick
import Quickshell
import Quickshell.Io
import "SetupGate.js" as Gate

// The Start Jarvis at boot setting. This instance's build, at shell start,
// starts the user's own Jarvis session once while the setting is on
// (backend/session-start.js, which starts nothing while a session of that
// name runs). A later change of the setting, the account or the home folder
// starts nothing: it reads what the next start would meet. Each answer is
// the Jarvis session row, whose hint the setting shows, and the session
// choices are offered only while the setting is on.
Item {
    id: root
    property var shell: null
    // What the last run read, as JSON; "" before this instance's first.
    property string judged: ""
    property bool pending: false
    property string output: ""
    readonly property string program: String(Qt.resolvedUrl("backend/session-start.js")).replace(/^file:\/\//, "")
    onShellChanged: settle()

    function publish(wanted, kind) {
        if (shell.status.set("sessionModes", Gate.sessionModes(wanted)) !== "ok"
                || shell.status.set("sessionStart", Gate.sessionStart(wanted, kind)) !== "ok")
            throw new Error("jarvis-session: status=refused");
    }

    // A new `shell` is any changed setting, so only a change of what the
    // helper reads runs it again. The handler reads `shell`, not a binding
    // of it: Qt defines no order between a binding and this handler.
    function settle() {
        if (shell === null) return;
        if (helper.running) { pending = true; return; }
        pending = false;
        const read = { wanted: shell.settings.startAtBoot, account: shell.settings.brain, home: shell.settings.home };
        const first = judged === "";
        if (JSON.stringify(read) === judged) return;
        judged = JSON.stringify(read);
        if (!read.wanted) { publish(false, ""); return; }
        // The session choices and the hint stand before the helper answers.
        publish(true, "ready");
        output = "";
        helper.command = ["node", program, "--tree", Quickshell.shellDir + "/..", first ? "start" : "check", read.account, read.home]
            .concat(first ? [shell.settings.bootSession === "new" ? "new" : "resume"] : []);
        helper.running = true;
    }

    function answered() {
        let kind = "failed";
        try { kind = JSON.parse(output).kind; } catch (error) { console.warn("jarvis-session: start=no-answer"); }
        if (shell !== null && shell.settings.startAtBoot) publish(true, kind);
        if (pending) Qt.callLater(settle);
    }

    Process {
        id: helper
        // The session is the user's own program on the user's own tmux
        // server, so it takes the shell's session environment, less
        // VGSHELL_RUNNER_PID, which marks the shell's own processes: a null
        // value removes a variable from the inherited environment while
        // clearEnvironment is false. Quickshell 0.3.1,
        // https://quickshell.org/docs/v0.3.1/types/Quickshell.Io/Process
        environment: ({ VGSHELL_RUNNER_PID: null })
        stdout: StdioCollector { onStreamFinished: root.output = text }
        onRunningChanged: if (!running) root.answered()
    }
}
