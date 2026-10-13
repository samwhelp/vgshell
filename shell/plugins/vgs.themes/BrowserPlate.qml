import QtQuick
import qs.Commons

// The layout slot keeps its size and position while the solid plate and
// its contents move together onto whole screen rows and columns.
Item {
    id: root

    default property alias content: plate.data
    property alias color: plate.color
    property alias radius: plate.radius

    data: Rectangle {
        id: plate
        // Item x/y are relative to the parent (Qt 6 Item documentation).
        // The browser's ancestors, including SummonLayer's host slot, have
        // translation only. Reading each position here keeps the origin
        // reactive when the pane centres again, without moving its rail.
        // https://doc.qt.io/qt-6/qml-qtquick-item.html#x-prop
        readonly property point origin: {
            let x = 0, y = 0;
            for (let item = parent; item !== null; item = item.parent) {
                x += item.x;
                y += item.y;
            }
            return Qt.point(x, y);
        }
        x: Math.round(origin.x) - origin.x
        y: Math.round(origin.y) - origin.y
        width: root.width
        height: root.height
        radius: Theme.surface.radius
        color: Theme.carousel.failurePlate
    }
}
