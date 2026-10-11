import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import "NotificationLogic.js" as Logic

// An app's own notification sound, muted while the shell plays none of its
// own: the service creates this while Do Not Disturb is on or Sound is off
// and destroys it when both turn back or the service goes.
//
// Two layers. The sound rule (wireplumber/vgs-notification-sounds.lua),
// while WirePlumber runs it (`ruleRunning`), holds every new output stream
// the hold names silent before it links it, so the chime's first sample is
// silent however late the shell reacts; this writes that hold, naming the
// apps of every notification the service keeps or arms, and the rule
// keeps it only while this instance's writer lives. The shell then frees
// a stream the rule held for an app no notification armed, such as a
// call, as soon as WirePlumber links it. Every other stream keeps the
// reaction: `arm` names the app of a notification that arrived, and a
// stream of that app that then starts to play is muted until it pauses
// (NotificationLogic.appSoundStep).
//
// The mute is the stream's softMute: WirePlumber 0.5 keeps a stream's
// `mute` and volumes for every later stream of the same app
// (state-stream.lua, keyed by media.role, else application.name), so a
// plain mute of Slack's chime would mute its next call, and it keeps no
// softMute. Any write of the stream's `mute` mixes the stream at its own
// volume and mute again, though its softMute still reads true; a write
// of `softMute: false` alone, or with the mute in the same write, leaves
// it mixed at full volume whatever its own volume. So the lift is two
// writes: softMute false, then the mute the stream already has, which
// leaves both reading false at its own level (measured on a private
// PipeWire 1.6.9 and WirePlumber 0.5.18 with stand-in streams, VGS-1311,
// and with a stream at channel volume 0.5, VGS-1424). A volume written to
// a held stream lifts its softMute the same way, so it is muted again.
// The destruction lifts every stream this instance wrote to. A shell
// stopped by a signal runs no destruction, but its writer dies with it,
// so the rule lifts what it held; the next instance's first scan lifts
// what the reaction left, and a shell that does not start again leaves
// that stream muted until its app closes it.
Item {
    id: root

    visible: false

    // Whether WirePlumber runs the sound rule at the shipped version
    // (SoundRule.running), and the notifications the service keeps, live
    // and history, whose apps the hold names.
    property bool ruleRunning: false
    property var kept: []

    // App name -> { at, until }: the apps a notification armed lately.
    property var arms: ({})
    // The output streams of the last snapshot, each { node, since, judged,
    // freeing, wrote }, bound so their properties stay current: judged once
    // the rule's verdict on it was read, freeing while a stream the rule
    // held waits for its link to be freed, wrote once this instance wrote
    // to it. A snapshot, never a binding on the live model, as vgs.sound's
    // Audio.qml explains.
    property var streams: []
    // Node id -> { node, phase, until, level }: the streams under a mute;
    // level is the volume the stream last reported, so only a change mutes
    // it again.
    property var holds: ({})
    // The writes made while the writer does not run, each { node, on }, the
    // last for each stream that is still there.
    property var pending: []
    // The hold as last written to the rule, { at, apps, roles }, at when its
    // first write started; null before that.
    property var ruleHold: null
    // The start-up scan has lifted what an earlier shell left, so a stream
    // the rule holds under this instance's hold is never taken for one.
    property bool scanned: false
    // The apps the hold names: every name a kept or armed notification goes
    // by, as bounded as what the service keeps.
    readonly property var holdNames: Logic.holdApps(kept, Object.keys(arms))
    onHoldNamesChanged: {
        if (ruleHold !== null && Logic.holdGrows(ruleHold.apps, holdNames)) writeHold();
    }
    onRuleRunningChanged: writeHold()

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

    // The rule's verdict counts on a stream's first step with properties,
    // the first the rule could have matched.
    function judge(node) {
        const entry = streams.find(e => e.node === node);
        if (entry === undefined) return;
        let ruled = "";
        if (!entry.judged && Object.keys(props(node)).length > 0) {
            entry.judged = true;
            ruled = Logic.ruleHeld(ruleHold, props(node), entry.since);
        }
        const id = String(node.id);
        const held = Logic.hasOwn(holds, id) && holds[id].node === node ? holds[id] : null;
        const step = Logic.appSoundStep(held === null ? null : { phase: held.phase, until: held.until },
            armOf(node), { corked: corked(node), since: entry.since }, Date.now(), ruled);
        if (step.change === "") return;
        const next = Object.assign({}, holds);
        if (step.hold === null) delete next[id];
        else next[id] = { node: node, phase: step.hold.phase, until: step.hold.until, level: level(node) };
        holds = next;
        entry.freeing = step.change === "release" && ruled !== "";
        if (entry.freeing) freeLinked();
        else soften(node, step.change !== "release");
        schedule();
    }

    // A stream the rule held is freed once it is linked: WirePlumber sends
    // the rule's softMute before it links the stream, on its one
    // connection, so a lift written once the link shows reaches the stream
    // after that mute. One written as soon as the stream shows can reach it
    // first and leave it muted: the shell judged a call within the same
    // millisecond as the rule held it (nested sandbox, WirePlumber 0.5.18,
    // VGS-1424).
    function freeLinked() {
        const linked = Pipewire.linkGroups.values.filter(g => g !== null).map(g => g.source);
        for (const entry of streams) {
            if (!entry.freeing || linked.indexOf(entry.node) === -1) continue;
            entry.freeing = false;
            soften(entry.node, false);
        }
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
            return known === undefined ? { node: n, since: now, judged: false, freeing: false, wrote: false } : known;
        });
        const next = {};
        for (const id of Object.keys(holds))
            if (nodes.indexOf(holds[id].node) !== -1) next[id] = holds[id];
        holds = next;
        pending = pending.filter(i => nodes.indexOf(i.node) !== -1);
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

    // The writer's lines for node ID: ON mutes it; otherwise the lift,
    // softMute false and then MUTED, the stream's own mute.
    function softLines(id, on, muted) {
        const set = "set-param " + id + " Props ";
        return on ? [set + "{ softMute: true }"] : [set + "{ softMute: false }", set + ownProps(muted)];
    }

    function ownProps(muted) {
        return muted ? "{ mute: true }" : "{ mute: false }";
    }

    function ownMute(node) {
        return node.audio !== null && node.audio.muted;
    }

    // A node PipeWire removed meanwhile is skipped: its id may already name
    // another stream.
    function soften(node, on) {
        if (!writer.running) {
            pending = pending.filter(i => i.node !== node).concat([{ node: node, on: on }]);
            return;
        }
        if (!Pipewire.nodes.values.includes(node)) return;
        const entry = streams.find(e => e.node === node);
        if (entry !== undefined) entry.wrote = true;
        writer.write(softLines(node.id, on, ownMute(node)).join("\n") + "\n");
    }

    // The hold names this instance's writer, once it runs, WirePlumber runs
    // the rule and the scan is done; a hold written again keeps the time
    // of its first write.
    function writeHold() {
        if (!ruleRunning || !writer.running || !scanned) return;
        ruleHold = { at: ruleHold === null ? Date.now() : ruleHold.at, apps: holdNames, roles: Logic.HOLD_ROLES };
        if (holdWriter.running) holdWriter.again = true;
        else holdWriter.send();
    }

    // TEXT is pw-dump's answer. A soft mute on an output stream that this
    // instance does not hold is one a shell that stopped left: nothing else
    // sets a stream's softMute, since pipewire-pulse and WirePlumber write
    // `mute`, and the rule lifts what it held when that shell's writer
    // died. A stream a destruction lifted with its mute alone still reads
    // softMute true, so it is lifted again, which changes nothing.
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

    Connections {
        target: Pipewire.linkGroups
        function onValuesChanged() { Qt.callLater(root.freeLinked); }
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

    // The one pw-cli that takes every softMute write on its stdin, a line
    // each, and whose life is the hold's: the rule counts the hold only
    // while a PipeWire client with this process's pid exists. setpriv
    // gives it SIGKILL as its parent-death signal, so it dies with a shell
    // stopped by a signal; pw-cli runs on after its input ends (measured,
    // pw-cli 1.6.9, VGS-1424), and Quickshell kills a destroyed Process's
    // child (vgs.capture's Service.qml). setpriv and sh each exec the next
    // program, so the Process's pid is pw-cli's. pw-cli prints a line for
    // every change it sees; its output goes nowhere.
    // pw-cli, pw-metadata and pw-dump need the program path and the
    // session's PipeWire alone; under clearEnvironment a null value passes
    // the shell's own value through (Quickshell 0.3.1,
    // Process.clearEnvironment).
    Process {
        id: writer
        command: ["setpriv", "--pdeathsig", "KILL", "--", "sh", "-c", "exec pw-cli >/dev/null"]
        stdinEnabled: true
        clearEnvironment: true
        environment: ({ PATH: null, XDG_RUNTIME_DIR: null, PIPEWIRE_RUNTIME_DIR: null, PIPEWIRE_REMOTE: null, LANG: "C.UTF-8" })
        stderr: SplitParser {
            onRead: line => console.info("notifications: app sounds: pw-cli " + line)
        }
        onStarted: {
            const owed = root.pending;
            root.pending = [];
            for (const item of owed) root.soften(item.node, item.on);
            root.writeHold();
        }
        // Info: the destruction ends it too.
        onExited: (code, status) => console.info("notifications: app sounds: writer exit=" + JSON.stringify({ code: code, status: status }))
    }

    Process {
        id: holdWriter
        property bool again: false
        property var completion: null
        function send() {
            command = ["pw-metadata", "-n", Logic.SOUND_RULE_METADATA, "0", "hold", Logic.holdEntry(writer.processId, root.ruleHold.apps), "Spa:String:JSON"];
            running = true;
        }
        clearEnvironment: true
        environment: ({ PATH: null, XDG_RUNTIME_DIR: null, PIPEWIRE_RUNTIME_DIR: null, PIPEWIRE_REMOTE: null, LANG: "C.UTF-8" })
        stderr: StdioCollector { id: holdErr }
        onExited: (code, status) => { completion = { code: code, status: status }; }
        onRunningChanged: {
            if (running) return;
            const done = completion;
            completion = null;
            if (done === null || done.code !== 0) console.warn("notifications: app sounds: hold write exit=" + JSON.stringify(done) + " " + holdErr.text.trim().split("\n")[0]);
            if (!again) return;
            again = false;
            send();
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
            root.scanned = true;
            root.writeHold();
        }
    }

    Component.onCompleted: {
        refresh();
        scan.running = true;
        writer.running = true;
    }

    // The writer goes with this instance, SIGKILLed, and may not have
    // reached PipeWire with what it was last given, so every stream this
    // instance wrote to or holds, and every lift still owed, gets a lift of
    // its own. It writes the stream's own mute alone, which mixes it at its
    // own level: two detached processes could land softMute false last and
    // leave it at full volume.
    Component.onDestruction: {
        const owed = streams.filter(e => e.wrote).map(e => e.node).concat(Object.keys(holds).map(id => holds[id].node))
            .concat(pending.filter(i => !i.on).map(i => i.node));
        for (const node of owed.filter((n, i) => owed.indexOf(n) === i))
            if (Pipewire.nodes.values.includes(node)) Quickshell.execDetached(["pw-cli", "set-param", String(node.id), "Props", ownProps(ownMute(node))]);
    }
}
