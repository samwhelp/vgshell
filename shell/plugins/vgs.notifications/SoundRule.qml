import QtQuick
import Quickshell
import Quickshell.Io
import "NotificationLogic.js" as Logic

// The sound rule's install: the WirePlumber script wireplumber/
// vgs-notification-sounds.lua, which holds an app's own notification sound
// silent from its first sample while AppSounds asks for it. The service
// builds this when it starts, never on a mute toggle. It copies the script
// into WirePlumber's user scripts directory and writes the one
// configuration fragment that loads that copy by its absolute path, each
// only when absent or different: the plugin runs from a snapshot under
// the session's runtime directory (Registry.qml, `sourceDir`), which a
// later login's WirePlumber, started before the shell, would not find.
// Then it reads whether WirePlumber runs the rule at this script's
// version, and if not restarts WirePlumber once for that version, a marker
// beside the service's state file saying which version it restarted for.
// A failed step logs one keyed line and leaves the rule as it is:
// AppSounds then mutes by reaction alone. Each line is an info line: the
// user has nothing to do, and a sandbox without the session's systemd or
// PipeWire reaches every one of them.
Item {
    id: rule

    visible: false

    readonly property string shippedPath: String(Qt.resolvedUrl("wireplumber/vgs-notification-sounds.lua")).replace(/^file:\/\//, "")
    readonly property string scriptDir: (Quickshell.env("XDG_DATA_HOME") || (Quickshell.env("HOME") + "/.local/share")) + "/wireplumber/scripts"
    readonly property string scriptPath: scriptDir + "/vgs-notification-sounds.lua"
    readonly property string confDir: (Quickshell.env("XDG_CONFIG_HOME") || (Quickshell.env("HOME") + "/.config")) + "/wireplumber/wireplumber.conf.d"
    readonly property string confPath: confDir + "/90-vgs-notification-sounds.conf"
    readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")) + "/vgshell/notifications"
    readonly property string markerPath: stateDir + "/sound-rule-restarted"

    // installing, reading, restarting, running, refused (restarted for this
    // version already) or failed.
    property string phase: "installing"
    readonly property bool running: phase === "running"
    property string version: ""
    // The shipped script's text, null until read.
    property var shipped: null
    // The copy's text, "" while there is none; null until read.
    property var copied: null
    // The marker's version, "" while there is none; null until read.
    property var marker: null
    // The fragment's text, "" while there is none; null until read.
    property var installed: null
    // How many reads a restart has waited through.
    property int waited: 0
    // Reads after a restart, one every pollInterval ms, at most pollLimit:
    // systemctl returns once the unit has started, and WirePlumber loads
    // its scripts after that.
    readonly property int pollInterval: 500
    readonly property int pollLimit: 20

    function state() {
        return { phase: phase, version: version };
    }

    function stop(line) {
        phase = "failed";
        console.info("notifications: sound rule: " + line);
    }

    // Each step waits for what it reads: the script, its copy, the
    // fragment and the marker, then the directories.
    function install() {
        if (phase !== "installing" || shipped === null || copied === null || installed === null || marker === null) return;
        dirs.running = true;
    }

    // setText skips text equal to what the view holds, and then saves
    // nothing.
    function writeFragment() {
        const fragment = Logic.soundRuleFragment(scriptPath, version);
        if (installed === fragment) written();
        else confFile.setText(fragment);
    }

    function written() {
        phase = "reading";
        reader.running = true;
    }

    function read(text) {
        const found = Logic.soundRuleRunning(text);
        if (!found.ok) {
            stop("read=failed error=" + found.error);
            return;
        }
        if (phase === "restarting") {
            if (found.version === version) phase = "running";
            else if (++waited < pollLimit) poll.restart();
            else stop("running=absent version=" + version + " after=restart");
            return;
        }
        const step = Logic.soundRuleStep(version, found.version, marker);
        if (step === "running") {
            phase = "running";
        } else if (step === "refused") {
            phase = "refused";
            console.info("notifications: sound rule: restart=refused version=" + version + " running=" + JSON.stringify(found.version));
        } else {
            markerFile.setText(version + "\n");
        }
    }

    FileView {
        id: shippedFile
        path: rule.shippedPath
        watchChanges: false
        printErrors: false
        onLoaded: {
            rule.shipped = text();
            rule.version = Logic.soundRuleVersion(rule.shipped);
            rule.install();
        }
        onLoadFailed: error => rule.stop("script=unreadable path=" + rule.shippedPath + " error=" + FileViewError.toString(error))
    }

    FileView {
        id: copyFile
        path: rule.scriptPath
        watchChanges: false
        atomicWrites: true
        printErrors: false
        onLoaded: {
            rule.copied = text();
            rule.install();
        }
        onLoadFailed: error => {
            if (error !== FileViewError.FileNotFound) {
                rule.stop("copy=unreadable path=" + rule.scriptPath + " error=" + FileViewError.toString(error));
                return;
            }
            rule.copied = "";
            rule.install();
        }
        onSaved: rule.writeFragment()
        onSaveFailed: error => rule.stop("copy=failed path=" + rule.scriptPath + " error=" + FileViewError.toString(error))
    }

    FileView {
        id: confFile
        path: rule.confPath
        watchChanges: false
        atomicWrites: true
        printErrors: false
        onLoaded: {
            rule.installed = text();
            rule.install();
        }
        onLoadFailed: error => {
            if (error !== FileViewError.FileNotFound) {
                rule.stop("fragment=unreadable path=" + rule.confPath + " error=" + FileViewError.toString(error));
                return;
            }
            rule.installed = "";
            rule.install();
        }
        onSaved: rule.written()
        onSaveFailed: error => rule.stop("fragment=failed path=" + rule.confPath + " error=" + FileViewError.toString(error))
    }

    FileView {
        id: markerFile
        path: rule.markerPath
        watchChanges: false
        atomicWrites: true
        printErrors: false
        onLoaded: {
            rule.marker = text().trim();
            rule.install();
        }
        onLoadFailed: error => {
            if (error !== FileViewError.FileNotFound) {
                rule.stop("marker=unreadable path=" + rule.markerPath + " error=" + FileViewError.toString(error));
                return;
            }
            rule.marker = "";
            rule.install();
        }
        // The marker is written before the restart, so a restart that ends
        // the shell or fails is never asked twice for one version.
        onSaved: {
            rule.phase = "restarting";
            restart.running = true;
        }
        onSaveFailed: error => rule.stop("marker=failed path=" + rule.markerPath + " error=" + FileViewError.toString(error))
    }

    // FileView writes into a directory that exists; the copy's, the
    // fragment's and the marker's are made first.
    Process {
        id: dirs
        property var completion: null
        command: ["mkdir", "-p", "--", rule.scriptDir, rule.confDir, rule.stateDir]
        onExited: (code, status) => { completion = { code: code, status: status }; }
        onRunningChanged: {
            if (running) return;
            const done = completion;
            completion = null;
            if (done === null || done.code !== 0) {
                rule.stop("directories=failed exit=" + JSON.stringify(done));
                return;
            }
            if (rule.copied === rule.shipped) rule.writeFragment();
            else copyFile.setText(rule.shipped);
        }
    }

    // pw-dump, systemctl and pw-cli need the program path and the session's
    // PipeWire or bus alone; under clearEnvironment a null value passes the
    // shell's own value through (Quickshell 0.3.1, Process.clearEnvironment).
    Process {
        id: reader
        property var completion: null
        command: ["pw-dump"]
        clearEnvironment: true
        environment: ({ PATH: null, XDG_RUNTIME_DIR: null, PIPEWIRE_RUNTIME_DIR: null, PIPEWIRE_REMOTE: null, LANG: "C.UTF-8" })
        stdout: StdioCollector { id: dumped }
        onExited: (code, status) => { completion = { code: code, status: status }; }
        onRunningChanged: {
            if (running) return;
            const done = completion;
            completion = null;
            if (done === null || done.code !== 0) rule.stop("read=failed exit=" + JSON.stringify(done));
            else rule.read(dumped.text);
        }
    }

    Process {
        id: restart
        property var completion: null
        command: ["systemctl", "--user", "restart", "wireplumber.service"]
        clearEnvironment: true
        environment: ({ PATH: null, XDG_RUNTIME_DIR: null, DBUS_SESSION_BUS_ADDRESS: null, LANG: "C.UTF-8" })
        stderr: StdioCollector { id: restartErr }
        onExited: (code, status) => { completion = { code: code, status: status }; }
        onRunningChanged: {
            if (running) return;
            const done = completion;
            completion = null;
            if (done === null || done.code !== 0) {
                rule.stop("restart=failed version=" + rule.version + " exit=" + JSON.stringify(done) + " " + restartErr.text.trim().split("\n")[0]);
                return;
            }
            rule.waited = 0;
            reader.running = true;
        }
    }

    Timer {
        id: poll
        interval: rule.pollInterval
        onTriggered: reader.running = true
    }
}
