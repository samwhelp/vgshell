import QtQuick
import qs.Commons
import qs.Ui

// The unlock mark of a locked toggle, internal to the module: a lock-open
// IconButton `stack.inline` after the toggle's body, built only while the
// toggle is locked (DisabledReason) and its `unlock` is set. `unlock` is
// `{ label, run }`, the words of the one step the user takes to unlock the
// toggle and the function that takes it, the shape of a setup step's
// action; another value is logged and draws no mark. The mark names the
// step, a click on it, or Space or Enter, calls `run`, and it is the Tab
// stop after the toggle. With the keyboard on it, the mark shows the
// toggle's reason; under the pointer the toggle's own reason shows, since
// the mark lies inside the toggle and a second tooltip would repeat it.
// `room` is the width the toggle keeps after its body for the mark, 0
// without it. The mark is a toggle's own part, so an IconButton, which
// extends Button, holds none: Button cannot contain its own kind.
Loader {
    id: root

    required property Item control
    // Where the toggle's body ends, and the height the mark centres on.
    required property real bodyEnd
    required property real centreY
    readonly property bool valid: shaped(control.unlock)
    readonly property real room: item !== null ? Theme.stack.inline + item.width : 0

    function shaped(unlock) {
        if (unlock === null || unlock === undefined) return false;
        if (typeof unlock === "object" && typeof unlock.label === "string" && unlock.label !== "" && typeof unlock.run === "function") return true;
        console.error("UnlockMark: unlock=" + JSON.stringify(unlock) + " unexpected; want { label, run }");
        return false;
    }

    active: control.lock.locked && valid
    x: bodyEnd + Theme.stack.inline
    y: Math.round(centreY - height / 2)
    // Over the toggle's shield (DisabledReason), which takes every other
    // press on the locked toggle.
    z: 2

    sourceComponent: IconButton {
        size: "sm"
        iconName: "lock-open"
        label: root.valid ? root.control.unlock.label : ""
        tooltip: visualFocus ? root.control.disabledReason : ""
        onClicked: root.control.unlock.run()
    }
}
