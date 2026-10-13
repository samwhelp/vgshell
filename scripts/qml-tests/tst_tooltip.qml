import QtQuick
import QtQuick.Templates as T
import QtTest
import qs.Commons
import qs.Ui
import qs.Unit

// A tooltip's page references through the stand-in popup window. A tooltip
// with no link closes when the pointer leaves its item. A `pageLinks`
// tooltip whose line names a page stays open while the pointer goes from
// the item into the popup and closes after it left the popup. Without
// `pageLinks` the line draws the reference's words alone. Opened by
// focus, Tab makes the link current and draws its ring round the words,
// Enter emits `pageActivated` with the page and tab, and Escape closes it
// with the focus still on the item. The crossing waits on `tooltip.delay`
// in real time, so it proves the timer's wiring; the nested sandbox proves
// the real pointer, the real keys and the popup's surface.
Item {
    id: root
    width: 300
    height: 200

    // A focusable item, as BarItem is: it hands its keys to its tooltip.
    component Anchor: T.Button {
        id: anchor
        property alias tip: tip
        property alias pageLinks: tip.pageLinks
        property alias title: tip.text
        property alias details: tip.details
        width: 60
        height: 26
        focusPolicy: Qt.TabFocus
        Keys.onPressed: event => { event.accepted = tip.takeKey(event); }
        Tooltip { id: tip }
    }

    Anchor { id: bare; title: "Sound" }
    Anchor { id: linked; x: 100; pageLinks: true; title: "Jarvis is not set up"; details: ["Finish in [Setup](page:acme.probe/Setup)."] }
    Anchor { id: unrouted; x: 200; title: "Jarvis is not set up"; details: ["Finish in [Setup](page:acme.probe/Setup)."] }
    Anchor { id: after; y: 60; title: "Next" }
    SignalSpy { id: activations; target: linked.tip; signalName: "pageActivated" }

    TestCase {
        name: "tooltip"
        when: windowShown

        function init() {
            UnitTheme.reset();
            compare(UnitTheme.override({ tooltip: { delay: 200 } }), "ok");
            activations.clear();
            away();
            root.forceActiveFocus();
        }

        function cleanup() {
            for (const item of [bare, linked, unrouted, after]) {
                item.tip.shown = false;
                tryCompare(item.tip, "opened", false);
            }
        }

        function away() { mouseMove(root, root.width - 1, root.height - 1); }

        function descendants(node) {
            let out = [];
            for (const child of node.children) out = out.concat([child], descendants(child));
            return out;
        }

        function named(tip, name) {
            return descendants(tip.tracker.popup.contentItem).filter(child => child.objectName === name);
        }

        // The stand-in popup opens at the screen's origin, where the
        // offscreen platform's cursor rests, so a new popup reads the
        // pointer on it until a move says otherwise.
        function opened(item) {
            tryCompare(item.tip, "opened", true);
            const popup = item.tip.tracker.popup;
            mouseMove(popup.contentItem, -10, -10);
            tryCompare(popup, "pointerOver", false);
        }

        function hoverOpen(item) {
            mouseMove(item, item.width / 2, item.height / 2);
            opened(item);
        }

        function test_a_tooltip_with_no_link_closes_when_the_pointer_leaves() {
            hoverOpen(bare);
            compare(named(bare.tip, "tooltipLink").length, 0);
            away();
            compare(bare.tip.opened, false);
        }

        function test_the_pointer_crosses_into_a_linked_tooltip() {
            hoverOpen(linked);
            const popup = linked.tip.tracker.popup;
            away();
            compare(linked.tip.opened, true, "the tooltip stays while the pointer crosses the gap");
            mouseMove(popup.contentItem, popup.width / 2, popup.height / 2);
            tryCompare(popup, "pointerOver", true);
            // Longer than the grace: the pointer on the popup holds it open.
            wait(3 * Theme.tooltip.delay);
            compare(linked.tip.opened, true, "the pointer on the popup holds it open");
            mouseMove(popup.contentItem, -10, -10);
            tryCompare(linked.tip, "opened", false);
        }

        function test_an_owner_that_routes_no_link_draws_the_words() {
            hoverOpen(unrouted);
            compare(named(unrouted.tip, "tooltipLink").length, 0);
            const lines = named(unrouted.tip, "tooltipDetailLine");
            compare(lines.length, 1);
            compare(lines[0].text, "Finish in Setup.");
            compare(lines[0].visible, true);
            away();
            compare(unrouted.tip.opened, false, "it closes on leave as a tooltip with no link does");
            hoverOpen(linked);
            compare(named(linked.tip, "tooltipLink").length, 1);
            compare(named(linked.tip, "tooltipLink")[0].plain, "Finish in Setup.");
            compare(named(linked.tip, "tooltipDetailLine")[0].visible, false);
        }

        function test_the_keyboard_reaches_and_opens_the_link() {
            linked.forceActiveFocus(Qt.TabFocusReason);
            opened(linked);
            const link = named(linked.tip, "tooltipLink")[0];
            const ring = descendants(link).find(child => child.target === link && child.border !== undefined);
            verify(ring !== undefined, "the link owns its ring");
            compare(ring.visible, false);
            keyClick(Qt.Key_Return);
            compare(activations.count, 0, "Enter on the item opens no link before Tab");
            keyClick(Qt.Key_Tab);
            compare(linked.activeFocus, true, "the first Tab stays on the item");
            compare(linked.tip.currentLine, 1);
            compare(ring.visible, true);
            verify(ring.parent.width < link.width, "the ring goes round the words, not the line: " + ring.parent.width + " of " + link.width);
            keyClick(Qt.Key_Return);
            compare(activations.count, 1);
            compare(activations.signalArguments[0][0], "acme.probe");
            compare(activations.signalArguments[0][1], "Setup");
            tryCompare(linked.tip, "opened", false);
            compare(linked.activeFocus, true);

            // Escape closes it with the focus on the item, and it stays
            // closed until the focus left and came back.
            root.forceActiveFocus();
            linked.forceActiveFocus(Qt.TabFocusReason);
            opened(linked);
            keyClick(Qt.Key_Escape);
            compare(linked.tip.opened, false);
            compare(linked.activeFocus, true);
            wait(3 * Theme.tooltip.delay);
            compare(linked.tip.opened, false);

            // Past the last link, Tab goes on to the next item.
            root.forceActiveFocus();
            linked.forceActiveFocus(Qt.TabFocusReason);
            opened(linked);
            keyClick(Qt.Key_Tab);
            compare(linked.activeFocus, true);
            keyClick(Qt.Key_Tab);
            compare(linked.activeFocus, false, "the second Tab leaves the item");
            tryCompare(linked.tip, "opened", false);
        }
    }
}
