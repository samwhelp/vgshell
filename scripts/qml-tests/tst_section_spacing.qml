import QtQuick
import QtTest
import qs.Commons
import qs.Core
import qs.Ui
import qs.Unit
import "../../shell/plugins/vgs.settings"

// The space above a Settings section heading, read off the drawn page: from
// the lowest row of ink above the heading to its capitals' top row is
// `stack.heading` on the System monitor, Capture and Displays pages, built
// from their shipped manifests, whatever row ends the section above: a
// switch, a select, a segmented control, a slider or a help line, one
// with descenders or, planted, one without. The same holds on the Setup
// tab of a Jarvis-like plugin with its steps open and with them done,
// where a step with no hint whose primary button overhangs its row ends a
// section. The settings of no group draw no heading: they follow the
// Enabled switch at the space rows of one list leave. A
// section spaced by its box, as before `stack.heading`, is the control the
// reading must refuse.
Item {
    id: root
    width: 520
    height: 1800

    // The layout reads a glyph's ink from the font's tight box; its
    // antialiased edge differs from it by up to a pixel.
    readonly property int tolerance: 1
    readonly property var pages: ["vgs.sysmon", "vgs.capture", "vgs.displays"]

    Rectangle {
        id: backdrop
        anchors.fill: parent
        color: Theme.color.surface
    }

    Item {
        id: fakePanel
        property var shell: null
        property var plugins: []
        property var capture: null
        function writeKey() { return "ok"; }
        function writeSetting() { return "ok"; }
        function writePlacement() { return "ok"; }
        function toggle() { return "ok"; }
        function refreshChoices() {}
        function openLink() {}
        function openSurface() {}
        function openPlugin() { return "ok"; }
        function leave(next) { next(); }
        function replyOf() { return ""; }
        function tuiKey(name) { return "tui:" + name; }
    }

    // A Jarvis-like plugin's Setup tab: the Setup group's headline and one
    // step, a Personality step with its hint, a Home session step with
    // none, as Jarvis's session row has none, and two tools, both present.
    readonly property var stepped: ({
        requirements: PluginLogic.normalRequirements([
            { command: "acme-tool", optional: true, purpose: "A tool" },
            { command: "acme-other", optional: false, purpose: "Another tool" }
        ]),
        tui: { connect: { requires: [] }, edit: { requires: [] }, start: { requires: [] } },
        status: {
            summary: { type: "state", label: "Setup", group: "Setup" },
            account: { type: "state", label: "Account", group: "Setup", action: { label: "Sign in", tui: "connect" } },
            personality: { type: "state", label: "Personality", group: "Personality", hint: "How Jarvis talks.", action: { label: "Edit", tui: "edit" } },
            session: { type: "state", label: "Jarvis session", group: "Home", action: { label: "Start", tui: "start" } }
        }
    })

    Component {
        id: pageComponent
        PluginPage {
            width: root.width
            height: root.height
            panel: fakePanel
        }
    }

    // A box-spaced section after a drawn row: the gap the reading must
    // not take for the token.
    Column {
        id: boxSpaced
        x: 0
        y: 0
        width: 400
        spacing: Theme.stack.page
        visible: false
        Field { label: "Shown"; inline: true; width: parent.width; Switch { size: "sm"; checked: true } }
        Section {
            title: "Planted"
            topPadding: Theme.stack.section - Theme.stack.page
            Field { label: "One"; inline: true; width: parent.width; Label { role: "item"; text: "Ready" } }
        }
    }

    // Two switch rows of one list, the second with an info mark, as the
    // Enabled row and Notifications' VGlass row draw: the space rows of a
    // list leave between them.
    Column {
        id: listRows
        x: 0
        y: 0
        width: 400
        spacing: Theme.stack.row
        visible: false
        Field { label: "Enabled"; inline: true; width: parent.width; Switch { size: "sm"; checked: true } }
        Field { label: "VGlass"; info: "Glass for every surface."; inline: true; width: parent.width; Switch { size: "sm" } }
    }

    // A help line whose letters have no descender: its ink ends at the
    // baseline, not the font's descent.
    Column {
        id: flatHint
        x: 0
        y: 0
        width: 400
        // No spacing, so the section's own padding holds the whole space.
        spacing: 0
        visible: false
        Section {
            title: "Recording"
            Field { label: "Trim"; inline: true; hint: "Removes the first tenth"; width: parent.width; Switch { size: "sm" } }
        }
        Section {
            title: "Text"
            Field { label: "One"; inline: true; width: parent.width; Label { role: "item"; text: "Ready" } }
        }
    }

    // A status section as a plugin page draws it: a GroupList of loaded
    // fields, the last ending in a hint of one line or of two, then the
    // next section.
    Component {
        id: statusThenSection
        Column {
            id: statusPage
            property string hint: ""
            width: 400
            spacing: 0
            Section {
                title: "Status"
                GroupList {
                    Loader {
                        width: parent.width
                        sourceComponent: Field { label: "Setup"; inline: true; hint: statusPage.hint; Label { role: "item"; text: "Ready" } }
                    }
                }
            }
            Section {
                title: "Setup"
                Field { label: "One"; inline: true; width: parent.width; Label { role: "item"; text: "Ready" } }
            }
        }
    }

    TestCase {
        name: "sectionSpacing"
        when: windowShown

        function init() { UnitTheme.reset(); }

        function manifest(id) {
            const request = new XMLHttpRequest();
            request.open("GET", Qt.resolvedUrl("../../shell/plugins/" + id + "/manifest.json"), false);
            request.send();
            return JSON.parse(request.responseText);
        }

        function rowOf(id) {
            const m = manifest(id);
            const settings = {};
            // A bounded number with no default draws its slider at its minimum.
            for (const key of Object.keys(m.schema)) settings[key] = m.schema[key].default !== undefined ? m.schema[key].default : m.schema[key].min;
            return {
                id: id, name: m.name, version: m.version, description: m.description, author: m.author,
                license: "", icon: m.icon, source: "bundled", enabled: true, alwaysOn: false, placed: true,
                builtins: [], kinds: m.kinds, capabilities: m.capabilities, schema: m.schema, settings: settings,
                settingChoices: ({}), status: [], secretLabel: "", tuis: [], opens: "", paneHolder: "",
                binds: [], requirements: [], errors: []
            };
        }

        function descendants(item) {
            let out = [];
            for (const child of item.children) out = out.concat([child], descendants(child));
            return out;
        }

        // The shown headings under `item`, as their eyebrow labels.
        function headings(item) {
            return descendants(item).filter(child => child instanceof SectionHeader && child.visible && child.text !== "")
                .map(header => header.children[0].children[0]);
        }

        function inked(img, x, y) {
            const bg = Qt.color(Theme.color.surface);
            return Math.abs(img.red(x, y) - Math.round(bg.r * 255)) > 8 || Math.abs(img.green(x, y) - Math.round(bg.g * 255)) > 8
                || Math.abs(img.blue(x, y) - Math.round(bg.b * 255)) > 8;
        }

        function rowInked(img, y, left, right) {
            for (let x = Math.max(0, left); x < Math.min(img.width, right); x++) if (inked(img, x, y)) return true;
            return false;
        }

        // The blank rows between the ink above `label` and its first row of
        // ink, -1 when nothing above it draws.
        function gapAbove(img, label) {
            const at = label.mapToItem(root, 0, 0);
            let top = Math.floor(at.y);
            while (top < at.y + label.height && !rowInked(img, top, Math.floor(at.x), Math.ceil(at.x + label.width))) top++;
            verify(top < at.y + label.height, "\"" + label.text + "\" draws");
            for (let y = top - 1; y >= 0; y--) if (rowInked(img, y, 0, img.width)) return top - y - 1;
            return -1;
        }

        // Steps open: the open account step holds the page's primary
        // button and ends the Setup section. Steps done: the optional
        // session step, the first that offers its action, holds it and
        // ends the Home section.
        function test_heading_space_on_the_setup_tab_data() {
            return [
                { tag: "steps open", primary: "Sign in", values: {
                    summary: { tone: "warning", text: "Not ready" },
                    account: { tone: "warning", text: "Signed out", action: true },
                    personality: { tone: "ok", text: "Set", action: true },
                    session: { tone: "info", text: "Optional" } } },
                { tag: "steps done", primary: "Start", values: {
                    summary: { tone: "ok", text: "Ready" },
                    account: { tone: "ok", text: "Signed in" },
                    personality: { tone: "ok", text: "Set", action: true },
                    session: { tone: "info", text: "Not started", action: true } } }
            ];
        }

        function test_heading_space_on_the_setup_tab(data) {
            const row = Object.assign(rowOf("vgs.sysmon"), {
                id: "acme.jarvis", name: "Acme Jarvis", schema: {}, settings: {},
                status: PluginLogic.statusRows(root.stepped, data.values, []),
                requirements: PluginLogic.requirementRows(root.stepped, [], {})
            });
            const page = createTemporaryObject(pageComponent, root, { row: row });
            verify(page !== null);
            page.open(Qt.OtherFocusReason, "Setup");
            compare(page.tab, "Setup");
            tryVerify(() => headings(page).length === 5, 2000, "the tab heads Status, Setup, Personality, Home and Requirements");
            compare(descendants(page).filter(item => item instanceof Button && item.visible && item.variant === "primary").map(button => button.text), [data.primary]);
            verify(waitForRendering(page));
            const img = grabImage(root);
            // The tab's first heading starts the page, `stack.page` under
            // the strip (TabPages).
            const shown = headings(page).slice(1);
            compare(shown.map(label => label.text), ["Setup", "Personality", "Home", "Requirements"]);
            for (const label of shown) {
                const gap = gapAbove(img, label);
                verify(gap >= 0, "something draws above \"" + label.text + "\"");
                verify(Math.abs(gap - Theme.stack.heading) <= root.tolerance,
                    data.tag + ": \"" + label.text + "\" sits " + gap + " px under the ink above, not " + Theme.stack.heading);
            }
        }

        // The first and last rows of ink inside ITEM's box.
        function inkRows(img, item) {
            const at = item.mapToItem(root, 0, 0);
            const left = Math.floor(at.x);
            const right = Math.ceil(at.x + item.width);
            let top = Math.floor(at.y);
            let bottom = Math.ceil(at.y + item.height) - 1;
            while (top <= bottom && !rowInked(img, top, left, right)) top++;
            while (bottom >= top && !rowInked(img, bottom, left, right)) bottom--;
            verify(top <= bottom, "the row draws");
            return [top, bottom];
        }

        // The blank rows between the ink of two rows: the lowest of UPPER
        // and the highest of LOWER.
        function gapBetween(img, upper, lower) {
            return inkRows(img, lower)[0] - inkRows(img, upper)[1] - 1;
        }

        // Settings of no group follow the Enabled switch as rows of its
        // list do, `stack.row` apart. Drawn as a section of no title,
        // VGlass sat 66 blank rows under the Enabled switch at the default
        // theme, against 24 between two rows of a list (10 under the
        // switch's ink in its row box, `stack.row` 4, 10 above the next
        // row's ink): the section's padding filled `stack.heading`, 32,
        // from the switch's ink (10, `stack.page` 16, padding 6), then the
        // untitled heading kept its empty eyebrow line, 16, and
        // `sectionHeader.paddingBottom`, 8, and VGlass's row box 10 above
        // its ink: 32 + 16 + 8 + 10 = 66, read by this test under
        // scripts/qml-unit.sh on e041ebaa9.
        function test_ungrouped_settings_follow_the_enabled_row() {
            listRows.visible = true;
            verify(waitForRendering(listRows));
            const list = gapBetween(grabImage(root), listRows.children[0], listRows.children[1]);
            listRows.visible = false;
            // Set after creation, as a JS object, the row keeps its
            // schema's key order; a creation property goes through a
            // QVariantMap, whose keys are sorted.
            const page = createTemporaryObject(pageComponent, root);
            verify(page !== null);
            page.row = rowOf("vgs.notifications");
            const fields = descendants(page);
            const enabled = fields.find(item => item instanceof Field && item.label === "Enabled");
            const glass = fields.find(item => item instanceof SettingField && item.key === "glass");
            verify(enabled !== undefined && glass !== undefined, "the page draws Enabled and VGlass");
            tryVerify(() => glass.height > 0, 2000);
            verify(waitForRendering(page));
            const gap = gapBetween(grabImage(root), enabled, glass);
            verify(Math.abs(gap - list) <= root.tolerance, "VGlass sits " + gap + " px under the Enabled switch, not " + list + " as rows of a list");
        }

        function test_heading_space_on_plugin_pages_data() {
            return root.pages.map(id => ({ tag: id, id: id }));
        }

        function test_heading_space_on_plugin_pages(data) {
            const page = createTemporaryObject(pageComponent, root, { row: rowOf(data.id) });
            verify(page !== null);
            tryVerify(() => headings(page).length >= 2, 2000, "the page heads two groups or more");
            verify(waitForRendering(page));
            const img = grabImage(root);
            const shown = headings(page);
            for (const label of shown) {
                const gap = gapAbove(img, label);
                verify(gap >= 0, "something draws above \"" + label.text + "\"");
                verify(Math.abs(gap - Theme.stack.heading) <= root.tolerance,
                    data.id + ": \"" + label.text + "\" sits " + gap + " px under the ink above, not " + Theme.stack.heading);
            }
        }

        function test_the_token_moves_the_space() {
            compare(UnitTheme.override({ stack: { heading: 44 } }), "ok");
            const page = createTemporaryObject(pageComponent, root, { row: rowOf("vgs.sysmon") });
            tryVerify(() => headings(page).length >= 2, 2000);
            verify(waitForRendering(page));
            const img = grabImage(root);
            for (const label of headings(page)) verify(Math.abs(gapAbove(img, label) - 44) <= root.tolerance, "\"" + label.text + "\" follows the token");
        }

        // At 40 px the font's descent lies 8 px or more under the baseline,
        // past the reading's tolerance.
        function test_a_help_line_without_descenders() {
            compare(UnitTheme.override({ text: { hint: { size: 40 } } }), "ok");
            flatHint.visible = true;
            verify(waitForRendering(flatHint));
            const img = grabImage(root);
            const gap = gapAbove(img, headings(flatHint)[1]);
            flatHint.visible = false;
            verify(Math.abs(gap - Theme.stack.heading) <= root.tolerance, "the heading sits " + gap + " px under the help line, not " + Theme.stack.heading);
        }

        function test_heading_space_after_a_status_hint_data() {
            return [
                { tag: "one line", hint: "Setup copies defaults.", lines: 1 },
                { tag: "two lines", hint: "Setup copies defaults and downloads the speech model the dictation needs.", lines: 2 }
            ];
        }

        function test_heading_space_after_a_status_hint(data) {
            const page = createTemporaryObject(statusThenSection, root, { hint: data.hint });
            verify(page !== null);
            tryVerify(() => headings(page).length === 2, 2000, "the page heads two groups");
            const hints = descendants(page).filter(child => child instanceof LinkText && child.text === data.hint);
            compare(hints.length, 1);
            compare(hints[0].lineCount, data.lines);
            verify(waitForRendering(page));
            const gap = gapAbove(grabImage(root), headings(page)[1]);
            verify(Math.abs(gap - Theme.stack.heading) <= root.tolerance, "the heading sits " + gap + " px under the hint, not " + Theme.stack.heading);
        }

        // The control: a section spaced by its box under a switch row.
        function test_box_spacing_is_refused() {
            boxSpaced.visible = true;
            verify(waitForRendering(boxSpaced));
            const img = grabImage(root);
            const planted = headings(boxSpaced);
            compare(planted.length, 1);
            const gap = gapAbove(img, planted[0]);
            boxSpaced.visible = false;
            verify(gap >= 0);
            verify(Math.abs(gap - Theme.stack.heading) > root.tolerance, "the reading tells a box-spaced heading from the token: " + gap);
        }
    }
}
