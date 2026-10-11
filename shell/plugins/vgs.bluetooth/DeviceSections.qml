import QtQuick
import Quickshell.Bluetooth
import qs.Commons
import qs.Ui
import "BluetoothLogic.js" as Logic

// The two device lists the flyout and the pane share, each a qs.Ui
// DeviceList over BluetoothLogic.deviceRows: My Devices, whose action
// connects, disconnects or retries a device while its row shows Connecting…,
// Disconnecting… and one failure sentence; Nearby, whose Pair asks the
// owner through `pairRequested`, hidden while `pairBusy` holds. With
// `manage`, My Devices offers Rename, which asks the owner through
// `renameRequested`, Trust or Don't trust, and Forget, which Delete runs
// too. Both lists show only while Bluetooth is on.
Column {
    id: root

    property bool powerOn: false
    property bool manage: false
    property bool pairBusy: false
    property var attempts: ({})
    // Quickshell 0.3.1 publishes BluetoothDevice.state with stateChanged,
    // and BluetoothDeviceState.toString returns the four state names.
    readonly property var states: Logic.stateMap(Bluetooth.devices.values, root.stateOf)
    onStatesChanged: root.attempts = Logic.settleAttempts(root.attempts, root.states)
    readonly property var lists: Logic.deviceRows(Bluetooth.devices.values, root.stateOf, root.attempts)
    readonly property var failures: root.lists.mine.filter(r => r.failed).map(r => Logic.failureText(r.text))
    readonly property var adapter: Bluetooth.defaultAdapter
    readonly property bool searching: adapter !== null && adapter.discovering
    readonly property alias mine: mineList

    signal pairRequested(string address)
    signal renameRequested(string address)

    spacing: Theme.stack.group

    function deviceFor(address) { return Logic.deviceAt(Bluetooth.devices.values, address); }
    function stateOf(device) { return BluetoothDeviceState.toString(device.state); }

    function toggle(address) {
        const device = deviceFor(address);
        if (device === null) return;
        const action = Logic.pressAction(stateOf(device));
        if (action === null) return;
        device.connected = action === "connect";
        // Quickshell 0.3.1 sets Connecting or Disconnecting during this write.
        // Recording after it keeps settlement from reading the old state, and no failure reason is exposed.
        root.attempts = Logic.attemptPressed(root.attempts, address, action);
    }

    // A menu entry of one of your devices.
    function choose(address, key) {
        const device = deviceFor(address);
        if (device === null) return;
        switch (key) {
        case "rename":
            root.renameRequested(address);
            break;
        case "trust":
            device.trusted = true;
            break;
        case "untrust":
            device.trusted = false;
            break;
        case "forget":
            device.forget();
            break;
        default:
            throw new Error("bluetooth: device menu key " + JSON.stringify(key) + " is not one of rename, trust, untrust, forget");
        }
    }

    Section {
        title: "My Devices"
        visible: root.powerOn
        width: parent.width
        DeviceList {
            id: mineList
            width: parent.width
            rows: root.lists.mine
            removable: root.manage
            actionOf: row => Logic.mineAction(row)
            menuOf: row => root.manage ? Logic.mineMenu(row) : []
            onActed: key => root.toggle(key)
            onChose: (key, entry) => root.choose(key, entry)
            onRemoved: key => root.choose(key, "forget")
        }
        Repeater {
            model: root.failures
            Label {
                width: parent.width
                role: "hint"
                color: Theme.color.danger
                wrapMode: Text.Wrap
                text: modelData
            }
        }
        Label {
            width: parent.width
            visible: root.lists.mine.length === 0
            role: "hint"
            text: "No devices yet"
        }
    }

    Section {
        title: "Nearby"
        visible: root.powerOn
        width: parent.width
        DeviceList {
            width: parent.width
            rows: root.lists.nearby
            actionOf: row => Logic.nearbyAction(row, root.pairBusy)
            onActed: key => { if (!root.pairBusy) root.pairRequested(key); }
        }
        Row {
            visible: root.lists.nearby.length === 0
            spacing: Theme.control.gap
            Spinner {
                anchors.verticalCenter: parent.verticalCenter
                running: root.searching
                visible: root.searching
            }
            Label {
                anchors.verticalCenter: parent.verticalCenter
                role: "hint"
                text: root.searching ? "Looking for devices" : "No devices nearby"
            }
        }
    }
}
