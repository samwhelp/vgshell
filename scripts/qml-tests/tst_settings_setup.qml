import QtQuick
import QtTest
import qs.Commons
import qs.Core
import qs.Ui
import "../../shell/plugins/vgs.settings"

// The Plugins window's Setup tab and the list's setup marks. A plugin page
// has a Setup tab, between Settings and Details, only while the plugin has
// a step, a key or a screen to draw there or a tool to install; the
// Requirements section draws on that tab, and on Details for a page with
// none. A page opens on the tab it is asked for, and on Settings when it
// has no such tab. A row of the list shows Setup needed while its plugin
// asks for a setup step and a warning icon while an optional tool is
// missing; a click on the row opens Setup while the chip shows, else
// Settings, and a click on the icon opens Setup. A change of the manager's
// rows keeps the shown tab by its text, and a Setup tab that leaves while
// it shows hands on to Details. The rows are the core's own,
// PluginLogic.statusRows and requirementRows over manifests written here;
// the shell stands in for the window's capabilities.
Item {
    id: root
    width: 1200
    height: 1200

    readonly property var screen: ({ name: "DP-1", x: 0, y: 0, width: 1920, height: 1080 })

    readonly property var tools: PluginLogic.normalRequirements([
        { command: "acme-tool", optional: true, purpose: "A tool" },
        { command: "acme-other", optional: false, purpose: "Another tool" }
    ])
    readonly property var stepped: ({
        requirements: tools,
        tui: { connect: { requires: [] } },
        status: {
            summary: { type: "state", label: "Setup", group: "Setup" },
            account: { type: "state", label: "Account", group: "Setup", action: { label: "Sign in", tui: "connect" } },
            health: { type: "state", label: "Health" }
        }
    })
    readonly property var todo: ({ summary: { tone: "warning", text: "Not ready" }, account: { tone: "warning", text: "To do", action: true }, health: { tone: "ok", text: "Good" } })
    readonly property var done: ({ summary: { tone: "ok", text: "Ready" }, account: { tone: "ok", text: "Signed in" }, health: { tone: "ok", text: "Good" } })

    // One manager row, as the manager lists it, for a plugin that declares
    // MANIFEST's status and requirements, publishes VALUES and misses the
    // tools MISSING names, with FIELDS over it.
    function pluginRow(id, manifest, values, missing, fields) {
        return Object.assign({
            id: id,
            name: id,
            version: "1",
            description: "",
            author: "VGS",
            license: "",
            icon: "package",
            source: "bundled",
            enabled: true,
            alwaysOn: false,
            placed: false,
            kinds: ["service"],
            capabilities: [],
            schema: ({}),
            settings: ({}),
            settingChoices: ({}),
            status: PluginLogic.statusRows(manifest, values, missing),
            secretLabel: "",
            tuis: [],
            builtins: [],
            opens: "",
            paneHolder: "",
            binds: [],
            requirements: PluginLogic.requirementRows(manifest, missing, {}),
            errors: []
        }, fields);
    }

    readonly property var plain: ({ requirements: tools, tui: ({}), status: ({ health: { type: "state", label: "Health" } }) })
    // [id, manifest, published values, missing tools, row fields].
    readonly property var fixtures: [
        ["acme.plain", plain, { health: { tone: "warning", text: "Slow" } }, [], {}],
        ["acme.todo", stepped, todo, [], {}],
        ["acme.done", stepped, done, [], {}],
        ["acme.optional", plain, {}, ["acme-tool"], {}],
        ["acme.required", plain, {}, ["acme-other"], {}],
        ["acme.blocked", stepped, todo, ["acme-other"], {}],
        ["acme.off", plain, {}, ["acme-tool", "acme-other"], { enabled: false }],
        ["acme.installed", stepped, done, [], { source: "installed" }],
        ["acme.loose", plain, {}, [], { source: "installed" }]
    ]
    function rows(change) {
        return fixtures.map(f => change !== undefined && change[f[0]] !== undefined ? pluginRow(f[0], f[1], f[2], change[f[0]], f[4]) : pluginRow(f[0], f[1], f[2], f[3], f[4]));
    }

    QtObject {
        id: fakeManager
        property var plugins: root.rows()
        // Each plugin whose requirements the window asked to install.
        property var installs: []
        function rescan() { return "ok"; }
        function viewPage(id) {}
        function installRequirements(id) { installs = installs.concat([id]); return "ok"; }
        // Each installed plugin the window asked to update.
        property var updates: []
        function update(id) { updates = updates.concat([id]); return "ok"; }
    }
    QtObject {
        id: fakeCompositor
        function readWindows(done) {}
    }
    QtObject {
        id: fakeShell
        readonly property var manager: fakeManager
        readonly property var compositor: fakeCompositor
        readonly property var manifest: ({ id: "vgs.settings", name: "Plugins" })
        readonly property var screens: ({ current: root.screen, all: [root.screen] })
        readonly property var shortcut: ({ capture: null })
    }

    Component {
        id: windowComponent
        Window { shell: fakeShell }
    }

    TestCase {
        name: "settingsSetup"
        when: windowShown

        function descendants(item) {
            const found = [item];
            for (let i = 0; i < found.length; i++)
                for (const child of found[i].children || []) found.push(child);
            return found;
        }

        function init() {
            fakeManager.plugins = root.rows();
            fakeManager.installs = [];
            fakeManager.updates = [];
        }

        function opened() {
            const window = createTemporaryObject(windowComponent, root);
            verify(window !== null, "the window builds");
            window.width = window.implicitWidth;
            window.height = 900;
            window.open("{}");
            waitForRendering(window);
            return window;
        }

        function pageOf(window) {
            return descendants(window).find(item => item.fitHeight !== undefined && item.row !== undefined);
        }
        function tabsOf(window) {
            return descendants(pageOf(window)).find(item => item instanceof TabPages);
        }
        // The titles of the sections the page draws now.
        function shownSections(window) {
            return descendants(pageOf(window)).filter(item => item instanceof SectionHeader && item.visible).map(header => header.text);
        }
        function listRow(window, id) {
            return descendants(window).find(item => item instanceof ListItem && item.text === id);
        }
        // What the row of plugin ID draws of its setup: [the chip shows, the
        // warning icon shows]. The row's only other Badge counts errors,
        // in the danger tone.
        function marks(window, id) {
            const shown = descendants(listRow(window, id)).filter(item => item.visible);
            return [shown.some(item => item instanceof Badge && item.tone === "warning"), shown.some(item => item instanceof IconButton)];
        }

        function test_a_page_has_a_setup_tab_only_with_something_to_set_up_data() {
            return [
                { tag: "nothing to set up", id: "acme.plain", tabs: ["Settings", "Details"] },
                { tag: "open steps", id: "acme.todo", tabs: ["Settings", "Setup", "Details"] },
                { tag: "done steps", id: "acme.done", tabs: ["Settings", "Setup", "Details"] },
                { tag: "a missing optional tool", id: "acme.optional", tabs: ["Settings", "Setup", "Details"] },
                { tag: "a missing required tool", id: "acme.required", tabs: ["Settings", "Setup", "Details"] }
            ];
        }
        function test_a_page_has_a_setup_tab_only_with_something_to_set_up(data) {
            const window = opened();
            compare(window.openPlugin(data.id, Qt.OtherFocusReason), "ok");
            compare(tabsOf(window).model, data.tabs);
            compare(pageOf(window).tab, "Settings", "a page opens on Settings unless asked");
        }

        // Each tab draws its own sections, and the Requirements section on
        // one tab alone.
        function test_each_item_draws_on_one_tab() {
            const window = opened();
            const tabs = () => tabsOf(window);
            const texts = wanted => shownSections(window).filter(text => wanted.indexOf(text) !== -1);
            const all = ["Status", "Setup", "Requirements"];
            window.openPlugin("acme.todo", Qt.OtherFocusReason);
            compare(texts(all), [], "Settings draws no setup step and no requirement");
            tabs().currentIndex = 1;
            tryCompare(pageOf(window), "tab", "Setup");
            compare(texts(all), ["Status", "Setup", "Requirements"], "Setup draws the steps, then the requirements");
            tabs().currentIndex = 2;
            tryCompare(pageOf(window), "tab", "Details");
            compare(texts(all), ["Status"], "Details draws the states outside the setup and no requirement");
            window.openPlugin("acme.plain", Qt.OtherFocusReason);
            tabs().currentIndex = 1;
            tryCompare(pageOf(window), "tab", "Details");
            compare(texts(all), ["Status", "Requirements"], "a page with no Setup tab draws the requirements on Details");
        }

        // Details is the strip's third page beside a Setup tab and draws
        // on its second for a plugin with none, and moves as the window
        // goes from one plugin's page to another's: a press there reaches
        // its actions either way, whichever page came before.
        function test_details_takes_a_press_on_either_page_data() {
            return [
                { tag: "beside a Setup tab", before: "acme.loose", id: "acme.installed", index: 2 },
                { tag: "with no Setup tab", before: "acme.installed", id: "acme.loose", index: 1 }
            ];
        }
        function test_details_takes_a_press_on_either_page(data) {
            const window = opened();
            window.openPlugin(data.before, Qt.OtherFocusReason);
            window.openPlugin(data.id, Qt.OtherFocusReason);
            tabsOf(window).currentIndex = data.index;
            tryCompare(pageOf(window), "tab", "Details");
            const update = () => descendants(pageOf(window)).find(item => item instanceof RowAction && item.visible && item.text === "Update");
            tryVerify(() => update() !== undefined && update().height > 0 && pageOf(window).parent.x === -window.width, 2000, "the page has slid in on Details");
            mouseClick(update());
            compare(fakeManager.updates, [data.id]);
        }

        function test_a_page_opens_on_the_tab_it_is_asked_for_data() {
            return [
                { tag: "the row of a plugin with an open step", open: w => w.openRow("acme.todo", Qt.OtherFocusReason), tab: "Setup" },
                { tag: "the row of a plugin missing a required tool", open: w => w.openRow("acme.required", Qt.OtherFocusReason), tab: "Setup" },
                { tag: "the row of a plugin with every step done", open: w => w.openRow("acme.done", Qt.OtherFocusReason), tab: "Settings" },
                { tag: "the row of a plugin missing an optional tool", open: w => w.openRow("acme.optional", Qt.OtherFocusReason), tab: "Settings" },
                { tag: "the row of a plugin with nothing to set up", open: w => w.openRow("acme.plain", Qt.OtherFocusReason), tab: "Settings" },
                { tag: "the row of a plugin that is off", open: w => w.openRow("acme.off", Qt.OtherFocusReason), tab: "Settings" },
                { tag: "a deep link, as a widget's Settings entry sends", open: w => w.open('{"plugin":"acme.todo"}'), tab: "Settings" },
                { tag: "the title's menu", open: w => w.openPlugin("acme.todo", Qt.OtherFocusReason), tab: "Settings" },
                { tag: "the warning icon", open: w => w.openPlugin("acme.optional", Qt.OtherFocusReason, "Setup"), tab: "Setup" },
                { tag: "a tab the page lacks", open: w => w.openPlugin("acme.plain", Qt.OtherFocusReason, "Setup"), tab: "Settings" }
            ];
        }
        function test_a_page_opens_on_the_tab_it_is_asked_for(data) {
            const window = opened();
            data.open(window);
            compare(pageOf(window).tab, data.tab);
        }

        function test_a_row_shows_what_its_plugin_asks_data() {
            return [
                { tag: "nothing to set up", id: "acme.plain", marks: [false, false] },
                { tag: "an open step", id: "acme.todo", marks: [true, false] },
                { tag: "every step done", id: "acme.done", marks: [false, false] },
                { tag: "a missing optional tool", id: "acme.optional", marks: [false, true] },
                { tag: "a missing required tool", id: "acme.required", marks: [true, false] },
                { tag: "off", id: "acme.off", marks: [false, false] }
            ];
        }
        function test_a_row_shows_what_its_plugin_asks(data) {
            const window = opened();
            compare(marks(window, data.id), data.marks);
        }

        function test_a_click_on_a_row_and_on_its_icon_open_the_page() {
            const window = opened();
            mouseClick(listRow(window, "acme.todo"));
            compare(window.page, "acme.todo");
            compare(pageOf(window).tab, "Setup", "a row with the chip opens Setup");
            window.back();
            mouseClick(listRow(window, "acme.optional"));
            compare(window.page, "acme.optional");
            compare(pageOf(window).tab, "Settings", "a row without the chip opens Settings");
            window.back();
            mouseClick(descendants(listRow(window, "acme.optional")).find(item => item instanceof IconButton));
            compare(window.page, "acme.optional");
            compare(pageOf(window).tab, "Setup", "the warning icon opens Setup");
            window.back();
            const list = descendants(window).find(item => item.openCurrent !== undefined);
            list.current = list.shown.findIndex(plugin => plugin.id === "acme.todo");
            list.openCurrent(Qt.TabFocusReason);
            compare(pageOf(window).tab, "Setup", "Enter on a row with the chip opens Setup");
        }

        // The manager publishes new rows on each change: the shown tab
        // stays, by its text, as the Setup tab comes and goes.
        function test_a_change_of_the_rows_keeps_the_shown_tab() {
            const window = opened();
            window.openPlugin("acme.optional", Qt.OtherFocusReason, "Setup");
            compare(pageOf(window).tab, "Setup");
            fakeManager.plugins = root.rows({ "acme.optional": [] });
            compare(tabsOf(window).model, ["Settings", "Details"], "the Setup tab leaves once the tool is installed");
            compare(pageOf(window).tab, "Details", "the page goes on to Details");
            verify(shownSections(window).indexOf("Requirements") !== -1, "where the requirements now draw");
            fakeManager.plugins = root.rows({ "acme.optional": ["acme-tool"] });
            compare(tabsOf(window).model, ["Settings", "Setup", "Details"], "the Setup tab returns with a tool to install");
            compare(pageOf(window).tab, "Details", "Details stays shown as it moves along the strip");
            compare(tabsOf(window).currentIndex, 2);
            window.openPlugin("acme.optional", Qt.OtherFocusReason);
            fakeManager.plugins = root.rows({ "acme.optional": [] });
            compare(pageOf(window).tab, "Settings", "Settings stays shown");
        }

        // The page's one primary action: a step's while one holds it, else
        // the Requirements section's.
        function test_the_requirements_action_is_primary_only_without_a_step_data() {
            return [
                { tag: "no step", id: "acme.required", variant: "primary" },
                { tag: "a step that holds the primary", id: "acme.blocked", variant: "secondary" }
            ];
        }
        function test_the_requirements_action_is_primary_only_without_a_step(data) {
            const window = opened();
            window.openPlugin(data.id, Qt.OtherFocusReason, "Setup");
            compare(pageOf(window).tab, "Setup");
            const requirements = descendants(pageOf(window)).find(item => item instanceof Section && item.visible && item.title === "Requirements");
            const install = descendants(requirements).find(item => item instanceof Button && item.visible);
            verify(install !== undefined, "the Setup tab draws the install action");
            compare(install.variant, data.variant);
            // The page slides in and its columns lay out before a press
            // can land on the action.
            tryVerify(() => install.height > 0 && pageOf(window).parent.x === -window.width, 2000, "the page has slid in");
            mouseClick(install);
            compare(fakeManager.installs, [data.id], "a press asks the manager to install the plugin's tools");
        }
    }
}
