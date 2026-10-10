import QtQuick
import qs.Commons
import qs.Ui
import "CloudSyncLogic.js" as Logic

// The Cloud Sync icon in the bar. It draws the status the service
// publishes and runs nothing itself: nothing until a folder pair exists,
// then a calm cloud while the folders are
// current, paused or syncing, the warning tone while the data is old, the
// sync is offline or not set up, or files wait for review, with their
// count, and the danger tone while a sign-in is needed or the sync failed;
// a spinner while a sync runs (CloudSyncLogic.widgetView decides). The
// tooltip names each folder pair by its label and state, and the last
// sync's time in the shell's one wording of a past moment (Timestamp); it
// never shows a file name or an account. A click opens or closes the
// Cloud Sync window.
BarWidget {
    id: widget

    readonly property var cloud: shell === null ? undefined : shell.status.values.cloud
    readonly property var view: Logic.widgetView(cloud, Time.now.getTime())
    readonly property var tip: Logic.widgetTooltip(cloud, Time.now.getTime(), Timestamp.text)

    visible: !view.hidden
    implicitWidth: view.hidden ? 0 : button.implicitWidth
    implicitHeight: barSize

    function toneColor(tone) {
        switch (tone) {
        case "calm": return Theme.bar.foreground;
        case "warning": return Theme.color.warning;
        case "danger": return Theme.color.danger;
        default: throw new Error("cloud-sync widget: tone " + JSON.stringify(tone) + " is not one of calm, warning, danger");
        }
    }

    // Open or close the Cloud Sync window; answers the window host's reply.
    function toggle() {
        const reply = shell.surfaces.toggle("window", "{}");
        if (reply !== "ok") console.warn("cloud-sync widget: window " + reply);
        return reply;
    }

    BarItem {
        id: button
        anchors.centerIn: parent
        label: "Cloud Sync"
        iconName: widget.view.icon
        spinning: widget.view.spinning
        count: widget.view.badge
        tone: widget.toneColor(widget.view.tone)
        tooltip: widget.tip.title
        tooltipDetails: widget.tip.details
        onClicked: widget.toggle()
    }
}
