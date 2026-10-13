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
// `tooltip.maxWidth` unless set, and is no narrower than `minWidth`, so a
// caller can have it span a row. Under its item from the start edge it
// is a band of help under a form row: it draws `band`, a neutral plate
// with no outline, since an input shows by its outline and a band with
// one read as an empty input. A title or a plain detail line that holds a
// page reference (PageReference.js) draws the reference's words alone.
// With `pageLinks` set, such a line whose reference names a page draws as
// a link (LinkText), and a click on it, or Enter, Return or Space on it,
// emits `pageActivated` with that page and tab and closes the tooltip.
// The pointer reaches a link across the gap: when it leaves the item, a
// tooltip with a link stays for `tooltip.delay`, stays while the pointer
// is on it, and closes that long after the pointer left it too. The
// tooltip never takes the keyboard. The item hands each key it gets to
// `takeKey` first, which answers whether the tooltip took it: Tab moves
// to the next link and draws its focus ring, and past the last one goes
// on to the next item; Shift+Tab moves back; Escape closes the tooltip,
// which opens again only after the pointer and the focus have both left
// the item. A tooltip with no link takes no key. Under a last line that
// is a link, the tooltip is as much taller as keeps that link's ring
// `focusRing.offset` clear of its border. The declaring item is an
// invisible, sizeless member of its parent.
Item {
    id: root

    property string text: ""
    property var details: []
    // Draw a page reference as a link; the owner opens the page.
    property bool pageLinks: false
    signal pageActivated(string page, string tab)
    // An item with a label under it opens its tooltip to the right, so the
    // tooltip never covers that label.
    property string side: "below"
    property rect box: Qt.rect(0, 0, anchorItem === null ? 0 : anchorItem.width, anchorItem === null ? 0 : anchorItem.height)
    property real maxWidth: Theme.tooltip.maxWidth
    property real minWidth: 0
    // A fill lifted off the surface it lies on, its border in that fill.
    readonly property var band: ({ background: Theme.color.surfaceHover, border: Theme.color.surfaceHover, radius: Theme.tooltip.radius })
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
    readonly property bool live: anchorItem !== null && anchorItem.visible && anchorItem.enabled && text !== ""
    readonly property bool unpressed: !(press !== null && press.pressed) && !pressedHere
    readonly property bool pointerResting: hover !== null && hover.hovered && unpressed
    readonly property bool resting: live && (pointerResting || focusResting)

    // The lines that draw as links, the title as 0 and detail i as i + 1,
    // in the order Tab takes them.
    readonly property var links: [text].concat(Array.isArray(details) ? details : []).map((line, at) => linked(line) ? at : -1).filter(at => at !== -1)
    // The place in `links` of the link the keyboard is on, -1 for none.
    property int current: -1
    readonly property int currentLine: current >= 0 && current < links.length ? links[current] : -1
    // The pointer may cross to a link and rest on it.
    readonly property bool reachable: live && unpressed && links.length > 0
    readonly property bool reached: reachable && popup.item !== null && popup.item.pointerOver
    // The pointer on the item or the popup, as `settle` last read it.
    property bool pointerWasOn: false

    visible: false

    // A line that draws as a link, in the place and the look of the Label
    // that draws it as words. `current` draws its focus ring.
    component LinkLine: Loader {
        id: slot

        property string line: ""
        property string role: "body"
        property color tint
        property int wrapMode: Text.Wrap
        property bool current: false
        // How far the link's ring reaches under this line.
        readonly property real ringBelow: item !== null ? item.ringBelow : 0
        signal pageActivated(string page, string tab)

        width: parent.width
        sourceComponent: LinkText {
            objectName: "tooltipLink"
            text: slot.line
            role: slot.role
            color: slot.tint
            wrapMode: slot.wrapMode
            focusPreview: slot.current
            onPageActivated: (page, tab) => slot.pageActivated(page, tab)
        }
    }

    function linked(line) {
        return pageLinks && typeof line === "string" && PageReference.parse(line).page !== "";
    }

    function lineAt(at) { return at === 0 ? text : details[at - 1]; }

    // Start the grace when the pointer leaves the item or the popup, end it
    // when the pointer is on either, and close once nothing holds the
    // tooltip open. Several bindings change on one pointer move, in no
    // fixed order, so every one of them settles here from the state it
    // finds.
    function settle() {
        const pointerOn = pointerResting || reached;
        if (pointerOn || !reachable) grace.stop();
        else if (pointerWasOn && shown) grace.restart();
        pointerWasOn = pointerOn;
        if (!resting && !reached && !grace.running) shown = false;
    }

    function activate(page, tab) {
        pageActivated(page, tab);
        closing.restart();
    }

    // Whether the tooltip took the key the item got.
    function takeKey(event) {
        if (!shown || links.length === 0) return false;
        if (event.key === Qt.Key_Escape) {
            shown = false;
            return true;
        }
        if (event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier)) return false;
        if (event.key === Qt.Key_Tab) {
            current = current + 1 < links.length ? current + 1 : -1;
            return current !== -1;
        }
        if (event.key === Qt.Key_Backtab) {
            if (current === -1) return false;
            current -= 1;
            return true;
        }
        if (currentLine !== -1 && [Qt.Key_Return, Qt.Key_Enter, Qt.Key_Space].indexOf(event.key) !== -1) {
            const reference = PageReference.parse(lineAt(currentLine));
            activate(reference.page, reference.tab);
            return true;
        }
        return false;
    }

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
        else delay.stop();
        settle();
    }
    onPointerRestingChanged: settle()
    onReachableChanged: settle()
    onReachedChanged: settle()
    onShownChanged: if (!shown) current = -1
    onLinksChanged: current = -1

    Timer {
        id: delay
        interval: Theme.tooltip.delay
        onTriggered: if (root.resting && OverlayState.open === 0) root.shown = true
    }

    // How long the pointer may take from the item to a link and back.
    Timer {
        id: grace
        interval: Theme.tooltip.delay
        onTriggered: root.settle()
    }

    // An activation closes the tooltip once its handler has returned: a
    // click's handler runs inside the popup the close destroys.
    Timer {
        id: closing
        interval: 0
        onTriggered: root.shown = false
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
            readonly property bool pointerOver: over.hovered
            color: "transparent"
            // One line up to `maxWidth`, then title and plain details
            // wrap; never wider than the output less its gutters.
            readonly property real paddedWidth: Math.min(Math.max(root.minWidth, content.implicitWidth + 2 * Theme.tooltip.paddingX), OverlayState.widthFor(root.anchorItem, root.maxWidth + 2 * Theme.tooltip.paddingX))
            // The room under the content: the padding, or what the last
            // line's link ring needs to stand clear of the border.
            readonly property real paddingBelow: Math.max(Theme.tooltip.paddingY, content.ringBelow + Theme.focusRing.offset + Theme.surface.border)
            implicitWidth: Math.max(1, paddedWidth)
            implicitHeight: Math.max(1, content.implicitHeight + Theme.tooltip.paddingY + paddingBelow)

            // Under a rounded theme the text sits in from the sides until it
            // clears the drawn corner.
            ClearingInset {
                id: sideInset
                pad: Theme.tooltip.paddingX
                radius: Theme.tooltip.radius
                width: window.paddedWidth
                height: content.implicitHeight + Theme.tooltip.paddingY + window.paddingBelow
                top: Theme.tooltip.paddingY
            }

            // Solid while glass is on: its text is judged on that fill
            // (ThemeLogic.readabilityShortfalls), which reads over any
            // backdrop, where translucent glass over a light one would not.
            GlassSurface {
                objectName: "tooltipSurface"
                anchors.fill: parent
                standard: root.side === "belowStart" ? root.band : Theme.tooltip
                elevation: "tight"
                solidOnly: true
            }

            // The whole popup, its padding too, holds a tooltip with a
            // link open under the pointer.
            HoverHandler { id: over }

            Item {
                id: content
                objectName: "tooltipContent"
                x: sideInset.inset
                y: Theme.tooltip.paddingY
                width: Math.max(0, window.width - 2 * sideInset.inset)
                height: column.implicitHeight
                implicitWidth: Math.min(Math.max(titleWidth, detailWidth), root.maxWidth)
                implicitHeight: column.implicitHeight

                readonly property real titleWidth: Math.min(Math.ceil(titleLink.active ? titleLink.implicitWidth : titleLabel.implicitWidth), root.maxWidth)
                readonly property real labelColumnWidth: detailColumn.maxColumn("labelImplicitWidth")
                readonly property real valueColumnWidth: detailColumn.maxColumn("valueImplicitWidth")
                readonly property real countWidth: labelColumnWidth > 0 || valueColumnWidth > 0 ? labelColumnWidth + Theme.tooltip.gap + valueColumnWidth : 0
                readonly property real detailWidth: Math.min(Math.max(detailColumn.maxColumn("detailWidth"), countWidth), root.maxWidth)
                readonly property string detailRole: "itemHint"
                // The role's faint text unless it falls short on the fill
                // the tooltip's glass draws (Tokens.js tooltip.detail).
                readonly property color detailColor: Theme.tooltip.detail
                readonly property real ringBelow: detailColumn.visible ? detailColumn.lastRingBelow() : titleLink.ringBelow
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

                    Item {
                        width: parent.width
                        height: titleLink.active ? titleLink.height : titleLabel.height

                        Label {
                            id: titleLabel
                            objectName: "tooltipTitle"
                            visible: !titleLink.active
                            role: "tooltip"
                            text: PageReference.plain(root.text)
                            color: Theme.tooltip.foreground
                            width: parent.width
                            wrapMode: content.lineWrapMode
                        }

                        LinkLine {
                            id: titleLink
                            active: root.linked(root.text)
                            line: root.text
                            role: titleLabel.role
                            tint: titleLabel.color
                            wrapMode: content.lineWrapMode
                            current: root.currentLine === 0
                            onPageActivated: (page, tab) => root.activate(page, tab)
                        }
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

                        // The last drawn row's, 0 where it holds no link.
                        function lastRingBelow() {
                            for (var i = children.length - 1; i >= 0; i--)
                                if (children[i].visible && children[i].ringBelow !== undefined) return children[i].ringBelow;
                            return 0;
                        }

                        Repeater {
                            model: content.detailModel()
                            delegate: Item {
                                objectName: kind === "count" ? "tooltipCountRow" : "tooltipDetailRow"
                                property var entry: modelData
                                readonly property string kind: content.detailKind(entry, index)
                                readonly property bool zeroRow: content.detailHidden(entry)
                                readonly property bool isCountDetail: kind === "count"
                                readonly property real ringBelow: plainLink.ringBelow
                                readonly property real labelImplicitWidth: countLabel.implicitWidth
                                readonly property real valueImplicitWidth: valueLabel.implicitWidth
                                readonly property real detailWidth: kind === "plain" ? Math.min(Math.ceil(plainLink.active ? plainLink.implicitWidth : plainLabel.implicitWidth), root.maxWidth) : labelImplicitWidth + Theme.tooltip.gap + valueImplicitWidth
                                width: detailColumn.width
                                height: !visible ? 0 : plainLink.active ? plainLink.height : kind === "plain" ? plainLabel.height : Math.max(countLabel.height, valueLabel.height)
                                visible: !zeroRow

                                Label {
                                    id: plainLabel
                                    objectName: "tooltipDetailLine"
                                    visible: kind === "plain" && !plainLink.active
                                    role: content.detailRole
                                    color: content.detailColor
                                    text: kind === "plain" ? PageReference.plain(entry) : ""
                                    width: parent.width
                                    wrapMode: content.lineWrapMode
                                }

                                LinkLine {
                                    id: plainLink
                                    active: root.linked(entry)
                                    line: active ? entry : ""
                                    role: plainLabel.role
                                    tint: plainLabel.color
                                    wrapMode: content.lineWrapMode
                                    current: root.currentLine === index + 1
                                    onPageActivated: (page, tab) => root.activate(page, tab)
                                }

                                Label {
                                    id: countLabel
                                    objectName: "tooltipCountLabel"
                                    visible: kind === "count"
                                    role: content.detailRole
                                    color: content.detailColor
                                    text: kind === "count" ? String(entry.label) : ""
                                    width: Math.max(0, parent.width - content.valueColumnWidth - Theme.tooltip.gap)
                                    elide: Text.ElideRight
                                }

                                Label {
                                    id: valueLabel
                                    objectName: "tooltipCountValue"
                                    visible: kind === "count"
                                    role: content.detailRole
                                    color: content.detailColor
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
