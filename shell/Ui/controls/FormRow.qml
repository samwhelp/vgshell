import QtQuick
import QtQuick.Templates as T
import qs.Commons
import qs.Ui

// The one key/value row: a label column `field.labelWidth` wide, then the
// control slot, `field.labelGap` after the column, bounded by
// `control.maxWidth`. The control stays on the value column's start edge. The row box is `row.height` tall unless its label wraps or its
// control is taller, so every key/value row of a page shares one height. A
// one-line label is placed by capital height, a label of more lines is
// centred, and the control is centred by its box. A control taller than the
// row is one of two cases. One that is a single box, such as a text area,
// grows the row box, and a one-line label and its info button centre on
// that box. One that wraps into lines, such as a RowActions, declares
// `firstLineHeight`, the height of its first line while it wraps, and a
// one-line label and its info button centre on that line, as they do
// beside a one-line control; such a control grows the row, so its first
// line starts at the row box's top. A label too long for its
// column wraps onto as many lines as it needs and never elides; the row
// grows to hold them. `labelTooltip`, when set, is the label's tooltip on
// hover and keyboard focus. It opens to the label's right, centred on the
// label's box, ends on the row's end edge and moves no row. Past the
// control's drawn end (Theme.inkEnd), `tooltip.gap` after it, where its
// text wrapped to the room left there reaches no further than `stack.row`
// above or below that box, so it covers neither its own control nor a row
// beside it. Otherwise, as beside a control that fills the value column,
// it opens on the value column's start edge, wrapped to the whole column,
// over its own control. `warning` is the row's message:
// text in the role `warningRole` names, `hint` unless set, under the value
// column, `field.gap` below the row box and
// wrapped to the column, in the colour `warningTone` names, `warning`,
// `danger` or `muted`. `warningLink`, when set, names the substring of
// `warning` that opens a cited file through `warningLinkActivated`. The
// row grows by the gap and the message's height, and the label and the
// control stay centred on the row box, so a message takes no room from its
// control. Light feedback in a form is this line, plain sentence-case text
// in a muted or status colour. A chip, a fill or capitals are for a state
// the user must act on now, with the action beside it. `action` is one
// control for the message, such as a RowAction that undoes what the message
// names: it draws on the message's line, on the row's end edge, only while
// the row has a message, and the message wraps `stack.inline` before it.
// It centres on the message and keeps the message's height: an action
// taller than the message overhangs it and does not count in `inkBelow()`,
// so showing or hiding it moves no row and no heading below.
// Where that would leave the message less than `field.labelWidth`, as in a
// narrow flyout, the action goes on a line of its own, `field.gap` under
// the message, from the value column's start. While the row has a message
// it takes room under it, so the next row of its column starts
// `stack.group` below the message (Theme.subTextRoom).
// A hidden action takes no room. While
// `labelColumn` is false the row draws no label and keeps
// no row height: the control takes the full width at its own height, as a
// Field whose label stands above its control does. `valueX` is where the
// value column starts, for content that belongs under it, and
// `valueBottom` where the value's box ends in the row, for content under
// the value. Width comes from
// the parent. `inkBelow()` is how far above its bottom edge the row's
// lowest drawn part ends, its label, its control as drawn, its message or
// an action on a line of its own under that message, since the control
// centres in a taller row box. `inkAbove()` is how far below its top edge
// the highest drawn part starts, its label or its control as drawn.
Item {
    id: root

    property string label: ""
    property string warning: ""
    property string warningLink: ""
    property string warningTone: "warning"
    property string warningRole: "hint"
    property string info: ""
    property string labelTooltip: ""
    property bool labelColumn: true
    default property alias control: slot.data
    property alias action: actionSlot.data
    readonly property Item actionItem: actionSlot.visibleChildren.length > 0 ? actionSlot.visibleChildren[0] : null
    readonly property bool actionBelow: actionItem !== null && valueRoom - actionItem.width - Theme.stack.inline < Theme.field.labelWidth
    readonly property real actionRoom: actionItem === null || actionBelow ? 0 : actionItem.width + Theme.stack.inline
    readonly property real messageLine: actionBelow ? message.height + Theme.field.gap + actionItem.height : message.height
    readonly property real valueX: labelColumn ? Theme.field.labelWidth + Theme.field.labelGap : 0
    readonly property real valueRoom: Math.max(0, width - valueX)
    readonly property real valueBottom: slot.y + slot.height
    readonly property real messageRoom: warning === "" ? 0 : Theme.field.gap + messageLine
    readonly property real controlEnd: {
        let end = 0;
        for (const child of slot.children) {
            if (child.visible) end = Math.max(end, child.x + Theme.inkEnd(child));
        }
        return slot.x + end;
    }
    readonly property real besideX: controlEnd + Theme.tooltip.gap
    readonly property real besideWrap: Math.min(Theme.tooltip.maxWidth, width - besideX - 2 * Theme.tooltip.paddingX)
    readonly property bool explainBeside: besideWrap > 0 && besideMeasure.implicitHeight + 2 * Theme.tooltip.paddingY <= labelBox + 2 * Theme.stack.row
    readonly property real subTextRoom: Theme.subTextRoom(warning !== "", Positioner.index, Positioner.isLastItem, parent)
    // Where the message's line ends, above the room under it.
    readonly property real messageBottom: height - subTextRoom
    readonly property real boxHeight: messageBottom - messageRoom
    // The box a one-line label and its info button centre on.
    readonly property real labelBox: {
        if (labelText.lineCount > 1) return boxHeight;
        for (const child of slot.children) {
            if (child.visible && child.firstLineHeight > 0) return child.firstLineHeight;
        }
        return boxHeight;
    }
    signal warningLinkActivated()

    function inkBelow() {
        let bottom = labelColumn && label !== "" ? labelText.y + labelText.height - labelText.inkBelow() : 0;
        for (const child of slot.children) {
            if (child.visible) bottom = Math.max(bottom, slot.y + child.y + child.height - Theme.inkBelow(child));
        }
        if (message.visible) bottom = Math.max(bottom, message.y + message.height - message.inkBelow());
        if (actionSlot.visible && root.actionBelow) bottom = Math.max(bottom, actionSlot.y + actionSlot.height);
        return height - bottom;
    }

    function inkAbove() {
        let top = labelColumn && label !== "" ? labelText.y + labelText.inkAbove() : height;
        for (const child of slot.children) {
            if (child.visible) top = Math.min(top, slot.y + child.y + Theme.inkAbove(child));
        }
        return Math.min(top, height);
    }

    function toneColor(name) {
        if (name === "warning") return Theme.color.warning;
        if (name === "danger") return Theme.color.danger;
        if (name === "muted") return Theme.text.hint.color;
        console.error("FormRow: no warningTone named " + JSON.stringify(name));
        return Theme.color.warning;
    }

    // Smoke rows read this hook to verify all key/value rows use one
    // height without depending on the private tree shape.
    objectName: "fieldRow"
    implicitWidth: slot.x + Math.max(Theme.field.minWidth, Math.min(Theme.control.maxWidth, slot.childrenRect.width))
    implicitHeight: (labelColumn ? Math.max(Theme.row.height, labelText.implicitHeight, slot.childrenRect.height) : slot.childrenRect.height) + messageRoom + subTextRoom

    Label {
        id: labelText
        objectName: "fieldLabel"
        T.Control {
            id: labelFocus
            Accessible.name: labelText.text
            Accessible.role: Accessible.StaticText
            anchors.fill: parent
            activeFocusOnTab: root.labelTooltip !== "" && visible
            Tooltip {
                text: root.labelTooltip
                side: "right"
                // The side's gap from this box's end puts the tooltip at its start.
                box: Qt.rect(0, -labelText.y, (root.explainBeside ? root.besideX : root.valueX) - Theme.tooltip.gap, root.labelBox)
                maxWidth: root.explainBeside ? root.besideWrap : root.valueRoom - 2 * Theme.tooltip.paddingX
            }
        }
        FocusRing { target: labelFocus; outside: true }
        role: "label"
        text: root.label
        visible: root.labelColumn
        width: Theme.field.labelWidth - (infoButton.active ? infoButton.width + Theme.space.xs : 0)
        wrapMode: Text.Wrap
        y: lineCount > 1 ? Math.round((root.boxHeight - implicitHeight) / 2) : topForCapCenter(root.labelBox)
    }

    Loader {
        id: infoButton
        active: root.info !== "" && root.labelColumn
        x: Theme.field.labelWidth - width
        y: Math.round((root.labelBox - implicitHeight) / 2)
        sourceComponent: InfoButton {
            title: root.label
            info: root.info
        }
    }

    Item {
        id: slot
        x: root.valueX
        width: Math.min(root.valueRoom, Theme.control.maxWidth)
        height: childrenRect.height
        y: root.labelColumn ? Math.round((root.boxHeight - height) / 2) : 0
    }

    LinkText {
        id: message
        role: root.warningRole
        text: root.warning
        link: root.warningLink
        color: root.toneColor(root.warningTone)
        visible: root.warning !== ""
        x: slot.x
        y: root.boxHeight + Theme.field.gap
        width: root.valueRoom - root.actionRoom
        wrapMode: Text.Wrap
        onActivated: root.warningLinkActivated()
    }

    Item {
        id: actionSlot
        visible: message.visible
        x: root.actionBelow ? slot.x : root.width - width
        y: root.actionBelow ? root.messageBottom - height : root.messageBottom - root.messageLine + Math.round((root.messageLine - height) / 2)
        width: root.actionItem === null ? 0 : root.actionItem.width
        height: root.actionItem === null ? 0 : root.actionItem.height
    }

    // The explainer's text at the width it wraps to past the control.
    Label {
        id: besideMeasure
        visible: false
        role: "tooltip"
        text: root.labelTooltip
        width: Math.max(1, root.besideWrap)
        wrapMode: Text.Wrap
    }
}
