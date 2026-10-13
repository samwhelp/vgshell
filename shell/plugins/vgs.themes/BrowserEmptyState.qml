import QtQuick
import qs.Commons
import qs.Ui

// A solid plate keeps an empty browser readable over every wallpaper,
// as the search and failure lines do. The inset keeps the recovery
// button and its focus ring inside the plate, including rounded corners.
Rectangle {
    id: root

    property alias iconName: state.iconName
    property alias text: state.text
    property alias actionText: state.actionText
    signal activated()

    implicitHeight: state.implicitHeight + 2 * Theme.surface.padding
    radius: Theme.surface.radius
    color: Theme.carousel.failurePlate

    EmptyState {
        id: state
        x: plateInset.inset
        y: Theme.surface.padding
        width: Math.max(0, root.width - 2 * plateInset.inset)
        onActivated: root.activated()
    }

    ClearingInset {
        id: plateInset
        pad: Theme.surface.padding
        radius: root.radius
        width: root.width
        height: root.height
        top: Theme.surface.padding
    }
}
