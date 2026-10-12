import QtQuick
import Quickshell
import Quickshell.Io
import "SetupGate.js" as Gate

// The user's Jarvis session as the Jarvis package's session command owns it
// (backend/session-control.js). This instance's build, at shell start or
// when the user enables Jarvis, makes the one automatic call: the package
// starts the session after the app's Off or, while Start Jarvis at boot is
// on, for a boot it has not handled, and answers the session as it is for
// any other. The Start and Retry actions ask for a start, a changed account
// or home replaces a session that lives, and each opening of the Jarvis
// page reads the session again. A read starts nothing. turnedOff() is the
// user's Off: it stops the session in a process that outlives this service.
// Each answer is the Jarvis session row.
Item {
    id: root
    property var shell: null
    // The account and home the last call read, as JSON; "" before the build's.
    property string judged: ""
    // The home that call read: a change stops the session there.
    property string judgedHome: ""
    // The helper's last answer, null before the first.
    property var result: null
    // The calls that wait for the running one, oldest first.
    property var waiting: []
    property string output: ""
    readonly property string program: String(Qt.resolvedUrl("backend/session-control.js")).replace(/^file:\/\//, "")
    readonly property bool wanted: shell !== null && shell.settings.startAtBoot
    onWantedChanged: publish()
    readonly property bool pageViewed: shell !== null && shell.status.viewed
    onPageViewedChanged: if (pageViewed && judged !== "") call(["status", shell.settings.home])
    onShellChanged: {
        if (shell === null) return;
        // A new `shell` is any changed setting, so only a change of what a
        // call reads makes one. The handler reads `shell`, not a binding of
        // it: Qt defines no order between a binding and this handler.
        const settings = shell.settings;
        const read = JSON.stringify({ account: settings.brain, home: settings.home });
        const mode = settings.bootSession === "new" ? "new" : "resume";
        if (judged === "") {
            // The TUI step behind the row's Start and Retry (tui/start-session.sh).
            shell.ipc.handle("start-session", () => {
                const now = root.shell.settings;
                root.call(["start", now.brain, now.home, now.bootSession === "new" ? "new" : "resume"]);
                return "ok";
            });
            call(["build", settings.brain, settings.home, mode, settings.startAtBoot ? "on" : "off"]);
        } else if (read !== judged) call(["change", judgedHome, settings.brain, settings.home, mode]);
        judged = read;
        judgedHome = settings.home;
        publish();
    }

    function publish() {
        if (shell === null) return;
        if (shell.status.set("sessionModes", Gate.sessionModes(shell.settings.startAtBoot)) !== "ok"
                || shell.status.set("sessionStart", Gate.sessionStart(shell.settings.startAtBoot, result)) !== "ok")
            throw new Error("jarvis-session: status=refused");
    }

    function call(args) {
        if (helper.running) {
            // A status read adds nothing behind a call that answers the session.
            if (args[0] !== "status" || waiting.length === 0) waiting = waiting.concat([args]);
            return;
        }
        output = "";
        helper.command = ["node", program, "--tree", Quickshell.shellDir + "/.."].concat(args);
        helper.running = true;
    }

    function answered() {
        try { result = JSON.parse(output); }
        catch (error) {
            console.warn("jarvis-session: control=no-answer");
            result = { kind: "failed" };
        }
        publish();
        if (waiting.length === 0) return;
        const next = waiting[0];
        waiting = waiting.slice(1);
        Qt.callLater(() => root.call(next));
    }

    // The core calls this on the service when the user disables the plugin,
    // before it destroys the service; a reload and a shell exit do not.
    function turnedOff() {
        if (shell === null) return;
        const reply = shell.run.detached(["node", program, "--tree", Quickshell.shellDir + "/..", "stop", shell.settings.home, "app-off"]);
        if (reply !== "ok") console.warn("jarvis-session: stop " + reply);
    }

    Process {
        id: helper
        // The package's command takes the shell's session environment, which
        // the helper passes on less the shell's own marks: the session is the
        // user's own program.
        stdout: StdioCollector { onStreamFinished: root.output = text }
        onRunningChanged: if (!running) root.answered()
    }
}
