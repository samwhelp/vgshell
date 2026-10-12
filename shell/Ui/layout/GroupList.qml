import QtQuick
import qs.Commons
import qs.Ui

// A column of groups: each child is one group of lines, such as a key/value
// row with its hint, its action and its command, whose own lines sit
// `row.lineGap` apart. Groups sit `groupList.gap` apart with a hairline in
// `groupList.divider` in each gap, so the lines of one group read as one
// block and the next group starts clearly after it. The hairline is centred
// between what the eye sees: the lowest drawn pixel of the group above
// (Theme.inkBelow) and the highest of the group below (Theme.inkAbove),
// so a hint's leading, a label centred in a taller row or a button that
// fills its row moves it no closer to one group than to the other. A
// child that is hidden or has no width or height takes no gap and no
// hairline, as a Column skips it. A group list inside another is one group
// of the outer one and divides its own groups the same way, so every group
// of a section is divided alike whatever holds it. `inkAbove()` and
// `inkBelow()` are where the first shown group's drawn content starts and
// the last one's ends, so an outer list and a section after the list
// measure from that ink.
Item {
    id: root

    default property alias groups: column.data

    function inkAbove() { return Theme.inkAbove(column); }
    function inkBelow() { return height - column.height + Theme.inkBelow(column); }
    // The y of each hairline, one per gap between two shown groups.
    readonly property var hairlines: {
        const shown = column.children.filter(child => child.visible && child.width > 0 && child.height > 0);
        return shown.slice(1).map((child, i) => {
            const above = shown[i].y + shown[i].height - Theme.inkBelow(shown[i]);
            return Math.round((above + child.y + Theme.inkAbove(child) - Theme.divider.thickness) / 2);
        });
    }

    width: parent ? parent.width : implicitWidth
    implicitWidth: column.implicitWidth
    implicitHeight: column.implicitHeight

    Column {
        id: column
        width: root.width
        spacing: Theme.groupList.gap
    }

    Repeater {
        model: root.hairlines
        Divider {
            required property real modelData
            y: modelData
            width: root.width
            color: Theme.groupList.divider
        }
    }
}
