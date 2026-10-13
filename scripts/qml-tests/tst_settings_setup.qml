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
// none. A status entry that declares an action draws as a step on Setup,
// one of a group of its own under that group's title, and Details draws
// neither it nor its action. A listed screen draws on Setup only when its
// manifest marks it as a setup screen, else in the Actions row of Details,
// where a press opens it and a withheld one takes no press and names its
// reason on hover. A page opens on the tab it is asked for, and
// on Settings when it has no such tab. A row of the list shows Setup needed
// while its plugin asks for a setup step and a warning icon while an
// optional tool is missing; a click on the row opens Setup while the chip shows, else
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

    // Steps outside the Setup group: one of no group and one of a group of
    // its own, beside a state that declares no action.
    readonly property var moved: ({
        requirements: [],
        tui: { allow: { requires: [] } },
        status: {
            health: { type: "state", label: "Health" },
            capture: { type: "state", label: "Capture", action: { label: "Allow capture", tui: "allow" } },
            apple: { type: "state", label: "Apple displays", group: "Access", action: { label: "Allow access", tui: "allow" } }
        }
    })
    readonly property var movedOpen: ({ health: { tone: "ok", text: "Good" }, capture: { tone: "warning", text: "Not allowed", action: true }, apple: { tone: "warning", text: "No access", action: true } })
    readonly property var movedIdle: ({ health: { tone: "ok", text: "Good" }, capture: { tone: "warning", text: "Not allowed" }, apple: { tone: "ok", text: "Allowed" } })

    // Every required step done: an optional step that offers its action,
    // and a step of a group of its own that reads warning and offers none.
    readonly property var settled: ({
        requirements: [],
        tui: { connect: { requires: [] }, start: { requires: [] } },
        status: {
            summary: { type: "state", label: "Setup", group: "Setup" },
            account: { type: "state", label: "Account", group: "Setup", action: { label: "Sign in", tui: "connect" } },
            session: { type: "state", label: "Session", group: "Home", action: { label: "Start", tui: "start" } }
        }
    })
    readonly property var settledValues: ({ summary: { tone: "ok", text: "Ready" }, account: { tone: "info", text: "Optional", action: true }, session: { tone: "warning", text: "Cannot start" } })

    readonly property var plain: ({ requirements: tools, tui: ({}), status: ({ health: { type: "state", label: "Health" } }) })
    // One listed screen no entry declares, as the manager row lists it,
    // marked as a setup screen or not, WITHHELD the core's reason while it
    // lacks a tool, else "".
    function listed(setup, withheld) {
        return { tuis: [{ name: "tools", label: "Manage tools", icon: "wrench", setup: setup, withheld: withheld }] };
    }
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
        ["acme.loose", plain, {}, [], { source: "installed" }],
        ["acme.moved", moved, movedOpen, [], {}],
        ["acme.idle", moved, movedIdle, [], {}],
        ["acme.settled", settled, settledValues, [], {}],
        ["acme.tasks", plain, {}, [], listed(false, "")],
        ["acme.held", plain, {}, [], listed(false, "Needs acme-tool. Install all missing first.")],
        ["acme.screen", plain, {}, [], listed(true, "")],
        ["acme.heldsetup", plain, {}, [], listed(true, "Needs acme-tool. Install all missing first.")]
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
        // Each listed screen the window asked to open, as [id, name].
        property var opens: []
        function openTui(id, name) { opens = opens.concat([[id, name]]); return "ok"; }
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
            fakeManager.opens = [];
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
                { tag: "a missing required tool", id: "acme.required", tabs: ["Settings", "Setup", "Details"] },
                { tag: "steps outside the Setup group", id: "acme.moved", tabs: ["Settings", "Setup", "Details"] },
                { tag: "a listed setup screen", id: "acme.screen", tabs: ["Settings", "Setup", "Details"] },
                { tag: "a listed screen that is no setup screen", id: "acme.tasks", tabs: ["Settings", "Details"] }
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

        // An entry that declares an action is a step on Setup, in the Setup
        // section or under its group's title, with its action beside it;
        // Details draws the state that declares none, and no action.
        function test_an_entry_with_an_action_draws_on_setup_alone() {
            const window = opened();
            const texts = () => shownSections(window).filter(text => ["Status", "Setup", "Access"].indexOf(text) !== -1);
            const steps = ["Allow capture", "Allow access"];
            const actions = () => descendants(pageOf(window)).filter(item => (item instanceof RowAction || item instanceof Button) && item.visible && steps.indexOf(item.text) !== -1).map(item => item.text);
            const labels = () => descendants(pageOf(window)).filter(item => item instanceof Field && item.visible).map(field => field.label).filter(label => ["Health", "Capture", "Apple displays"].indexOf(label) !== -1);
            window.openPlugin("acme.moved", Qt.OtherFocusReason, "Setup");
            compare(pageOf(window).tab, "Setup");
            compare(texts(), ["Setup", "Access"], "Setup draws the step of no group, then the group's own section");
            compare(labels(), ["Capture", "Apple displays"], "each step draws under its entry's label");
            compare(actions(), steps, "each offered step draws its action on Setup");
            tabsOf(window).currentIndex = 2;
            tryCompare(pageOf(window), "tab", "Details");
            compare(texts(), ["Status"], "Details draws no section of the group whose entries are steps");
            compare(labels(), ["Health"], "Details draws the state that declares no action alone");
            compare(actions(), [], "Details draws no action");
        }

        // A listed screen draws once: a setup screen on Setup, and one
        // with no mark in the Actions row of Details, where a press opens
        // it through the manager.
        function test_a_listed_screen_draws_on_setup_only_when_marked() {
            const window = opened();
            const screens = () => descendants(pageOf(window)).filter(item => item instanceof RowAction && item.visible && item.text === "Manage tools");
            const rowOf = action => descendants(pageOf(window)).find(item => item instanceof Field && item.visible && descendants(item).indexOf(action) !== -1).label;
            window.openPlugin("acme.screen", Qt.OtherFocusReason, "Setup");
            compare(screens().map(rowOf), ["More setup"], "Setup draws the setup screen");
            const moreSetupRow = () => descendants(pageOf(window)).find(item => item instanceof Field && item.visible && descendants(item).indexOf(screens()[0]) !== -1);
            compare(moreSetupRow().hint, "", "a setup screen that lacks nothing gives More setup no hint");
            window.openPlugin("acme.heldsetup", Qt.OtherFocusReason, "Setup");
            tryCompare(pageOf(window), "tab", "Setup");
            compare(screens().map(rowOf), ["More setup"], "Setup draws the withheld setup screen");
            compare(screens()[0].enabled, false, "a withheld setup screen takes no press");
            compare(moreSetupRow().hint, "Manage tools: Needs acme-tool. Install all missing first.", "More setup's hint names the withheld screen and its reason");
            window.openPlugin("acme.screen", Qt.OtherFocusReason, "Setup");
            tryCompare(pageOf(window), "tab", "Setup");
            tabsOf(window).currentIndex = 2;
            tryCompare(pageOf(window), "tab", "Details");
            compare(screens(), [], "Details draws no setup screen");
            window.openPlugin("acme.tasks", Qt.OtherFocusReason);
            tabsOf(window).currentIndex = 1;
            tryCompare(pageOf(window), "tab", "Details");
            compare(screens().map(rowOf), ["Actions"], "Details draws the screen that is no setup screen");
            tryVerify(() => screens()[0].height > 0 && pageOf(window).parent.x === -window.width, 2000, "the page has slid in on Details");
            mouseClick(screens()[0]);
            compare(fakeManager.opens, [["acme.tasks", "tools"]]);
            compare(descendants(screens()[0]).find(item => item instanceof Tooltip).text, "", "a screen that lacks nothing names no reason");
            window.openPlugin("acme.held", Qt.OtherFocusReason);
            tabsOf(window).currentIndex = 1;
            tryCompare(pageOf(window), "tab", "Details");
            compare(screens().map(rowOf), ["Actions"], "Details draws the withheld screen");
            compare(screens()[0].enabled, false, "a withheld screen takes no press");
            compare(descendants(screens()[0]).find(item => item instanceof Tooltip).text, "Needs acme-tool. Install all missing first.", "its hover names the core's reason");
            const actionsRow = descendants(pageOf(window)).find(item => item instanceof Field && item.visible && descendants(item).indexOf(screens()[0]) !== -1);
            compare(actionsRow.hint, "Manage tools: Needs acme-tool. Install all missing first.", "the row's hint names the reason without a hover");
            // A refusal kept from an earlier open reads on its own line and
            // leaves the hint in place. The window logs the refusal it keeps.
            ignoreWarning(/^settings: acme\.held\/tui:tools refused: tui=tools reason=busy$/);
            window.keep(window.stepKey("acme.held", window.tuiKey("tools")), "refused: tui=tools reason=busy");
            const refusal = window.replyOf("acme.held", window.tuiKey("tools"));
            verify(refusal !== "", "the planted refusal is kept");
            compare(actionsRow.error, "", "a refusal does not take the hint's place");
            tryVerify(() => descendants(pageOf(window)).some(item => item instanceof Label && item.visible && item.text === refusal && descendants(actionsRow).indexOf(item) === -1), 2000, "the refusal reads under the row on its own line");
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
                { tag: "the row of a plugin with an open step outside the Setup group", open: w => w.openRow("acme.moved", Qt.OtherFocusReason), tab: "Setup" },
                { tag: "the row of a plugin whose open step outside the Setup group offers no action", open: w => w.openRow("acme.idle", Qt.OtherFocusReason), tab: "Settings" },
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
                { tag: "off", id: "acme.off", marks: [false, false] },
                { tag: "an open step outside the Setup group that offers its action", id: "acme.moved", marks: [true, false] },
                { tag: "an open step outside the Setup group that offers no action", id: "acme.idle", marks: [false, false] }
            ];
        }
        function test_a_row_shows_what_its_plugin_asks(data) {
            const window = opened();
            compare(marks(window, data.id), data.marks);
        }

        // A screen reader hears the warning icon's count, the text its
        // tooltip shows, as the description it reads after the name.
        function test_the_warning_icon_describes_its_count() {
            const window = opened();
            const icon = descendants(listRow(window, "acme.optional")).find(item => item instanceof IconButton);
            compare(icon.Accessible.description, icon.tooltip, "the description is the tooltip's text");
            verify(/\b1\b/.test(icon.Accessible.description), "the description carries the count: got " + JSON.stringify(icon.Accessible.description));
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

        // A step outside the Setup group that reads warning and offers no
        // action is no open step: the first offered optional step draws
        // the page's filled button.
        function test_an_actionless_step_outside_setup_withholds_no_primary() {
            const window = opened();
            window.openPlugin("acme.settled", Qt.OtherFocusReason, "Setup");
            compare(pageOf(window).tab, "Setup");
            verify(shownSections(window).indexOf("Home") !== -1, "the page draws the actionless step's section");
            compare(descendants(pageOf(window)).filter(item => item instanceof Button && item.visible && item.variant === "primary").map(button => button.text), ["Sign in"]);
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

        // While every missing tool is optional the install is a choice:
        // a RowAction under Optional tools, with no Missing row and no
        // filled primary; a missing required tool keeps both.
        function test_an_optional_install_is_a_row_action_data() {
            return [
                { tag: "a missing optional tool", id: "acme.optional", row: ["Optional tools", "Install optional tools"], primary: [] },
                { tag: "a missing required tool", id: "acme.required", row: ["Missing", ""], primary: ["Install all missing"] }
            ];
        }
        function test_an_optional_install_is_a_row_action(data) {
            const window = opened();
            window.openPlugin(data.id, Qt.OtherFocusReason, "Setup");
            compare(pageOf(window).tab, "Setup");
            const requirements = descendants(pageOf(window)).find(item => item instanceof Section && item.visible && item.title === "Requirements");
            // The step row is the section's one field outside a
            // RequirementRow, each of which holds a field of its own.
            const inRows = descendants(requirements).filter(item => item instanceof RequirementRow).reduce((all, row) => all.concat(descendants(row)), []);
            const field = descendants(requirements).find(item => item instanceof Field && item.visible && inRows.indexOf(item) === -1);
            const action = descendants(field).find(item => item instanceof RowAction && item.visible);
            compare([field.label, action === undefined ? "" : action.text], data.row);
            compare(descendants(pageOf(window)).filter(item => item instanceof Button && item.visible && item.variant === "primary").map(button => button.text), data.primary);
            if (action === undefined) return;
            tryVerify(() => action.height > 0 && pageOf(window).parent.x === -window.width, 2000, "the page has slid in");
            mouseClick(action);
            compare(fakeManager.installs, [data.id], "a press asks the manager for the requirement notice");
        }

        // A Requirements row's chip holds one state: a missing optional
        // tool reads Optional in the info tone, a missing required one
        // Missing in the danger tone, and an outdated one Outdated in the
        // warning tone, optional or not.
        function test_a_requirement_chip_reads_one_state_data() {
            return [
                { tag: "a missing optional tool", id: "acme.optional", tool: "acme-tool", chip: ["Optional", "info"] },
                { tag: "a missing required tool", id: "acme.required", tool: "acme-other", chip: ["Missing", "danger"] }
            ];
        }
        function test_a_requirement_chip_reads_one_state(data) {
            const window = opened();
            window.openPlugin(data.id, Qt.OtherFocusReason, "Setup");
            compare(pageOf(window).tab, "Setup");
            const row = descendants(pageOf(window)).find(item => item instanceof RequirementRow && item.visible && item.requirement.name === data.tool);
            verify(row !== undefined, "the Setup tab draws the tool's row");
            const chip = descendants(row).find(item => item instanceof Badge);
            compare([chip.text, chip.tone], data.chip);
        }
        function test_an_outdated_requirement_reads_one_state_data() {
            return [
                { tag: "optional", optional: true },
                { tag: "required", optional: false }
            ];
        }
        function test_an_outdated_requirement_reads_one_state(data) {
            const row = createTemporaryObject(requirementComponent, root, { requirement: { name: "acme-tool", purpose: "A tool", optional: data.optional, state: "outdated", badge: PluginLogic.requirementBadge("outdated", data.optional) } });
            const chip = descendants(row).find(item => item instanceof Badge);
            compare([chip.text, chip.tone], ["Outdated", "warning"]);
        }
    }

    Component {
        id: requirementComponent
        RequirementRow { width: 400 }
    }
}
