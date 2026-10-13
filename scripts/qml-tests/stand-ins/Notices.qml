pragma Singleton
import QtQml

// The members of the real Notices the Hyprland layer writes, and the
// answer it reads.
QtObject {
    property var consent: null
    property var consentState: null
    property string welcome: "reading"

    signal consentAnswered(string answer)
}
