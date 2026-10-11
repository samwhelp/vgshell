import QtQuick

// A holder of the `dictation` capability for scripts/smoke/rows/dictation.sh.
// IPC: `start` takes the mode and answers what the capability answered;
// `stop` answers likewise and keeps what its callback receives; `cancel`
// and `restart` answer likewise. The row reads `state`, the capability's
// own, `last`, the last stop's result, and `results`, how many arrived.
Item {
    id: root
    property var shell: null
    property bool registered: false
    property var last: null
    property int results: 0
    readonly property var state: shell === null ? null : shell.dictation.state

    onShellChanged: {
        if (shell === null || registered) return;
        registered = true;
        shell.ipc.handle("start", mode => root.shell.dictation.start(mode));
        shell.ipc.handle("stop", () => root.shell.dictation.stop(result => {
            root.last = result;
            root.results += 1;
        }));
        shell.ipc.handle("cancel", () => root.shell.dictation.cancel());
        shell.ipc.handle("restart", () => root.shell.dictation.restart());
    }
}
