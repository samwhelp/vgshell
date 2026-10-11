import QtQuick
import QtQuick.Effects
import QtQuick.Window
import QtQuick.Templates as T
import qs.Commons
import qs.Ui
import "../foundation/KeyNavLogic.js" as KeyNavLogic

// A vertically scrolling area for content taller than it: children go in
// the flickable's content item and the content height follows them. The
// content reserves `rightInset` for the embedded bar, `bar`, which sits
// inside that inset while the content overflows, so no
// content lies under it and the content's width never depends on its own
// height: wrapping text would otherwise move the layout a turn after it
// settled, or feed a binding its own input. With `barOverContent` the
// content spans that clip and the bar draws over its right strip: for rows
// whose fills reach the area's edge and whose own end padding keeps that
// strip clear while the content overflows, as a menu's entries do. The area
// scrolls by the wheel, a touchpad swipe, which TouchpadScroll moves it by,
// the keys, its bar and a touch drag, never by a
// mouse drag: it takes no mouse button, so a mouse press and drag reaches
// the item under the pointer, which selects text where text is selectable.
// It takes the wheel and a touch only while its content overflows, so a
// touch on an area that fits reaches what lies under it, such as a scrim
// that closes a full-screen view. While the content overflows, it fades
// out across a `scrollArea.fadeHeight` band at each edge, at most half the
// view: a mask on the content's alpha, so every part of it, text, outline
// and fill alike, fades toward whatever lies behind the area on any
// surface and theme. Each band's strength, `fadeAbove` and `fadeBelow`,
// grows in as content comes to lie beyond its edge, so an end the view
// rests at shows its content in full. A `divider.thickness` hairline in
// `color.borderStrong` marks each edge where content is clipped, the
// bottom while content continues below the view and the top while content
// is scrolled under it, `cueBelow` and `cueAbove`. Unlike the bar neither
// fades with time, so a page cut at the window's edge says so at rest;
// neither takes input. The bar, the focus ring and the hairlines lie
// outside the mask, so they never fade. The hairline spans the viewport
// alone, so a holder that draws its own line on an edge, as Pane's divider
// under a sticky header and over a sticky footer does, turns this one off
// there with `cueLineAbove` or `cueLineBelow`; the fade stays.
Flickable {
    id: root

    property real rightInset: Theme.scrollArea.gutter
    property bool barOverContent: false
    // True while the area is short only for a moment, as in a card that
    // grows toward its content: the bar stays hidden for that overflow.
    property bool barHeld: false
    property bool keyboardScroll: false
    property bool cueLineAbove: true
    property bool cueLineBelow: true
    property real contentPadding: 0
    readonly property real clipPadding: keyboardScroll && keyboardFocus.visualFocus ? contentPadding : 0
    readonly property real focusInset: keyboardScroll ? Theme.focusRing.width + Theme.focusRing.offset : 0
    readonly property real measuredContentHeight: measureContentHeight()
    readonly property bool overflowing: scrollBar.needed
    // Under half a pixel of clipped content is float noise, as for the bar.
    readonly property bool cueAbove: overflowing && !barHeld && contentY >= 0.5
    readonly property bool cueBelow: overflowing && !barHeld && contentHeight - height - contentY >= 0.5
    readonly property real fadeExtent: Math.min(Theme.scrollArea.fadeHeight, contentClip.height / 2)
    readonly property real fadeAbove: overflowing && !barHeld ? fadeStrength(contentY) : 0
    readonly property real fadeBelow: overflowing && !barHeld ? fadeStrength(contentHeight - height - contentY) : 0
    readonly property alias bar: scrollBar
    readonly property Item focusProxy: keyboardFocus

    clip: true
    activeFocusOnTab: false
    contentWidth: width - 2 * focusInset - (barOverContent ? 0 : rightInset)
    contentHeight: measuredContentHeight + 2 * focusInset
    boundsBehavior: Flickable.StopAtBounds
    interactive: overflowing
    // No mouse drag (Qt 6.9's Flickable.acceptedButtons): a press goes to
    // the child under the pointer, so a drag selects a text field's text,
    // while a touch still drags and the wheel still scrolls.
    acceptedButtons: Qt.NoButton

    function measureContentHeight() {
        let bottom = 0;
        for (const child of contentItem.children) {
            // The touchpad area follows the view and is no content.
            if (child === touchpad) continue;
            if (!child.visible && root.visible) continue;
            const childHeight = child.height > 0 ? child.height : child.implicitHeight;
            bottom = Math.max(bottom, child.y + childHeight);
        }
        return bottom;
    }

    // The strength of a band with `distance` of content beyond its edge:
    // full once a band's depth of content lies beyond it.
    function fadeStrength(distance) {
        return Math.max(0, Math.min(1, distance / Math.max(1, fadeExtent)));
    }
    function maskColor(alpha) {
        const color = Qt.color(Theme.color.text);
        color.a = alpha;
        return color;
    }

    function checkInset() {
        if (!barOverContent && Theme.scrollArea.gutter > rightInset)
            console.error("ScrollArea: gutter=" + Theme.scrollArea.gutter + " exceeds rightInset=" + rightInset);
    }
    function reveal(item) {
        if (item === null || item === undefined) return;
        const at = item.mapToItem(contentItem, 0, 0);
        const y = KeyNavLogic.revealY(at.y - clipPadding, item.height, contentY, contentClip.height, Theme.focusRing.offset + Theme.focusRing.width);
        contentY = Math.max(0, Math.min(contentHeight - height, y));
    }
    function scrollBy(delta) {
        contentY = Math.max(0, Math.min(contentHeight - height, contentY + delta));
    }
    Component.onCompleted: {
        // Reparent after Flickable has installed its declared children.
        contentItem.parent = contentOrigin;
        checkInset();
    }
    onRightInsetChanged: checkInset()
    onBarOverContentChanged: checkInset()

    function handleScrollKey(event) {
        const action = KeyNavLogic.intent(event.key, event.modifiers, "vertical", false);
        if (action === "prev") root.scrollBy(-Theme.row.height);
        else if (action === "next") root.scrollBy(Theme.row.height);
        else if (action === "pagePrev") root.scrollBy(-contentClip.height);
        else if (action === "pageNext") root.scrollBy(contentClip.height);
        else if (action === "first") root.contentY = 0;
        else if (action === "last") root.contentY = Math.max(0, root.contentHeight - root.height);
        else return false;
        KeyNavLogic.focusNavigation(keyboardFocus);
        return true;
    }

    Connections {
        target: root === null ? null : root.Window.window
        function onActiveFocusItemChanged() {
            if (root === null || root.Window.window === null) return;
            const item = root.Window.window.activeFocusItem;
            if (item !== null && item !== root && root.contentItem !== null && KeyNavLogic.contains(root.contentItem, item)) {
                root.reveal(item);
                return;
            }
        }
    }

    HoverHandler { id: hover }
    TouchpadScroll { id: touchpad; view: root; width: contentClip.width; height: contentClip.height }

    // Clip scrolling content before it reaches the area's ring. When a
    // child takes focus, its existing padding holds the child's ring.
    // Qt's Item layer effect consumes a texture-backed mask's alpha
    // (doc.qt.io/qt-6/qml-qtquick-effects-multieffect.html); the layer
    // holds the content alone, so the bar, ring and hairlines stay whole.
    Item {
        id: contentClip
        parent: root
        anchors.fill: parent
        anchors.margins: root.focusInset + root.clipPadding
        clip: true
        layer.enabled: root.visible && height > 0 && root.overflowing && !root.barHeld
        layer.smooth: true
        layer.effect: MultiEffect {
            maskEnabled: true
            maskSource: fadeMask
            maskThresholdMin: 0.5
            maskSpreadAtMin: 1
        }
    }

    Rectangle {
        id: fadeMask
        parent: root
        anchors.fill: contentClip
        visible: false
        layer.enabled: contentClip.layer.enabled
        layer.smooth: true
        gradient: Gradient {
            GradientStop { position: 0; color: root.maskColor(1 - root.fadeAbove) }
            GradientStop { position: root.fadeExtent / Math.max(1, contentClip.height); color: root.maskColor(1) }
            GradientStop { position: 1 - root.fadeExtent / Math.max(1, contentClip.height); color: root.maskColor(1) }
            GradientStop { position: 1; color: root.maskColor(1 - root.fadeBelow) }
        }
    }

    // Preserve the content coordinates while its existing padding becomes
    // part of the stationary clip. Rows cannot paint into that padding.
    Item {
        id: contentOrigin
        parent: contentClip
        x: -root.clipPadding
        y: -root.clipPadding
        width: contentClip.width + 2 * root.clipPadding
        height: contentClip.height + 2 * root.clipPadding
    }

    T.Control {
        id: keyboardFocus
        parent: root
        anchors.fill: parent
        z: -1
        visible: root.keyboardScroll
        enabled: root.keyboardScroll
        focusPolicy: root.keyboardScroll ? Qt.StrongFocus : Qt.NoFocus
        activeFocusOnTab: root.keyboardScroll
        Keys.onPressed: event => { event.accepted = root.handleScrollKey(event); }
    }

    // The hairlines lie over the content and under the bar, whose z is 1.
    Rectangle {
        parent: root
        anchors { left: contentClip.left; right: contentClip.right; top: contentClip.top }
        height: Theme.divider.thickness
        color: Theme.color.borderStrong
        visible: root.cueAbove && root.cueLineAbove
    }
    Rectangle {
        parent: root
        anchors { left: contentClip.left; right: contentClip.right; bottom: contentClip.bottom }
        height: Theme.divider.thickness
        color: Theme.color.borderStrong
        visible: root.cueBelow && root.cueLineBelow
    }

    ScrollBar {
        id: scrollBar
        flickable: root
        x: root.width - root.focusInset - width - Theme.scrollArea.barInset
        y: root.focusInset
        height: contentClip.height
        hovered: hover.hovered
    }

    FocusRing {
        parent: root
        target: keyboardFocus
        // The Flickable clips its children. Keep the ring inside that clip.
        anchors.margins: 0
        visible: root.keyboardScroll && keyboardFocus.visualFocus
    }
}
