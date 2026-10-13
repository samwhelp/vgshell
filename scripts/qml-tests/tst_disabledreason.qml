import QtQuick
import QtTest
import qs.Commons
import qs.Ui
import qs.Unit

// A `disabledReason` disables a control and says why. While locked, each
// control stays a Tab stop, shows the reason in the shared Tooltip on
// hover and on keyboard focus, and takes no click, Space, Return, Enter,
// Up or Down; it draws its parts faded and no hover, and the control
// itself stays opaque. A toggle given `unlock` draws a lock-open mark
// `stack.inline` after its body, inside its own width, that runs the step
// on a click, Space or Return and shows the reason with the keyboard on
// it; a toggle without a step draws none, and a control that is no toggle
// takes no `unlock`. An empty reason leaves the control as it was. Pane
// hands its header switch the reason and the step, the mark ending on the
// content edge, and Field hands its control the reason. The tooltip waits
// on `tooltip.delay` in real time, so this proves its wiring; the stand-in
// popup positions nothing.
Item {
    id: root
    width: 600
    height: 700

    readonly property string reason: "Sign in to your VPN account to turn on this switch"
    property int runs: 0
    readonly property var step: ({ label: "Sign in", run: () => { root.runs += 1; } })

    Column {
        spacing: 8
        Button { id: before; text: "Before" }
        Switch { id: sw; text: "VPN"; disabledReason: root.reason; unlock: root.step }
        Switch { id: bare; disabledReason: root.reason }
        Checkbox { id: box; text: "Verified"; disabledReason: root.reason; unlock: root.step }
        ToggleButton { id: toggle; text: "Pin"; disabledReason: root.reason; unlock: root.step }
        Button { id: button; text: "Publish"; disabledReason: root.reason }
        IconButton { id: icon; iconName: "x"; label: "Close"; disabledReason: root.reason }
        Select { id: select; model: ["One", "Two", "Three"]; currentIndex: 1; disabledReason: root.reason }
        Switch { id: free; text: "Free" }
        Field { id: field; label: "Field"; width: 300; disabledReason: root.reason; Switch { id: fielded } }
    }
    Pane { id: pane; y: 420; width: 400; height: 120; title: "VPN"; switchShown: true; switchDisabledReason: root.reason; switchUnlock: root.step }

    Component { id: spyComponent; SignalSpy {} }

    TestCase {
        name: "disabledreason"
        when: windowShown

        function init() {
            UnitTheme.reset();
            compare(UnitTheme.override({ tooltip: { delay: 200 } }), "ok");
            root.runs = 0;
            away();
            root.forceActiveFocus();
        }

        function cleanup() {
            for (const tip of descendants(root).filter(item => item.anchorItem !== undefined && item.side !== undefined)) {
                tip.shown = false;
                tryCompare(tip, "opened", false);
            }
        }

        function away() { mouseMove(root, root.width - 1, root.height - 1); }

        function descendants(node) {
            let out = [];
            for (const child of node.children) out = out.concat([child], descendants(child));
            return out;
        }

        function reasonTip(control) { return descendants(control).find(item => item.objectName === "disabledReasonTip") || null; }
        function markOf(control) { return descendants(control).find(item => item.iconName === "lock-open") || null; }
        function ownTip(button) { return button.data.find(child => child.anchorItem !== undefined && child.side !== undefined); }

        // The opacity an item draws at: its own times every ancestor's.
        function drawnOpacity(item) {
            let out = 1;
            for (let at = item; at !== null; at = at.parent) out *= at.opacity;
            return out;
        }

        // Every locked control, with what a press must leave as it was.
        function locked_data() {
            return [
                { tag: "Switch", control: sw },
                { tag: "Switch with no step", control: bare },
                { tag: "Checkbox", control: box },
                { tag: "ToggleButton", control: toggle },
                { tag: "Button", control: button },
                { tag: "IconButton", control: icon },
                { tag: "Select", control: select },
                { tag: "Pane switch", control: pane.headerSwitch },
                { tag: "Field switch", control: fielded }
            ];
        }

        function test_a_locked_control_says_why_on_hover_data() { return locked_data(); }
        function test_a_locked_control_says_why_on_hover(data) {
            const control = data.control;
            const tip = reasonTip(control);
            verify(tip !== null, "the locked control holds its reason");
            mouseMove(control, 2, control.height / 2);
            tryCompare(tip, "opened", true);
            compare(tip.text, root.reason);
            for (const other of descendants(root).filter(item => item.anchorItem === control && item.side !== undefined && item !== tip))
                compare(other.live, false, "no other tooltip of the control can open: " + other.text);
            away();
            tryCompare(tip, "opened", false);
        }

        // Tab reaches the control from the item before it, and the reason
        // opens on that focus.
        function test_a_locked_control_says_why_on_keyboard_focus_data() { return locked_data(); }
        function test_a_locked_control_says_why_on_keyboard_focus(data) {
            const control = data.control;
            const previous = control.nextItemInFocusChain(false);
            previous.forceActiveFocus(Qt.TabFocusReason);
            keyClick(Qt.Key_Tab);
            compare(control.activeFocus, true, "Tab reaches the locked control");
            compare(control.visualFocus, true);
            tryCompare(reasonTip(control), "opened", true);
            root.forceActiveFocus();
            tryCompare(reasonTip(control), "opened", false);
        }

        function test_a_locked_control_takes_no_click_or_key_data() { return locked_data(); }
        function test_a_locked_control_takes_no_click_or_key(data) {
            const control = data.control;
            const clicks = createTemporaryObject(spyComponent, root, { target: control, signalName: "clicked" });
            const was = { checked: control.checked, index: control.currentIndex };
            // Each input is judged alone: Up then Down would move a choice
            // and move it back.
            function unchanged(input) {
                compare(clicks.count, 0, input + ": no click");
                compare(control.checked, was.checked, input + ": no toggle");
                compare(control.currentIndex, was.index, input + ": no choice moves");
                if (control === select) compare(select.listOpen, false, input + ": the list stays closed");
            }
            mouseClick(control, 2, control.height / 2);
            unchanged("click");
            control.forceActiveFocus(Qt.TabFocusReason);
            for (const key of [Qt.Key_Space, Qt.Key_Return, Qt.Key_Enter, Qt.Key_Up, Qt.Key_Down]) {
                keyClick(key);
                unchanged("key " + key);
            }
            if (control === select) {
                select.openList();
                unchanged("openList");
            }
            compare(control.activeFocus, true, "the keys leave the focus on the control");
        }

        // The parts fade and draw no hover; the control and its mark stay
        // opaque.
        function test_a_locked_control_draws_faded_with_no_hover() {
            compare(sw.opacity, 1);
            compare(sw.indicator.opacity, Theme.opacity.disabled);
            compare(sw.contentItem.opacity, Theme.opacity.disabled);
            compare(button.background.opacity, Theme.opacity.disabled);
            compare(button.contentItem.opacity, Theme.opacity.disabled);
            compare(select.background.opacity, Theme.opacity.disabled);
            compare(drawnOpacity(markOf(sw)), 1, "the mark draws at full strength");
            // Each drawn state reads `hovered`, which a locked control
            // never sets.
            mouseMove(sw.indicator, 4, sw.indicator.height / 2);
            tryCompare(reasonTip(sw), "opened", true);
            compare(sw.hovered, false, "a locked switch draws no hover");
            mouseMove(button, 4, button.height / 2);
            tryCompare(reasonTip(button), "opened", true);
            compare(button.hovered, false, "a locked button draws no hover");
        }

        // Where each toggle's body ends, read from its parts.
        function marked_data() {
            return [
                { tag: "Switch", control: sw, body: () => sw.contentItem.x + sw.contentItem.implicitWidth },
                { tag: "Checkbox", control: box, body: () => box.contentItem.x + box.contentItem.implicitWidth },
                { tag: "ToggleButton", control: toggle, body: () => toggle.background.x + toggle.background.width },
                { tag: "Pane switch", control: pane.headerSwitch, body: () => pane.headerSwitch.indicator.x + pane.headerSwitch.indicator.width }
            ];
        }

        // The mark sits `stack.inline` after the body, inside the toggle's
        // own width, is the Tab stop after it, and runs the step on a
        // click, Space or Return.
        function test_the_mark_runs_the_step_data() { return marked_data(); }
        function test_the_mark_runs_the_step(data) {
            const control = data.control;
            const mark = markOf(control);
            verify(mark !== null, "the toggle draws its mark");
            compare(mark.label, "Sign in");
            compare(mark.Accessible.name, "Sign in");
            const at = mark.mapToItem(control, 0, 0);
            compare(at.x, data.body() + Theme.stack.inline, "the mark starts the gap after the body");
            verify(at.x + mark.width <= control.width, "the mark lies inside the toggle: " + (at.x + mark.width) + " of " + control.width);
            compare(control.inkEnd !== undefined ? control.inkEnd() : control.width, at.x + mark.width, "the drawn end is the mark's");
            compare(control.nextItemInFocusChain(true), mark, "the mark is the Tab stop after the toggle");
            mouseClick(mark);
            compare(root.runs, 1);
            // The click focused the mark with the mouse reason, which a
            // second focus call on it would keep.
            root.forceActiveFocus();
            mark.forceActiveFocus(Qt.TabFocusReason);
            keyClick(Qt.Key_Space);
            compare(root.runs, 2);
            keyClick(Qt.Key_Return);
            compare(root.runs, 3);
            const tip = ownTip(mark);
            compare(tip.text, root.reason, "the mark shows the reason with the keyboard on it");
            tryCompare(tip, "opened", true);
            root.forceActiveFocus();
            compare(tip.text, "", "under the pointer the toggle's own tooltip shows the reason");
        }

        // The mark ends on the pane's content edge, after the switch, with
        // the switch's track where it was beside a mark-less switch.
        function test_the_pane_header_holds_the_switch_and_its_mark() {
            const header = pane.headerSwitch;
            const mark = markOf(header);
            const end = mark.mapToItem(pane, mark.width, 0).x;
            compare(end, pane.contentInset + pane.contentWidth);
            const track = header.indicator.mapToItem(pane, header.indicator.width, 0).x;
            compare(end - track, Theme.stack.inline + mark.width);
            compare(header.disabledReason, root.reason);
        }

        // expected-log: UnlockMark: unlock= -- the test hands a step with no run on purpose
        function test_no_mark_without_a_step() {
            compare(markOf(bare), null, "a locked toggle with no step draws no mark");
            compare(bare.width, Theme.toggle.size.md.width, "and keeps no room for one");
            for (const control of [button, icon, select])
                compare(control.unlock, undefined, control + " takes no step");
            const malformed = createTemporaryQmlObject("import qs.Ui\nSwitch { disabledReason: \"x\"; unlock: ({ label: \"Sign in\" }) }", root);
            compare(markOf(malformed), null, "a step with no run draws no mark");
        }

        // An empty reason leaves a control as it was: no reason, no mark,
        // no room, and a click and Space toggle it.
        function test_an_empty_reason_changes_nothing() {
            compare(reasonTip(free), null);
            compare(markOf(free), null);
            compare(free.indicator.opacity, 1);
            compare(free.width, free.contentItem.implicitWidth);
            mouseClick(free.indicator);
            compare(free.checked, true);
            free.forceActiveFocus(Qt.TabFocusReason);
            keyClick(Qt.Key_Space);
            compare(free.checked, false);
            sw.disabledReason = "";
            compare(reasonTip(sw), null, "clearing the reason drops the tooltip");
            compare(markOf(sw), null, "and the mark");
            compare(sw.width, sw.contentItem.implicitWidth, "and its room");
            mouseClick(sw.indicator);
            compare(sw.checked, true);
            sw.checked = false;
            sw.disabledReason = Qt.binding(() => root.reason);
            verify(markOf(sw) !== null);
        }

        // expected-log: Field: disabledReason= -- the test hands a reason to a field whose control takes none on purpose
        function test_a_field_hands_its_control_the_reason() {
            compare(fielded.disabledReason, root.reason);
            compare(fielded.lock.locked, true);
            field.disabledReason = "";
            compare(fielded.disabledReason, "");
            compare(fielded.lock.locked, false);
            field.disabledReason = Qt.binding(() => root.reason);
            compare(fielded.lock.locked, true);
            createTemporaryQmlObject("import qs.Ui\nField { disabledReason: \"x\"; TextField {} }", root);
        }
    }
}
