import QtQuick
import qs.Commons
import qs.Ui

// The panel's header over the stack while the Inbox or the History is open:
// its title with the Settings gear on the title's line and the subtitle
// under it, then the Sound, Do Not Disturb and History icons and one pill,
// Mark all read (Inbox) or Clear history (History). The History icon stays
// in its place in both views and is checked while the History shows, where
// a click goes back to the Inbox. Sound off and Do Not Disturb on draw the
// same signal, their glyph and the checked box, so a state away from the
// normal one reads the same on both. Each icon's box is IconBox, round as
// the header, and each icon's screen-reader name states its state. Its
// caller supplies state and handles each request.
Item {
    id: header

    required property var look
    required property Item settingsHost
    // The notifications' own VGlass choice, their `glass` setting.
    property bool glassChoice: false
    property string mode: "inbox"
    property string subtitle: ""
    // Whether a notification that shows may play the shell's sound, and
    // whether the user chose a sound for it on the Sounds page: with none
    // chosen nothing plays, which the Sound icon's tooltip says.
    property bool sound: true
    property bool soundChosen: false
    property bool dnd: false
    property bool shown: false
    readonly property bool history: mode === "history"
    // The stack's text column, which the cards' text starts on.
    required property real textColumn
    signal soundRequested(bool on)
    signal dndRequested(bool on)
    signal clearRequested()
    signal markReadRequested()
    signal modeRequested(string mode)
    // The title starts on the cards' column, and never under the header's
    // own rounded end: the controls inset is the square-corner floor.
    readonly property real titleInset: Math.max(textColumn, Math.ceil(Inset.clearing(look.header.controlsInset, look.radius.full, width, height, look.radius.clearance, titles.y)))

    // The box behind a header icon, in place of the shared Button's: the
    // look's colours on the look's full rounding, so a checked icon draws a
    // circle in the round header, not the theme's square. The rest is
    // clear; hover, press and checked draw as the shared button orders them.
    component IconBox: Rectangle {
        id: box

        required property var look
        required property Item button
        readonly property var tokens: look.header.icon

        radius: look.radius.full
        color: button.checked ? (button.down ? tokens.checkedPressed : button.hovered ? tokens.checkedHover : tokens.checked)
            : button.down ? tokens.pressed : button.hovered ? tokens.hover : tokens.rest
        border.width: tokens.borderWidth
        border.color: button.checked ? tokens.border : tokens.rest
        Behavior on color { ColorAnim { duration: box.look.motion.duration.short4; curve: box.look.motion.curve.standard } }
        FocusRing { target: box.button }
    }

    implicitWidth: look.header.width
    implicitHeight: look.header.height
    opacity: shown ? 1 : 0
    visible: opacity > 0
    transform: Translate { y: header.shown ? 0 : -header.look.header.drop }
    Behavior on opacity { Anim { duration: header.look.motion.duration.medium1; curve: header.look.motion.curve.standard } }

    GlassSurface {
        anchors.fill: parent
        optIn: header.glassChoice
        fill: header.look.card.fill
        radius: header.look.radius.full
        elevation: "tight"
        shadowCached: false
    }

    Column {
        id: titles
        anchors.left: parent.left
        anchors.leftMargin: header.titleInset
        anchors.verticalCenter: parent.verticalCenter
        spacing: header.look.header.lineGap

        Text {
            id: title
            objectName: "notificationHeaderTitleText"
            textFormat: Text.PlainText
            text: header.history ? "History" : "Notifications"
            color: header.look.text.foreground
            font.family: header.look.font.family.sans
            font.pixelSize: header.look.text.title.size
            font.weight: header.look.text.title.weight
            style: Text.Raised
            styleColor: header.look.text.shadow
        }
        Text {
            objectName: "notificationHeaderSubtitleText"
            textFormat: Text.PlainText
            visible: text.length > 0
            text: header.subtitle
            color: header.look.text.subtitle.color
            font.family: header.look.font.family.sans
            font.pixelSize: header.look.text.subtitle.size
        }
    }

    // On the title's line: the gear's glyph, not its box, stands the title
    // gap after the title, and the box is centred on the title's line on a
    // whole pixel, so the icon draws sharp.
    IconButton {
        id: gear
        objectName: "notificationSettingsGear"
        x: Math.round(titles.x + title.width + header.look.header.titleGap - glyphStart)
        y: Math.round(titles.y + title.y + (title.height - height) / 2)
        size: "sm"
        background: IconBox { look: header.look; button: gear }
        iconName: "settings"
        label: "Settings"
        onClicked: header.settingsHost.openSettingsPage()
    }

    Row {
        anchors.right: parent.right
        anchors.rightMargin: header.look.header.controlsInset
        anchors.verticalCenter: parent.verticalCenter
        spacing: header.look.header.controlsGap

        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: header.look.header.iconGap

            // The shell's own sound. Sound off also mutes the sound an app
            // plays itself for a notification, which the Sounds page says.
            IconButton {
                id: soundIcon
                size: "sm"
                background: IconBox { look: header.look; button: soundIcon }
                iconName: header.sound ? "volume-2" : "volume-off"
                label: "Notification sound"
                Accessible.name: label + (header.sound ? ", on" : ", off")
                checked: !header.sound
                tooltip: !header.sound ? "The VGS notification sound is off. Click to turn it on."
                    : header.soundChosen ? "The VGS notification sound is on. Click to turn it off."
                    : "The VGS notification sound is on. No sound plays until you select one in System Settings → Sounds. Click to turn it off."
                onClicked: header.soundRequested(!header.sound)
            }
            IconButton {
                id: dndIcon
                size: "sm"
                background: IconBox { look: header.look; button: dndIcon }
                iconName: header.dnd ? "bell-off" : "bell"
                label: "Do Not Disturb"
                Accessible.name: label + (header.dnd ? ", on" : ", off")
                tooltip: header.dnd ? "Do Not Disturb is on. New notifications go to History and do not show. Click to turn it off."
                    : "Do Not Disturb is off. Click to keep new notifications in History without showing them."
                checked: header.dnd
                onClicked: header.dndRequested(!header.dnd)
            }
            IconButton {
                id: historyIcon
                size: "sm"
                background: IconBox { look: header.look; button: historyIcon }
                iconName: "rotate-ccw-clock"
                label: "History"
                Accessible.name: label + (header.history ? ", open" : ", closed")
                tooltip: header.history ? "The panel shows History. Click to show unread notifications."
                    : "The panel shows unread notifications. Click to show History."
                checked: header.history
                onClicked: header.modeRequested(header.history ? "inbox" : "history")
            }
        }

        PillButton {
            anchors.verticalCenter: parent.verticalCenter
            look: header.look
            text: header.history ? "Clear history" : "Mark all read"
            onClicked: header.history ? header.clearRequested() : header.markReadRequested()
        }
    }
}
