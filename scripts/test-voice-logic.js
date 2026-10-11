#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");

const repo = path.join(__dirname, "..");
const file = path.join(repo, "shell", "plugins", "vgs.voice", "VoiceLogic.js");
const same = (got, want, message) => assert.deepEqual(JSON.parse(JSON.stringify(got)), want, message);

const modelsReady = '{"engines":{"parakeet":{"models":[{"name":"parakeet-tdt-0.6b-v3","installed":true,"downloadable":true,"download_arg":"parakeet-tdt-0.6b-v3"}],"default":"parakeet-tdt-0.6b-v3"}},"verified":true}';
const modelsMissing = '{"engines":{"parakeet":{"models":[{"name":"parakeet-tdt-0.6b-v3","installed":false,"downloadable":true,"download_arg":"parakeet-tdt-0.6b-v3"}],"default":"parakeet-tdt-0.6b-v3"}},"verified":true}';
const enginesReady = '[{"name":"whisper","compiled":true,"active":false},{"name":"parakeet","compiled":true,"active":true}]';
const enginesMissing = '[{"name":"whisper","compiled":true,"active":true},{"name":"parakeet","compiled":false,"active":false}]';
// Probe stdout as voxtype 1.1.0 prints it on host cachy, read on
// 2026-10-06: `voxtype --version`.
const readsReady = { present: true, version: 'voxtype 1.1.0\n', engine: '{"value":"parakeet"}', model: '{"value":"parakeet-tdt-0.6b-v3"}', models: modelsReady, engines: enginesReady };
const readsMissing = { present: true, version: 'voxtype 1.1.0\n', engine: '{"value":"parakeet"}', model: '{"value":"parakeet-tdt-0.6b-v3"}', models: modelsMissing, engines: enginesMissing };
// The `dictation` capability's state (DictationModel.state).
const lent = (daemon, phase, holder) => ({ daemon: daemon, phase: phase, holder: holder, engine: "", model: "", device: "" });

function verify(logic) {
  // ownDictation: [name, the capability's state, whether the last shown
  // was Voice's own, { own, phase }].
  const ownRows = [
    ["Voice's own recording shows", lent("ready", "recording", "vgs.voice"), false, { own: true, phase: "recording" }],
    ["Voice's own recording shows its transcribing", lent("ready", "transcribing", "vgs.voice"), true, { own: true, phase: "transcribing" }],
    ["Voice's start the daemon has not taken yet reads idle, its own", lent("ready", "idle", "vgs.voice"), false, { own: true, phase: "idle" }],
    ["another holder's recording reads idle", lent("ready", "recording", "acme.dictation"), false, { own: false, phase: "idle" }],
    ["another holder's recording ends Voice's own", lent("ready", "recording", "acme.dictation"), true, { own: false, phase: "idle" }],
    ["the daemon unread after Voice's stop shows transcribing", lent("ready", "unread", ""), true, { own: true, phase: "transcribing" }],
    ["the transcription after Voice's stop shows", lent("ready", "transcribing", ""), true, { own: true, phase: "transcribing" }],
    ["the transcription after another holder's stop reads idle", lent("ready", "transcribing", ""), false, { own: false, phase: "idle" }],
    ["the daemon unread after another holder's stop reads idle", lent("ready", "unread", ""), false, { own: false, phase: "idle" }],
    ["an idle daemon ends Voice's own", lent("ready", "idle", ""), true, { own: false, phase: "idle" }],
    ["a recording nobody holds reads idle", lent("ready", "recording", ""), true, { own: false, phase: "idle" }],
    ["a daemon that is not ready reads idle", lent("failed", "idle", ""), true, { own: false, phase: "idle" }],
  ];
  for (const [name, state, own, want] of ownRows) same(logic.ownDictation(state, own), want, `ownDictation: ${name}`);

  // setupState: [name, reads, the capability's daemon word, tone, action,
  // line count, a fragment the first line holds or null]. Ready's line
  // carries the version and the model; each missing thing is one line.
  const stateRows = [
    ["ready reads the version and the model", readsReady, "ready", "ok", "", 1, "1.1.0"],
    ["ready names the configured model", readsReady, "ready", "ok", "", 1, "parakeet-tdt-0.6b-v3"],
    ["a daemon that is starting adds no line", readsReady, "starting", "ok", "", 1, "1.1.0"],
    ["every missing thing is a line", readsMissing, "failed", "warning", "setup", 3, null],
    ["voxtype not found offers the install", { present: false }, "failed", "warning", "install", 1, null],
    ["voxtype not found before the capability is read offers the install", { present: false }, "", "warning", "install", 1, null],
    ["no daemon is not ready", readsReady, "absent", "warning", "setup", 1, null],
    ["a daemon the shell did not start offers to stop it", readsReady, "elsewhere", "warning", "stop", 1, null],
    ["a daemon the shell did not start offers to stop it before the setup", readsMissing, "elsewhere", "warning", "stop", 3, null],
    ["a daemon that failed is not ready", readsReady, "failed", "warning", "setup", 1, null],
    ["a missing model is not ready", Object.assign({}, readsReady, { models: modelsMissing }), "ready", "warning", "setup", 1, null],
    ["no version still reads ready", Object.assign({}, readsReady, { version: "" }), "ready", "ok", "", 1, "parakeet-tdt-0.6b-v3"],
  ];
  for (const [name, reads, daemon, tone, action, count, fragment] of stateRows) {
    const state = logic.setupState(reads, daemon);
    same([state.tone, state.action, state.lines.length], [tone, action, count], `setupState: ${name}`);
    if (fragment !== null) assert.ok(state.lines[0].includes(fragment), `setupState: ${name}: the first line holds ${fragment}`);
  }
  // Each daemon word that is not ready has a line of its own.
  const daemonLines = ["absent", "elsewhere", "failed"].map(daemon => logic.setupState(readsReady, daemon).lines[0]);
  assert.equal(new Set(daemonLines).size, 3, "absent, elsewhere and failed each read their own line");
  assert.throws(() => logic.setupState(readsReady, "paused"), "a daemon word the capability does not have is refused");
  assert.equal(logic.versionOf("voxtype 1.1.0\n"), "1.1.0", "the version is read from --version");
  assert.equal(logic.versionOf("voxtype\n"), "", "no version reads empty");
  assert.equal(logic.modelInstalled(modelsReady, "parakeet", "parakeet-tdt-0.6b-v3"), true, "installed model is found");
  assert.equal(logic.modelInstalled(modelsMissing, "parakeet", "parakeet-tdt-0.6b-v3"), false, "missing model is detected");
  assert.equal(logic.engineAvailable(enginesReady, "parakeet"), true, "compiled engine is found");
  assert.equal(logic.engineAvailable(enginesMissing, "parakeet"), false, "uncompiled engine is detected");
  const configured = logic.setupState(Object.assign({}, readsReady, { model: '{"value":"configured"}' }), "starting");
  same(logic.modelData(lent("starting", "idle", ""), configured), { engine: "parakeet", model: "configured" }, "the Model row reads the configured engine and model before a daemon names its own");
  same(logic.modelData(Object.assign(lent("ready", "idle", ""), { engine: "whisper", model: "base.en" }), configured), { engine: "whisper", model: "base.en" }, "the Model row reads the running daemon's engine and model");

  // Lines in the shape voxtype-audio-bridge prints (voxtype-shared README, AudioBridge).
  same(logic.parseFrame('{"peak":0.421,"rms":0.18,"vad":1,"ts_ms":1234567}'), { ok: true, kind: "frame", peak: 0.421, rms: 0.18 }, "a bridge frame parses");
  same(logic.parseFrame('{"status":"connected"}'), { ok: true, kind: "connected" }, "the connected line parses");
  same(logic.parseFrame('{"status":"disconnected"}'), { ok: true, kind: "disconnected" }, "the disconnected line parses");
  same(logic.parseFrame("bridge: starting"), { ok: false, reason: "json" }, "a log line is refused");
  same(logic.parseFrame('{"peak":"0.4","rms":0.1}'), { ok: false, reason: "frame" }, "a text peak is refused");
  same(logic.parseFrame('{"peak":0.4}'), { ok: false, reason: "frame" }, "a frame without rms is refused");
  same(logic.parseFrame('{"peak":-0.1,"rms":0.1}'), { ok: false, reason: "frame" }, "a negative peak is refused");
  assert.equal(logic.frameLevel(0, 0), 0, "silence draws no level");
  assert.equal(logic.frameLevel(0.5, 0), 1, "a loud peak reaches the full level");
  assert.ok(Math.abs(logic.frameLevel(0.01, 0) - Math.pow(0.06, 0.62)) < 1e-12, "a quiet peak is lifted by the gamma");
  assert.ok(Math.abs(logic.frameLevel(0.01, 0.02) - Math.pow(0.02 * 1.7 * 6, 0.62)) < 1e-12, "a louder weighted RMS sets the level");

  // runFinished: [name, the endedAt seen last, the screen's state, want].
  const ended = (endedAt, code) => ({ running: false, code: code, endedAt: endedAt });
  const finishedRows = [
    ["a run ended before the first read restarts nothing", undefined, ended("t1", 0), false],
    ["the first run ending with code 0 restarts", null, ended("t1", 0), true],
    ["a new run ending with code 0 restarts", "t1", ended("t2", 0), true],
    ["the end already seen restarts nothing again", "t2", ended("t2", 0), false],
    ["a failed run restarts nothing", "t1", ended("t2", 1), false],
    ["a run that never ended restarts nothing", null, { running: true, code: null, endedAt: null }, false],
  ];
  for (const [name, seen, run, want] of finishedRows) assert.equal(logic.runFinished(seen, run), want, `runFinished: ${name}`);

  // Dictation sounds. feedbackValue: [name, the stdout of `voxtype config
  // get audio.feedback.enabled --json`, the value]; the first two are what
  // voxtype 1.1.0 printed in a scratch home on host cachy on 2026-10-09.
  const feedbackOn = '{\n  "file_value": true,\n  "key": "audio.feedback.enabled",\n  "value": true\n}\n';
  const feedbackOff = '{\n  "file_value": null,\n  "key": "audio.feedback.enabled",\n  "value": false\n}\n';
  const feedbackValueRows = [
    ["tones on in the file", feedbackOn, "own"],
    ["no config file and the default in effect", feedbackOff, ""],
    ["no output", "", null],
    ["a value that is no boolean", '{"value":"true"}', null],
    ["an answer that is no object", "true", null],
  ];
  for (const [name, out, want] of feedbackValueRows) assert.equal(logic.feedbackValue(out), want, `feedbackValue: ${name}`);

  // fileKind: [name, the stdout of `stat --format=%f`, the kind]; the three
  // modes are what stat printed for a file, a symbolic link and a
  // directory on host cachy on 2026-10-09.
  const kindRows = [
    ["a regular file", "81a4\n", "file"],
    ["a symbolic link", "a1ff\n", "link"],
    ["a directory", "41ed\n", "none"],
    ["no output, as for a missing file", "", "none"],
    ["text that is no mode", "regular file\n", "none"],
  ];
  for (const [name, out, want] of kindRows) assert.equal(logic.fileKind(out), want, `fileKind: ${name}`);

  // feedbackCommand: each stage's argv, which voxtype and stat read; the
  // restart stage runs none, the service asks the capability.
  const get = ["voxtype", "config", "get", "audio.feedback.enabled", "--json"];
  const commandRows = [
    ["read", "", get],
    ["verify", "", get],
    ["kind", "", ["stat", "--format=%f", "--", "/h/.config/voxtype/config.toml"]],
    ["write", "", ["voxtype", "config", "set", "audio.feedback.enabled", "false"]],
    ["write", "own", ["voxtype", "config", "set", "audio.feedback.enabled", "true"]],
    ["restart", "", null],
  ];
  for (const [stage, wanted, want] of commandRows) same(logic.feedbackCommand(stage, wanted, "/h/.config/voxtype/config.toml"), want, `feedbackCommand: ${stage} for ${JSON.stringify(wanted)}`);
  for (const stage of logic.FEEDBACK_STAGES) assert.doesNotThrow(() => logic.feedbackCommand(stage, "", "/c"), `feedbackCommand: stage ${stage} is known`);
  assert.throws(() => logic.feedbackCommand("done", "", "/c"), "a stage outside the list has no command");
  same(logic.feedbackRun(""), { stage: "read", wanted: "", value: null, problem: "" }, "a run starts by reading");

  // feedbackNext: [name, the run, the exit code and stdout of its stage,
  // the run after].
  const at = (stage, wanted, value, problem) => ({ stage: stage, wanted: wanted, value: value, problem: problem });
  const nextRows = [
    ["a read alone states the value and ends", at("read", null, null, ""), 0, feedbackOn, at("done", null, "own", "")],
    ["a read alone that fails ends unread", at("read", null, null, ""), 1, "", at("done", null, null, "unread")],
    ["a choice the config already holds writes nothing and restarts nothing", at("read", "", null, ""), 0, feedbackOff, at("done", "", "", "")],
    ["a choice the config does not hold goes on to the file", at("read", "", null, ""), 0, feedbackOn, at("kind", "", "own", "")],
    ["a choice over a value that cannot be read writes nothing", at("read", "", null, ""), 1, "", at("done", "", null, "unread")],
    ["a regular config file is written", at("kind", "", "own", ""), 0, "81a4\n", at("write", "", "own", "")],
    ["a symbolic link is left as it is", at("kind", "", "own", ""), 0, "a1ff\n", at("done", "", "own", "link")],
    ["a missing config file is not written", at("kind", "own", "", ""), 1, "", at("done", "own", "", "no-config")],
    ["a write has the daemon started again", at("write", "", "own", ""), 0, "", at("restart", "", "own", "")],
    ["a failed write restarts nothing", at("write", "", "own", ""), 1, "", at("done", "", "own", "write")],
    ["a restart is followed by the read back", at("restart", "", "own", ""), 0, "", at("verify", "", "own", "")],
    ["a refused restart is named and the value is read back", at("restart", "", "own", ""), 1, "", at("verify", "", "own", "restart")],
    ["the read back states the value", at("verify", "", "own", ""), 0, feedbackOff, at("done", "", "", "")],
    ["the read back keeps a failed restart", at("verify", "", "own", "restart"), 0, feedbackOff, at("done", "", "", "restart")],
    ["a read back of another value is a mismatch", at("verify", "", "own", ""), 0, feedbackOn, at("done", "", "own", "mismatch")],
    ["a read back that fails is unread", at("verify", "", "own", ""), 1, "", at("done", "", null, "unread")],
  ];
  const problems = new Set(["missing"]);
  for (const [name, run, code, out, want] of nextRows) {
    same(logic.feedbackNext(run, code, out), want, `feedbackNext: ${name}`);
    problems.add(want.problem);
  }
  assert.throws(() => logic.feedbackNext(at("done", "", "", ""), 0, ""), "a run that ended has no next stage");
  // Every problem a run ends with, and voxtype missing, has its line.
  for (const problem of problems) assert.equal(typeof logic.FEEDBACK_PROBLEMS[problem], "string", `FEEDBACK_PROBLEMS has ${JSON.stringify(problem)}`);
  same(Object.keys(logic.FEEDBACK_PROBLEMS).sort(), [...problems].sort(), "FEEDBACK_PROBLEMS holds no line a run cannot end with");
  same(Object.keys(logic.FEEDBACK_PROBLEMS).filter(problem => (logic.FEEDBACK_PROBLEMS[problem] === "") !== (problem === "")), [], "each problem but none has a line");
}

verify(load(file));

const controls = [
  ["the phase is read whatever the holder", "if (state.holder === HOLDER) return { own: true, phase: state.phase };", "if (state.holder !== \"\") return { own: true, phase: state.phase };"],
  ["Voice's own recording reads idle", "if (state.holder === HOLDER) return { own: true, phase: state.phase };", ""],
  ["the transcription after any stop shows", "var after = own && state.holder === \"\"", "var after = state.holder === \"\""],
  ["a recording nobody holds shows after Voice's own", " && (state.phase === \"unread\" || state.phase === \"transcribing\");", ";"],
  ["the transcription after Voice's stop reads idle", "phase: after ? \"transcribing\" : \"idle\"", "phase: \"idle\""],
  ["model presence ignored", "row.name === wanted && row.installed === true", "row.name === wanted"],
  ["engine compiled ignored", "return row.compiled === true;", "return true;"],
  ["setup never offers action", "if (lines.length > 0) return { tone: \"warning\", text: \"Set up needed\", lines: lines, action: daemon === \"elsewhere\" ? \"stop\" : \"setup\",", "if (lines.length > 0) return { tone: \"warning\", text: \"Set up needed\", lines: lines, action: \"\","],
  ["a daemon that is not ready reads ready", "    if (DAEMON_LINES[daemon] !== \"\") lines.push(", "    if (false) lines.push("],
  ["a daemon the shell did not start reads as one that failed", "    elsewhere: \"Another voxtype is already running. Stop the other voxtype so VGS can start its own.\",", "    elsewhere: \"voxtype did not start.\","],
  ["a daemon the shell did not start offers Set up", "action: daemon === \"elsewhere\" ? \"stop\" : \"setup\",", "action: \"setup\","],
  ["any line offers Stop the other voxtype", "action: daemon === \"elsewhere\" ? \"stop\" : \"setup\",", "action: \"stop\","],
  ["an unknown daemon word reads ready", "    if (DAEMON_LINES[daemon] === undefined)\n", "    if (false)\n"],
  ["voxtype absent offers Set up", "lines: [\"voxtype is not installed.\"], action: \"install\",", "lines: [\"voxtype is not installed.\"], action: \"setup\","],
  ["the version is not read", "return found === null ? \"\" : found[1];", "return \"\";"],
  ["bridge frame shape ignored", "if (!amplitude(frame.peak) || !amplitude(frame.rms)) return { ok: false, reason: \"frame\" };", ""],
  ["bridge status lines read as frames", "if (frame.status === \"connected\" || frame.status === \"disconnected\") return { ok: true, kind: frame.status };", ""],
  ["level not lifted", "Math.pow(Math.max(peak, rms * RMS_WEIGHT) * LEVEL_GAIN, LEVEL_GAMMA)", "Math.max(peak, rms * RMS_WEIGHT) * LEVEL_GAIN"],
  ["level ignores rms", "Math.max(peak, rms * RMS_WEIGHT)", "peak"],
  ["a past run's end at startup restarts", "return seen !== undefined && ", "return "],
  ["a failed run restarts", " && run.code === 0;", ";"],
  ["a seen end restarts again", " && run.endedAt !== seen", ""],
  ["a read alone goes on to a write", "else if (run.wanted !== null && next.value !== run.wanted) next.stage = \"kind\";", "else if (next.value !== run.wanted) next.stage = \"kind\";"],
  ["a choice the config holds is written again", "else if (run.wanted !== null && next.value !== run.wanted) next.stage = \"kind\";", "else if (run.wanted !== null) next.stage = \"kind\";"],
  ["a value that cannot be read is written over", "if (next.value === null) next.problem = \"unread\";\n        else if (run.wanted !== null", "if (run.wanted === null && next.value === null) next.problem = \"unread\";\n        else if (run.wanted !== null"],
  ["a symbolic link is written through", "if (kind === \"file\") next.stage = \"write\";", "if (kind !== \"none\") next.stage = \"write\";"],
  ["a missing config file is written", "if (kind === \"file\") next.stage = \"write\";", "if (kind !== \"link\") next.stage = \"write\";"],
  ["a link reads as a missing file", "else next.problem = kind === \"link\" ? \"link\" : \"no-config\";", "else next.problem = \"no-config\";"],
  ["a link's mode reads as a file's", "return type === 0x8000 ? \"file\" : type === 0xa000 ? \"link\" : \"none\";", "return type === 0x8000 || type === 0xa000 ? \"file\" : \"none\";"],
  ["a failed write restarts the daemon", "if (code !== 0) next.problem = \"write\";\n        else next.stage = \"restart\";", "next.stage = \"restart\";"],
  ["a write restarts nothing", "        else next.stage = \"restart\";", "        else next.stage = \"verify\";"],
  ["a refused restart is silent", "if (code !== 0) next.problem = \"restart\";\n        next.stage = \"verify\";", "next.stage = \"verify\";"],
  ["a mismatch is silent", "else if (next.value !== run.wanted) next.problem = \"mismatch\";", ""],
  ["a read back that fails is silent", "if (next.value === null) next.problem = \"unread\";\n        else if (next.value !== run.wanted)", "if (false) next.problem = \"unread\";\n        else if (next.value !== run.wanted)"],
  ["the value in effect is not read", "return data.value ? FEEDBACK_ON : FEEDBACK_OFF;", "return FEEDBACK_ON;"],
  ["a value that is no boolean is read", "if (!isObject(data) || typeof data.value !== \"boolean\") return null;", "if (!isObject(data)) return null;"],
  ["off is written as on", "wanted === FEEDBACK_ON ? \"true\" : \"false\"", "\"true\""],
  ["the restart stage runs a command", "    case \"restart\": return null;", "    case \"restart\": return [\"voxtype\", \"daemon\"];"],
  ["the configured model wins over the running daemon's", "model: state.model !== \"\" ? state.model : setup.model };", "model: setup.model };"],
  ["the Model row is empty before a daemon runs", "model: state.model !== \"\" ? state.model : setup.model };", "model: state.model };"]
];
const source = fs.readFileSync(file, "utf8");
const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "voice-logic-control-"));
try {
  for (const [label, needle, replacement] of controls) {
    assert.equal(source.split(needle).length, 2, `control ${label}: replacement text occurs once`);
    const mutant = path.join(temp, "VoiceLogic.js");
    fs.writeFileSync(mutant, source.replace(needle, replacement));
    let failed = false;
    try { verify(load(mutant)); } catch (e) { failed = true; }
    assert.ok(failed, `control ${label}: suite passed without the rule`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
// The requirement logic over the shipped manifest: Configure, Choose model
// and Stop the other voxtype run voxtype, so a press without it raises the
// requirement notice in place of the script, which then opens the screen
// once it is found. Only Stop the other voxtype needs systemctl: the core
// runs voxtype, and no user unit does.
const pluginLogic = load(path.join(repo, "shell", "Core", "PluginLogic.js"));
const manifestFile = path.join(repo, "shell", "plugins", "vgs.voice", "manifest.json");
const logic = load(file);
// The screens that run voxtype.
const VOXTYPE_TUIS = ["configure", "model"];
function verifyRequirements(raw) {
  const judged = pluginLogic.validateManifest(raw, path.dirname(manifestFile));
  assert.ok(judged.ok, `the Voice manifest is accepted: ${judged.error}`);
  const missing = ["voxtype", "voxtype-audio-bridge"];
  const runner = { launcher: "present", busy: [], run: "r1" };
  same(Object.keys(judged.manifest.tui).sort(), Array.from(logic.RESTART_TUIS).sort(), "the screens Voice ships are the three whose end restarts the daemon");
  same(Array.from(logic.RESTART_TUIS).sort(), ["configure", "model", "stop-other"], "Configure, Choose model and Stop the other voxtype restart the daemon");
  for (const name of VOXTYPE_TUIS) {
    same(pluginLogic.tuiMissingRequirements(judged.manifest, name, missing), ["voxtype"], `${name} without voxtype asks for it before its script`);
    same(pluginLogic.tuiMissingRequirements(judged.manifest, name, ["systemctl"]), [], `${name} without systemctl runs its script`);
    same(pluginLogic.tuiMissingRequirements(judged.manifest, name, []), [], `${name} with voxtype present runs its script`);
    same(pluginLogic.tuiRunFor(judged.manifest, true, "/src", runner, name, missing).kind, "install", `the ${name} press raises the requirement notice`);
  }
  // Set up's state names the manifest's action that applies: the install
  // without voxtype, the core's dictation setup while a line stands, and
  // none once ready.
  const act = (reads, daemon) => {
    const state = logic.setupState(reads, daemon);
    const values = { setup: Object.assign({ tone: state.tone, text: state.text, lines: state.lines }, state.action === "" ? {} : { action: state.action }) };
    return pluginLogic.statusActionRequest(judged.manifest, "vgs.voice", true, values, "setup");
  };
  same(act({ present: false }, "failed"), { ok: true, kind: "install", commands: ["voxtype", "voxtype-audio-bridge"] }, "without voxtype the setup entry's step installs it");
  same(act(readsMissing, "ready"), { ok: true, kind: "core", name: "dictation-setup" }, "Set up opens the core's dictation setup");
  same(act(readsReady, "ready").ok, false, "a ready Voice offers no step");
  same(act(readsReady, "elsewhere"), { ok: true, kind: "tui", name: "stop-other" }, "another voxtype running opens Stop the other voxtype");
  same(pluginLogic.tuiMissingRequirements(judged.manifest, "stop-other", missing), ["voxtype"], "Stop the other voxtype without voxtype asks for it before its script");
  same(pluginLogic.tuiMissingRequirements(judged.manifest, "stop-other", ["systemctl"]), ["systemctl"], "Stop the other voxtype without systemctl asks for it before its script");
}
const shipped = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
verifyRequirements(shipped);
for (const name of VOXTYPE_TUIS) {
  const unrequired = JSON.parse(JSON.stringify(shipped));
  assert.deepEqual(unrequired.tui[name].requires, ["voxtype"], `control unrequired ${name}: the shipped screen requires voxtype`);
  delete unrequired.tui[name].requires;
  assert.throws(() => verifyRequirements(unrequired), `control unrequired ${name}: a manifest copy whose ${name} does not require voxtype passed`);
}
const manifestControls = [
  ["a manifest copy whose Configure needs systemctl", raw => { raw.tui.configure.requires.push("systemctl"); }],
  ["a manifest copy whose elsewhere step is Set up", raw => { raw.status.setup.actions.stop = { label: "Stop the other voxtype", dictation: "setup" }; }],
  ["a manifest copy that keeps its own Set up screen", raw => { raw.tui.setup = JSON.parse(JSON.stringify(raw.tui.model)); raw.status.setup.actions.setup = { label: "Set up", tui: "setup" }; }],
  ["a manifest copy whose Set up installs voxtype", raw => { raw.status.setup.actions.setup = { label: "Set up", install: ["voxtype"] }; }],
];
for (const [label, edit] of manifestControls) {
  const copy = JSON.parse(JSON.stringify(shipped));
  edit(copy);
  assert.throws(() => verifyRequirements(copy), `control: ${label} passed`);
}

// The dictation sounds event over the shipped manifest: the core takes each
// value and each problem line the service states for it, and stores no
// choice for it, so voxtype's config is the value's one holder.
function verifyFeedback(raw) {
  const manifest = pluginLogic.validateManifest(raw, path.dirname(manifestFile)).manifest;
  for (const value of [logic.FEEDBACK_ON, logic.FEEDBACK_OFF, null]) {
    for (const problem of Object.keys(logic.FEEDBACK_PROBLEMS))
      assert.equal(pluginLogic.soundReport(manifest, "feedback", value, logic.FEEDBACK_PROBLEMS[problem]).ok, true, `the core takes ${JSON.stringify(value)} with the ${JSON.stringify(problem)} line`);
  }
  for (const value of [logic.FEEDBACK_ON, logic.FEEDBACK_OFF])
    same(pluginLogic.soundEdit({ version: 1 }, {}, manifest, "vgs.voice", "feedback", value), { ok: true, held: true }, `the choice ${JSON.stringify(value)} goes to Voice and writes no user file`);
  same(pluginLogic.soundChoices({ sounds: { "vgs.voice": { feedback: "" } } }, manifest), {}, "the core lends Voice no stored choice");
}
verifyFeedback(shipped);
const stored = JSON.parse(JSON.stringify(shipped));
delete stored.sounds.feedback.held;
stored.sounds.feedback.default = "own";
assert.throws(() => verifyFeedback(stored), "control stored: a manifest copy whose dictation event the core stores passed");

console.log(`test-voice-logic: ok controls=${controls.length + VOXTYPE_TUIS.length + 1 + manifestControls.length}`);
