import QtQuick
import "SetupGate.js" as Gate

// The Cloned voice setup row (SetupGate.clonedVoiceStep) uses the same
// setup status reader as local voice, read again after either clone TUI
// ends, after each requirement scan and when the voice the daemon runs
// changes. `provider` is that voice (SetupGate.voiceProvider).
LocalRuntime {
    property string provider: ""
    readonly property var removeState: shell === null ? null : shell.tui.state["clone-voice-remove"]
    readonly property var removedAt: removeState === null || removeState === undefined ? null : removeState.endedAt
    statusKey: "clonedVoiceSetup"
    tuiName: "clone-voice"
    command: ["python3", "-I", program, "clone", "status"]
    shape: value => Gate.clonedVoiceStep(value, provider)
    onRemovedAtChanged: if (removedAt !== null) refresh()
    onProviderChanged: refresh()
}
