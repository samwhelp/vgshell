import QtQuick
import qs.Commons
import qs.Ui
import "CloudSyncLogic.js" as Logic

// The Cloud Sync window: where the sync stands, from the status the service
// publishes. Its subtitle is the headline (CloudSyncLogic.headline, which
// the bar and the Settings page also read) in its tone's colour, then the
// last complete sync, the pause and the last problem. Folder pairs lists
// each pair by its label, Google Drive folder and state, with Remove, which opens
// the remove TUI for that pair; while the folder pair list is invalid, it
// offers the reset TUI, which keeps the damaged list and starts an empty
// one. To review lists each file Cloud Sync kept or restored,
// a change on both sides, a local deletion, a Drive deletion or a Drive rename, under its folder
// pair's label, with Open folders, which opens the folders that hold its
// versions. The footer holds Sync now, enabled only when a sync can
// start, Resume while the sync is paused, or Set up hourly sync while the
// hourly sync is not set up, over Pause or Resume and Add a folder pair
// while a folder pair exists (CloudSyncLogic.footerView).
// It runs nothing itself: Sync now, Pause and Resume ask the service
// through the plugin's own IPC, setup opens the plugin's floating TUIs,
// and Open folders hands each folder to xdg-open. The window asks to be
// `size.panel.lg` wide and `size.panel.maxHeight` tall, or the room its
// screen leaves when that is less; an Escape nothing here takes goes on to
// the window host, which closes the window. It takes no payload.
FocusScope {
    id: root

    // The core assigns the plugin's scoped shell object after creation, and
    // again when the plugin's settings change.
    property var shell: null
    readonly property var screen: shell === null ? null : shell.screens.current
    readonly property var cloud: shell === null ? undefined : shell.status.values.cloud
    readonly property bool known: cloud !== undefined
    readonly property double now: Time.now.getTime()
    readonly property var standing: known ? Logic.windowStatus(cloud, now, Timestamp.text) : null
    readonly property var footer: Logic.footerView(cloud)
    // While the runner cannot read the pair list it refuses every pair
    // change, so the window offers none; the subtitle says why.
    readonly property bool pairsValid: known && Logic.pairListValid(cloud)
    // The refusal the last action was answered with, "" for none.
    property string problem: ""
    property Item initialFocus: primary

    function open(payloadJson) {
        problem = "";
    }
    function close() {}

    // Sync now, Pause or Resume through the service; answers its reply.
    function ask(name) {
        return answered(shell.ipc.call(name, ""), "VGS could not reach Cloud Sync.");
    }

    // Open the plugin's TUI NAME with ARGS; answers the capability's reply.
    function run(name, args) {
        return answered(shell.tui.run(name, args === undefined ? [] : args), "VGS could not open the setup window.");
    }

    function toneColor(tone) {
        return tone === "danger" ? Theme.color.danger : tone === "warning" ? Theme.color.warning : Theme.color.textMuted;
    }

    // Open each folder that holds a version of the file under review.
    function review(dirs) {
        for (const dir of dirs) {
            const reply = answered(shell.run.detached(["xdg-open", dir]), "VGS could not open the folder.");
            if (reply !== "ok") return reply;
        }
        return "ok";
    }

    function answered(reply, sentence) {
        problem = reply === "ok" ? "" : sentence;
        if (reply !== "ok") console.warn("cloud-sync window: " + reply);
        return reply;
    }

    implicitWidth: Math.floor(Math.min(Theme.size.panel.lg, OverlayState.room(screen).width))
    implicitHeight: Math.floor(Math.min(Theme.size.panel.maxHeight, OverlayState.room(screen).height))
    focus: true

    Pane {
        id: layout
        anchors.fill: parent
        container: "window"

        title: "Cloud Sync"
        subtitle: [
            Column {
                width: layout.contentWidth
                spacing: Theme.row.lineGap

                Label {
                    width: parent.width
                    role: "hint"
                    text: root.known ? root.standing.text : "Reading the sync status"
                    color: root.known ? root.toneColor(root.standing.tone) : Theme.color.textMuted
                    wrapMode: Text.Wrap
                }
                Repeater {
                    model: root.known ? root.standing.lines : []
                    Label {
                        required property var modelData
                        width: layout.contentWidth
                        role: "hint"
                        text: modelData.text
                        color: modelData.tone === "danger" ? Theme.color.danger : Theme.color.textFaint
                        wrapMode: Text.Wrap
                    }
                }
                Label {
                    width: parent.width
                    role: "hint"
                    visible: text !== ""
                    text: root.problem
                    color: Theme.color.danger
                    wrapMode: Text.Wrap
                }
            }
        ]

        Column {
            width: layout.contentWidth
            spacing: Theme.stack.group
            visible: root.known

            Section {
                title: "Folder pairs"
                Repeater {
                    model: root.known ? root.cloud.pairs.map(p => Logic.pairRow(p, root.now)) : []
                    ListItem {
                        id: pairRow
                        required property var modelData
                        width: parent.width
                        iconName: modelData.icon
                        text: modelData.label
                        secondary: modelData.secondary
                        trailing: [
                            Badge {
                                anchors.verticalCenter: parent.verticalCenter
                                text: pairRow.modelData.text
                                tone: pairRow.modelData.tone
                            },
                            RowAction {
                                anchors.verticalCenter: parent.verticalCenter
                                tone: "danger"
                                text: "Remove"
                                onClicked: root.run("remove-pair", [pairRow.modelData.id])
                            }
                        ]
                    }
                }
                EmptyState {
                    width: parent.width
                    visible: root.known && !root.pairsValid
                    iconName: "file-x"
                    text: root.known ? Logic.pairListResetHint(root.cloud.lastError) : ""
                    actionText: "Start the folder pair list again"
                    onActivated: root.run("reset-pairs")
                }
                EmptyState {
                    width: parent.width
                    visible: root.pairsValid && root.cloud.pairs.length === 0
                    iconName: "folder-sync"
                    text: "No folder pairs yet. Add one to choose what Cloud Sync keeps in step."
                    actionText: "Add a folder pair"
                    onActivated: root.run("add-pair")
                }
            }

            Section {
                visible: root.known && root.cloud.conflictCount > 0
                title: "To review"
                description: "Cloud Sync kept older copies on this computer, restored removed files, and deleted nothing. Open folders shows the folders that hold each version."
                // A pair's label on its own line over its files, since a
                // ListItem's secondary line elides and would cut it.
                Repeater {
                    model: root.known ? Logic.conflictGroups(root.cloud.conflicts) : []
                    Column {
                        id: conflictGroup
                        required property var modelData
                        width: parent.width
                        spacing: Theme.stack.row
                        Label {
                            width: parent.width
                            role: "bodyStrong"
                            text: conflictGroup.modelData.label
                            wrapMode: Text.Wrap
                        }
                        Repeater {
                            model: conflictGroup.modelData.rows
                            ListItem {
                                id: conflictRow
                                required property var modelData
                                width: parent.width
                                iconName: "file-exclamation-point"
                                text: modelData.label
                                secondary: modelData.secondary
                                trailing: [
                                    RowAction {
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "Open folders"
                                        onClicked: root.review(conflictRow.modelData.dirs)
                                    }
                                ]
                            }
                        }
                    }
                }
                Label {
                    width: parent.width
                    visible: text !== ""
                    role: "hint"
                    text: root.known ? Logic.moreConflicts(root.cloud) : ""
                }
            }
        }

        footer: [
            Column {
                width: layout.contentWidth
                spacing: Theme.stack.group

                Button {
                    id: primary
                    width: parent.width
                    variant: "primary"
                    enabled: root.footer.primary.enabled
                    text: root.footer.primary.text
                    iconName: root.footer.primary.icon
                    onClicked: root.footer.primary.action === "setup" ? root.run("setup") : root.ask(root.footer.primary.action)
                }

                // Hidden with no folder pair, when the empty pair list
                // offers Add a folder pair itself. Column lays out no
                // invisible child (Qt 6 Column reference: "If an item
                // within a Column is not visible ... the item will not be
                // laid out").
                Item {
                    width: parent.width
                    height: addButton.implicitHeight
                    visible: root.footer.add

                    Button {
                        id: pauseButton
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        variant: "tertiary"
                        visible: root.footer.pause !== null
                        text: root.footer.pause !== null ? root.footer.pause.text : ""
                        iconName: root.footer.pause !== null ? root.footer.pause.icon : ""
                        onClicked: root.ask(root.footer.pause.action)
                    }
                    Button {
                        id: addButton
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        variant: "tertiary"
                        enabled: root.pairsValid
                        text: "Add a folder pair"
                        iconName: "folder-plus"
                        onClicked: root.run("add-pair")
                    }
                }
            }
        ]
    }
}
