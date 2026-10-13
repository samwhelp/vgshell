import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// A tooltip for the item it is declared in: it draws one title line and
// optional quieter detail lines. A detail is a string line, or `{ label,
// value }` for a count row whose value column aligns with the other count
// rows. After the theme's delay with the pointer resting on the item or
// after keyboard focus reaches it, the tooltip opens in its own surface
// on the item's `side`, "below" (the default), "right" or "belowStart",
// under the item from its start edge, and takes no focus. It closes when the pointer leaves and
// focus leaves, on a press on the item, when the item hides, and it does
// not open while another overlay is open. After a press it stays closed
// until the pointer leaves the item, so it never covers what the press
// opened. It opens beside `box`, a rectangle in the item's coordinates,
// the item's own box unless set, and wraps its text past `maxWidth`,
// `tooltip.maxWidth` unless set. The declaring item is an invisible,
// sizeless member of its parent.
Item {
    id: root

    property string text: ""
    property var details: []
    // An item with a label under it opens its tooltip to the right, so the
    // tooltip never covers that label.
    property string side: "below"
    property rect box: Qt.rect(0, 0, anchorItem === null ? 0 : anchorItem.width, anchorItem === null ? 0 : anchorItem.height)
    property real maxWidth: Theme.tooltip.maxWidth
    readonly property int edge: edgeFor(side)
    // A corner of the box with the gravity of the opposite corner starts
    // the popup on that corner; only opposing edges are refused.
    // https://quickshell.org/docs/v0.3.1/types/Quickshell/PopupAnchor/
    readonly property int anchorEdges: side === "belowStart" ? Edges.Bottom | Edges.Left : edge
    readonly property int anchorGravity: side === "belowStart" ? Edges.Bottom | Edges.Right : edge
    property bool shown: false
    readonly property bool opened: popup.item !== null && popup.item.visible
    readonly property var tracker: popup.item === null ? null : popup.item.tracker
    readonly property Item anchorItem: parent

    // The handlers live on the anchor, made once it is known: a handler
    // declared with a parent binding crashes the engine while the parent
    // is still null.
    property HoverHandler hover: null
    property TapHandler press: null
    // A press on the item since the pointer last entered it.
    property bool pressedHere: false
    readonly property Component hoverComponent: Component { HoverHandler { onHoveredChanged: if (!hovered) root.pressedHere = false } }
    // pointer-cursor-exempt: it watches a press on the anchor to close the tooltip; the anchor's own control owns the cursor
    // keyboard-path: the anchor's focus opens the tooltip and focus leaving closes it
    readonly property Component pressComponent: Component { TapHandler { gesturePolicy: TapHandler.ReleaseWithinBounds; onPressedChanged: if (pressed) root.pressedHere = true } }
    readonly property bool focusResting: anchorItem !== null && ("visualFocus" in anchorItem) && anchorItem.visualFocus === true
    readonly property bool resting: anchorItem !== null && anchorItem.visible && anchorItem.enabled && ((hover !== null && hover.hovered && !(press !== null && press.pressed) && !pressedHere) || focusResting) && text !== ""

    visible: false

    function edgeFor(name) {
        if (name === "below" || name === "belowStart") return Edges.Bottom;
        if (name === "right") return Edges.Right;
        throw new Error("Tooltip: side=" + JSON.stringify(name) + " unexpected");
    }

    Component.onCompleted: {
        if (anchorItem === null) return;
        hover = hoverComponent.createObject(anchorItem);
        press = pressComponent.createObject(anchorItem);
    }

    onRestingChanged: {
        if (resting) delay.restart();
        else { delay.stop(); root.shown = false; }
    }

    Timer {
        id: delay
        interval: Theme.tooltip.delay
        onTriggered: if (root.resting && OverlayState.open === 0) root.shown = true
    }

    // Another overlay opening closes a tooltip already shown.
    Connections {
        target: OverlayState
        function onOpenChanged() { if (OverlayState.open > 0) root.shown = false; }
    }

    // LazyLoader owns its item and destroys it when active drops. A
    // tooltip has no window or content tree until its delay has elapsed.
    // https://quickshell.org/docs/v0.3.1/types/Quickshell/LazyLoader/
    LazyLoader {
        id: popup
        active: root.shown

        PopupWindow {
            id: window

            anchor.item: root.anchorItem
            anchor.rect.x: root.box.x
            anchor.rect.y: root.box.y
            anchor.rect.width: root.box.width
            anchor.rect.height: root.box.height
            // A negative margin grows the anchor rect past that edge, so the
            // popup opens the gap away from the item.
            anchor.edges: root.anchorEdges
            anchor.gravity: root.anchorGravity
            anchor.adjustment: PopupAdjustment.Flip | PopupAdjustment.Slide
            anchor.margins.bottom: root.edge === Edges.Bottom ? -Theme.tooltip.gap : 0
            anchor.margins.right: root.edge === Edges.Right ? -Theme.tooltip.gap : 0
            // No grab: Quickshell makes this a Qt ToolTip, which an outside
            // click leaves open; grabFocus true is a Popup with an xdg_popup
            // grab the compositor dismisses on a click outside.
            grabFocus: false
            visible: root.shown
            readonly property AnchorTracker tracker: AnchorTracker { popup: window; anchor: root.anchorItem }
            color: "transparent"
            // One line up to `maxWidth`, then title and plain details
            // wrap; never wider than the output less its gutters.
            readonly property real paddedWidth: Math.min(content.implicitWidth + 2 * Theme.tooltip.paddingX, OverlayState.widthFor(root.anchorItem, root.maxWidth + 2 * Theme.tooltip.paddingX))
            implicitWidth: Math.max(1, paddedWidth)
            implicitHeight: Math.max(1, content.implicitHeight + 2 * Theme.tooltip.paddingY)

            // Under a rounded theme the text sits in from the sides until it
            // clears the drawn corner.
            ClearingInset {
                id: sideInset
                pad: Theme.tooltip.paddingX
                radius: Theme.tooltip.radius
                width: window.paddedWidth
                height: content.implicitHeight + 2 * Theme.tooltip.paddingY
                top: Theme.tooltip.paddingY
            }

            GlassSurface {
                anchors.fill: parent
                standard: Theme.tooltip
                elevation: "tight"
            }

            Item {
                id: content
                objectName: "tooltipContent"
                x: sideInset.inset
                y: Theme.tooltip.paddingY
                width: Math.max(0, window.width - 2 * sideInset.inset)
                height: column.implicitHeight
                implicitWidth: Math.min(Math.max(titleWidth, detailWidth), root.maxWidth)
                implicitHeight: column.implicitHeight

                readonly property real titleWidth: Math.min(Math.ceil(titleLabel.implicitWidth), root.maxWidth)
                readonly property real labelColumnWidth: detailColumn.maxColumn("labelImplicitWidth")
                readonly property real valueColumnWidth: detailColumn.maxColumn("valueImplicitWidth")
                readonly property real countWidth: labelColumnWidth > 0 || valueColumnWidth > 0 ? labelColumnWidth + Theme.tooltip.gap + valueColumnWidth : 0
                readonly property real detailWidth: Math.min(Math.max(detailColumn.maxColumn("detailWidth"), countWidth), root.maxWidth)
                readonly property string detailRole: "itemHint"
                readonly property int lineWrapMode: Text.Wrap

                function detailModel() {
                    if (Array.isArray(root.details)) return root.details;
                    throw new Error("Tooltip: details=" + JSON.stringify(root.details) + " unexpected");
                }

                function isCount(entry) {
                    return entry !== null && typeof entry === "object" && !Array.isArray(entry)
                        && Object.prototype.hasOwnProperty.call(entry, "label")
                        && Object.prototype.hasOwnProperty.call(entry, "value");
                }

                function detailKind(entry, index) {
                    if (typeof entry === "string") return "plain";
                    if (isCount(entry)) return "count";
                    throw new Error("Tooltip: details[" + index + "]=" + JSON.stringify(entry) + " unexpected");
                }

                function detailHidden(entry) {
                    return isCount(entry) && (entry.value === 0 || entry.value === "0");
                }

                Column {
                    id: column
                    width: content.width
                    spacing: Theme.tooltip.gap

                    Label {
                        id: titleLabel
                        objectName: "tooltipTitle"
                        role: "tooltip"
                        text: root.text
                        color: Theme.tooltip.foreground
                        width: parent.width
                        wrapMode: content.lineWrapMode
                    }

                    Column {
                        id: detailColumn
                        objectName: "tooltipDetails"
                        width: parent.width
                        spacing: Theme.tooltip.gap
                        visible: root.details.length > 0

                        function maxColumn(propertyName) {
                            var max = 0;
                            for (var i = 0; i < children.length; i++) {
                                var child = children[i];
                                if (child.visible && child[propertyName] !== undefined)
                                    max = Math.max(max, Math.ceil(child[propertyName]));
                            }
                            return max;
                        }

                        Repeater {
                            model: content.detailModel()
                            delegate: Item {
                                objectName: kind === "count" ? "tooltipCountRow" : "tooltipDetailRow"
                                property var entry: modelData
                                readonly property string kind: content.detailKind(entry, index)
                                readonly property bool zeroRow: content.detailHidden(entry)
                                readonly property bool isCountDetail: kind === "count"
                                readonly property real labelImplicitWidth: countLabel.implicitWidth
                                readonly property real valueImplicitWidth: valueLabel.implicitWidth
                                readonly property real detailWidth: kind === "plain" ? plainLabel.detailWidth : labelImplicitWidth + Theme.tooltip.gap + valueImplicitWidth
                                width: detailColumn.width
                                height: !visible ? 0 : kind === "plain" ? plainLabel.height : Math.max(countLabel.height, valueLabel.height)
                                visible: !zeroRow

                                Label {
                                    id: plainLabel
                                    objectName: "tooltipDetailLine"
                                    property real detailWidth: Math.min(Math.ceil(implicitWidth), root.maxWidth)
                                    visible: kind === "plain"
                                    role: content.detailRole
                                    text: kind === "plain" ? entry : ""
                                    width: parent.width
                                    wrapMode: content.lineWrapMode
                                }

                                Label {
                                    id: countLabel
                                    objectName: "tooltipCountLabel"
                                    visible: kind === "count"
                                    role: content.detailRole
                                    text: kind === "count" ? String(entry.label) : ""
                                    width: Math.max(0, parent.width - content.valueColumnWidth - Theme.tooltip.gap)
                                    elide: Text.ElideRight
                                }

                                Label {
                                    id: valueLabel
                                    objectName: "tooltipCountValue"
                                    visible: kind === "count"
                                    role: content.detailRole
                                    text: kind === "count" ? String(entry.value) : ""
                                    x: parent.width - width
                                    width: content.valueColumnWidth
                                    horizontalAlignment: Text.AlignRight
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Connections {
        target: popup.item
        function onVisibleChanged() { if (popup.item !== null && !popup.item.visible) root.shown = false; }
    }

    Component.onDestruction: {
        if (hover !== null) hover.destroy();
        if (press !== null) press.destroy();
    }
}
