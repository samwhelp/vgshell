import QtQuick
import qs.Commons
import qs.Ui

// The locked state of a control, internal to the module: an enabled
// control whose `disabledReason` is set. Qt gives a disabled item no
// active focus and Tab skips it, so a control a reason disables stays
// Qt-enabled and this takes its actions away instead: a shield over the
// control takes every press while locked, so a click toggles, opens or
// clicks nothing, and `takeKey` takes Space, Return and Enter, the keys
// the control hands it first. `KeyNavLogic.activate` refuses a locked
// control too, since a `Keys.onReturnPressed` handler runs before
// `Keys.onPressed` and stops it (a qml-unit run, 2026-10-13). The control
// draws no hover or press while locked, and its drawn parts bind `fade`,
// the disabled opacity, while the control itself stays opaque, so an
// unlock mark it holds (UnlockMark) draws at full strength. The reason
// shows in the shared Tooltip on hover and on keyboard focus of the
// control, built only while locked. A control the plain Qt `enabled`
// disables is not locked: it keeps its own fade and shows no reason.
Item {
    id: root

    required property Item control
    readonly property bool locked: control.enabled && control.disabledReason !== ""
    readonly property real fade: locked ? Theme.opacity.disabled : 1

    // Whether a locked control takes `event`, so the control never acts.
    function takeKey(event) {
        return locked && [Qt.Key_Space, Qt.Key_Return, Qt.Key_Enter].indexOf(event.key) !== -1;
    }

    anchors.fill: parent
    // Over the control's own parts, which would take a press first; under
    // its unlock mark.
    z: 1

    // pointer-cursor-exempt: it takes the presses of a locked control, which a press cannot change; the control's PointerCursor stands down while locked, so the arrow shows
    // keyboard-path: the control keeps its focus and its keys, which takeKey refuses while locked
    MouseArea {
        anchors.fill: parent
        enabled: root.locked
        acceptedButtons: Qt.AllButtons
    }

    Loader {
        active: root.locked
        sourceComponent: Tooltip {
            objectName: "disabledReasonTip"
            anchorItem: root.control
            text: root.control.disabledReason
        }
    }
}
