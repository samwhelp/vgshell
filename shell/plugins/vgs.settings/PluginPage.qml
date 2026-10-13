import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Steps.js" as Steps

// One plugin's page, drawn from its manager row alone. The header holds a
// back button, which returns to the list, and the plugin's name as a title
// whose menu lists every plugin, the current one checked, and opens the
// chosen one's page. Open summons the plugin's window or panel. The body
// holds every error and the last refusal, then the pages under one tab
// strip (TabPages): Settings, Setup for a plugin with something to set up
// (Steps.setupTab), and Details. No item draws on two tabs.
//
// Settings holds what a user chooses: the enabled switch, the Show in bar
// switch of a plugin with a bar widget and another kind besides bar and
// bar-widget, which stays enabled once unplaced, the switch turning only
// while the plugin is enabled (for a widget-only plugin Enabled is the
// placement), then one settings section
// per schema group (entries without a group have no heading), one
// section per `list` entry, titled with its label, and the Keys section,
// then, for a plugin of kind `pane` while a panes holder is enabled, a
// button named for the holder that opens the plugin's page there. A
// plugin with none of those below its switches says so in one line. A
// disabled plugin's fields are read-only, its Enabled switch says to turn
// it on while it has something to change, and its holder button takes no
// press.
//
// Setup holds what a user does, the status sections (Steps.setupSections):
// a Status section with the `Setup` group's first entry under its own
// label; a Setup section with each further entry of that group, and each
// entry of no group that declares an action, as a step
// row under its own label, the open steps first, whose value is a Badge
// chip in its tone, beside it a step's offered screen or action, with its
// lines and hint under it, then the plugin's stored keys and tokens of no
// group or of `Setup`, each entry a StatusRow with one line per key, whose
// steps add, replace and remove a key the core stores, then, on an
// unlabelled row from the value column, the first entry's offered action
// when it opens no listed screen, then one action per other screen the
// manifest lists and marks as a setup screen, which opens it through the
// manager: a screen an offered status action opens first, with the
// action's label, then the others; then one section per other status group that holds a key list
// or an entry that declares an action, titled with the group, its keys,
// the states beside a key and the entries that declare an action in
// manifest order; then the Requirements section
// with an Install all missing button while one is missing, and Update all
// outdated once the rest are only outdated. A step keeps its row once it
// is done, with its state and the action its plugin offers to run it
// again. The first offered step that is no danger draws as the page's one
// primary Button, every other action as a RowAction, a danger one in the
// danger tone; the Requirements button is the primary only while no step
// holds it. A disabled plugin's setup actions take no press.
//
// Details holds what a user reads: the description, in the hint role in
// the muted colour, the capabilities, the listing metadata, the README
// link of a plugin included with VGS, the Update and Remove actions of an
// installed plugin, the Actions row with each listed screen that is no
// setup screen and that no status entry declares, such as one that runs
// the plugin's own task, one status section per status
// group (entries without a group first, under `Status`), but for the
// entries the Setup tab draws (Steps.detailEntries), every entry that
// declares an action among them, whose values are read-only and which
// draw no action of their own, and, for a plugin with no Setup tab, the Requirements
// section, every tool of which then reads present. A disabled plugin's
// status rows say it has not reported.
//
// `open` shows the tab it is asked for, Settings unless the caller names
// another; a change of the manager's rows moves neither the page nor an
// edit, but for a Setup tab that leaves while it shows, when the page goes
// on to Details. A page change returns the body to its top, where the
// strip is. The header and body
// share one content edge, the scroll bar sits in the window's right inset,
// and each inline value draws at line height 1, centred on its label. The
// switches, and the listing metadata with Manage, are each one key/value
// group `stack.row` apart, with one key/value row height. The Setup tab's
// steps, its keys and its Requirements are each a GroupList, divided as
// the status rows of Details are.
//
// A text field and a key typed as text wait for a save (EditSet): while one
// holds an unsaved edit the footer shows the save bar, whose Save, and
// Ctrl+S anywhere on the page, write every such edit, and whose Discard
// puts the configuration's values back. The bar reads Saved once the last
// edit is written, and a refused one keeps its field edited and the bar
// shown. A change to another tab with an unsaved edit returns to Settings
// and asks the panel first.
FocusScope {
    id: page

    // The Settings panel: its rows, its replies and its navigation.
    required property Item panel
    // The manager row this page draws, or null.
    property var row: null

    readonly property bool editable: row !== null && row.enabled
    // The Requirements section's step for what the last scan read, or null
    // while every requirement is present (Steps.requirementStep).
    readonly property var requirementStep: row === null ? null : Steps.requirementStep(row.requirements)
    readonly property bool isSelf: row !== null && panel.shell !== null && row.id === panel.shell.manifest.id
    readonly property alias scrollArea: layout.scrollArea
    // The page's height unscrolled, with the tab it shows now; the window
    // follows it on each tab change, `tab`.
    readonly property real fitHeight: layout.uncappedHeight
    // The tab shown, by its text on the strip.
    readonly property string tab: tabs.model[tabs.currentIndex] || "Settings"
    readonly property alias titleMenu: menu
    readonly property alias title: titleHeader.titleButton
    readonly property alias initialFocus: back
    // The manager row of the panes holder that shows this plugin's page,
    // or null.
    readonly property var paneHolder: row === null || row.paneHolder === "" ? null : panel.plugins.find(p => p.id === row.paneHolder) || null
    // Whether the Settings page holds nothing below its switches.
    readonly property bool bare: row !== null && row.builtins.length === 0 && sections.length === 0 && lists.length === 0 && row.binds.length === 0 && paneHolder === null
    // Whether a field of the page holds an unsaved edit.
    readonly property bool dirty: unsaved.edited

    // Built-in placement and same-named schema fields share one section.
    // Ungrouped fields follow built-ins, then each group in the order its
    // first entry appears. The manifest's key order is the schema's. A `list` entry
    // whose group exists on the page follows that group; one whose group is
    // absent stays with ungrouped lists at the end. A `hideEmpty` field has
    // no place while its select model is empty: nothing is offered for it.
    readonly property var sections: {
        if (row === null) return [];
        const out = row.builtins.map(builtin => ({ group: builtin.name, keys: [], builtin: builtin }));
        out.push({ group: "", keys: [], builtin: null });
        const hidden = key => row.schema[key].hideEmpty === true && (row.settingChoices[key] || []).length === 0;
        for (const key of Object.keys(row.schema).filter(key => row.schema[key].type !== "list" && !hidden(key))) {
            const group = row.schema[key].group === undefined ? "" : row.schema[key].group;
            let section = out.find(s => s.group === group);
            if (section === undefined) {
                section = { group: group, keys: [], builtin: null };
                out.push(section);
            }
            section.keys.push(key);
        }
        const kept = out.filter(s => s.builtin !== null || s.keys.length > 0);
        for (const key of Object.keys(row.schema).filter(key => row.schema[key].type === "list")) {
            const group = row.schema[key].group;
            const section = group === undefined ? undefined : kept.find(s => s.group === group);
            if (section !== undefined) {
                if (section.lists === undefined) section.lists = [];
                section.lists.push(key);
            }
        }
        return kept;
    }

    readonly property var lists: {
        if (row === null) return [];
        const groups = page.sections.map(section => section.group);
        return Object.keys(row.schema).filter(key => row.schema[key].type === "list"
            && (row.schema[key].group === undefined || groups.indexOf(row.schema[key].group) === -1));
    }
    // The Setup tab's status sections in drawn order, with their rows,
    // keys and setup actions.
    readonly property var setupSections: row === null ? [] : Steps.setupSections(row.tuis, row.status)
    // Whether the page has a Setup tab, which then holds the Requirements
    // section too.
    readonly property bool hasSetup: row !== null && Steps.setupTab(setupSections, row.requirements)
    // The listed screens Details draws in its Actions row: those that are
    // no setup screens and that no status entry declares.
    readonly property var detailScreens: row === null ? [] : Steps.freeScreens(row.tuis, row.status, false)
    // Give the strip the tabs the row has now and keep the shown tab by its
    // text. The strip builds a new button per text, which moves its index,
    // so the index is set again before the page answers a tab change. A
    // Setup tab that leaves while it shows, as a requirement-only one does
    // once its tools are installed, hands on to Details, where the
    // Requirements section then draws.
    onHasSetupChanged: {
        const names = hasSetup ? ["Settings", "Setup", "Details"] : ["Settings", "Details"];
        const shown = names.indexOf(tab) !== -1 ? tab : "Details";
        tabs.returning = true;
        tabs.model = names;
        tabs.currentIndex = names.indexOf(shown);
        tabs.returning = false;
    }

    // The keys of the status entries Details draws, by section, as
    // `sections` holds the schema's: [{ group, keys }], ungrouped first,
    // then each group in the order its first entry appears. The row's
    // `status` is in manifest order and holds no `data`, `choices` or
    // hidden entry.
    readonly property var statusSections: {
        if (row === null) return [];
        const out = [{ group: "", keys: [] }];
        for (const entry of Steps.detailEntries(row.status)) {
            let section = out.find(s => s.group === entry.group);
            if (section === undefined) {
                section = { group: entry.group, keys: [] };
                out.push(section);
            }
            section.keys.push(entry.key);
        }
        return out.filter(s => s.keys.length > 0);
    }

    function statusEntry(key) {
        return row === null ? null : row.status.find(entry => entry.key === key) || null;
    }

    // The tools a plugin needs, each with its state, and STEP, the one
    // action that installs or updates them (Steps.requirementStep), or null.
    // The page draws it on one tab: Setup when it has that tab, else
    // Details. PRIMARY holds while its action is the page's main one.
    component Requirements: Section {
        id: tools

        property var requirements: []
        property var step: null
        property bool primary: true
        signal install()

        visible: requirements.length > 0
        title: "Requirements"
        description: "Tools this plugin needs"

        // Each command is one group, and the Install row after them.
        GroupList {
            id: requirementRows
            width: parent.width

            Repeater {
                model: ScriptModel {
                    values: tools.requirements
                    objectProp: "command"
                }
                RequirementRow {
                    required property var modelData
                    width: requirementRows.width
                    requirement: modelData
                }
            }

            Field {
                width: requirementRows.width
                label: tools.step === null ? "" : tools.step.label
                inline: true
                visible: tools.step !== null
                hint: tools.step === null ? "" : tools.step.hint
                Button {
                    text: tools.step === null ? "" : tools.step.button
                    iconName: tools.step === null ? "" : tools.step.icon
                    variant: tools.primary ? "primary" : "secondary"
                    onClicked: tools.install()
                }
            }
        }
    }

    // Show the page as it opens: on TAB, a tab's text, or on Settings when
    // the page has no such tab, the back button focused.
    function open(reason, tab) {
        tabs.currentIndex = Math.max(0, tabs.model.indexOf(tab));
        back.forceActiveFocus(reason);
    }

    // Write every unsaved edit; answers whether none is left.
    function save() {
        return unsaved.save();
    }

    function discard() {
        unsaved.discard();
    }

    EditSet {
        id: unsaved
        onSaved: saveBar.confirm()
        // The bar's actions leave with the last edit, so the keyboard one
        // of them holds goes to the strip, as a page that hides hands it on.
        onEditedChanged: if (!edited && saveBar.activeFocus) tabs.tabs.forceActiveFocus(Qt.TabFocusReason)
    }

    // The back button and the title sit outside the tab pages, so the keys
    // they leave go to the pages, which step on the tab keys.
    Keys.forwardTo: [tabs]
    Keys.onPressed: event => {
        if (event.key !== Qt.Key_S || event.modifiers !== Qt.ControlModifier) return;
        save();
        event.accepted = true;
    }

    Pane {
        id: layout
        anchors.fill: parent
        container: "window"
        bodySpacing: 0

        titleContent: [
            PageHeader {
                id: titleHeader
                width: parent.width
                text: page.row === null ? "" : page.row.name
                menu: menu

                leading: [
                    IconButton {
                        id: back
                        iconName: "chevron-left"
                        label: "Back to the plugin list"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: page.panel.back()
                    }
                ]

                trailing: [
                    Button {
                        id: openButton
                        text: "Open"
                        iconName: "app-window"
                        variant: "secondary"
                        anchors.verticalCenter: parent.verticalCenter
                        visible: page.row !== null && page.row.opens !== "" && !page.isSelf
                        enabled: page.editable
                        onClicked: page.panel.openSurface(page.row.id)
                    }
                ]

                Menu {
                    id: menu
                    Repeater {
                        model: ScriptModel {
                            values: page.panel.plugins
                            objectProp: "id"
                        }
                        MenuItem {
                            required property var modelData
                            text: modelData.name
                            iconName: modelData.icon
                            checked: page.row !== null && modelData.id === page.row.id
                            onTriggered: page.panel.openPlugin(modelData.id, Qt.TabFocusReason)
                        }
                    }
                }
            }
        ]

        Column {
            id: body
            width: parent.width
            spacing: Theme.stack.page
            visible: page.row !== null

            Repeater {
                model: page.row === null ? [] : page.row.errors
                Label {
                    required property string modelData
                    role: "hint"
                    text: Reply.line(modelData)
                    color: Theme.color.danger
                    width: body.width
                    wrapMode: Text.Wrap
                }
            }

            Label {
                role: "hint"
                text: page.row === null ? "" : page.panel.replyOf(page.row.id)
                visible: text !== ""
                color: Theme.color.danger
                width: parent.width
                wrapMode: Text.Wrap
            }

            TabPages {
                id: tabs
                width: parent.width
                model: ["Settings", "Details"]
                // True while the handler puts Settings back, and while
                // the page sets the strip's tabs.
                property bool returning: false
                onCurrentIndexChanged: {
                    if (returning) return;
                    if (currentIndex === 0 || !page.dirty) {
                        layout.scrollArea.contentY = 0;
                        return;
                    }
                    const wanted = currentIndex;
                    returning = true;
                    currentIndex = 0;
                    returning = false;
                    page.panel.leave(() => { tabs.currentIndex = wanted; });
                }

                Column {
                    id: settingsPage
                    spacing: Theme.stack.page

                    Column {
                        width: parent.width
                        spacing: Theme.stack.row

                        Field {
                            width: parent.width
                            label: "Enabled"
                            inline: true
                            visible: page.row !== null && !page.row.alwaysOn
                            hint: page.row !== null && !page.row.enabled && !page.bare ? "Turn on " + page.row.name + " to change its settings and shortcuts." : ""
                            Switch {
                                size: "sm"
                                checked: page.row !== null && page.row.enabled
                                onToggled: {
                                    checked = Qt.binding(() => page.row !== null && page.row.enabled);
                                    if (page.row !== null) page.panel.toggle(page.row.id);
                                }
                            }
                        }

                        Field {
                            width: parent.width
                            label: "Show in bar"
                            inline: true
                            visible: page.row !== null && page.row.kinds.indexOf("bar-widget") !== -1 && page.row.kinds.some(kind => kind !== "bar" && kind !== "bar-widget")
                            hint: page.row !== null && !page.row.enabled ? "Turn on " + page.row.name + " to show it in the bar." : ""
                            Switch {
                                size: "sm"
                                checked: page.row !== null && page.row.placed
                                enabled: page.editable
                                onToggled: {
                                    checked = Qt.binding(() => page.row !== null && page.row.placed);
                                    if (page.row !== null) page.panel.togglePlaced(page.row.id);
                                }
                            }
                        }
                    }

                    Label {
                        role: "hint"
                        color: Theme.color.textMuted
                        text: "This plugin has no other settings."
                        visible: page.bare
                        width: parent.width
                        wrapMode: Text.Wrap
                    }

                    // Keyed models keep each section, field and key row
                    // while the manager's rows are replaced, so an edit in
                    // progress survives an unrelated change.
                    Repeater {
                        model: ScriptModel {
                            values: page.sections
                            objectProp: "group"
                        }
                        Section {
                            id: section
                            required property var modelData
                            width: body.width
                            title: section.modelData.group

                            Repeater {
                                model: ScriptModel {
                                    values: section.modelData.builtin === null ? [] : [section.modelData.builtin]
                                    objectProp: "id"
                                }
                                SettingField {
                                    required property var modelData
                                    pluginId: modelData.id
                                    spec: ({ type: "boolean", label: "Show on the bar" })
                                    value: modelData.placed
                                    editable: page.editable
                                    onApply: v => { if (page !== null && page.row !== null) page.panel.writePlacement(pluginId, v, page.row.id); }
                                }
                            }

                            Repeater {
                                model: ScriptModel {
                                    values: section.modelData.keys
                                }
                                SettingField {
                                    required property string modelData
                                    width: section.width
                                    pluginId: page.row.id
                                    key: modelData
                                    spec: page.row.schema[modelData]
                                    value: page.row.settings[modelData]
                                    choices: page.row.settingChoices[modelData] || []
                                    status: page.row.status
                                    editable: page.editable
                                    edits: unsaved
                                    onApply: v => { if (page !== null && page.row !== null) page.panel.writeSetting(pluginId, key, v); }
                                    onOpenLink: link => { if (page !== null && page.row !== null) page.panel.openLink(pluginId, link); }
                                    onOpenPage: (id, tab) => { if (page !== null && page.panel !== null) page.panel.openPage(id, tab); }
                                    onChoicesWanted: if (page !== null && page.row !== null) page.panel.refreshChoices(pluginId, spec.optionsFrom)
                                }
                            }

                            Repeater {
                                model: ScriptModel {
                                    values: section.modelData.lists || []
                                }
                                Section {
                                    id: groupedListSection
                                    required property string modelData
                                    width: section.width
                                    title: page.row.schema[modelData].label
                                    description: page.row.schema[modelData].description === undefined ? "" : page.row.schema[modelData].description
                                    info: page.row.schema[modelData].info === undefined ? "" : page.row.schema[modelData].info

                                    ListField {
                                        width: groupedListSection.width
                                        pluginId: page.row.id
                                        key: groupedListSection.modelData
                                        spec: page.row.schema[groupedListSection.modelData]
                                        value: page.row.settings[groupedListSection.modelData]
                                        choices: page.row.settingChoices[groupedListSection.modelData] || []
                                        status: page.row.status
                                        editable: page.editable
                                        edits: unsaved
                                        onApply: v => { if (page !== null && page.row !== null) page.panel.writeSetting(pluginId, key, v); }
                                        onOpenLink: link => { if (page !== null && page.row !== null) page.panel.openLink(pluginId, link); }
                                        onOpenPage: (id, tab) => { if (page !== null && page.panel !== null) page.panel.openPage(id, tab); }
                                    }
                                }
                            }
                        }
                    }

                    Repeater {
                        model: ScriptModel {
                            values: page.lists
                        }
                        Section {
                            id: listSection
                            required property string modelData
                            width: body.width
                            title: page.row.schema[modelData].label
                            description: page.row.schema[modelData].description === undefined ? "" : page.row.schema[modelData].description
                            info: page.row.schema[modelData].info === undefined ? "" : page.row.schema[modelData].info

                            ListField {
                                width: listSection.width
                                pluginId: page.row.id
                                key: listSection.modelData
                                spec: page.row.schema[listSection.modelData]
                                value: page.row.settings[listSection.modelData]
                                choices: page.row.settingChoices[listSection.modelData] || []
                                status: page.row.status
                                editable: page.editable
                                edits: unsaved
                                onApply: v => { if (page !== null && page.row !== null) page.panel.writeSetting(pluginId, key, v); }
                                onOpenLink: link => { if (page !== null && page.row !== null) page.panel.openLink(pluginId, link); }
                                onOpenPage: (id, tab) => { if (page !== null && page.panel !== null) page.panel.openPage(id, tab); }
                            }
                        }
                    }

                    Section {
                        width: parent.width
                        visible: page.row !== null && page.row.binds.length > 0
                        title: "Keys"
                        description: "Select a shortcut and press its new keys."

                        Repeater {
                            model: ScriptModel {
                                values: page.row === null ? [] : page.row.binds
                                objectProp: "shortcut"
                            }
                            KeyField {
                                id: keyField
                                required property var modelData
                                width: body.width
                                pluginId: page.row.id
                                bind: modelData
                                editable: page.editable
                                capture: page.panel.capture
                                edits: unsaved
                                onRemovalAsked: row => page.panel.confirmRemoval(keyField, row)
                                onLineAsked: row => page.panel.openUserLine(row)
                                onApplyKey: key => {
                                    if (page === null || page.row === null) return;
                                    settle(key, Reply.isOk(page.panel.writeKey(pluginId, modelData.shortcut, key)));
                                }
                            }
                        }
                    }

                    Button {
                        text: page.paneHolder === null ? "" : "More settings in " + page.paneHolder.name
                        iconName: page.paneHolder === null ? "" : page.paneHolder.icon
                        variant: "secondary"
                        visible: page.paneHolder !== null
                        enabled: page.editable
                        onClicked: page.panel.openPane(page.row.id)
                    }
                }

                // The strip's second page. Setup stands between Settings and
                // Details when the plugin has it, so the second page is
                // Setup for such a plugin and Details for any other, which
                // then draws here, under sections that are none: an Item's
                // `parent` is writable, and a Column lays out the children
                // it has that are shown and sized
                // (https://doc.qt.io/qt-6/qml-qtquick-item.html#parent-prop,
                // https://doc.qt.io/qt-6/qml-qtquick-column.html).
                Column {
                    id: setupPage
                    spacing: Theme.stack.page

                    // The status sections. Keyed by title, by entry and
                    // by action as drawn, so a status write, which hands
                    // the page new rows, keeps each row in place and a
                    // masked field open on a key line. Each row is one
                    // group of the section's GroupList, `groupList.gap`
                    // apart with a hairline between.
                    Repeater {
                        model: ScriptModel {
                            values: page.setupSections
                            objectProp: "title"
                        }
                        Section {
                            id: statusPart
                            required property var modelData
                            width: body.width
                            title: modelData.title

                            GroupList {
                                id: statusGroups
                                width: statusPart.width

                                // Quickshell 0.3.1's ScriptModel keeps the
                                // old modelData of a row that one update
                                // both changes and moves, matched by
                                // objectProp, while a row changed in place
                                // takes the new one: seen in sandbox-shots'
                                // jarvis-causes scene, after-probe-timeout,
                                // on 834123ac against f09e7df6. A step's
                                // slot changes with its rank, so a moved
                                // step is a new row.
                                Repeater {
                                    model: ScriptModel {
                                        values: statusPart.modelData.items
                                        objectProp: "slot"
                                    }
                                    Loader {
                                        id: statusItem
                                        required property var modelData
                                        width: statusGroups.width
                                        sourceComponent: modelData.keys ? keyList : stepRow

                                        // The stored keys, beside the
                                        // screen that gets one.
                                        Component {
                                            id: keyList
                                            StatusRow {
                                                entry: statusItem.modelData.entry
                                                panel: page.panel
                                                pluginId: page.row === null ? "" : page.row.id
                                                secretLabel: page.row === null ? "" : page.row.secretLabel
                                                onOpenLink: link => { if (page !== null && page.row !== null) page.panel.openLink(page.row.id, link); }
                                                onOpenPage: (id, tab) => { if (page !== null && page.panel !== null) page.panel.openPage(id, tab); }
                                            }
                                        }

                                        // A row in the page's key/value
                                        // style whose value is the entry's
                                        // chip in its tone, or its text
                                        // while it has no tone, so the
                                        // label sits level with the chip,
                                        // and a step's offered action
                                        // beside it, the chip no wider than
                                        // the value column less that
                                        // action, eliding a long state,
                                        // and its entry's info beside the
                                        // label;
                                        // then its lines and its hint under
                                        // the value, as a field draws them,
                                        // the words of the hint its entry's
                                        // `link` names opening that
                                        // address, and the last refusal of
                                        // its step.
                                        Component {
                                            id: stepRow
                                            Field {
                                                id: stepState
                                                readonly property var view: Steps.statusView(statusItem.modelData.entry, ms => Timestamp.text(ms, Time.now.getTime()))
                                                readonly property var button: statusItem.modelData.button
                                                label: statusItem.modelData.label
                                                info: view.info
                                                inline: true
                                                lines: view.lines
                                                hint: view.hint
                                                hintLink: view.link === null ? "" : view.link.text
                                                onHintLinkActivated: page.panel.openLink(page.row.id, view.link)
                                                onHintPageActivated: (id, tab) => page.panel.openPage(id, tab)
                                                // The last refusal of the route its
                                                // press takes.
                                                error: page.row === null || page.panel === null ? ""
                                                    : button !== null && button.name !== "" ? page.panel.replyOf(page.row.id, page.panel.tuiKey(button.name))
                                                    : page.panel.replyOf(page.row.id, statusItem.modelData.key)

                                                function press() {
                                                    if (button.name !== "") page.panel.openTui(page.row.id, button.name);
                                                    else page.panel.act(page.row.id, statusItem.modelData.key);
                                                }

                                                // A Row places only its
                                                // visible children, so a row
                                                // with no action draws as
                                                // the chip alone. The row
                                                // takes the height a
                                                // RowAction would, so it
                                                // keeps one height whichever
                                                // action it offers; the
                                                // primary Button, at the
                                                // small control size so it
                                                // clears the hint under it,
                                                // overhangs it.
                                                Row {
                                                    id: stepValue
                                                    spacing: Theme.stack.inline
                                                    readonly property real actionWidth: primaryStep.visible ? primaryStep.implicitWidth + spacing : plainStep.visible ? plainStep.implicitWidth + spacing : 0
                                                    height: Math.max(stepChip.visible ? stepChip.implicitHeight : 0, stepText.visible ? stepText.implicitHeight : 0, stepState.button !== null ? plainStep.implicitHeight : 0)
                                                    Badge {
                                                        id: stepChip
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        width: Math.min(implicitWidth, stepState.bodyWidth - (stepState.valueX - stepState.leftPadding) - stepValue.actionWidth)
                                                        visible: stepState.view.tone !== ""
                                                        text: stepState.view.text
                                                        tone: stepState.view.tone === "" ? "neutral" : stepState.view.tone
                                                    }
                                                    Label {
                                                        id: stepText
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        role: stepState.view.muted ? "itemHint" : "value"
                                                        visible: stepState.view.tone === "" && stepState.view.text !== ""
                                                        text: stepState.view.text
                                                    }
                                                    Button {
                                                        id: primaryStep
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        visible: stepState.button !== null && stepState.button.primary
                                                        text: visible ? stepState.button.label : ""
                                                        variant: "primary"
                                                        size: "sm"
                                                        enabled: page.editable
                                                        onClicked: stepState.press()
                                                    }
                                                    RowAction {
                                                        id: plainStep
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        visible: stepState.button !== null && !stepState.button.primary
                                                        text: visible ? stepState.button.label : ""
                                                        tone: stepState.button !== null && stepState.button.tone === "danger" ? "danger" : "accent"
                                                        enabled: page.editable
                                                        onClicked: stepState.press()
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // The headline's offered action and the
                                // setup screens no entry declares, under
                                // their own label, with the last refusal
                                // of each open under them.
                                Column {
                                    width: statusGroups.width
                                    spacing: Theme.field.gap
                                    visible: statusPart.modelData.buttons.length > 0
                                    // A labelled row, so the setup screens
                                    // start on the value column with the step
                                    // rows' chips and read as no step's.
                                    Field {
                                        width: parent.width
                                        label: "More setup"
                                        inline: true
                                        Flow {
                                            width: parent.width
                                            spacing: Theme.rowAction.gap
                                            Repeater {
                                                model: ScriptModel {
                                                    values: statusPart.modelData.buttons
                                                    objectProp: "key"
                                                }
                                                // A withheld screen's action
                                                // takes no press and no Tab
                                                // stop; its reason opens on
                                                // hover, which reaches a
                                                // disabled item in Qt Quick,
                                                // and the Status section names
                                                // what is missing for a
                                                // keyboard user.
                                                Loader {
                                                    id: setupScreen
                                                    required property var modelData
                                                    sourceComponent: modelData.primary ? primaryScreen : plainScreen
                                                    // A screen opens through
                                                    // the manager; the
                                                    // headline's own action
                                                    // is its act.
                                                    function press() {
                                                        if (modelData.status === "") page.panel.openTui(page.row.id, modelData.name);
                                                        else page.panel.act(page.row.id, modelData.status);
                                                    }
                                                    Component {
                                                        id: primaryScreen
                                                        Button {
                                                            text: setupScreen.modelData.label
                                                            variant: "primary"
                                                            enabled: page.editable && setupScreen.modelData.enabled
                                                            onClicked: setupScreen.press()
                                                        }
                                                    }
                                                    Component {
                                                        id: plainScreen
                                                        RowAction {
                                                            text: setupScreen.modelData.label
                                                            tone: setupScreen.modelData.tone === "danger" ? "danger" : "accent"
                                                            enabled: page.editable && setupScreen.modelData.enabled
                                                            onClicked: setupScreen.press()
                                                            Tooltip { text: setupScreen.modelData.reason }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Repeater {
                                        model: page.panel === null ? [] : statusPart.modelData.buttons.map(button => button.status === "" ? page.panel.tuiKey(button.name) : button.status)
                                        Label {
                                            required property string modelData
                                            role: "hint"
                                            color: Theme.color.danger
                                            text: page.row === null || page.panel === null ? "" : page.panel.replyOf(page.row.id, modelData)
                                            visible: text !== ""
                                            width: parent.width
                                            wrapMode: Text.Wrap
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Requirements {
                        requirements: page.row !== null && page.hasSetup ? page.row.requirements : []
                        step: page.requirementStep
                        primary: !Steps.stepHoldsPrimary(page.setupSections)
                        onInstall: page.panel.installRequirements(page.row.id)
                    }
                }

                Column {
                    id: detailsPage
                    // The strip's last page beside a Setup tab, as declared.
                    parent: page.hasSetup ? settingsPage.parent : setupPage
                    // The strip shows and hides its own pages alone, and hid
                    // this one as its third.
                    onParentChanged: if (parent === setupPage) visible = true
                    spacing: Theme.stack.page

                    Label {
                        role: "hint"
                        color: Theme.color.textMuted
                        text: page.row === null ? "" : page.row.description
                        width: parent.width
                        wrapMode: Text.Wrap
                    }

                    Flow {
                        width: parent.width
                        spacing: Theme.space.xs
                        visible: page.row !== null && page.row.capabilities.length > 0
                        Repeater {
                            model: page.row === null ? [] : page.row.capabilities
                            Badge { required property string modelData; text: modelData; iconName: "shield" }
                        }
                    }

                    Column {
                        width: parent.width
                        spacing: Theme.stack.row

                        Repeater {
                            model: page.row === null ? [] : [["Author", page.row.author], ["Version", page.row.version], ["License", page.row.license], ["Source", page.row.source === "bundled" ? "Included with VGS" : "Installed"]].filter(pair => pair[1] !== "")
                            Field {
                                id: detail
                                required property var modelData
                                width: body.width
                                label: modelData[0]
                                inline: true
                                Label { role: "value"; text: detail.modelData[1]; width: parent.width; elide: Text.ElideRight }
                            }
                        }

                        Field {
                            width: parent.width
                            label: "Readme"
                            inline: true
                            visible: page.row !== null && page.row.readme !== ""
                            RowAction {
                                text: "Open on GitHub"
                                onClicked: page.panel.openLink(page.row.id, { url: page.row.readme })
                            }
                        }

                        // A bundled plugin is disabled, never updated or removed.
                        Field {
                            width: parent.width
                            label: "Manage"
                            inline: true
                            visible: page.row !== null && page.row.source === "installed"
                            hint: "You can review changes before you apply them."
                            RowActions {
                                RowAction {
                                    text: "Update"
                                    onClicked: page.panel.updatePlugin(page.row.id)
                                }
                                RowAction {
                                    text: "Remove"
                                    tone: "danger"
                                    onClicked: page.panel.removePlugin(page.row.id)
                                }
                            }
                        }

                        // Each screen opens through the manager, and the
                        // last refusal of one reads under the row. A
                        // withheld screen takes no press and no Tab stop;
                        // its reason opens on hover, as on Setup.
                        Field {
                            width: parent.width
                            label: "Actions"
                            inline: true
                            visible: page.detailScreens.length > 0
                            error: page.row === null || page.panel === null ? ""
                                : page.detailScreens.map(screen => page.panel.replyOf(page.row.id, page.panel.tuiKey(screen.name))).find(reply => reply !== "") || ""
                            RowActions {
                                width: parent.width
                                Repeater {
                                    model: ScriptModel {
                                        values: page.detailScreens
                                        objectProp: "key"
                                    }
                                    RowAction {
                                        id: detailScreen
                                        required property var modelData
                                        text: modelData.label
                                        enabled: page.editable && modelData.enabled
                                        onClicked: page.panel.openTui(page.row.id, modelData.name)
                                        Tooltip { text: detailScreen.modelData.reason }
                                    }
                                }
                            }
                        }
                    }

                    // What the plugin published, read-only.
                    Repeater {
                        model: ScriptModel {
                            values: page.statusSections
                            objectProp: "group"
                        }
                        Section {
                            id: statusSection
                            required property var modelData
                            width: body.width
                            title: statusSection.modelData.group === "" ? "Status" : statusSection.modelData.group

                            // Each entry is one group, divided from the next.
                            GroupList {
                                id: statusRows
                                width: statusSection.width

                                Repeater {
                                    model: ScriptModel {
                                        values: statusSection.modelData.keys
                                    }
                                    StatusRow {
                                        required property string modelData
                                        width: statusRows.width
                                        entry: page.statusEntry(modelData)
                                        panel: page.panel
                                        onOpenLink: link => { if (page !== null && page.row !== null) page.panel.openLink(page.row.id, link); }
                                        onOpenPage: (id, tab) => { if (page !== null && page.panel !== null) page.panel.openPage(id, tab); }
                                        pluginId: page.row === null ? "" : page.row.id
                                        secretLabel: page.row === null ? "" : page.row.secretLabel
                                    }
                                }
                            }
                        }
                    }

                    // No tool of a page with no Setup tab asks for a step.
                    Requirements {
                        requirements: page.row !== null && !page.hasSetup ? page.row.requirements : []
                    }
                }
            }
        }

        footer: [
            SaveBar {
                id: saveBar
                width: parent.width
                dirty: page.dirty
                onSave: page.save()
                onDiscard: page.discard()
            }
        ]
    }
}
