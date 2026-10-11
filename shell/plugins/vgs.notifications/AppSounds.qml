import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import "NotificationLogic.js" as Logic

// An app's own notification sound, muted while the shell plays none of its
// own: the service creates this while Do Not Disturb is on or Sound is off
// and destroys it when both turn back or the shell exits. `arm` names the
// app of a notification that arrived; a stream of that app that then
// starts to play is muted until it pauses (NotificationLogic.appSoundStep).
// The mute is the stream's softMute, set with pw-cli: WirePlumber 0.5 keeps
// a stream's `mute` and volumes for every later stream of the same app
// (state-stream.lua, keyed by media.role, else application.name), so a
// plain mute of Slack's chime would mute its next call, and it keeps no
// softMute (measured on a private PipeWire 1.6.9 and WirePlumber 0.5.18
// with a stand-in Slack stream, VGS-1311). A volume written to the stream
// after the softMute lifts it, so a held stream whose volume changes is
// muted again. The destruction lifts every mute this instance holds; one
// that a dead shell left is lifted by the next instance's first scan.
Item {
    id: root

    visible: false

    // App name -> { at, until }: the apps a notification armed lately.
    property var arms: ({})
    // The output streams of the last snapshot, each { node, since }, bound
    // so their properties stay current. A snapshot, never a binding on the
    // live model, as vgs.sound's Audio.qml explains.
    property var streams: []
    // Node id -> { node, phase, until, level }: the streams under a mute;
    // level is the volume the stream last reported, so only a change mutes
    // it again.
    property var holds: ({})
    // The pw-cli runs still to make, each { node, on }, in order.
    property var queue: []

    // The app of a notification that arrived: its streams that start to
    // play in the next APP_SOUND_ARM ms are muted.
    function arm(desktopEntry, appName) {
        const now = Date.now();
        const next = Object.assign({}, arms);
        for (const app of Logic.soundApps(desktopEntry, appName)) next[app] = { at: now, until: now + Logic.APP_SOUND_ARM };
        arms = next;
        for (const entry of streams) judge(entry.node);
    }

    // What the service's status reports: the node names of the streams
    // under a mute.
    function state() {
        return { held: Object.keys(holds).map(id => String(holds[id].node.name)).sort() };
    }

    function props(node) {
        const p = node.properties;
        return p !== null && p !== undefined ? p : {};
    }

    // Quickshell hands node properties over as PipeWire's strings.
    function corked(node) {
        const value = props(node)["pulse.corked"];
        return value === "true" ? true : value === "false" ? false : null;
    }

    function level(node) {
        const audio = node.audio;
        return audio === null ? "" : JSON.stringify([audio.volumes, audio.muted]);
    }

    // The latest arm of the app NODE belongs to, or null.
    function armOf(node) {
        let latest = null;
        for (const app of Object.keys(arms))
            if (Logic.streamOfApps(props(node), [app]) && (latest === null || arms[app].at > latest.at)) latest = arms[app];
        return latest;
    }

    function judge(node) {
        const entry = streams.find(e => e.node === node);
        if (entry === undefined) return;
        const id = String(node.id);
        const held = Logic.hasOwn(holds, id) && holds[id].node === node ? holds[id] : null;
        const step = Logic.appSoundStep(held === null ? null : { phase: held.phase, until: held.until },
            armOf(node), { corked: corked(node), since: entry.since }, Date.now());
        if (step.change === "") return;
        const next = Object.assign({}, holds);
        if (step.hold === null) delete next[id];
        else next[id] = { node: node, phase: step.hold.phase, until: step.hold.until, level: level(node) };
        holds = next;
        soften(node, step.change !== "release");
        schedule();
    }

    // A held stream whose volume changed has lost its mute.
    function levelChanged(node) {
        const id = String(node.id);
        if (!Logic.hasOwn(holds, id) || holds[id].node !== node || holds[id].level === level(node)) return;
        holds[id].level = level(node);
        soften(node, true);
    }

    function refresh() {
        const now = Date.now();
        const nodes = Pipewire.nodes.values.filter(n => n !== null && n.isStream && n.isSink && n.audio !== null);
        streams = nodes.map(n => {
            const known = root.streams.find(e => e.node === n);
            return known === undefined ? { node: n, since: now } : known;
        });
        const next = {};
        for (const id of Object.keys(holds))
            if (nodes.indexOf(holds[id].node) !== -1) next[id] = holds[id];
        holds = next;
        for (const entry of streams) judge(entry.node);
    }

    // The clock runs to the nearest end of an arm or a hold.
    function schedule() {
        const now = Date.now();
        const ends = Object.keys(arms).map(a => arms[a].until).concat(Object.keys(holds).map(id => holds[id].until)).filter(t => t > now);
        if (ends.length === 0) {
            clock.stop();
            return;
        }
        clock.interval = Math.max(1, Math.min(...ends) - now);
        clock.restart();
    }

    function expire() {
        const now = Date.now();
        const next = {};
        for (const app of Object.keys(arms)) if (arms[app].until > now) next[app] = arms[app];
        arms = next;
        for (const entry of streams) judge(entry.node);
        schedule();
    }

    function softArgv(id, on) {
        return ["pw-cli", "set-param", String(id), "Props", on ? "{ softMute: true }" : "{ softMute: false }"];
    }

    function soften(node, on) {
        queue = queue.concat([{ node: node, on: on }]);
        runNext();
    }

    // A node PipeWire removed meanwhile is skipped: its id may already name
    // another stream.
    function runNext() {
        if (runner.running) return;
        while (queue.length > 0) {
            const item = queue[0];
            queue = queue.slice(1);
            if (!Pipewire.nodes.values.includes(item.node)) continue;
            runner.item = item;
            runner.command = softArgv(item.node.id, item.on);
            runner.running = true;
            return;
        }
    }

    // TEXT is pw-dump's answer. A soft mute on an output stream that this
    // instance does not hold is one a shell that died left: nothing else
    // sets a stream's softMute, since pipewire-pulse and WirePlumber write
    // `mute`.
    function lift(text) {
        let objects;
        try {
            objects = JSON.parse(text);
        } catch (e) {
            console.warn("notifications: app sounds: scan json=" + e.message);
            return;
        }
        for (const o of objects) {
            const info = o.info || {};
            const params = (info.params || {}).Props || [];
            if ((info.props || {})["media.class"] !== "Stream/Output/Audio" || !params.some(p => p.softMute === true)) continue;
            if (Logic.hasOwn(holds, String(o.id))) continue;
            const node = Pipewire.nodes.values.find(n => n !== null && n.id === o.id);
            if (node !== undefined) soften(node, false);
        }
    }

    PwObjectTracker {
        objects: root.streams.map(e => e.node)
    }

    // Read on the next turn, not inside the change: rebuilding from the
    // removal signal while Quickshell dispatches it has crashed its PipeWire
    // service (vgs.sound's Audio.qml). Not after Audio.qml's 75 ms either: a
    // Slack chime's stream starts to play 75 ms after it opens.
    Connections {
        target: Pipewire.nodes
        function onValuesChanged() { Qt.callLater(root.refresh); }
    }

    Repeater {
        model: root.streams
        Item {
            required property var modelData
            Connections {
                target: modelData.node
                function onPropertiesChanged() { root.judge(modelData.node); }
            }
            Connections {
                target: modelData.node.audio
                function onVolumesChanged() { root.levelChanged(modelData.node); }
                function onMutedChanged() { root.levelChanged(modelData.node); }
            }
        }
    }

    Timer {
        id: clock
        onTriggered: root.expire()
    }

    // pw-cli and pw-dump need the program path and the session's PipeWire
    // alone; under clearEnvironment a null value passes the shell's own
    // value through (Quickshell 0.3.1, Process.clearEnvironment).
    Process {
        id: runner
        property var item: null
        property var completion: null
        clearEnvironment: true
        environment: ({ PATH: null, XDG_RUNTIME_DIR: null, PIPEWIRE_RUNTIME_DIR: null, PIPEWIRE_REMOTE: null, LANG: "C.UTF-8" })
        stderr: StdioCollector { id: runErr }
        onExited: (code, status) => { completion = { code: code, status: status }; }
        onRunningChanged: {
            if (running) return;
            const done = completion;
            completion = null;
            item = null;
            if (done === null || done.code !== 0)
                console.warn("notifications: app sounds: pw-cli exit=" + JSON.stringify(done) + " argv=" + JSON.stringify(command) + " " + runErr.text.trim().split("\n")[0]);
            root.runNext();
        }
    }

    Process {
        id: scan
        property var completion: null
        command: ["pw-dump"]
        clearEnvironment: true
        environment: ({ PATH: null, XDG_RUNTIME_DIR: null, PIPEWIRE_RUNTIME_DIR: null, PIPEWIRE_REMOTE: null, LANG: "C.UTF-8" })
        stdout: StdioCollector { id: dumped }
        onExited: (code, status) => { completion = { code: code, status: status }; }
        onRunningChanged: {
            if (running) return;
            const done = completion;
            completion = null;
            if (done === null || done.code !== 0) console.warn("notifications: app sounds: pw-dump exit=" + JSON.stringify(done));
            else root.lift(dumped.text);
        }
    }

    Component.onCompleted: {
        refresh();
        scan.running = true;
    }

    // The runner goes with this instance and may stop before its pw-cli
    // reaches PipeWire, so every lift still owed, a held stream's, a queued
    // one's and the one for the stream the runner works on, gets a process
    // of its own.
    Component.onDestruction: {
        const owed = Object.keys(holds).map(id => holds[id].node).concat(queue.filter(i => !i.on).map(i => i.node));
        if (runner.item !== null) owed.push(runner.item.node);
        for (const node of owed)
            if (Pipewire.nodes.values.includes(node)) Quickshell.execDetached(softArgv(node.id, false));
    }
}
