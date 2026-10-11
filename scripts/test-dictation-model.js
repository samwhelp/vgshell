#!/usr/bin/env node
// Event sequences for the `dictation` capability's decisions,
// shell/Core/DictationModel.js, the code the core runs over its
// `voxtype daemon` child. One table: each row is a list of events, a `|`
// that marks where the row starts to read effects, and what the model and
// the effects after the mark must be. An event is its function's name and
// arguments; start, stop, cancel and restart carry the answer they must
// give last. Expected values are written by hand. Controls edit a copy of
// the module, one rule each, and require this suite to fail.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");

const file = path.join(__dirname, "..", "shell", "Core", "DictationModel.js");
const DIR = "/run/user/1000/vgshell/dictation";
const STATE_PATH = "/run/user/1000/voxtype/state";
// What `voxtype status --format json` prints, src/status_json.rs.
const line = (alt, model) => JSON.stringify({ text: "", alt: alt, class: alt, tooltip: "", model: model || "parakeet-tdt-0.6b-v3", device: "default", backend: "ONNX CPU" });
const PROBE = ["ran", "probe", 0, line("stopped") + "\n"];
const CONFIG = [
    ["ran", "audio.max_duration_secs", 0, "210\n"],
    ["ran", "audio.device", 0, "default\n"],
    ["ran", "engine", 0, "parakeet\n"],
    ["ran", "output.mode", 0, "paste\n"],
    ["ran", "output.auto_submit", 0, "true\n"],
    ["ran", "text.smart_auto_submit", 0, "false\n"]
];
// Holder `a` leases, the start steps pass, and the follower prints idle.
const READY = [["lease", "a"], PROBE, ...CONFIG, ["ran", "directory", 0, ""], ["ran", "clean", 0, ""], ["status", line("idle")]];
const BOTH = [...READY, ["lease", "b"]];
const TEXT_START = "run:voxtype record start --file=" + DIR + "/1.txt --no-auto-submit --no-smart-auto-submit --no-osd";
const TYPE_START = "run:voxtype record start --auto-submit --no-smart-auto-submit --paste";
const REMOVE = "run:rm -f -- " + DIR + "/1.txt " + DIR + "/1.txt.done";
const WAIT = "run:voxtype record stop --wait --json --timeout 60";
const CANCEL = "run:voxtype record cancel";
// The one read of the daemon after a recording's last command, and its end.
const READ = "run:voxtype status --format json";
const read = alt => ["ran", "state", 0, line(alt) + "\n"];
const END = ["abort", "unfollow", "term", "timer=2000"];
// A text recording by `a` that the daemon took, and one it cancelled.
const TAKEN = [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""]];
const CANCELLED = [...TAKEN, ["cancel", "a", "ok"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""]];
const answer = (status, text) => JSON.stringify({ chars: text.length, message: null, status: status, text: text }) + "\n";

const CASES = [
    ["a lease probes for a daemon before it starts one",
        ["|", ["lease", "a"]],
        { daemon: "starting", child: "none" }, ["run:voxtype status --format json"]],
    ["the probe's stopped reads the config, one key at a time",
        [["lease", "a"], "|", PROBE, CONFIG[0]],
        { daemon: "starting", child: "none" }, ["run:voxtype config get audio.max_duration_secs", "run:voxtype config get audio.device"]],
    ["the last start step removes the killed daemon's state file before the child starts",
        [["lease", "a"], PROBE, ...CONFIG, "|", ["ran", "directory", 0, ""]],
        { daemon: "starting", child: "none" }, ["run:rm -f -- " + STATE_PATH]],
    ["the clean step starts the daemon and its follower",
        [["lease", "a"], PROBE, ...CONFIG, ["ran", "directory", 0, ""], "|", ["ran", "clean", 0, ""]],
        { daemon: "starting", child: "running" }, ["daemon", "follow"]],
    ["the follower's idle reads the daemon ready, with what the config and the line name",
        [...READY],
        { daemon: "ready", phase: "idle", holder: "", engine: "parakeet", model: "parakeet-tdt-0.6b-v3", device: "default" }, null],
    ["the follower's stopped, printed before the daemon holds its lock, is not ready",
        [["lease", "a"], PROBE, ...CONFIG, ["ran", "directory", 0, ""], ["ran", "clean", 0, ""], ["status", line("stopped")]],
        { daemon: "starting" }, null],
    ["a second lease starts nothing",
        [...READY, "|", ["lease", "b"]],
        { daemon: "ready", holders: ["a", "b"] }, []],
    ["a release that leaves a holder keeps the daemon",
        [...BOTH, "|", ["release", "a"]],
        { daemon: "ready", child: "running", holders: ["b"] }, []],
    ["the last release stops the daemon and its follower",
        [...BOTH, ["release", "a"], "|", ["release", "b"]],
        { daemon: "absent", child: "stopping", holders: [] }, END],
    ["a daemon that outlives its grace is killed",
        [...READY, ["release", "a"], "|", ["deadline"]],
        { daemon: "absent", child: "stopping" }, ["kill"]],
    ["with no holder the ended daemon starts nothing",
        [...READY, ["release", "a"], "|", ["exited", 0]],
        { daemon: "absent", child: "none" }, ["timer=0"]],
    ["a lease taken while the daemon ends probes again from its exit",
        [...READY, ["release", "a"], ["lease", "b"], "|", ["exited", 0]],
        { daemon: "starting", child: "none" }, ["timer=0", "run:voxtype status --format json"]],
    ["a daemon that answers the probe reads elsewhere and starts nothing",
        [["lease", "a"], "|", ["ran", "probe", 0, line("idle") + "\n"], ["start", "a", "type", "refused: dictation=daemon-elsewhere"]],
        { daemon: "elsewhere", child: "none" }, []],
    ["a probe that fails reads failed and starts nothing",
        [["lease", "a"], "|", ["ran", "probe", 1, ""]],
        { daemon: "failed", child: "none" }, ["log", "abort"]],
    ["a cap the config does not state fails the start",
        [["lease", "a"], PROBE, ["ran", "audio.max_duration_secs", 0, "null\n"], CONFIG[1], CONFIG[2], CONFIG[3], CONFIG[4], "|", CONFIG[5]],
        { daemon: "failed", child: "none" }, ["log", "abort"]],
    ["an output mode outside voxtype's set fails the start",
        [["lease", "a"], PROBE, CONFIG[0], CONFIG[1], CONFIG[2], ["ran", "output.mode", 0, "weird\n"], CONFIG[4], "|", CONFIG[5]],
        { daemon: "failed", child: "none" }, ["log", "abort"]],
    ["an auto-submit value outside true and false fails the start",
        [["lease", "a"], PROBE, CONFIG[0], CONFIG[1], CONFIG[2], CONFIG[3], ["ran", "output.auto_submit", 0, "maybe\n"], "|", CONFIG[5]],
        { daemon: "failed", child: "none" }, ["log", "abort"]],
    ["a smart auto-submit value outside true and false fails the start",
        [["lease", "a"], PROBE, CONFIG[0], CONFIG[1], CONFIG[2], CONFIG[3], CONFIG[4], "|", ["ran", "text.smart_auto_submit", 0, "maybe\n"]],
        { daemon: "failed", child: "none" }, ["log", "abort"]],
    ["a daemon that ends on its own reads failed",
        [...READY, "|", ["exited", 1]],
        { daemon: "failed", child: "none" }, ["unfollow", "log", "abort"]],
    ["a start before the daemon is ready is refused",
        [["lease", "a"], "|", ["start", "a", "text", "refused: dictation=daemon-starting"]],
        { daemon: "starting", holder: "" }, []],
    ["a mode that is neither type nor text is refused",
        [...READY, "|", ["start", "a", "paste", "refused: dictation=mode value=\"paste\""]],
        { holder: "" }, []],
    ["mode type records with voxtype's own output",
        [...READY, "|", ["start", "a", "type", "ok"]],
        { holder: "a", mode: "type" }, [TYPE_START]],
    ["a start after a killed daemon reads starting until the new daemon's own word",
        [["lease", "a"], PROBE, ...CONFIG, ["ran", "directory", 0, ""], ["ran", "clean", 0, ""], ["status", line("stopped")], "|",
            ["start", "a", "type", "refused: dictation=daemon-starting"], ["status", line("idle")]],
        { daemon: "ready", phase: "idle", holder: "" }, []],
    ["a type start after a killed text recording passes the configured output",
        [...TAKEN, ["exited", null], ["restart", "ok"], PROBE, ...CONFIG, ["ran", "directory", 0, ""], ["ran", "clean", 0, ""], ["status", line("idle")], "|", ["start", "a", "type", "ok"]],
        { holder: "a", mode: "type" }, [TYPE_START]],
    ["a type start names the other configured values: file output, no auto-submit, smart auto-submit",
        [["lease", "a"], PROBE, CONFIG[0], CONFIG[1], CONFIG[2], ["ran", "output.mode", 0, "file\n"], ["ran", "output.auto_submit", 0, "false\n"],
            ["ran", "text.smart_auto_submit", 0, "true\n"], ["ran", "directory", 0, ""], ["ran", "clean", 0, ""], ["status", line("idle")], "|", ["start", "a", "type", "ok"]],
        { holder: "a", mode: "type" }, ["run:voxtype record start --no-auto-submit --smart-auto-submit --file"]],
    ["mode text records to a file and arms the cancel a second before the cap",
        [...READY, "|", ["start", "a", "text", "ok"]],
        { holder: "a", mode: "text" }, ["timer=209000", TEXT_START]],
    ["a second holder's start answers busy and names the holder",
        [...BOTH, ["start", "a", "text", "ok"], "|", ["start", "b", "type", "refused: dictation=busy holder=a"]],
        { holder: "a", mode: "text" }, []],
    ["a stop or a cancel by another holder is refused",
        [...BOTH, ["start", "a", "text", "ok"], "|", ["stop", "b", "refused: dictation=not-holder holder=a"], ["cancel", "b", "refused: dictation=not-holder holder=a"]],
        { holder: "a" }, []],
    ["a stop with no recording is refused",
        [...READY, "|", ["stop", "a", "refused: dictation=idle"]],
        { holder: "" }, []],
    ["a text stop waits for the transcript, hands it over and removes the file",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["status", line("recording")], "|", ["stop", "a", "ok"], ["ran", "stop", 0, answer("ok", "hello there")]],
        { holder: "", phase: "unread" }, ["timer=0", WAIT, "done:" + JSON.stringify({ kind: "text", text: "hello there" }), REMOVE, READ]],
    ["an empty transcript is handed over as empty",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], "|", ["ran", "stop", 3, answer("empty", "")]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "empty" }), REMOVE, READ]],
    ["an ok answer with no words is handed over as empty",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], "|", ["ran", "stop", 0, answer("ok", " ")]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "empty" }), REMOVE, READ]],
    ["a stop that prints no answer is handed over as failed",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], "|", ["ran", "stop", 1, ""]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "failed", reason: "stop code=1" }), CANCEL, REMOVE]],
    ["a stop that gave up is handed over as failed, and its transcription is cancelled before the file goes",
        [...TAKEN, ["stop", "a", "ok"], "|", ["ran", "stop", 4, answer("timeout", "")], ["ran", "cancel", 0, ""]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "failed", reason: "stop status=timeout" }), CANCEL, REMOVE, READ]],
    ["a type stop hands over typed once the stop ran",
        [...READY, ["start", "a", "type", "ok"], ["ran", "start", 0, ""], "|", ["stop", "a", "ok"], ["ran", "stop", 0, ""]],
        { holder: "" }, ["run:voxtype record stop", "done:" + JSON.stringify({ kind: "typed" }), READ]],
    ["a type stop that failed is handed over as failed",
        [...READY, ["start", "a", "type", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], "|", ["ran", "stop", 1, ""]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "failed", reason: "stop code=1" }), READ]],
    ["a transcript the daemon finished before the stop command ended is still handed over",
        [...TAKEN, ["stop", "a", "ok"], ["status", line("transcribing")], ["status", line("idle")], "|", ["ran", "stop", 0, answer("ok", "hello there")]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "text", text: "hello there" }), REMOVE, READ]],
    ["a stop asked before the start command ended is still answered",
        [...READY, ["start", "a", "text", "ok"], ["stop", "a", "ok"], ["ran", "start", 0, ""], "|", ["ran", "stop", 0, answer("ok", "hello there")]],
        { holder: "" }, ["done:" + JSON.stringify({ kind: "text", text: "hello there" }), REMOVE, READ]],
    ["a second stop while one waits is refused",
        [...READY, ["start", "a", "text", "ok"], ["stop", "a", "ok"], "|", ["stop", "a", "refused: dictation=stopping"]],
        { holder: "a" }, []],
    ["the next holder takes its turn once the daemon was read and the follower prints idle",
        [...BOTH, ["start", "a", "type", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], ["ran", "stop", 0, ""],
            ["start", "b", "text", "refused: dictation=engine-busy state=unread"], read("transcribing"),
            ["start", "b", "text", "refused: dictation=engine-busy state=transcribing"], ["status", line("idle")], "|", ["start", "b", "text", "ok"]],
        { holder: "b", phase: "idle" }, ["timer=209000", TEXT_START]],
    ["a start after a cancel waits for the cancelled recording's commands",
        [...READY, ["start", "a", "text", "ok"], ["cancel", "a", "ok"], "|", ["start", "a", "text", "refused: dictation=engine-busy state=unread"],
            ["ran", "start", 0, ""], ["status", line("recording")], ["ran", "cancel", 0, ""], ["status", line("idle")]],
        { holder: "", timer: "none", phase: "unread" }, [READ]],
    ["the start after that cancel is taken once the daemon was read idle",
        [...CANCELLED, read("idle"), "|", ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["status", line("recording")]],
        { holder: "a", timer: "cap", phase: "recording" }, ["timer=209000", TEXT_START.replace("/1.txt", "/2.txt"), "check"]],
    ["the cancelled recording's lines, late, leave a recording whose start command has not ended",
        [...CANCELLED, read("idle"), ["start", "a", "text", "ok"], "|", ["status", line("recording")], ["status", line("idle")]],
        { holder: "a", timer: "cap" }, []],
    ["a start the first recording's failed command belongs to is not the second's",
        [...READY, ["start", "a", "text", "ok"], ["cancel", "a", "ok"], "|", ["ran", "start", 1, ""]],
        { holder: "" }, []],
    ["a start command that ended 0 arms the start check",
        [...READY, ["start", "a", "text", "ok"], "|", ["ran", "start", 0, ""]],
        { holder: "a", phase: "idle" }, ["check"]],
    ["a start the daemon said nothing for is read once at the check, and its idle releases the holder for the next start",
        [...TAKEN, "|", ["checked"], read("idle"), ["start", "a", "text", "ok"]],
        { holder: "a", phase: "idle", timer: "cap" }, [READ, "timer=0", REMOVE, "timer=209000", TEXT_START.replace("/1.txt", "/2.txt")]],
    ["restart is taken once that read released the holder",
        [...TAKEN, ["checked"], read("idle"), "|", ["restart", "ok"]],
        { daemon: "starting", holder: "" }, END],
    ["the check reads nothing once the follower said recording",
        [...TAKEN, ["status", line("recording")], "|", ["checked"]],
        { holder: "a", phase: "recording" }, []],
    ["the check reads nothing under a stop",
        [...TAKEN, ["stop", "a", "ok"], "|", ["checked"]],
        { holder: "a" }, []],
    ["the check's idle read keeps a recording stopped while it ran",
        [...TAKEN, ["checked"], ["stop", "a", "ok"], "|", read("idle")],
        { holder: "a" }, []],
    ["the check's recording read keeps the recording",
        [...TAKEN, ["checked"], "|", read("recording")],
        { holder: "a", phase: "recording" }, []],
    ["a daemon that took the start signal and never recorded reads idle after the stop",
        [...TAKEN, ["stop", "a", "ok"], ["ran", "stop", 3, answer("empty", "")], ["ran", "remove", 0, ""], read("idle"), "|", ["start", "a", "type", "ok"]],
        { holder: "a", phase: "idle" }, [TYPE_START]],
    ["a stop the follower printed nothing for leaves the daemon's own word",
        [...READY, ["start", "a", "type", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], ["ran", "stop", 0, ""], "|", read("transcribing"),
            ["start", "a", "type", "refused: dictation=engine-busy state=transcribing"]],
        { holder: "", phase: "transcribing" }, []],
    ["a state read that fails leaves no reader of the daemon, which fails",
        [...CANCELLED, "|", ["ran", "state", 1, ""]],
        { daemon: "failed", child: "stopping" }, ["log", ...END]],
    ["a state read that prints no status fails the daemon",
        [...CANCELLED, "|", ["ran", "state", 0, "not json\n"]],
        { daemon: "failed", child: "stopping" }, ["log", ...END]],
    ["a cancel discards the recording and its file",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], "|", ["cancel", "a", "ok"]],
        { holder: "" }, [CANCEL, "timer=0", REMOVE]],
    ["a release cancels that holder's recording and keeps the daemon",
        [...BOTH, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], "|", ["release", "a"]],
        { daemon: "ready", child: "running", holder: "", holders: ["b"] }, [CANCEL, "timer=0", REMOVE]],
    ["a release of the other holder leaves the recording",
        [...BOTH, ["start", "a", "text", "ok"], "|", ["release", "b"]],
        { holder: "a", holders: ["a"] }, []],
    ["a release while the stop waits drops its callback uncalled",
        [...BOTH, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], "|", ["release", "a"], ["ran", "stop", 0, answer("ok", "late")]],
        { holder: "" }, [CANCEL, "forget", REMOVE]],
    ["the last release with a text recording cancels it ahead of the queue and keeps the daemon for the cancel",
        [...TAKEN, ["stop", "a", "ok"], "|", ["release", "a"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""]],
        { daemon: "absent", child: "stopping", holder: "", holders: [], timer: "drain" }, ["abort", CANCEL, "forget", REMOVE, "timer=2000", READ]],
    ["the daemon ends once it is read idle after that cancel",
        [...TAKEN, ["release", "a"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""], "|", read("idle")],
        { daemon: "absent", child: "stopping", timer: "grace" }, END],
    ["a daemon read before it took that cancel ends at the follower's idle",
        [...TAKEN, ["release", "a"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""], read("recording"), "|", ["status", line("idle")]],
        { daemon: "absent", child: "stopping", timer: "grace" }, END],
    ["the follower's idle before the cancel command ended does not end the daemon",
        [...TAKEN, ["status", line("recording")], ["release", "a"], "|", ["status", line("idle")]],
        { daemon: "absent", timer: "drain" }, []],
    ["a daemon that takes no cancel within the grace is ended",
        [...TAKEN, ["release", "a"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""], read("recording"), "|", ["deadline"]],
        { daemon: "absent", child: "stopping", timer: "grace" }, ["log", ...END]],
    ["a daemon that ends while it takes the cancel leaves nothing to end",
        [...TAKEN, ["release", "a"], "|", ["exited", 0]],
        { daemon: "absent", child: "none", timer: "none" }, ["timer=0", "unfollow", "abort"]],
    ["a lease taken while the daemon takes the cancel probes again from its exit",
        [...TAKEN, ["release", "a"], ["lease", "b"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""], read("idle"), "|", ["exited", 0]],
        { daemon: "starting", child: "none" }, ["timer=0", "run:voxtype status --format json"]],
    ["the last release with a type recording ends the daemon at once",
        [...READY, ["start", "a", "type", "ok"], ["ran", "start", 0, ""], "|", ["release", "a"]],
        { daemon: "absent", child: "stopping", holder: "", timer: "grace" }, END],
    ["a failed daemon that still runs takes the text recording's cancel before it ends",
        [...TAKEN, ["stop", "a", "ok"], "|", ["unfollowed"]],
        { daemon: "failed", child: "stopping", holder: "", timer: "drain" }, ["log", "abort", CANCEL, "done:" + JSON.stringify({ kind: "failed", reason: "daemon-follower-ended" }), REMOVE, "timer=2000"]],
    ["a restart while the failed daemon takes the cancel probes again from its exit",
        [...TAKEN, ["unfollowed"], ["restart", "ok"], ["ran", "cancel", 0, ""], ["ran", "remove", 0, ""], read("idle"), "|", ["exited", 0]],
        { daemon: "starting", child: "none" }, ["timer=0", "run:voxtype status --format json"]],
    ["the deadline cancels a text recording",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], "|", ["deadline"]],
        { holder: "" }, ["log", CANCEL, REMOVE]],
    ["a type recording arms no deadline",
        [...READY, "|", ["start", "a", "type", "ok"], ["ran", "start", 0, ""]],
        { holder: "a", timer: "none" }, [TYPE_START, "check"]],
    ["a recording the daemon ended on its own is over",
        [...READY, ["start", "a", "type", "ok"], ["ran", "start", 0, ""], ["status", line("recording")], ["status", line("transcribing")], "|", ["status", line("idle")]],
        { holder: "", phase: "idle" }, []],
    ["a start the daemon did not take is over",
        [...READY, ["start", "a", "text", "ok"], "|", ["ran", "start", 1, ""]],
        { holder: "", phase: "unread" }, ["timer=0", REMOVE, READ]],
    ["a config value that cannot be read fails the start",
        [["lease", "a"], PROBE, CONFIG[0], "|", ["ran", "audio.device", 1, ""]],
        { daemon: "failed", child: "none" }, ["log", "abort"]],
    ["restart is refused while a recording runs",
        [...READY, ["start", "a", "type", "ok"], "|", ["restart", "refused: dictation=busy holder=a"]],
        { daemon: "ready", child: "running" }, []],
    ["restart ends the daemon and probes again from its exit",
        [...READY, "|", ["restart", "ok"], ["exited", 0]],
        { daemon: "starting", child: "none" }, [...END, "timer=0", "run:voxtype status --format json"]],
    ["restart reads a daemon elsewhere again",
        [["lease", "a"], ["ran", "probe", 0, line("idle") + "\n"], "|", ["restart", "ok"], PROBE],
        { daemon: "starting", child: "none" }, ["abort", "run:voxtype status --format json", "run:voxtype config get audio.max_duration_secs"]],
    ["a daemon that ends under a waiting stop hands over failed",
        [...READY, ["start", "a", "text", "ok"], ["ran", "start", 0, ""], ["stop", "a", "ok"], "|", ["exited", 1]],
        { daemon: "failed", holder: "" }, ["unfollow", "log", "abort", "done:" + JSON.stringify({ kind: "failed", reason: "daemon-ended code=1" }), REMOVE]],
    ["a follower that ends on its own fails the daemon",
        [...READY, "|", ["unfollowed"]],
        { daemon: "failed", child: "stopping" }, ["log", "abort", "unfollow", "term", "timer=2000"]],
    ["a line that is no status object is logged and changes nothing",
        [...READY, "|", ["status", "not json"]],
        { daemon: "ready", phase: "idle" }, ["log"]],
    ["voxtype's streaming is published as recording",
        [...READY, ["status", line("streaming")]],
        { phase: "recording" }, null],
    ["a line whose state is no word voxtype prints is logged and changes nothing",
        [...READY, ["status", line("recording")], "|", ["status", line("weird")]],
        { daemon: "ready", phase: "recording" }, ["log"]]
];

const word = e => e.kind === "run" ? "run:" + e.argv.join(" ") : e.kind === "timer" ? "timer=" + e.ms : e.kind === "done" ? "done:" + JSON.stringify(e.result) : e.kind;

function verify(M) {
    for (const [label, events, want, effects] of CASES) {
        let model = M.initial(DIR, STATE_PATH), seen = null;
        for (const event of events) {
            if (event === "|") {
                seen = [];
                continue;
            }
            const [name, ...args] = event;
            const answered = ["start", "stop", "cancel", "restart"].indexOf(name) !== -1;
            const step = M[name](model, ...(answered ? args.slice(0, -1) : args));
            if (answered) assert.equal(step.answer, args[args.length - 1], `${label}: ${name} answers`);
            model = step.model;
            if (seen !== null) seen.push(...step.effects.map(word));
        }
        const got = Object.assign({ timer: model.timer }, M.record(model), M.state(model));
        for (const key of Object.keys(want)) assert.deepEqual(JSON.parse(JSON.stringify(got[key])), want[key], `${label}: ${key}`);
        if (effects !== null) assert.deepEqual(seen, effects, `${label}: effects`);
    }
    assert.throws(() => M.release(M.initial(DIR, STATE_PATH), "a"), /release by a which holds none/, "a release with no lease is an error");
    assert.throws(() => M.start(M.initial(DIR, STATE_PATH), "a", "type"), /start by a which holds no lease/, "a start with no lease is an error");
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(M.record(M.initial(DIR, STATE_PATH))))).sort(), ["child", "daemon", "holder", "holders", "mode"], "the lending record holds no path and no text");
}

verify(load(file));

// [label, the text to replace, its replacement]: each must turn the suite red.
const CONTROLS = [
    ["a start while another recording runs is refused as busy", '    else if (t.recording !== null) answer = "refused: dictation=busy holder=" + t.recording.holder;\n', ""],
    ["no daemon starts with no holder", '    if (t.daemon === "starting" && t.step === "exit") step(t, effects, PROBE);', "    step(t, effects, PROBE);"],
    ["the last release stops the daemon", "    if (t.holders.length === 0) {\n        end(t, effects, \"\");", "    if (t.holders.length === 0) {"],
    ["a release cancels that holder's recording", "    } else if (t.recording !== null && t.recording.holder === id) {\n        cancelRecording(t, effects, \"\");\n    }", "    }"],
    ["restart is refused while a recording runs", '    if (t.recording !== null) answer = "refused: dictation=busy holder=" + t.recording.holder;\n    else if (t.holders.length === 0)', "    if (t.holders.length === 0)"],
    ["a daemon elsewhere starts nothing", '        } else if (alt.word !== "stopped") {', "        } else if (false) {"],
    ["today's reading of the old state file is removed before the child starts", '        step(s, effects, CLEAN);\n        return;', '        s.step = "child";\n        s.child = "running";\n        effects.push({ kind: "daemon" }, { kind: "follow" });\n        return;'],
    ["the deadline cancels a text recording", '        cancelRecording(t, effects, "");\n    } else if (timer === "grace"', '    } else if (timer === "grace"'],
    ["a text recording arms the deadline", '        setTimer(t, effects, "cap", (t.maxSecs - CAP_MARGIN_S) * 1000);\n', ""],
    ["the deadline is a second before the cap", "var CAP_MARGIN_S = 1;", "var CAP_MARGIN_S = 0;"],
    ["a text recording is written to a file", 'argv.push("--file=" + t.recording.path, ', "argv.push("],
    ["today's carried override is replaced by type-start flags", "        argv = argv.concat(t.typeFlags);\n", ""],
    ["the configured output mode selects the output flag", '        "--" + mode\n', '        "--type"\n'],
    ["the configured auto-submit selects its flag", '        autoSubmit === "true" ? "--auto-submit" : "--no-auto-submit",\n', '        "--auto-submit",\n'],
    ["the configured smart auto-submit selects its flag", '        smartAutoSubmit === "true" ? "--smart-auto-submit" : "--no-smart-auto-submit",\n', '        "--no-smart-auto-submit",\n'],
    ["a bad auto-submit config fails the start", '    if (autoSubmit !== "true" && autoSubmit !== "false") return', '    if (false) return'],
    ["a bad smart auto-submit config fails the start", '    if (smartAutoSubmit !== "true" && smartAutoSubmit !== "false") return', '    if (false) return'],
    ["a bad output mode config fails the start", '    if (OUTPUT_MODES.indexOf(mode) === -1) return "config output.mode=" + JSON.stringify(mode);\n', '    if (false) return "config output.mode=" + JSON.stringify(mode);\n'],
    ["a stop by another holder is refused", '    if (s.recording.holder !== id) return "refused: dictation=not-holder holder=" + s.recording.holder;\n', ""],
    ["the transcript's file is removed", '            if (r.mode === "text") run(effects, "remove", ["rm", "-f", "--", r.path, r.path + ".done"]);\n', ""],
    ["an ok answer with no words is empty", ' || (data.status === "ok" && data.text.trim() === "")', ""],
    ["no start is taken while a record command pends", 'function phase(s) { return s.pending > 0 && s.recording === null ? "unread" : s.status; }', "function phase(s) { return s.status; }"],
    ["no start is taken while the daemon transcribes", '    else if (phase(t) !== "idle") answer = "refused: dictation=engine-busy state=" + phase(t);\n', ""],
    ["the daemon is read after a recording's last command", "    if (s.pending === 0 && s.recording === null) command(s, effects, STATE, STATUS_ARGV);", ""],
    ["the read's word is the daemon's state", '        else if (read !== "stopped") t.status = read;\n', ""],
    ["a state read that fails fails the daemon", '        if (read === null) fail(t, effects, "state " + (code === 0 ? "status=unread" : "code=" + (code === null ? "none" : code)));\n        // `stopped`: the child\'s exit reports a daemon that ended.\n        else if', "        if"],
    ["a stop that waits is not dropped by the follower's idle", ' && t.recording.phase === "recording") drop(t, effects, "");', ') drop(t, effects, "");'],
    ["a line before the start command ended drops no recording", 't.recording.phase === "recording") drop(t, effects, "");', 't.recording.phase !== "stopping") drop(t, effects, "");'],
    ["a stop asked before the start command ended keeps its phase", 'else if (r !== null && r.phase === "starting") {', 'else if (r !== null) {'],
    ["a stop that gave up is not a transcript", '    if (data.status === "ok") return { kind: "text", text: data.text };\n', '    if (data.status !== "empty") return { kind: "text", text: data.text };\n'],
    ["a type stop that failed is not typed", 'code === 0 ? { kind: "typed" } :', 'true ? { kind: "typed" } :'],
    ["streaming is published as recording", '    return read.word === "streaming" ? "recording" : read.word;', "    return read.word;"],
    ["a state that is no word voxtype prints is not taken", '    if (read === null || (LIVE.indexOf(read.word) === -1 && read.word !== "stopped")) return null;', "    if (read === null) return null;"],
    ["a config read that fails fails the start", "    if (code !== 0) {\n        fail(s, effects, tag + ", "    if (code !== 0 && tag === PROBE) {\n        fail(s, effects, tag + "],
    ["a taken start arms the check", '            r.phase = "recording";\n            effects.push({ kind: "check" });', '            r.phase = "recording";'],
    ["the check reads a daemon that said nothing", '    if (r !== null && r.phase === "recording" && t.status === "idle") command(t, effects, STATE, STATUS_ARGV);', ""],
    ["the check reads nothing once the daemon said recording", 'r.phase === "recording" && t.status === "idle") command(', 'r.phase === "recording") command('],
    ["today's ran keeps a start the daemon read idle under", '        if (read === "idle" && r !== null && r.phase === "recording") drop(t, effects, "");\n', ""],
    ["an idle read keeps a recording being stopped", 'if (read === "idle" && r !== null && r.phase === "recording") drop(', 'if (read === "idle" && r !== null) drop('],
    ["a stop that gave up is cancelled", '            if (r.mode === "text" && result.kind === "failed") command(t, effects, "cancel", ["voxtype", "record", "cancel"]);\n', ""],
    ["a text recording is cancelled before the daemon ends", '    if (s.child === "running" && r !== null && r.mode === "text") {', "    if (false) {"],
    ["the daemon ends only once the cancel command ended", '    if (s.child === "draining" && s.pending === 0 && s.status === "idle") endChild(s, effects);', '    if (s.child === "draining" && s.status === "idle") endChild(s, effects);'],
    ["a daemon that takes no cancel is ended at the grace", '        effects.push({ kind: "log", line: "dictation: cancel=unread state=" + t.status });\n        endChild(t, effects);', '        effects.push({ kind: "log", line: "dictation: cancel=unread state=" + t.status });'],
    ["a daemon that ends on its own fails", '        fail(t, effects, "ended code=" + (code === null ? "none" : code));\n', ""],
    ["the follower's stopped is not ready", '    if (word === "stopped") return { model: t, effects: effects };\n', ""],
    ["an unreadable cap fails the start", '    if (!Number.isInteger(secs) || secs <= CAP_MARGIN_S) return "config max_duration_secs=" + JSON.stringify(s.config["audio.max_duration_secs"]);\n', ""],
    ["the lending record names no path", "function record(s) {\n    return {\n", "function record(s) {\n    return {\n        path: s.recording === null ? \"\" : s.recording.path,\n"]
];
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "test-dictation-model-")));
try {
    const source = fs.readFileSync(file, "utf8");
    for (const [label, needle, replacement] of CONTROLS) {
        assert.equal(source.split(needle).length - 1, 1, `control pattern occurs once: ${label}`);
        const mutant = path.join(scratch, "DictationModel.js");
        fs.writeFileSync(mutant, source.replace(needle, () => replacement));
        // A mutant that does not load proves no rule, so its load error ends the suite.
        const mutated = load(mutant);
        let red = false;
        try { verify(mutated); } catch (e) { red = true; }
        assert.equal(red, true, `control passed the suite: ${label}`);
    }
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}

console.log(`test-dictation-model: ok cases=${CASES.length} controls=${CONTROLS.length}`);
