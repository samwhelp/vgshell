pragma Singleton
import QtQuick

// Stands in for the Quickshell singleton, whose plugin does not load
// outside the shell. env(NAME) answers "env:NAME" for every variable, so a
// test reads which names a Process environment hands on and from where.
// It lists no screen; a test sets `screens` to the ones it needs.
QtObject {
    property string shellDir: "/stand-in/shell"
    property var screens: []

    function env(name) {
        return "env:" + name;
    }
}
