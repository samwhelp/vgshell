import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Steps.js" as Steps

// One plugin's page, drawn from its manager row alone. The header holds a
// back button, which returns to the list, and the plugin's name as a title
// whose menu lists every plugin, the current one checked, and opens the
// chosen one's page. Open summons the plugin's window or panel. The body
// holds every error and the last refusal, then two pages under one tab
// strip (TabPages), Settings first.
//
// Settings holds what a user changes: the enabled switch, the Show in bar
// switch of a plugin with a bar widget and another kind besides bar and
// bar-widget, which stays enabled once unplaced, the switch turning only
// while the plugin is enabled (for a widget-only plugin Enabled is the
// placement), then the status sections (Steps.settingsSections): a Status
// section with the `Setup` group's first entry under its own label; a
// Setup section with each further entry of that group as a step row under
// its own label, whose value is a Badge chip in its tone, beside it a
// step's offered screen or action, with its lines and hint under it, then
// the plugin's stored keys and tokens of no group or of `Setup`, each entry
// a StatusRow with one line per key, whose steps add, replace and remove a
// key the core stores, then, on an unlabelled row from the value column,
// the first entry's offered action when it opens no listed screen, then
// one action per other setup screen the manifest lists, which opens it
// through the manager: a screen an offered status action opens first, with
// the action's label, then the others; then one section per other status
// group that holds a key list, its keys and states in manifest order. The
// first offered step that is no danger draws as the page's one primary
// Button, every other action as a RowAction, a danger one in the danger
// tone. Then one settings section
// per schema group (entries without a group have no heading), one
// section per `list` entry, titled with its label, and the Keys section,
// then, for a plugin of kind `pane` while a panes holder is enabled, a
// button named for the holder that opens the plugin's page there. A
// plugin with none of those below its switches says so in one line. A
// disabled plugin's fields are read-only, its Enabled switch says to turn
// it on while it has something to change, and its setup actions and
// holder button take no press.
//
// Details holds what a user reads: the description, in the hint role in
// the muted colour, the capabilities, the listing metadata, the Update and
// Remove actions of an installed plugin, one status section per status
// group (entries without a group first, under `Status`), but for the
// entries the Settings tab draws (Steps.detailEntries), whose values are
// read-only and whose setup steps run through the manager (D061), and the
// Requirements section with an Install all missing button while one is
// missing, and Update all outdated once the rest are only outdated. A disabled plugin's status rows say it has not reported.
//
// `open` shows Settings, so every opened page starts there; a change of
// the manager's rows moves neither the page nor an edit. A page change
// returns the body to its top, where the strip is. The header and body
// share one content edge, the scroll bar sits in the window's right inset,
// and each inline value draws at line height 1, centred on its label. The
// switches, and the listing metadata with Manage, are each one key/value
// group `stack.row` apart, with one key/value row height. No row of the
// Settings tab draws a divider: a section heading parts its groups.
//
// A text field and a key typed as text wait for a save (EditSet): while one
// holds an unsaved edit the footer shows the save bar, whose Save, and
// Ctrl+S anywhere on the page, write every such edit, and whose Discard
// puts the configuration's values back. The bar reads Saved once the last
// edit is written, and a refused one keeps its field edited and the bar
// shown. A change to Details with an unsaved edit returns to Settings and
// asks the panel first.
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
    readonly property int tab: tabs.currentIndex
    readonly property alias titleMenu: menu
    readonly property alias title: titleHeader.titleButton
    readonly property alias initialFocus: back
    // The manager row of the panes holder that shows this plugin's page,
    // or null.
    readonly property var paneHolder: row === null || row.paneHolder === "" ? null : panel.plugins.find(p => p.id === row.paneHolder) || null
    // Whether the Settings page holds nothing below its switches.
    readonly property bool bare: row !== null && row.builtins.length === 0 && row.tuis.length === 0 && settingsSections.length === 0 && sections.length === 0 && lists.length === 0 && row.binds.length === 0 && paneHolder === null
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
    // The Settings tab's status sections in drawn order, with their rows,
    // keys and setup actions.
    readonly property var settingsSections: row === null ? [] : Steps.settingsSections(row.tuis, row.status)

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

    // Show the page as it opens: on Settings, the back button focused.
    function open(reason) {
        tabs.currentIndex = 0;
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
                // True while the handler puts Settings back.
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

                    // The status sections. Keyed by title, by entry and
                    // by action as drawn, so a status write, which hands
                    // the page new rows, keeps each row in place and a
                    // masked field open on a key line. Each row is one
                    // group of the section's GroupList, `groupList.gap`
                    // apart with no divider.
                    Repeater {
                        model: ScriptModel {
                            values: page.settingsSections
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
                                divided: false

                                Repeater {
                                    model: ScriptModel {
                                        values: statusPart.modelData.items
                                        objectProp: "key"
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
                                                divided: statusGroups.divided
                                                entry: statusItem.modelData.entry
                                                panel: page.panel
                                                pluginId: page.row === null ? "" : page.row.id
                                                secretLabel: page.row === null ? "" : page.row.secretLabel
                                                onOpenLink: url => { if (page !== null && page.row !== null) page.panel.openLink(page.row.id, url); }
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
                                        // action, eliding a long state;
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
                                                inline: true
                                                lines: view.lines
                                                hint: view.hint
                                                hintLink: view.link === null ? "" : view.link.text
                                                onHintLinkActivated: page.panel.openLink(page.row.id, view.link.url)
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

                                // The setup screens no step row draws,
                                // with the last refusal of each open
                                // under them.
                                Column {
                                    width: statusGroups.width
                                    spacing: Theme.field.gap
                                    visible: statusPart.modelData.buttons.length > 0
                                    // An unlabelled row, so the setup screens
                                    // start on the value column with the step
                                    // rows' chips.
                                    Field {
                                        width: parent.width
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
                                    onOpenLink: url => { if (page !== null && page.row !== null) page.panel.openLink(pluginId, url); }
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
                                        onOpenLink: url => { if (page !== null && page.row !== null) page.panel.openLink(pluginId, url); }
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
                                onOpenLink: url => { if (page !== null && page.row !== null) page.panel.openLink(pluginId, url); }
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

                Column {
                    id: detailsPage
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
                                        onOpenLink: url => { if (page !== null && page.row !== null) page.panel.openLink(page.row.id, url); }
                                        pluginId: page.row === null ? "" : page.row.id
                                        secretLabel: page.row === null ? "" : page.row.secretLabel
                                    }
                                }
                            }
                        }
                    }

                    Section {
                        width: parent.width
                        visible: page.row !== null && page.row.requirements.length > 0
                        title: "Requirements"
                        description: "Tools this plugin needs"

                        // Each command is one group, and the Install row after them.
                        GroupList {
                            id: requirementRows
                            width: parent.width

                            Repeater {
                                model: ScriptModel {
                                    values: page.row === null ? [] : page.row.requirements
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
                                label: page.requirementStep === null ? "" : page.requirementStep.label
                                inline: true
                                visible: page.requirementStep !== null
                                hint: page.requirementStep === null ? "" : page.requirementStep.hint
                                Button {
                                    text: page.requirementStep === null ? "" : page.requirementStep.button
                                    iconName: page.requirementStep === null ? "" : page.requirementStep.icon
                                    variant: "primary"
                                    onClicked: page.panel.installRequirements(page.row.id)
                                }
                            }
                        }
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
