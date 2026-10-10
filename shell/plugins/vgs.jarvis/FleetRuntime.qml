import QtQuick
import Quickshell

// The Agent fleet row (SetupGate.fleetStep) uses the same setup status
// reader as local voice, read again after its setup terminal ends and after
// each requirement scan. Qt defines no order between this command's binding
// and LocalRuntime's own handler of a new shell, which a changed home
// setting brings, so a changed command reads again.
LocalRuntime {
    statusKey: "setupFleet"
    tuiName: "setup-fleet"
    program: String(Qt.resolvedUrl("backend/fleet-setup.js")).replace(/^file:\/\//, "")
    command: ["node", program, "--tree", Quickshell.shellDir + "/..", "status", shell === null ? "" : shell.settings.home]
    onCommandChanged: refresh()
}
