#!/usr/bin/env node
// Which setup step Jarvis offers while a command its setup needs is missing,
// shell/plugins/vgs.jarvis/SetupGate.js, under node: the value a setup reader
// publishes for its probe's value and the requirements capability's missing
// list, the value of a requirement's own Install row, and the Setup
// section's summary and steps from the daemon's answer, read by their tone,
// action and line count. The shipped account and service callbacks also
// determine the model action. No shell process, network or audio is used.
//
// The controls at the end edit a copy of the library, one rule at a time,
// and require this suite to fail an assertion on each copy.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const cp = require("node:child_process");
const { load } = require("../bin/lib/qml-library.js");
const judge = load(path.join(__dirname, "..", "shell", "Core", "PluginLogic.js"));
const settings = load(path.join(__dirname, "..", "shell", "plugins", "vgs.settings", "Steps.js"));
// Every row the Settings tab's status sections draw, in drawn order.
const settingsRows = sections => sections.reduce((all, section) => all.concat(section.items), []);
const protocol = load(path.join(__dirname, "..", "shell", "plugins", "vgs.jarvis", "JarvisProtocol.js"));
const session = load(path.join(__dirname, "..", "shell", "plugins", "vgs.jarvis", "Session.js"));
const widget = load(path.join(__dirname, "..", "shell", "plugins", "vgs.jarvis", "WidgetView.js"));

// This terminal only sends the request. It never owns capture or opens audio.
function verifyMicrophoneAction(script, root) {
    const library = path.join(root, "tui-lib"), command = path.join(root, "vgshell");
    fs.writeFileSync(library, 'vgs_tui_header() { printf "%s\\n" "$@"; }\nvgs_tui_error() { printf "%s\\n" "$*" >&2; }\n');
    fs.writeFileSync(command, '#!/bin/bash\n[[ $# == 6 && $1 == ipc && $2 == call && $3 == vgs.jarvis && $4 == invoke && $5 == check-microphone && -z $6 ]] || exit 2\nprintf "%s\\n" "$CHECK_REPLY"\n', { mode: 0o700 });
    for (const reply of ["ok", "refused: microphone-check=unavailable"]) {
        const result = cp.spawnSync("/bin/bash", [script], { encoding: "utf8",
            env: { PATH: root, VGS_TUI_LIB: library, CHECK_REPLY: reply } });
        assert.equal(result.status, reply === "ok" ? 0 : 1, "the action reports daemon refusal");
        assert.match(result.stdout, /Say Hey Jarvis.*three seconds/);
        assert.match(result.stdout, /Settings > Jarvis/);
        if (reply !== "ok") assert.match(result.stderr, /cannot check the microphone/);
    }
}

// The Preview screen asks the service, and for a cloud voice asks the
// user first; it speaks nothing itself. Each refusal key shows its own
// message. A stub vgshell logs each invoke and answers from the scenario.
function runScreen(script, root, scenario) {
    const library = path.join(root, "tui-lib"), command = path.join(root, "vgshell"), log = path.join(root, "screen.log");
    fs.rmSync(log, { force: true });
    fs.writeFileSync(library, [
        'vgs_tui_header() { :; }', 'vgs_tui_success() { printf "success\\n" >> "$SCREEN_LOG"; }',
        'vgs_tui_error() { printf "%s\\n" "$*" >&2; }',
        'vgs_tui_confirm() { printf "confirm\\n" >> "$SCREEN_LOG"; [[ $CONFIRM == yes ]]; }',
        'vgs_tui_close_prompt() { printf "close %s\\n" "$1" >> "$SCREEN_LOG"; }', ""].join("\n"));
    fs.writeFileSync(command, '#!/bin/bash\n[[ $# == 6 && $1 == ipc && $2 == call && $3 == vgs.jarvis && $4 == invoke ]] || exit 2\n'
        + 'printf "%s %s\\n" "$5" "$6" >> "$SCREEN_LOG"\ncase $6 in kind) printf "%s\\n" "$KIND" ;; play) printf "%s\\n" "$PLAY" ;; *) printf "%s\\n" "$FILE" ;; esac\n', { mode: 0o700 });
    fs.writeFileSync(path.join(root, "gio"), '#!/bin/bash\nprintf "gio %s %s\\n" "$1" "$2" >> "$SCREEN_LOG"\n[[ $GIO == ok ]]\n', { mode: 0o700 });
    const result = cp.spawnSync("/bin/bash", [script], { encoding: "utf8",
        env: { PATH: root + ":/usr/bin:/bin", VGS_TUI_LIB: library, SCREEN_LOG: log, KIND: "", PLAY: "", FILE: "", CONFIRM: "", GIO: "", ...scenario } });
    return { status: result.status, stderr: result.stderr, log: fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [] };
}
function verifyPreviewAction(script, root) {
    const run = scenario => runScreen(script, root, scenario);
    assert.deepEqual(run({ KIND: "local", PLAY: "ok" }), { status: 0, stderr: "", log: ["preview-voice kind", "preview-voice play", "success"] },
        "a local preview plays without asking");
    assert.deepEqual(run({ KIND: "cloud", PLAY: "ok", CONFIRM: "yes" }).log, ["preview-voice kind", "confirm", "preview-voice play", "success"],
        "a cloud preview asks before it plays");
    assert.deepEqual(run({ KIND: "cloud", PLAY: "ok", CONFIRM: "no" }), { status: 0, stderr: "", log: ["preview-voice kind", "confirm"] },
        "a cloud preview the user declines plays nothing");
    const causes = ["refused: preview=muted", "refused: preview=busy", "refused: preview=down", "refused: jarvis=not-ready"].map(key => {
        const asked = run({ KIND: key });
        assert.deepEqual([asked.status, asked.log], [1, ["preview-voice kind"]], key + ": nothing plays");
        assert.notEqual(asked.stderr, "", key + ": the screen says why");
        const played = run({ KIND: "local", PLAY: key });
        assert.deepEqual([played.status, played.stderr], [1, asked.stderr], key + ": the same cause when the play is refused");
        return asked.stderr;
    });
    assert.equal(new Set(causes).size, causes.length, "each refusal key has its own cause");
}
// The Edit screen opens the file the service answers with gio, and holds
// its plain window on the close prompt when it cannot.
function verifyEditAction(script, root) {
    const run = scenario => runScreen(script, root, scenario);
    assert.deepEqual(run({ FILE: "/home/user/Jarvis/AGENTS.md", GIO: "ok" }),
        { status: 0, stderr: "", log: ["personality-file ", "gio open /home/user/Jarvis/AGENTS.md"] }, "Edit opens the home's AGENTS.md");
    const failed = run({ FILE: "/home/user/Jarvis/AGENTS.md", GIO: "no" });
    assert.deepEqual([failed.status, failed.log.at(-1)], [1, "close 1"], "a file gio cannot open holds the window");
    const homeless = run({ FILE: "refused: home=none", GIO: "ok" });
    assert.deepEqual([homeless.status, homeless.log], [1, ["personality-file ", "close 1"]], "with no home nothing opens");
    assert.ok(failed.stderr !== "" && homeless.stderr !== "" && failed.stderr !== homeless.stderr, "each failure says its own cause");
}

const file = path.join(__dirname, "..", "shell", "plugins", "vgs.jarvis", "SetupGate.js");
const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
const ABSENT = { tone: "warning", text: "Browser needs setup", action: true };
const READY = { tone: "ok", text: "Private browser ready", action: false };
// [label, probe value, requires, missing, null for the probe value itself or
// the commands the withheld value names].
const SETUP = [
    ["nothing required", ABSENT, [], ["agent-browser"], null],
    ["required and found", ABSENT, ["agent-browser"], [], null],
    ["another command missing", ABSENT, ["agent-browser"], ["bwrap", "uv"], null],
    ["ready with its command found", READY, ["agent-browser"], ["bwrap"], null],
    ["required and missing", ABSENT, ["agent-browser"], ["bwrap", "agent-browser"], ["agent-browser"]],
    ["ready yet missing", READY, ["agent-browser"], ["agent-browser"], ["agent-browser"]],
    ["two of three missing", ABSENT, ["node", "agent-browser", "chromium"], ["chromium", "node"], ["node", "chromium"]]
];
// The local voice's dictation recording: [label, the voice, the lent state,
// the commands the scan misses, the cause the hello carries, the Voice
// step's value (the cause's DICTATION entry, the withheld form, LOADING or
// DONE as the Voice step carries them, with no action), whether it offers
// Set up dictation]. voxtype missing reads failed
// in the core. Set up dictation is offered where the core's setup applies;
// another voxtype or another microphone is the user's to change in Voice.
const DICTATION = [
    ["voxtype missing", "local", { daemon: "failed", device: "" }, ["voxtype"], "speech=dictation-failed", "withheld", true],
    ["daemon absent", "local", { daemon: "absent", device: "" }, [], "speech=dictation-absent", "entry", true],
    ["daemon failed", "local", { daemon: "failed", device: "" }, [], "speech=dictation-failed", "entry", true],
    ["another voxtype", "local", { daemon: "elsewhere", device: "" }, [], "speech=dictation-elsewhere", "entry", false],
    ["another device", "local", { daemon: "ready", device: "alsa_input.usb-fixture" }, [], "speech=dictation-device", "entry", false],
    ["daemon starting", "local", { daemon: "starting", device: "" }, [], "speech=dictation-starting", "loading", false],
    ["ready on the default", "local", { daemon: "ready", device: "default" }, [], "", "done", false],
    ["Realtime voice", "realtime", { daemon: "failed", device: "" }, ["voxtype"], "", "done", false],
    ["state unread", "local", null, [], "", "done", false]
];
// The Agent fleet row: [label, the home folder, the mail tool found in it,
// whether the row shows].
const FLEET = [
    ["no home chosen", null, null, false],
    ["a home without the mail tool", "/h/Jarvis", null, true],
    ["a home with the mail tool", "/h/Jarvis", "/h/Jarvis/.agents/skills/orch/scripts/lane-mail", false]
];
// A command with a floor: [label, missing, outdated, expected value]. Its
// row names the action that applies, and none once it is found at its floor.
const FLOORED = [
    ["found at its floor", ["bwrap"], ["pi"], { tone: "ok", text: "Installed" }],
    ["missing", ["agent-browser"], [], { tone: "warning", text: "Not installed", action: "install" }],
    ["below its floor", [], ["pi", "agent-browser"], { tone: "warning", text: "Needs an update", action: "update" }]
];
// [label, command, missing, expected value].
const REQUIREMENT = [
    ["found", "agent-browser", [], { tone: "ok", text: "Installed", action: false }],
    ["another command missing", "agent-browser", ["bwrap"], { tone: "ok", text: "Installed", action: false }],
    ["missing", "agent-browser", ["bwrap", "agent-browser"], { tone: "warning", text: "Not installed", action: true }]
];

// The Setup section from the daemon's answer: [label, answer, the summary's
// tone, the steps still to do, the steps to do that keep their declared
// hint, the AI model's named action while to do, "key" when left out]. A
// step to do is a warning with its action and, unless its action already
// says what it asks, a hint of its own; a done step is ok with neither.
// No value the Setup group draws holds a keyed cause (area=cause): the
// summary says its state and hint, and each step words its own cause.
const READINESS = [
    ["ready", { kind: "answered", causes: [] }, "ok", [], []],
    ["nothing set up", { kind: "answered", causes: ["speech=local-not-set-up", "brain=unselected"] }, "warning", ["setupVoice", "setupModel"], ["setupVoice"]],
    ["local voice only", { kind: "answered", causes: ["speech=local-not-ready"] }, "warning", ["setupVoice"], []],
    ["local voice ready timeout", { kind: "answered", causes: ["speech=local-ready-timeout"] }, "warning", ["setupVoice"], []],
    ["probe timeout", { kind: "answered", causes: ["setup=probe-timeout"] }, "ok", [], []],
    ["probe timeout beside an AI model cause", { kind: "answered", causes: ["setup=probe-timeout", "brain=unselected"] }, "warning", ["setupModel"], []],
    ["the AI model only", { kind: "answered", causes: ["brain=account-unavailable"] }, "warning", ["setupModel"], []],
    // ChainedEngine's cause while no speech row exists has no hint of its own.
    ["a cause with no hint of its own", { kind: "answered", causes: ["speech=no-adapter"] }, "warning", ["setupVoice"], ["setupVoice"]],
    // A brain cause with no hint of its own takes the step's.
    ["a brain cause with no hint of its own", { kind: "answered", causes: ["brain=unnamed"] }, "warning", ["setupModel"], []],
    ["a signed-out AI model", { kind: "answered", causes: ["brain=signed-out"] }, "warning", ["setupModel"], [], "signIn"],
    ["a Pi older than the Pi brain's floor", { kind: "answered", causes: ["brain=pi-update"] }, "warning", ["setupModel"], [], "update"]
];
// Each step's action once done: the voice step's boolean; the AI model's
// manifest entry declares named actions, so its value carries none.
const DONE_ACTION = { setupVoice: false, setupModel: undefined };
// The home folder's causes: Home.js's and Guidance.js's. One without a hint
// of its own takes the step's.
const HOME_CAUSES = ["home=link", "home=path", "home=unwritable", "guidance=home-too-large", "guidance=home-skills-too-large", "guidance=home-memory-too-large"];
// Each brain cause asks for its own action.
const BRAIN_CAUSES = ["brain=unselected", "brain=account-unavailable", "brain=model-required", "brain=accounts-unreadable", "brain=signed-out",
    "brain=pi-update"];
// The TUI each of the AI model's named actions opens, from the manifest.
const MODEL_TUI = { key: "add-key", signIn: "sign-in" };
const plain = value => JSON.parse(JSON.stringify(value));
// The voice the daemon hears of: [label, the settings a user changed over the
// manifest's own, the stored OpenAI keys the account reader holds or
// undefined while it has no answer, the voice]. A fresh settings file holds
// only the manifest's values.
const KEY = [{ value: "openai-1", label: "OpenAI / fixture" }];
const VOICE = [
    ["a fresh settings file with no key", {}, [], "local"],
    ["a stored key and no choice", { voiceAccount: "openai-1" }, KEY, "realtime"],
    ["a stored key the Realtime key setting does not name", {}, KEY, "local"],
    ["the named key removed", { voiceAccount: "openai-1" }, [], "local"],
    ["the named key before the reader answers", { voiceAccount: "openai-1" }, undefined, "realtime"],
    ["no key before the reader answers", {}, undefined, "local"],
    ["Local chosen beside a stored key", { voiceProvider: "local", voiceAccount: "openai-1" }, KEY, "local"],
    ["Realtime chosen with no key", { voiceProvider: "realtime" }, [], "realtime"],
    ["Always talk mode beside a stored key", { mode: "always", voiceAccount: "openai-1" }, KEY, "local"],
    ["Always talk mode with Realtime chosen", { mode: "always", voiceProvider: "realtime", voiceAccount: "openai-1" }, KEY, "realtime"]
];
// The Voice group's key row: [label, the stored keys or null for a failed
// read, its tone and whether it offers Add key].
const VOICE_KEY = [["no key", [], ["info", true]], ["a stored key", KEY, ["ok", false]], ["keys unread", null, ["warning", true]]];
// The keyed start causes the service can publish before the first ready state.
// The widget and the Setup page both read these words from SetupGate.
const START_CAUSES = [
    ["hello timeout", "jarvis: hello=timeout", "hello-timeout"],
    ["Node too old", "jarvis: node=20.19.5 need=22", "node-too-old"],
    ["Node exit", "jarvis: daemon=exit code=78 status=0", "node-too-old"],
    ["daemon exit", "jarvis: daemon=exit code=1 status=0", "daemon-exit"],
    ["daemon ended", "jarvis: daemon=ended", "daemon-exit"],
    ["wire defect", "jarvis: protocol=identity", "wire-defect"],
    ["probe timeout", "jarvis: setup=probe-timeout", "probe-timeout"]
];
const ARBITRARY_STDERR = "SyntaxError: fixture";
// The widest start cause title the VGS-1228 sheets show whole in the Setup
// status chip at the Settings window's default width: "Jarvis did not
// answer in time" (tmp/landed-sheets/VGS-1228/r2/jarvis-setup-dark-1.png in
// the base checkout, After 55f0ab7e). The chip draws capitals in a fixed
// width font, so a title's characters measure its width.
const CHIP_TITLE_MAX = "Jarvis did not answer in time".length;
// The Local voice setting: [label, the setting, the pick, the ready tier or
// null, the run a change to the setting starts (null for none), the setting
// after a run ended with that ready tier (null to keep it)].
const TIERS = [
    ["auto on a fresh computer installs the pick", "auto", "large", null, [], null],
    ["a chosen tier on a fresh computer installs it", "medium", "large", null, ["medium"], null],
    ["auto while the pick is ready starts nothing", "auto", "large", "large", null, null],
    ["a chosen tier that is ready starts nothing", "medium", "large", "medium", null, null],
    ["auto beside another ready tier installs the pick", "auto", "large", "small", [], "small"],
    ["a chosen tier beside the ready pick installs it", "medium", "large", "large", ["medium"], "auto"],
    ["choosing the pick by name beside another tier installs it", "large", "large", "small", ["large"], "small"],
    ["a chosen tier beside a third ready tier", "medium", "large", "small", ["medium"], "small"],
    ["the pick by name while it is ready starts nothing", "large", "large", "large", null, null]
];

// The model and effort the Jarvis page offers and saves. Each list is the
// page's read for one sign-in, as its program's adapter narrows it: the
// program's own default first. Copilot's adapter names no effort level.
const LEVELS = ["low", "medium", "high", "xhigh", "max"];
const offer = (value, label, efforts = LEVELS, effort = "") => ({ value, label, efforts, effort });
const FABLE = offer("claude-fable-5-1", "Fable 5.1"), OPUS = offer("claude-opus-5-5[1m]", "Opus 5.5");
const HAIKU = offer("claude-haiku-4-5", "Haiku 4.5", []), SONNET = offer("claude-sonnet-5-5", "Sonnet 5.5", ["low", "high", "xhigh"]);
const CLAUDE = [OPUS, FABLE, HAIKU, SONNET];
const COPILOT = [offer("auto", "Auto", []), offer("claude-opus-5.5", "Claude Opus 5.5", []), offer("gpt-6.1-sol", "GPT-6.1-Sol", [])];
const CODEX = [offer("gpt-6.1-sol", "GPT-6.1-Sol", [...LEVELS, "ultra"], "low"), offer("gpt-6-luna", "GPT-6-Luna", LEVELS, "medium")];
// An Anthropic key's list, its row's own, each at the API's own default.
const ANTHROPIC_KEY = [offer("claude-opus-5-5", "Claude Opus 5.5", LEVELS, "medium"), offer("claude-sonnet-5-5", "Claude Sonnet 5.5", LEVELS, "high"),
    offer("claude-haiku-4-5", "Claude Haiku 4.5", [], "")];
const read = offers => ({ kind: "read", offers });
const CLAUDE_VALUES = ["claude-fable-5-1", "claude-opus-5-5[1m]", "claude-haiku-4-5", "claude-sonnet-5-5"];
const FAILED = { kind: "failed", reason: "harness-exit" };
// [label, the saved model and effort, the page's read, the model and effort
// the page saves, the page's model and effort choices by value, the
// sign-in's provider where the row needs one].
const CHOICE = [
    ["Claude Code and nothing saved", {}, read(CLAUDE), ["claude-fable-5-1", "high"], CLAUDE_VALUES, ["high", "low", "medium", "xhigh", "max"]],
    ["Copilot, which offers Opus 5.5, no Fable and no effort level", { effort: "high" }, read(COPILOT), ["claude-opus-5.5", ""], ["claude-opus-5.5", "auto", "gpt-6.1-sol"], []],
    ["Claude Code without Fable", {}, read([OPUS, HAIKU, SONNET]), ["claude-opus-5-5[1m]", "high"], CLAUDE_VALUES.slice(1), ["high", "low", "medium", "xhigh", "max"]],
    ["a sign-in that offers neither, whose program names its effort", {}, read(CODEX), ["gpt-6.1-sol", "low"], ["gpt-6.1-sol", "gpt-6-luna"], ["low", "medium", "high", "xhigh", "max", "ultra"]],
    ["a preferred model that takes no high effort", {}, read([offer("claude-fable-5-1", "Fable 5.1", ["low", "medium"])]), ["claude-fable-5-1", ""], ["claude-fable-5-1"], ["default", "low", "medium"]],
    ["a saved model and effort", { model: "claude-sonnet-5-5", effort: "low" }, read(CLAUDE), ["claude-sonnet-5-5", "low"], CLAUDE_VALUES, ["default", "low", "high", "xhigh"]],
    ["a saved model whose program names no effort", { model: "claude-sonnet-5-5" }, read(CLAUDE), ["claude-sonnet-5-5", ""], CLAUDE_VALUES, ["default", "low", "high", "xhigh"]],
    ["the second preferred model saved beside the first", { model: "claude-opus-5-5[1m]" }, read(CLAUDE), ["claude-opus-5-5[1m]", "high"], CLAUDE_VALUES, ["high", "low", "medium", "xhigh", "max"]],
    ["a saved model the list does not name", { model: "gpt-6.1-sol", effort: "max" }, read(CLAUDE), ["gpt-6.1-sol", "max"], CLAUDE_VALUES, ["max"]],
    ["a saved effort the model does not offer", { model: "claude-fable-5-1", effort: "ultra" }, read(CLAUDE), ["claude-fable-5-1", "high"], CLAUDE_VALUES, ["high", "low", "medium", "xhigh", "max"]],
    ["a saved model that takes no effort", { model: "claude-haiku-4-5", effort: "high" }, read(CLAUDE), ["claude-haiku-4-5", ""], CLAUDE_VALUES, []],
    ["a sign-in whose list is empty", { model: "claude-fable-5-1", effort: "high" }, read([]), ["claude-fable-5-1", "high"], [], []],
    ["no read, as while the page is closed", { model: "claude-fable-5-1", effort: "xhigh" }, { kind: "none" }, ["claude-fable-5-1", "xhigh"], ["claude-fable-5-1"], ["xhigh"]],
    ["a read that has not answered and nothing saved", {}, { kind: "reading" }, ["", ""], [], [], "claude"],
    ["a read its program did not answer", { model: "claude-fable-5-1", effort: "high" }, FAILED, ["claude-fable-5-1", "high"], ["claude-fable-5-1"], ["high"]],
    // Nothing saved and no list: the page shows what Jarvis runs, and saves nothing.
    ["a failed read and nothing saved, for Claude Code", {}, FAILED, ["", ""], ["claude-fable-5-1"], ["high"], "claude"],
    ["a failed read and nothing saved, for a program that runs its own model", {}, FAILED, ["", ""], ["default"], [], "codex"],
    ["an Anthropic key and nothing saved", {}, read(ANTHROPIC_KEY), ["claude-opus-5-5", "high"],
        ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], ["high", "low", "medium", "xhigh", "max"], "anthropic"],
    ["an Anthropic key and its model saved at the API's default", { model: "claude-sonnet-5-5", effort: "high" }, read(ANTHROPIC_KEY),
        ["claude-sonnet-5-5", "high"], ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], ["high", "low", "medium", "xhigh", "max"], "anthropic"],
    ["no read and nothing saved, for an Anthropic key", {}, FAILED, ["", ""], ["claude-opus-5-5"], ["high"], "anthropic"]
];
// What the daemon gets with no list read. [label, the saved model and
// effort, the chosen sign-in's provider as the last account read names it,
// undefined before one, the model and effort in the hello].
const UNLISTED = [
    ["Claude Code and nothing saved", {}, "claude", ["claude-fable-5-1", "high"]],
    ["Claude Code and an effort saved alone", { effort: "max" }, "claude", ["claude-fable-5-1", "max"]],
    ["Claude Code and a saved model", { model: "claude-haiku-4-5" }, "claude", ["claude-haiku-4-5", ""]],
    ["Codex and nothing saved", {}, "codex", ["", ""]],
    ["Copilot and a saved model", { model: "auto" }, "copilot", ["auto", ""]],
    ["an Anthropic key and nothing saved", {}, "anthropic", ["claude-opus-5-5", "high"]],
    ["an Anthropic key and an effort saved alone", { effort: "max" }, "anthropic", ["claude-opus-5-5", "max"]],
    ["an Anthropic key and a saved model", { model: "claude-haiku-4-5" }, "anthropic", ["claude-haiku-4-5", ""]],
    ["an OpenAI key and nothing saved", {}, "openai", ["", ""]],
    ["no account read yet", {}, undefined, ["", ""]]
];

// The shipped choice rule against the manifest and the page's select model.
function verifyModelChoice(providers) {
    const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    try {
        for (const [label, saved, listed, want, models, efforts, provider] of CHOICE) {
            const settings = { ...plain(manifest.settings), brain: "claude-team", ...saved };
            const choice = providers.modelChoice(settings, listed, provider);
            assert.deepEqual([choice.model, choice.effort], want, label + ": the model and effort the page saves");
            assert.deepEqual([choice.models.map(row => row.value), choice.efforts.map(row => row.value)], [models, efforts], label + ": the page's choices");
            const values = {};
            for (const [key, value] of [["models", choice.models], ["efforts", choice.efforts]]) {
                assert.equal(judge.statusWrite(manifest, values, key, value).ok, true, label + ": accepted status " + key);
                values[key] = value;
            }
            // A field with nothing offered is not drawn, whatever is saved.
            const page = plain(judge.settingChoices(manifest, values, settings));
            assert.deepEqual([page.model.length === 0, page.effort.length === 0], [models.length === 0, efforts.length === 0], label + ": the fields the page draws");
            // A drawn Model field holds the saved model, offered or not,
            // and with none saved its first choice keeps the setting unset.
            if (models.length > 0) assert.equal(page.model.some((row, index) => row.value === settings.model && (settings.model !== "" || index === 0)), true,
                label + ": the Model field shows what is saved");
        }
        // Labels a user reads: a level by its word, the program's own by
        // name, a model with no list by its saved name, marked when its
        // list could not be read.
        const shown = providers.modelChoice({ model: "claude-sonnet-5-5", effort: "" }, read(CLAUDE)).efforts;
        assert.deepEqual(plain(shown), [{ label: "Model default", value: "default" }, { label: "Low", value: "low" }, { label: "High", value: "high" }, { label: "Extra high", value: "xhigh" }]);
        assert.deepEqual(plain(providers.modelChoice({ model: "claude-fable-5-1", effort: "xhigh" }, { kind: "none" }).models.concat(
            providers.modelChoice({ model: "claude-fable-5-1", effort: "xhigh" }, { kind: "failed" }).models,
            providers.modelChoice({ model: "claude-fable-5-1", effort: "xhigh" }, { kind: "none" }).efforts)),
            [{ label: "claude-fable-5-1", value: "claude-fable-5-1" }, { label: "claude-fable-5-1 (list not read)", value: "claude-fable-5-1" }, { label: "Extra high", value: "xhigh" }]);
    } catch (error) {
        if (error instanceof assert.AssertionError) error.check = "model-choice";
        throw error;
    }
}

// The shipped account reader's model list read, run as the page drives it:
// its bindings, its functions and its process's end, over a stand-in
// process. VIEWED is whether the Settings window shows the Jarvis page.
// A call the reader queues with Qt.callLater runs at settle(), once per
// function, as the engine runs it back in the event loop. The engine's own
// order of a binding's update and its handlers is
// scripts/qml-tests/tst_jarvis_accounts.qml's to hold.
function listReader(accountsSource, providers, saved, viewed) {
    const binding = name => accountsSource.match(new RegExp("^    readonly property \\w+ " + name + ": (.*)$", "m"));
    const fn = name => accountsSource.match(new RegExp("^    function " + name + "\\([^)]*\\) \\{\\n[\\s\\S]*?^    \\}", "m"));
    const changed = accountsSource.match(/^    onBrainChanged: (.*)$/m);
    const ended = accountsSource.match(/^        id: lister\n[\s\S]*?^        onRunningChanged: \{\n([\s\S]*?)^        \}/m);
    const settings = { brain: "claude-team", model: "", effort: "", ...saved };
    const writes = [], warnings = [], values = {}, queued = [];
    const root = { program: "/fixture/accounts.js", listed: { brain: "", kind: "none" }, seenBrain: null, providers: {},
        lister: { running: false, dropped: false, output: "", command: [] },
        shell: { settings, status: { viewed, set: (key, value) => { values[key] = value; return "ok"; } },
            configure: { set: (key, value) => { writes.push([key, value]); settings[key] = value; return "ok"; } } } };
    const globals = { root, Providers: providers, Quickshell: { shellDir: "/fixture/shell" }, console: { warn: text => warnings.push(text) },
        Qt: { callLater: call => { if (!queued.includes(call)) queued.push(call); } } };
    const run = text => vm.runInNewContext("(function() { with(root) { return (" + text + "); } })()", globals);
    for (const name of ["brain", "wanted", "list", "choice"]) {
        assert.ok(binding(name), "the reader binds " + name);
        Object.defineProperty(root, name, { get: () => run(binding(name)[1]) });
    }
    for (const name of ["save", "publishChoice", "readList", "listRead"]) {
        assert.ok(fn(name), "the reader holds " + name);
        root[name] = run(fn(name)[0]);
    }
    assert.ok(changed && ended);
    return { root, settings, writes, warnings, values,
        brainChanged: () => { run(changed[1]); },
        settle() { while (queued.length > 0) queued.shift()(); },
        // The choice's change handler, then the turn's queued calls.
        publish() { root.publishChoice(); this.settle(); },
        // The process ends: with OUTPUT on its stdout, or ended by readList.
        end(output) {
            root.lister.running = false;
            if (output !== undefined) root.lister.output = output;
            vm.runInNewContext("(function() { with(root.lister) { " + ended[1] + " } })()", globals);
        } };
}

function verifyListRead(providers, accountsSource) {
    try {
        // The shell starts with a saved choice and the page closed: no read
        // starts, the saved choice is published and nothing is written.
        const closed = listReader(accountsSource, providers, { model: "claude-fable-5-1", effort: "high" }, false);
        assert.equal(closed.root.wanted, "", "no list is wanted while the page is closed");
        closed.root.readList();
        closed.publish();
        assert.deepEqual(plain([closed.root.lister.running, closed.root.lister.command, closed.root.listed.kind, closed.values.models, closed.writes]),
            [false, [], "none", [{ label: "claude-fable-5-1", value: "claude-fable-5-1" }], []], "no read with the page closed");
        // A sign-in changed with the page closed keeps what is saved.
        closed.brainChanged();
        closed.settle();
        closed.settings.brain = "codex-team";
        closed.brainChanged();
        closed.settle();
        assert.deepEqual(closed.writes, [], "only a sign-in changed on the page drops the saved choice");
        // The page opens: one read for the chosen sign-in, and its list's
        // default is saved.
        const open = listReader(accountsSource, providers, {}, true);
        assert.equal(open.root.wanted, "claude-team");
        // A reader built while the page is open, as after a rescan, sees
        // the saved sign-in for the first time: no change, nothing dropped.
        const rebuilt = listReader(accountsSource, providers, { model: "claude-haiku-4-5" }, true);
        rebuilt.brainChanged();
        rebuilt.settle();
        assert.deepEqual(rebuilt.writes, [], "the first sight of the saved sign-in drops nothing");
        open.brainChanged();
        open.settle();
        open.root.readList();
        assert.deepEqual(plain([open.root.lister.running, open.root.lister.command.slice(-2), open.root.listed]),
            [true, ["models", "claude-team"], { brain: "claude-team", kind: "reading" }], "one read for the chosen sign-in");
        open.end(JSON.stringify(read(CLAUDE)));
        open.root.publishChoice();
        assert.deepEqual(open.writes, [], "a save waits for the turn's end");
        open.settle();
        assert.deepEqual(plain([open.values.models.map(row => row.value), open.values.efforts.map(row => row.value), open.writes]),
            [CLAUDE_VALUES, ["high", "low", "medium", "xhigh", "max"], [["model", "claude-fable-5-1"], ["effort", "high"]]],
            "a read list offers its models and efforts and saves its default");
        open.publish();
        assert.equal(open.writes.length, 2, "a saved choice is not written again");
        // The sign-in changes on the page while its read runs: the saved
        // choice is dropped, the running read runs to its end and its
        // answer is not taken, and the new sign-in's read starts at that end.
        open.settings.brain = "codex-team";
        open.brainChanged();
        open.publish();
        assert.deepEqual(open.writes.slice(2), [["model", ""], ["effort", ""]], "a sign-in changed on the page drops the saved model and effort");
        open.root.readList();
        assert.equal(open.root.lister.running, true);
        open.settings.brain = "copilot-team";
        open.root.readList();
        assert.deepEqual(plain([open.root.lister.running, open.root.lister.command.slice(-2)]), [true, ["models", "codex-team"]],
            "a changed sign-in leaves the running read to its end");
        open.end(JSON.stringify(read(CLAUDE)));
        assert.deepEqual(plain([open.root.listed, open.root.lister.running, open.root.lister.command.slice(-2)]),
            [{ brain: "copilot-team", kind: "reading" }, true, ["models", "copilot-team"]], "the ended read's answer is dropped and the next read starts");
        // A list read for an earlier sign-in changes nothing.
        open.end(JSON.stringify(read(COPILOT)));
        open.settings.brain = "claude-team";
        open.publish();
        assert.deepEqual(plain([open.root.list, open.values.models, open.writes.slice(4)]), [{ kind: "none" }, [], []], "a list for another sign-in offers and saves nothing");
        // A read its program does not answer: the saved choice with its
        // note, the cause in the log, nothing written.
        const failed = listReader(accountsSource, providers, { model: "claude-fable-5-1", effort: "high" }, true);
        failed.root.readList();
        failed.end(JSON.stringify(FAILED));
        failed.publish();
        assert.deepEqual(plain([failed.values.models, failed.warnings, failed.writes]),
            [[{ label: "claude-fable-5-1 (list not read)", value: "claude-fable-5-1" }], ["jarvis-accounts: models=harness-exit"], []], "a failed read");
        // With nothing saved the page shows what Jarvis runs for the
        // sign-in's provider, and saves nothing without a read list.
        const unsaved = listReader(accountsSource, providers, {}, true);
        unsaved.root.providers = { "claude-team": "claude" };
        unsaved.root.readList();
        unsaved.end(JSON.stringify(FAILED));
        unsaved.publish();
        assert.deepEqual(plain([unsaved.values.models.map(row => row.value), unsaved.writes]), [["claude-fable-5-1"], []], "a failed read with nothing saved");
        // A helper that prints no answer is a failed read, whatever an
        // earlier read printed.
        failed.root.readList();
        failed.end();
        assert.deepEqual(plain([failed.root.listed, failed.warnings.slice(1)]), [{ brain: "claude-team", kind: "failed", reason: "helper" }, ["jarvis-accounts: models=helper"]],
            "a helper that prints no answer");
        // The page closes: the running read runs to its end, its answer is
        // not taken and none starts.
        failed.root.readList();
        failed.root.shell.status.viewed = false;
        failed.root.readList();
        assert.equal(failed.root.lister.running, true, "a closed page leaves the running read to its end");
        failed.end(JSON.stringify(read(CLAUDE)));
        assert.deepEqual(plain([failed.root.listed, failed.root.lister.running]), [{ brain: "", kind: "none" }, false], "a closed page takes no answer and starts no read");
    } catch (error) {
        if (error instanceof assert.AssertionError) error.check = "model-choice";
        throw error;
    }
}

// Execute the shipped Details row accessor and the shipped Settings row
// projection against the same published status. This checks their source
// selection; the nested smoke and pictures check the rendered consumers.
const pageFile = path.join(path.dirname(file), "..", "vgs.settings", "PluginPage.qml");
const serviceFile = path.join(path.dirname(file), "Service.qml");
const accountsFile = path.join(path.dirname(file), "Accounts.qml");
const localRuntimeFile = path.join(path.dirname(file), "LocalRuntime.qml");
const providersFile = path.join(path.dirname(file), "AccountProviders.js");
const words = require(path.join(path.dirname(file), "AccountStatus.js"));
const UNSELECTED = { kind: "answered", causes: ["brain=unselected"] };
const SIGNED_OUT = { kind: "answered", causes: ["brain=signed-out"] };

// Config.writeUser produces the two refused replies. Execute the shipped
// shortcut and notice bodies, with only their capability endpoints supplied.
function verifyHomeSwitch(serviceSource) {
    const switchHome = serviceSource.match(/^    function switchHome\(item\) \{\n[\s\S]*?^    \}/m);
    const notice = serviceSource.match(/^    function notice\(options\) \{\n[\s\S]*?^    \}/m);
    assert.ok(switchHome && notice, "the home shortcut and notice helper are present");
    const id = "h0123456789ab", selected = "~/Other home", previous = "~/Current home";
    for (const [name, item, reply] of [
        ["saved", id, "ok"],
        ["unreadable", id, "refused: user-config=unreadable path=/fixture/shell.json"],
        ["read-only", id, "refused: user-config=unwritable path=/fixture/shell.json error=permission-denied"],
        ["unlisted", "h000000000000", "ok"]
    ]) {
        let saved = previous;
        const writes = [], notices = [], warnings = [];
        const shell = {
            configure: { set(key, value) { writes.push([key, value]); if (reply === "ok") saved = value; return reply; } },
            notify: { send(options) { notices.push(JSON.parse(JSON.stringify(options))); return "ok"; } }
        };
        const result = vm.runInNewContext(notice[0] + "\n" + switchHome[0] + "\nswitchHome(" + JSON.stringify(item) + ");",
            { shell, homeMessage: { homes: [{ id, value: selected }] }, console: { warn: text => warnings.push(text) } });
        const listed = item === id, refused = listed && reply !== "ok";
        assert.equal(result, listed ? reply : "refused: home=" + item + " reason=unlisted", name + ": the write result is retained");
        assert.deepEqual(writes, listed ? [["home", selected]] : [], name + ": only a listed home writes");
        assert.equal(saved, listed && !refused ? selected : previous, name + ": refused writes keep the home");
        assert.equal(notices.length, refused ? 1 : 0, name + ": only a refused write sends a notice");
        assert.deepEqual(warnings, refused ? ["jarvis: home-setting " + reply] : [], name + ": the refusal stays in the log");
        if (refused) {
            assert.equal(notices[0].tone, "danger");
            assert.equal(notices[0].icon, "folder");
            assert.ok(notices[0].title.length > 0 && notices[0].message.length > 0);
            assert.doesNotMatch(notices[0].message, /user-config=|permission-denied/, name + ": diagnostics stay out of the notice");
        }
    }
}
// want: the AI model step's tone and the named action it offers, undefined
// for none. An app is an account row of the helper's status: signIn is
// whether Sign in serves its signed-out account.
const MODEL = [
    { name: "key only before model discovery", keys: [{ value: "present" }], apps: [], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "signed-in app before model discovery", keys: [], apps: [{ source: "cli", state: "signed-in" }], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "verified app", keys: [], apps: [{ source: "cli", state: "verified" }], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "app verification pending", keys: [], apps: [{ source: "cli", state: "verifying" }], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "neither key nor app", keys: [], apps: [], answer: UNSELECTED, want: ["warning", "key"] },
    { name: "found app folder Sign in does not serve", keys: [], apps: [{ source: "cli", state: "found" }], answer: UNSELECTED, want: ["warning", "key"] },
    { name: "signed-out app folder", keys: [], apps: [{ source: "cli", state: "found", signIn: true }], answer: UNSELECTED, want: ["warning", "signIn"] },
    { name: "signed-out app beside a signed-in one", keys: [], apps: [{ source: "cli", state: "found", signIn: true }, { source: "cli", state: "signed-in" }],
        answer: UNSELECTED, want: ["warning", undefined] },
    { name: "signed-out app beside a key", keys: [{ value: "present" }], apps: [{ source: "cli", state: "found", signIn: true }], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "signed-out AI model chosen", keys: [{ value: "present" }], apps: [{ source: "cli", state: "signed-in" }], answer: SIGNED_OUT, want: ["warning", "signIn"] },
    { name: "unchecked app folder", keys: [], apps: [{ source: "cli", state: "unchecked" }], answer: UNSELECTED, want: ["warning", "key"] },
    { name: "locked key", keys: [{ value: "locked" }], apps: [], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "unavailable key reader", keys: [{ value: "unavailable" }], apps: [], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "key reader has not answered", keys: undefined, apps: [], answer: UNSELECTED, want: ["warning", undefined] },
    { name: "app reader failed", keys: [], apps: [], code: 1, answer: UNSELECTED, want: ["warning", undefined] },
    { name: "selected model", keys: [{ value: "present" }], apps: [], answer: { kind: "answered", causes: [] }, want: ["ok", undefined] },
    { name: "checking", keys: [], apps: [], answer: { kind: "checking" }, want: ["info", undefined] }
];

// Run both shipped publication functions. Accounts supplies typed sign-in
// facts; Service publishes the model row without relying on offered models.
function verifyModelConsumers(gate, serviceSource, accountsSource) {
    const publishAccounts = accountsSource.match(/^    function publish\(\) \{\n[\s\S]*?^    \}/m);
    const publishSetup = serviceSource.match(/^    function publishSetup\(answer\) \{\n[\s\S]*?^    \}/m);
    assert.ok(publishAccounts && publishSetup);
    const accessor = fs.readFileSync(pageFile, "utf8").match(/function statusEntry\(key\) \{[\s\S]*?\n    \}/);
    assert.ok(accessor, "the Details accessor is present");
    const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    for (const row of MODEL) {
        const values = row.keys === undefined ? {} : { keys: row.keys.map(key => ({ label: "Fixture key", ...key })) };
        if (row.keys !== undefined) assert.equal(judge.statusWrite(manifest, {}, "keys", values.keys).ok, true);
        const shell = { settings: { voiceAccount: "" }, requirements: { missing: [] }, status: { values, set: (key, value) => {
            const accepted = judge.statusWrite(manifest, values, key, value);
            assert.equal(accepted.ok, true, row.name + ": accepted status " + key);
            values[key] = value;
            return "ok";
        } } };
        const root = { shell, modelAccess: { kind: "checking" }, pending: false,
            completion: { kind: "exited", code: row.code ?? 0 }, diagnostic: { kind: "collected", text: "" },
            output: JSON.stringify({ accounts: row.apps.map(app => ({ label: "Fixture app", value: "present", plan: "", email: "", mismatch: false, signIn: false, ...app })),
                brains: [], voiceAccounts: [], search: { found: row.apps.length, partial: "" } }), refreshed: () => {} };
        vm.runInNewContext("(function() { with(root) { return (" + publishAccounts[0] + ").call(root); } })()",
            { root, Gate: gate, Words: words, Providers: { probeFailure: () => "jarvis-accounts: probe=failed" }, console: { warn: () => {} } });
        vm.runInNewContext("(" + publishSetup[0] + ")", { Gate: gate, shell, accountReader: root, localRuntime: { setupCause: "" }, sessionState: null, shellSetupCauses: [], setupAnswer: { kind: "checking" } })(row.answer);
        try {
            assert.deepEqual([values.setupModel.tone, values.setupModel.action], row.want, row.name);
            const entry = judge.statusRows(manifest, values, []).find(item => item.key === "setupModel");
            assert.equal(entry.action.offered, row.want[1] !== undefined, row.name + ": the actual row action");
            const setupRow = settingsRows(settings.settingsSections([{ name: "add-key" }, { name: "sign-in" }], judge.statusRows(manifest, values, [])))
                .find(item => item.entry.key === "setupModel");
            assert.equal(setupRow.button === null ? undefined : setupRow.button.name, MODEL_TUI[row.want[1]], row.name + ": Settings link");
            // A signed-out app replaces the cause's hint with its own.
            if (row.answer === UNSELECTED) {
                const detailsEntry = vm.runInNewContext("(" + accessor[0] + ")", { row: { status: judge.statusRows(manifest, values, []) } })("setupModel");
                const unselected = gate.readiness(UNSELECTED).setupModel.hint;
                for (const [consumer, actual] of [["Settings", setupRow.entry], ["Details", detailsEntry]]) {
                    const hint = settings.statusView(actual, String).hint;
                    if (row.want[1] !== "signIn")
                        assert.equal(hint, "Choose an AI model in Settings > AI model.", row.name + ": " + consumer + " AI model hint");
                    else assert.deepEqual([typeof hint, hint === unselected], ["string", false],
                        row.name + ": " + consumer + " signed-out hint replaces the unselected one");
                }
            }
        } catch (error) {
            error.check = "setup-model-action";
            error.case = row.name;
            throw error;
        }
    }
}
// Run the shipped hello and the shipped account publication: the daemon's
// own protocol judge accepts each hello, whose voice is the row's, and the
// Voice group's key row offers Add key until a key is stored.
// The settings of the hello the shipped service writes for SETTINGS and
// READER, its account reader's last read.
function helloSettings(gate, serviceSource, providers, manifest, settings, reader, label) {
    const hello = serviceSource.match(/^    function hello\(\) \{\n[\s\S]*?^    \}/m);
    assert.ok(hello);
    const keys = Object.fromEntries(manifest.hyprland.binds.map(bind => [bind.shortcut, bind.key]));
    let wire = null;
    const root = { accountReader: reader, shell: { settings,
        shortcut: { keys }, manifest: { hyprland: manifest.hyprland, __revision: "a".repeat(64) } },
        child: { running: true, write: text => { wire = text; } }, cause: "", lifetime: { kind: "starting" }, sessionState: null, dictationCause: "",
        feedbackSounds: false, lockObservation: () => false, broken: reason => assert.fail(label + ": the daemon refuses the hello: " + reason) };
    vm.runInNewContext("(function() { with(root) { return (" + hello[0] + ").call(root); } })()", { root, Gate: gate, Protocol: protocol,
        Quickshell: { env: name => "/fixture/" + name }, Paths: { stateDir: "/fixture/state" }, Providers: { ...providers, runtimeDirectory: () => "/fixture/run" } });
    return JSON.parse(wire).settings;
}

// The model and effort the daemon gets with no list read.
function verifyUnlisted(gate, providers, serviceSource) {
    const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    try {
        for (const [label, saved, provider, want] of UNLISTED) {
            const settings = { ...plain(manifest.settings), brain: "claude-team", ...saved };
            const sent = helloSettings(gate, serviceSource, providers, manifest, settings,
                { voiceKeys: [], providers: provider === undefined ? {} : { "claude-team": provider } }, label);
            assert.deepEqual([sent.model, sent.effort], want, label + ": the model and effort in the hello");
        }
    } catch (error) {
        if (error instanceof assert.AssertionError) error.check = "model-choice";
        throw error;
    }
}

function verifyVoice(gate, serviceSource, accountsSource) {
    const publishAccounts = accountsSource.match(/^    function publish\(\) \{\n[\s\S]*?^    \}/m);
    assert.ok(publishAccounts);
    const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    try {
        for (const [label, changed, offered, want] of VOICE) {
            const settings = { ...plain(manifest.settings), ...changed };
            assert.equal(helloSettings(gate, serviceSource, require(providersFile), manifest, settings, { voiceKeys: offered, providers: {} }, label).voiceProvider, want, label);
        }
        assert.equal(plain(gate.readiness({ kind: "answered", causes: [] })).setup.tone, "ok", "no cause, as a fresh install with its local voice set up: ready");
        for (const [label, offered, want] of VOICE_KEY) {
            const values = {};
            const shell = { settings: { voiceAccount: "openai-1" }, status: { values, set: (key, value) => {
                assert.equal(judge.statusWrite(manifest, values, key, value).ok, true, label + ": accepted status " + key);
                values[key] = value;
                return "ok";
            } } };
            const root = { shell, modelAccess: { kind: "checking" }, voiceKeys: "unread", providers: "unread", pending: false, completion: { kind: "exited", code: offered === null ? 1 : 0 },
                diagnostic: { kind: "collected", text: "" }, refreshed: () => {},
                output: JSON.stringify({ accounts: [], brains: [], providers: { "claude-team": "claude" }, voiceAccounts: offered ?? [], search: { found: 0, partial: "" } }) };
            vm.runInNewContext("(function() { with(root) { return (" + publishAccounts[0] + ").call(root); } })()",
                { root, Gate: gate, Words: words, Providers: { probeFailure: () => "jarvis-accounts: probe=failed" }, console: { warn: () => {} } });
            assert.deepEqual(plain({ keys: root.voiceKeys }), plain({ keys: offered ?? undefined }), label + ": the keys the reader hands the service");
            assert.deepEqual(plain(root.providers), offered === null ? {} : { "claude-team": "claude" }, label + ": the providers the reader hands the service");
            const entry = judge.statusRows(manifest, values, []).find(item => item.key === "voiceKey");
            assert.deepEqual(plain([entry.group, entry.tone, entry.action.offered, entry.action.tui]),
                ["Voice", { info: "info", ok: "success", warning: "warning" }[want[0]], want[1], want[1] ? "add-key" : ""], label + ": the Voice group's key row");
            assert.equal(typeof entry.hint === "string" && entry.hint !== "", true, label + ": the row says what the key unlocks");
        }
    } catch (error) {
        error.check = "voice-default";
        throw error;
    }
}
function verifyVoiceConsumers(gate, pageSource) {
    const accessor = pageSource.match(/function statusEntry\(key\) \{[\s\S]*?\n    \}/);
    assert.ok(accessor, "the Details accessor is present");
    const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    for (const [provider, causes, expected] of [
        ["realtime", ["brain=unselected"], ["success", false]],
        ["local", ["brain=unselected", "speech=local-not-set-up"], ["warning", true]]
    ]) {
        const values = { ...plain(gate.readiness({ kind: "answered", causes })),
            localRuntime: { tone: "warning", text: "Not set up", action: true } };
        values.setupVoice = gate.voiceCheck(values.setupVoice, null);
        const row = { status: judge.statusRows(manifest, values, []) };
        const detailsEntry = vm.runInNewContext("(" + accessor[0] + ")", { row })("setupVoice");
        const settingsEntry = settingsRows(settings.settingsSections([], row.status)).find(item => item.entry.key === "setupVoice").entry;
        try {
            assert.equal(detailsEntry, settingsEntry);
            assert.deepEqual(plain([detailsEntry.tone, detailsEntry.action.offered]), expected);
            assert.deepEqual(plain(settings.statusView(detailsEntry, String)), plain(settings.statusView(settingsEntry, String)));
        } catch (error) {
            error.check = "setup-voice-consumer-source";
            error.provider = provider;
            throw error;
        }
    }
}

// The keyed causes (area=cause, or jarvis: area=cause) among VALUE's FIELDS,
// as the Setup group draws them.
function keyedCauses(value, fields) {
    return fields.flatMap(field => value[field] === undefined ? [] : [].concat(value[field]))
        .filter(text => /(^|\s)(jarvis: )?[a-z-]+=[a-z0-9-]/.test(text));
}

function verifyReadiness(gate) {
    for (const [label, answer, tone, todo, declared, model] of READINESS) {
        const got = plain(gate.readiness(answer));
        assert.deepEqual(Object.keys(got).sort(), ["setup", "setupHome", "setupModel", "setupVoice"], label);
        assert.deepEqual(got.setupHome, { hidden: true }, label + ": the home folder step stays off the page");
        assert.equal(got.setup.tone, tone, label + ": the summary");
        assert.equal(got.setup.action, undefined, label + ": the summary offers no step");
        assert.deepEqual(keyedCauses(got.setup, ["text", "hint", "lines"]), [], label + ": the summary draws no keyed cause");
        for (const key of ["setupVoice", "setupModel"]) {
            const step = got[key];
            const open = todo.includes(key);
            const action = key === "setupModel" ? model ?? "key" : true;
            const expectedLines = open && answer.kind === "answered" && answer.causes[0] === "speech=local-ready-timeout" ? [answer.causes[0]] : undefined;
            assert.deepEqual([step.tone, step.action, step.lines], open ? ["warning", action, expectedLines] : ["ok", DONE_ACTION[key], undefined], label + ": " + key);
            assert.deepEqual(keyedCauses(step, ["text", "hint"]), [], label + ": " + key + " words its cause");
            if (!open || declared.includes(key)) assert.equal(step.hint, undefined, label + ": " + key + " keeps its declared hint");
            else assert.equal(typeof step.hint === "string" && step.hint !== "" && !/=/.test(step.hint), true,
                label + ": a plain hint, no keyed cause on screen");
        }
    }
    const lines = BRAIN_CAUSES.map(cause => plain(gate.readiness({ kind: "answered", causes: [cause] })).setupModel.hint);
    const localNotReady = plain(gate.readiness({ kind: "answered", causes: ["speech=local-not-ready"] })).setupVoice;
    assert.equal(localNotReady.hint, "Local voice did not start. Set it up again.", "local voice setup-broken words");
    const localReadyTimeout = plain(gate.readiness({ kind: "answered", causes: ["speech=local-ready-timeout"] })).setupVoice;
    assert.equal(localReadyTimeout.hint, "Local voice did not get ready in time. Turn Jarvis off and on again, or set it up again in Settings > Jarvis.", "local voice timeout words");
    const probeTimeout = plain(gate.readiness({ kind: "answered", causes: ["setup=probe-timeout"] }));
    assert.equal(typeof probeTimeout.setup.hint === "string" && probeTimeout.setup.hint !== "" && !/=/.test(probeTimeout.setup.hint), true,
        "probe timeout: the ready summary carries its caution");
    assert.deepEqual(probeTimeout.setupVoice, { tone: "ok", text: "Done", action: false }, "probe timeout: the voice step offers no setup");
    for (const cause of ["speech=local-memory-insufficient", "speech=local-memory-unavailable"]) {
        const got = plain(gate.readiness({ kind: "answered", causes: [cause] }));
        assert.deepEqual([got.setup.tone, got.setupVoice.tone, got.setupVoice.action, got.setupModel.tone],
            ["warning", "warning", false, "ok"], "memory refuses capture without reinstall action");
        assert.equal(got.setupVoice.lines, undefined, "recovery is no state badge");
        assert.equal(typeof got.setupVoice.hint, "string");
        assert.notEqual(got.setupVoice.hint.trim(), "", "memory refusal carries guidance");
    }
    assert.equal(new Set(lines).size, BRAIN_CAUSES.length, "each brain cause says its own hint");
    for (const cause of ["speech=live-account-unselected", "speech=live-account-unreadable", "speech=live-key-required", "speech=always-local-voice"]) {
        const got = plain(gate.readiness({ kind: "answered", causes: [cause] }));
        assert.deepEqual([got.setupVoice.tone, got.setupVoice.action, typeof got.setupVoice.hint], ["warning", false, "string"],
            "Realtime voice setup never starts local model installation");
        assert.deepEqual(got.setupModel, { tone: "ok", text: "Done" });
    }
    // Before the daemon answers nothing reads ready or to do.
    const checking = plain(gate.readiness({ kind: "checking" }));
    assert.deepEqual([checking.setup.tone, checking.setup.action], ["info", undefined], "checking: setup");
    for (const key of ["setupVoice", "setupModel"])
        assert.deepEqual([checking[key].tone, checking[key].action], ["info", DONE_ACTION[key]], "checking: " + key);
    assert.equal(gate.readiness({ kind: "checking" }).setupVoice, gate.CHECKING);
    assert.equal(gate.readiness({ kind: "answered", causes: ["speech=local-loading"] }).setupVoice, gate.LOADING);
    assert.equal(gate.readiness({ kind: "answered", causes: ["speech=local-loading"] }).setup, gate.LOADING_SUMMARY);
    assert.notEqual(gate.LOADING, gate.CHECKING, "loading and initial checking have distinct values");
    for (const causes of [["speech=local-loading"], ["speech=local-loading", "brain=unselected"]]) {
        const loading = plain(gate.readiness({ kind: "answered", causes }));
        assert.deepEqual([loading.setupVoice.tone, loading.setupVoice.action], ["info", false]);
        assert.equal(loading.setup.tone, causes.length === 1 ? "info" : "warning");
        assert.equal(loading.setup.action, undefined);
        assert.deepEqual([loading.setupModel.tone, loading.setupModel.action], causes.length === 1 ? ["ok", undefined] : ["warning", "key"]);
    }
    // A stopped daemon runs no check: its steps claim none and offer none.
    const stopped = plain(gate.readiness({ kind: "stopped" }));
    assert.deepEqual(Object.keys(stopped).sort(), ["setup", "setupHome", "setupModel", "setupVoice"], "stopped");
    assert.deepEqual([stopped.setupHome, checking.setupHome], [{ hidden: true }, { hidden: true }], "no home folder step without an answer");
    // A refused home folder is the one step to do, with what to change and
    // no action of its own; the voice and the AI model stay done.
    const homeHints = HOME_CAUSES.map(cause => {
        const got = plain(gate.readiness({ kind: "answered", causes: [cause] }));
        assert.deepEqual([got.setup.tone, got.setupHome.tone, got.setupHome.action, got.setupHome.lines, got.setupVoice.tone, got.setupModel.tone],
            ["warning", "warning", undefined, undefined, "ok", "ok"], cause);
        assert.equal(typeof got.setupHome.hint === "string" && got.setupHome.hint !== "" && !/=/.test(got.setupHome.hint), true,
            cause + ": a plain hint, no keyed cause on screen");
        return got.setupHome.hint;
    });
    assert.equal(new Set(homeHints).size, HOME_CAUSES.length, "each home cause says its own hint");
    // The Copilot Memory row shows for a usable GitHub Copilot account alone.
    const account = (provider, value) => ({ provider, value });
    for (const [label, accounts, shown] of [
        ["no account", [], false], ["another app", [account("claude", "present")], false],
        ["a signed-out Copilot", [account("copilot", "signed-out")], false],
        ["a Copilot account", [account("codex", "present"), account("copilot", "present")], true]]) {
        const got = plain(gate.copilotMemory(accounts));
        assert.deepEqual([got.hidden === true, got.tone], shown ? [false, "info"] : [true, undefined], label);
        assert.equal(got.action, undefined, label + ": the user's step runs on GitHub, with no action here");
    }
    assert.equal(stopped.setup.tone, "danger", "stopped: the summary");
    assert.deepEqual([stopped.setup.lines, typeof stopped.setup.hint], [undefined, "string"], "stopped: the summary says why as its hint");
    for (const key of ["setupVoice", "setupModel"])
        assert.deepEqual([stopped[key].tone === checking[key].tone, stopped[key].action], [false, DONE_ACTION[key]], "stopped: " + key);
    assert.throws(() => gate.readiness({ kind: "answered", causes: ["voice=missing"] }), /^Error: jarvis-setup: cause=voice=missing/);
    // An optional step: done while its reader is ok, else optional with
    // its reader's action.
    for (const [label, key, value, want] of [
        ["browser ready", "setupBrowser", READY, ["ok", false]],
        ["browser to set up", "setupBrowser", ABSENT, ["info", true]],
        ["browser withheld", "setupBrowser", { tone: "warning", text: "Needs agent-browser", action: false }, ["info", false]],
        ["input ready", "setupInput", { tone: "ok", text: "Keys ready; pointer ready", action: true }, ["ok", false]],
        ["input missing", "setupInput", { tone: "warning", text: "Input tools unavailable", action: true }, ["info", true]]]) {
        const got = plain(gate.optionalStep(key, value));
        assert.deepEqual([got.tone, got.action], want, label);
        assert.equal(typeof got.text, "string");
        assert.notEqual(got.text.trim(), "", "an optional step carries a state label");
        assert.equal(got.hint, undefined, "optional guidance stays in the manifest");
        assert.equal(got.lines, undefined, "optional guidance is no state badge");
    }
    assert.throws(() => gate.optionalStep("setupModel", READY), /step=setupModel is not optional/);
    // Every value the service publishes is one the manifest judge accepts
    // for its entry, so a refused write cannot stop the service's start.
    const manifest = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    const answers = READINESS.map(row => row[1]).concat([{ kind: "checking" }, { kind: "stopped" },
        { kind: "answered", causes: ["speech=local-memory-insufficient"] },
        { kind: "answered", causes: ["speech=local-memory-unavailable"] }], HOME_CAUSES.map(cause => ({ kind: "answered", causes: [cause] })));
    for (const accounts of [[], [{ provider: "copilot", value: "present" }]])
        assert.equal(judge.statusWrite(manifest, {}, "copilotMemory", plain(gate.copilotMemory(accounts))).ok, true, "the manifest judge accepts copilotMemory");
    // The row's link is words of its declared hint, to GitHub alone.
    const memory = judge.statusRows(manifest, { copilotMemory: plain(gate.copilotMemory([{ provider: "copilot", value: "present" }])) }, [])
        .find(entry => entry.key === "copilotMemory");
    assert.equal(memory.hint.includes(memory.link.text) && new URL(memory.link.url).hostname === "github.com", true);
    assert.equal(settings.statusView(memory, String).link.url, memory.link.url, "Settings draws the row's link");
    assert.equal(judge.statusRows(manifest, { copilotMemory: plain(gate.copilotMemory([])) }, []).some(entry => entry.key === "copilotMemory"), false,
        "no Copilot account, no row");
    for (const answer of answers)
        for (const [key, value] of Object.entries(plain(gate.readiness(answer))))
            assert.equal(judge.statusWrite(manifest, {}, key, key === "setupVoice" ? gate.voiceCheck(value, null) : value).ok, true,
                "the manifest judge accepts " + key + " for " + JSON.stringify(answer));
    for (const [key, value] of [["setupBrowser", READY], ["setupBrowser", ABSENT], ["setupInput", ABSENT]])
        assert.equal(judge.statusWrite(manifest, {}, key, plain(gate.optionalStep(key, value))).ok, true, "the manifest judge accepts " + key);
    const published = {
        ...plain(gate.readiness({ kind: "answered", causes: ["speech=local-memory-insufficient"] })),
        setupBrowser: plain(gate.optionalStep("setupBrowser", ABSENT)),
        setupInput: plain(gate.optionalStep("setupInput", ABSENT))
    };
    const fixtureManifest = plain(manifest);
    published.setupVoice = gate.voiceCheck(published.setupVoice, null);
    published.setupVoice.hint = "fixture state voice guidance";
    for (const key of ["setupVoice", "setupBrowser", "setupInput"]) {
        fixtureManifest.status[key].hint = "fixture declaration " + key;
        if (key !== "setupVoice") {
            assert.equal(published[key].hint, undefined, "optional guidance stays in the manifest");
            assert.equal(typeof manifest.status[key].hint, "string");
            assert.notEqual(manifest.status[key].hint.trim(), "", "the manifest owns the guidance");
        }
        const hint = key === "setupVoice" ? "fixture state voice guidance" : "fixture declaration " + key;
        const accepted = judge.statusWrite(fixtureManifest, {}, key, published[key]);
        assert.equal(accepted.ok, true);
        const row = judge.statusRows(fixtureManifest, accepted.values, []).find(entry => entry.key === key);
        const view = settings.statusView(row, String);
        assert.deepEqual(plain([view.hint, view.lines]), [hint, []], "Settings draws one badge with plain guidance: " + key);
    }
}

// The run a change of the Local voice setting starts, and the setting after
// a run ended: the written value is one the setting then holds, so it starts
// no run.
function verifyTiers(gate) {
    for (const [label, wanted, pick, ready, run, after] of TIERS) {
        assert.deepEqual(plain(gate.tierRun(wanted, pick, ready)), run, label + ": the run");
        assert.deepEqual(gate.tierAfterRun(wanted, pick, ready), after, label + ": the setting after a run");
        if (after !== null) assert.equal(gate.tierRun(after, pick, ready), null, label + ": the written setting starts no run");
    }
    const choices = [{ value: "auto", label: "Auto: Large, English, graphics card, 1.2 GB" }, { value: "small", label: "Small: English, quick setup, 685 MB" }];
    assert.equal(judge.statusWrite(manifest, {}, "localTiers", choices).ok, true, "the manifest judge accepts the Local voice offers");
    assert.equal(manifest.schema.localTier.optionsFrom, "localTiers", "the Local voice setting reads its offers");
    assert.equal(manifest.settings.localTier, "auto", "the Local voice setting defaults to the pick");
}

// The Jarvis session row: every state and reason pair of the package's
// contract, copied here from the contract and not from SetupGate.js, is a
// row the manifest
// judge accepts, a session that lives reads the same whatever the boot
// setting, only a session that does not run offers Start, only a failure
// offers Retry, and an answer outside the contract is a failure.
const SESSION_CONTRACT = {
    running: ["resumed", "new-no-record", "new-history-gone", "new-selection-changed", "new-requested", "existing"],
    starting: ["launching"], "handing-over": ["succession"], stopping: ["stop-requested"],
    stopped: ["never-started", "stopped", "ended"], off: ["app-off"],
    blocked: ["app-off", "name-conflict", "record-unreadable", "sign-in-required", "selection-conflict", "tmux-missing", "app-missing"],
    failed: ["launch-failed", "handover-failed"]
};
const SESSION_TONES = { running: "ok", starting: "info", "handing-over": "info", stopping: "info", stopped: "info", off: "info", failed: "danger" };
function verifySession(gate) {
    const names = { home: "~/Jarvis", account: "Claude Code, ~/.claude" };
    const offered = value => {
        assert.equal(judge.statusWrite(manifest, {}, "sessionStart", value).ok, true, "the manifest judge accepts the row: " + JSON.stringify(value));
        const request = plain(judge.statusActionRequest(manifest, "vgs.jarvis", true, { sessionStart: value }, "sessionStart"));
        return request.ok ? (request.kind === "tui" ? value.action + ":" + request.name : "install:" + request.commands.join(",")) : "none";
    };
    assert.deepEqual(plain(gate.sessionStart(true, null)), { hidden: true }, "no row before the first answer");
    for (const [state, reasons] of Object.entries(SESSION_CONTRACT))
        for (const reason of reasons)
            for (const wanted of [true, false]) {
                const label = state + " " + reason + " boot " + wanted;
                const value = plain(gate.sessionStart(wanted, { kind: "answer", state, reason, detail: "The package's line.", names }));
                const action = offered(value);
                assert.equal(typeof value.text === "string" && value.text !== "" && typeof value.hint === "string" && value.hint !== "", true, label + ": the row has its words");
                if (state === "blocked") assert.equal(value.tone, reason === "app-off" ? "info" : "warning", label + ": the tone");
                else assert.equal(value.tone, SESSION_TONES[state], label + ": the tone");
                assert.equal(action, state === "stopped" ? "start:start-session" : state === "failed" ? "retry:start-session"
                    : state === "blocked" && reason === "tmux-missing" ? "install:tmux" : "none", label + ": the action the row offers");
                if (state !== "stopped")
                    assert.deepEqual(value, plain(gate.sessionStart(!wanted, { kind: "answer", state, reason, detail: "The package's line.", names })),
                        label + ": the boot setting changes no row of a session that is not stopped");
                if (["failed"].includes(state) || reason === "sign-in-required")
                    assert.equal(value.hint, "The package's line.", label + ": the package's own line is shown");
                if (["resumed", "existing", "new-requested"].includes(reason))
                    assert.equal(value.hint.includes(names.home) && value.hint.includes(names.account), true, label + ": the recorded home and account are named");
            }
    assert.equal(offered(plain(gate.sessionStart(true, { kind: "answer", state: "running", reason: "existing", detail: "", names: null }))), "none",
        "a running session with no recorded names is a row the judge accepts");
    // The status judge's hint limit: a detail at the limit is drawn, and
    // names too long for one hint leave the row its text alone.
    const limit = plain(gate.sessionStart(true, { kind: "answer", state: "failed", reason: "launch-failed", detail: "x".repeat(200), names }));
    assert.deepEqual([limit.hint.length, offered(limit)], [200, "retry:start-session"], "a detail at the hint limit is a row the judge accepts");
    const long = plain(gate.sessionStart(true, { kind: "answer", state: "running", reason: "resumed", detail: "",
        names: { home: "~/" + "h".repeat(120), account: "Claude Code, ~/" + "a".repeat(120) } }));
    assert.deepEqual([long.text, long.hint, offered(long)], [plain(gate.sessionStart(true, { kind: "answer", state: "running", reason: "resumed", detail: "", names })).text, undefined, "none"],
        "names too long for a hint leave a row the judge accepts");
    assert.deepEqual(Object.keys(SESSION_CONTRACT).filter(state => gate.sessionLive(state)), ["running", "starting", "handing-over"], "the states of a session that lives");
    const stopped = wanted => plain(gate.sessionStart(wanted, { kind: "answer", state: "stopped", reason: "ended", detail: "", names: null }));
    assert.notEqual(stopped(true).text, stopped(false).text, "a stopped session reads by the boot setting");
    for (const block of ["no-account", "not-app", "no-home", "package"]) {
        const value = plain(gate.sessionStart(true, { kind: "blocked", block }));
        assert.deepEqual([value.tone, offered(value)], ["warning", "none"], block + ": a block offers no start");
    }
    assert.throws(() => gate.sessionStart(true, { kind: "blocked", block: "unknown" }), { message: "jarvis-setup: session=unknown" });
    for (const result of [{ kind: "failed" }, { kind: "answer", state: "running", reason: "launching", detail: "", names: null }, { kind: "other" }]) {
        const value = plain(gate.sessionStart(true, result));
        assert.deepEqual([value.tone, offered(value)], ["danger", "retry:start-session"], "an answer outside the contract is a failure with Retry");
    }
    const kept = plain(gate.sessionStart(true, { kind: "answer", state: "running", reason: "resumed", detail: "", names, unapplied: "not-app" }));
    assert.deepEqual([kept.text === plain(gate.sessionStart(true, { kind: "answer", state: "running", reason: "resumed", detail: "", names })).text,
        Array.isArray(kept.lines) && kept.lines.length === 1 && offered(kept)], [true, "none"], "a selection that failed its check shows beside the session that stays");
    assert.equal(manifest.settings.startAtBoot, false, "the setting is off at first");
    for (const [wanted, values] of [[false, []], [true, ["", "new"]]]) {
        const offers = plain(gate.sessionModes(wanted));
        assert.equal(judge.statusWrite(manifest, {}, "sessionModes", offers).ok, true, "the manifest judge accepts the session offers");
        const drawn = plain(judge.settingChoices(manifest, { sessionModes: offers }, manifest.settings).bootSession);
        assert.deepEqual(drawn.map(choice => choice.value), values, "the session field while the setting is " + wanted);
    }
}

function verify(gate) {
    verifySession(gate);
    for (const check of [{ kind: "ready" }, { kind: "done", result: "ready" }]) {
        const value = gate.voiceCheck(gate.readiness({ kind: "answered", causes: ["speech=local-ready-timeout"] }).setupVoice, check);
        assert.deepEqual(plain(value), { tone: "warning", text: "To do",
            hint: "Local voice did not get ready in time. Turn Jarvis off and on again, or set it up again in Settings > Jarvis.",
            action: "setup", lines: ["speech=local-ready-timeout"] }, "voice setup cause survives microphone check");
    }
    for (const [check, tone, action] of [[{ kind: "ready" }, "info", "check"],
        [{ kind: "waiting" }, "info", undefined], [{ kind: "recording" }, "info", undefined],
        [{ kind: "finishing" }, "info", undefined], [{ kind: "failed", reason: "check-timeout" }, "danger", "check"],
        [{ kind: "failed", reason: "speech=local-wake-failed" }, "danger", "check"], [{ kind: "done", result: "ready" }, "ok", "check"],
        [{ kind: "done", result: "silent" }, "warning", "check"], [{ kind: "done", result: "not-heard" }, "warning", "check"]]) {
        const value = gate.voiceCheck(gate.DONE, check);
        assert.deepEqual([value.tone, value.action], [tone, action]);
        assert.equal(judge.statusWrite(manifest, {}, "setupVoice", value).ok, true);
    }
    verifyOneReadiness(gate);
    verifyReadiness(gate);
    verifyChipTitles(gate);
    verifyTiers(gate);
    verifyModelConsumers(gate, fs.readFileSync(serviceFile, "utf8"), fs.readFileSync(accountsFile, "utf8"));
    verifyVoice(gate, fs.readFileSync(serviceFile, "utf8"), fs.readFileSync(accountsFile, "utf8"));
    verifyModelChoice(require(providersFile));
    verifyUnlisted(gate, require(providersFile), fs.readFileSync(serviceFile, "utf8"));
    verifyListRead(require(providersFile), fs.readFileSync(accountsFile, "utf8"));
    verifyDictation(gate, fs.readFileSync(serviceFile, "utf8"), fs.readFileSync(accountsFile, "utf8"));
    for (const [label, value, requires, missing, names] of SETUP) {
        const got = gate.setupValue(value, requires, missing);
        if (names === null) {
            assert.equal(got, value, label + ": the probe value is published as it is");
            continue;
        }
        assert.equal(got.tone, "warning", label);
        assert.equal(got.action, false, label + ": the setup step is withheld");
        for (const command of requires)
            assert.equal(got.text.includes(command), names.includes(command), label + ": the text names " + command + " only while it is missing");
        const at = names.map(command => got.text.indexOf(command));
        assert.deepEqual(at, [...at].sort((x, y) => x - y), label + ": the missing commands in declaration order");
    }
    for (const [label, command, missing, want] of REQUIREMENT)
        // The library's objects come from its own context; compare a copy.
        assert.deepEqual(JSON.parse(JSON.stringify(gate.requirementValue(command, missing))), want, label);
    for (const [label, missing, outdated, want] of FLOORED)
        assert.deepEqual(plain(gate.flooredValue("agent-browser", missing, outdated)), want, "a command with a floor: " + label);
    // The manifest gives both programs Jarvis holds to a version their
    // floor, and the judge accepts each value their rows publish.
    const judged = judge.validateManifest(JSON.parse(fs.readFileSync(path.join(path.dirname(file), "manifest.json"), "utf8")), path.dirname(file)).manifest;
    assert.deepEqual(["agent-browser", "pi"].map(command => typeof judged.requirements.find(row => row.name === command).floor), ["string", "string"],
        "the browser driver and Pi declare a floor");
    for (const [, missing, outdated] of FLOORED)
        assert.equal(judge.statusWrite(judged, {}, "browserDriver", plain(gate.flooredValue("agent-browser", missing, outdated))).ok, true, "the manifest judge accepts the driver row");
    const update = judge.statusActionRequest(judged, "vgs.jarvis", true, { setupModel: plain(gate.readiness({ kind: "answered", causes: ["brain=pi-update"] })).setupModel }, "setupModel");
    assert.deepEqual(plain(update), { ok: true, kind: "install", commands: ["pi"] }, "the AI model step's Update asks the core for Pi");
    assert.deepEqual(plain(judge.statusActionRequest(judged, "vgs.jarvis", true, { browserDriver: plain(gate.flooredValue("agent-browser", [], ["agent-browser"])) }, "browserDriver")),
        { ok: true, kind: "install", commands: ["agent-browser"] }, "the driver row's Update asks the core for the driver");
    // The Agent fleet row: hidden with no home or once the home's mail tool
    // is found, else offering its setup terminal, whose press the core
    // turns into the requirement notice while kendex or another command
    // that terminal needs is missing.
    for (const [label, home, tool, shown] of FLEET) {
        const value = plain(gate.fleetStep(home, tool));
        assert.equal(judge.statusWrite(judged, {}, "setupFleet", value).ok, true, label + ": the manifest judge accepts the row");
        for (const missing of [[], ["kendex"]]) {
            const row = judge.statusRows(judged, { setupFleet: value }, missing).find(entry => entry.key === "setupFleet");
            assert.equal(row !== undefined, shown, label + ": the row shows");
            if (!shown) continue;
            assert.deepEqual([row.action.offered, row.action.tui], [true, "setup-fleet"], label + ": the row offers its setup");
            assert.equal(row.action.label === judge.STATUS_WITHHELD_LABEL, missing.length > 0, label + ": the press installs kendex first while it is missing");
        }
    }
    verifySetupButtons(gate, judged);
    // Its control: the manifest with a launcher entry for the fleet TUI,
    // which the manager then lists in every state.
    const listed = plain(judged);
    listed.tui["setup-fleet"].entry = { label: "Install kendex", icon: "workflow", group: "Jarvis" };
    assert.throws(() => verifySetupButtons(gate, listed), assert.AssertionError, "a listed fleet TUI turns the check red");
    assert.deepEqual(plain(judge.tuiMissingRequirements(judged, "setup-fleet", ["kendex", "git", "tmux"])), ["git", "kendex"],
        "the setup terminal needs git and kendex");
    for (const command of ["git", "kendex"])
        assert.equal(judged.requirements.find(row => row.name === command).optional, true, command + " is optional: Jarvis works without the fleet");
    verifyProbeTimeoutConsumer(fs.readFileSync(localRuntimeFile, "utf8"));
    for (const [label, cause, kind] of START_CAUSES) {
        const words = gate.startCause(cause);
        assert.equal(words.kind, kind, label + ": classified");
        assert.equal(typeof words.title, "string", label + ": title");
        assert.equal(typeof words.action, "string", label + ": action");
        assert.deepEqual(JSON.parse(JSON.stringify(words.lines)), [cause], label + ": detail line");
        const setup = gate.readiness({ kind: "problem", cause }).setup;
        assert.equal(setup.text, words.title, label + ": setup text");
        assert.deepEqual(JSON.parse(JSON.stringify(setup.lines)), [cause], label + ": setup detail line");
    }
    let fallback;
    assert.doesNotThrow(() => { fallback = gate.startCause(ARBITRARY_STDERR); }, "arbitrary stderr maps to daemon exit");
    assert.equal(fallback.kind, "daemon-exit", "arbitrary stderr maps to daemon exit");
    for (const cause of ["jarvis: daemon=exit code=1 status=0 " + "x".repeat(240), "jarvis: protocol=bad\u0001line"]) {
        const words = gate.startCause(cause);
        const daemon = { tone: "danger", text: words.title, lines: [words.action].concat(words.lines) };
        const setup = gate.readiness({ kind: "problem", cause }).setup;
        assert.equal(judge.statusWrite(manifest, {}, "daemon", daemon).ok, true, "daemon accepts bounded cause line");
        assert.equal(judge.statusWrite(manifest, {}, "setup", setup).ok, true, "setup accepts bounded cause line");
        assert.equal(words.lines[0].length <= 200 && !/[\u0000-\u001f]/.test(words.lines[0]), true, "cause line is bounded and printable");
    }
}

verify(load(file));
const pageSource = fs.readFileSync(pageFile, "utf8");
verifyVoiceConsumers(load(file), pageSource);
console.log("test-jarvis-setup-gate: consumer=Settings,Details hint=Choose an AI model in Settings > AI model.");

// Each control removes one rule from a copy and keeps the text around it:
// [label, needle, replacement].
const CONTROLS = [
    ["check failure hidden", 'if (check.kind === "failed") return', 'if (false) return'],
    ["microphone check hides a setup cause", 'value.tone !== "ok" || ', "", "voice setup cause survives microphone check"],
    ["silent check is ready", 'if (check.result === "silent") return { tone: "warning"', 'if (check.result === "silent") return { tone: "ok"'],
    ["the AI model hint names the Settings field", '"brain=unselected": "Choose an AI model in Settings > AI model."', '"brain=unselected": "Choose an AI model in Settings."', "Settings AI model hint"],
    ["present keys still offer Add key", 'var absent = keys !== undefined && keys.every(function (key) { return key.value === "absent"; });', 'var absent = keys !== undefined;'],
    ["a signed-in app still offers Add key", 'access.kind === "absent"', 'access.kind !== "checking"'],
    ["a signed-out cause offers Add key", 'cause === "brain=signed-out" ? "signIn" : ', "", "a signed-out AI model: setupModel"],
    ["a signed-out cause loses Sign in beside a key", 'if (value.action !== "key") return value;', "if (value.action === undefined) return value;"],
    ["a signed-out app offers Add key", 'if (absent && access.kind === "signed-out") return', "if (false) return"],
    ["a signed-out app keeps the unselected hint", "{ hint: SIGNED_OUT_HINT, action: \"signIn\" }", "{ action: \"signIn\" }",
        "signed-out hint replaces the unselected one"],
    ["a signed-out app reads as none", 'account.signIn === true; }) ? "signed-out"', 'false; }) ? "signed-out"'],
    ["a merely found app suppresses Add key", '["signed-in", "verified", "verifying"].indexOf(account.state) !== -1', '["found", "unchecked", "signed-in", "verified", "verifying"].indexOf(account.state) !== -1'],
    ["checking account discovery offers Add key", 'access.kind === "absent"', 'access.kind !== "present"'],
    ["memory guidance is a badge", "out.setupVoice = MEMORY[cause];", "out.setupVoice = Object.assign({}, MEMORY[cause], { lines: [MEMORY[cause].hint], hint: undefined });"],
    ["optional guidance is a badge", "action: value.action === true };", 'lines: ["fixture guidance"], action: value.action === true };'],
    ["optional guidance changes with state", "action: value.action === true };", 'hint: "fixture guidance", action: value.action === true };'],
    ["memory refusal offers reinstall", 'if (Object.prototype.hasOwnProperty.call(MEMORY, cause)) {', 'if (false) {'],
    ["loading is initial checking", "out.setupVoice = LOADING;", "out.setupVoice = CHECKING;"],
    ["loading offers setup", 'if (cause === "speech=local-loading" || cause === "speech=dictation-starting") {', 'if (cause === "speech=dictation-starting") {'],
    ["a starting recording offers setup", 'if (cause === "speech=local-loading" || cause === "speech=dictation-starting") {', 'if (cause === "speech=local-loading") {', "daemon starting"],
    ["missing voxtype is not named", 'var ACTION_REQUIRES = { dictation: ["voxtype"] };', "var ACTION_REQUIRES = {};", "voxtype missing"],
    ["missing voxtype withholds Set up dictation", 'if (value.action === "dictation") withheld.action = "dictation";', 'if (false) withheld.action = "dictation";', "voxtype missing"],
    ["another voxtype offers setup", '"speech=dictation-elsewhere": { tone: "warning", text: "Another voxtype runs", hint: "Stop the other voxtype under Setup in Settings > Voice." },',
        '"speech=dictation-elsewhere": { tone: "warning", text: "Another voxtype runs", hint: "Stop the other voxtype under Setup in Settings > Voice.", action: "dictation" },', "another voxtype"],
    ["a failed daemon offers no setup", '"speech=dictation-failed": { tone: "warning", text: "To do", hint: "Dictation did not start. Set up dictation gets it ready.", action: "dictation" },',
        '"speech=dictation-failed": { tone: "warning", text: "To do", hint: "Dictation did not start. Set up dictation gets it ready." },', "the Voice step"],
    ["the voxtype row shows for any voice", 'return provider === "local" ? requirementValue("voxtype", missing) : { hidden: true };', 'return requirementValue("voxtype", missing);', "Realtime voice"],
    ["another device is no cause", 'return otherDevice(state) ? "speech=dictation-device" : "";', 'return "";', "another device"],
    ["the Realtime voice takes the cause", 'if (provider !== "local" || state === null) return "";', 'if (state === null) return "";', "Realtime voice"],
    ["the service starts another device", 'return otherDevice(state) ? "refused: dictation=device" : "";', 'return "";', "another device"],
    ["a step's named action is dropped", ': typeof value.action === "string" ? value : noAction(value);', ': noAction(value);', "the Voice step"],
    ["a stored key replaces the voice the user chose", 'if (settings.voiceProvider !== "auto") return settings.voiceProvider;', 'if (false) return settings.voiceProvider;'],
    ["no named key runs Realtime", ' || settings.voiceAccount === "") return "local";', ') return "local";'],
    ["a removed key keeps Realtime", "offered.some(function (key) { return key.value === settings.voiceAccount; })", "true"],
    ["a start loads the local voice beside a named key", "var stored = offered === undefined || ", "var stored = offered !== undefined && "],
    ["Always talk mode runs Realtime", 'if (settings.mode === "always" || ', "if ("],
    ["no key offers no Add key", 'text: "No key stored", action: true }', 'text: "No key stored", action: false }'],
    ["a stored key still offers Add key", 'text: "Key stored", action: false }', 'text: "Key stored", action: true }'],
    ["a failed key read offers no Add key", 'text: "Could not check", action: true }', 'text: "Could not check", action: false }'],
    ["the fleet row shows with no home", "if (home === null || tool !== null)", "if (tool !== null)", "no home chosen: the row shows"],
    ["the fleet row shows once the tool is found", "if (home === null || tool !== null)", "if (home === null)", "a home with the mail tool: the row shows"],
    ["the fleet row offers no setup", 'return { tone: "info", text: "Optional", action: true };', 'return { tone: "info", text: "Optional", action: false };'],
    ["a missing command does not withhold setup", "return missing.indexOf(command) !== -1; });", "return false; });"],
    ["the withheld step keeps its action", 'else if (typeof value.action !== "string") withheld.action = false;', 'else withheld.action = value.action;'],
    ["a withheld named action reads false", 'if (value.action === "dictation") withheld.action = "dictation";\n    else if (typeof value.action !== "string") withheld.action = false;', 'withheld.action = false;', "accepted status setupVoice"],
    ["any missing command withholds setup", "var lacking = requires.filter(", "var lacking = missing.filter("],
    ["the withheld text names every required command", 'lacking.join(" and ")', 'requires.join(" and ")'],
    ["a missing requirement offers no install", 'if (missing.indexOf(command) === -1) return { tone: "ok"', 'if (true) return { tone: "ok"'],
    ["a found requirement offers its install", 'if (missing.indexOf(command) === -1) return { tone: "ok"', 'if (false) return { tone: "ok"'],
    ["the Realtime voice offers the local install action", 'return cause.indexOf("speech=live-") !== 0 && ', 'return true && '],
    ["Always mode offers the local install action", ' && cause !== "speech=always-local-voice";', ";"],
    ["Always mode has no hint of its own", '    "speech=always-local-voice": ', '    "speech=always-local-voice-unused": '],
    ["a cause marks no step", "out[REQUIRED[step]] = hint === undefined", "void (hint === undefined)"],
    ["a cause marks the other step", 'speech: "setupVoice", brain: "setupModel" };', 'speech: "setupModel", brain: "setupVoice" };'],
    ["a caution reads not ready", 'blocking.length === 0 ? { tone: "ok", text: "Ready", hint:', 'false ? { tone: "ok", text: "Ready", hint:', "the bar and the Setup status state one readiness"],
    ["a caution turns its step to do", 'var blocking = answer.causes.filter(function (cause) { return !Object.prototype.hasOwnProperty.call(CAUTION, cause); });\n        var out',
        'var blocking = answer.causes.filter(function (cause) { return !Object.prototype.hasOwnProperty.call(CAUTION, cause); });\n        REQUIRED.setup = "setupVoice"; TODO["setup=probe-timeout"] = CAUTION["setup=probe-timeout"]; blocking = answer.causes;\n        var out'],
    ["a wire-defect title overflows the chip", 'title: "Jarvis message error"', 'title: "Jarvis and its daemon could not understand each other"', "fits the Setup status chip"],
    ["a home cause marks no step", 'if (REQUIRED[step] === "setupHome") {', 'if (false) {'],
    ["a home text cause marks the voice step", 'guidance: "setupHome", ', 'guidance: "setupVoice", '],
    ["the home causes share one hint", "hint: Object.prototype.hasOwnProperty.call(HOME_TODO, cause) ? HOME_TODO[cause] : HOME_STEP_TODO };", "hint: HOME_STEP_TODO };"],
    ["the home folder step always shows", "var HOME_READY = { hidden: true };", 'var HOME_READY = { tone: "ok", text: "Done" };'],
    ["the home folder step offers an action", 'out.setupHome = { tone: "warning", text: "To do",', 'out.setupHome = { tone: "warning", text: "To do", action: true,'],
    ["any account shows Copilot Memory", 'account.provider === "copilot" && ', ""],
    ["a signed-out Copilot shows Copilot Memory", ' && account.value === "present"; })', "; })"],
    ["a command below its floor reads as installed", 'if (outdated.indexOf(command) !== -1) return { tone: "warning", text: "Needs an update", action: "update" };', ""],
    ["a missing command with a floor offers its update", 'return { tone: "warning", text: "Not installed", action: "install" };', 'return { tone: "warning", text: "Not installed", action: "update" };'],
    ["a Pi older than its floor offers Add key", 'cause === "brain=pi-update" ? "update" : "key"', '"key"'],
    ["a Pi older than its floor takes the step's hint", '    "brain=pi-update": ', '    "brain=pi-update-removed": '],
    ["the brain causes share one hint", "var hint = Object.prototype.hasOwnProperty.call(TODO, cause) ? TODO[cause] : STEP_TODO[step];", "var hint = STEP_TODO[step];"],
    ["an unknown cause has no hint", "var hint = Object.prototype.hasOwnProperty.call(TODO, cause) ? TODO[cause] : STEP_TODO[step];", "var hint = TODO[cause];"],
    ["local voice repeats its action as its hint", "var STEP_TODO = { brain:", 'var STEP_TODO = { speech: "fixture repeat", brain:'],
    ["a step to do draws its hint as a line", 'lines === undefined ? { tone: "warning", text: "To do", hint: hint, action: action }', 'false ? { tone: "warning", text: "To do", hint: hint, action: action }'],
    ["a stopped summary draws its reason as a line", 'hint: "Jarvis stopped after a problem. Turn Jarvis off and on again." }', 'lines: ["Jarvis stopped after a problem. Turn Jarvis off and on again."] }'],
    ["the not-ready summary draws its causes", ': { tone: "warning", text: "Not ready" },', ': { tone: "warning", text: "Not ready", lines: answer.causes.map(setupCauseLine) },', "nothing set up: the summary draws no keyed cause"],
    ["a caution summary draws its cause", '.join(" ") }', '.join(" "), lines: answer.causes.map(setupCauseLine) }', "probe timeout: the summary draws no keyed cause"],
    ["causes leave the summary ready", 'setup: answer.causes.length === 0 ? { tone: "ok", text: "Ready" }', 'setup: true ? { tone: "ok", text: "Ready" }'],
    ["checking reads done", 'return { setup: CHECKING_SUMMARY, setupHome: HOME_READY, setupVoice: CHECKING, setupModel: noAction(CHECKING) };', 'return { setup: CHECKING_SUMMARY, setupHome: HOME_READY, setupVoice: DONE, setupModel: noAction(DONE) };'],
    ["an optional step reads done when not ok", 'if (value.tone === "ok") return DONE;', "if (true) return DONE;"],
    ["an optional step drops its action", "action: value.action === true };", "action: false };"],
    ["the checking summary offers a step", "return { setup: CHECKING_SUMMARY,", "return { setup: CHECKING,"],
    ["a stopped daemon's steps read checking", 'case "stopped":\n        return { setup: { tone: "danger", text: "Not ready", hint: "Jarvis stopped after a problem. Turn Jarvis off and on again." },\n            setupHome: HOME_READY, setupVoice: UNCHECKED, setupModel: noAction(UNCHECKED) };',
        'case "stopped":\n        return { setup: { tone: "danger", text: "Not ready", hint: "Jarvis stopped after a problem. Turn Jarvis off and on again." },\n            setupHome: HOME_READY, setupVoice: CHECKING, setupModel: noAction(CHECKING) };'],
    ["a keyed start cause has no words", '[/^jarvis: hello=timeout$/, { kind: "hello-timeout", title: "Jarvis did not answer in time", action: START_RESTART }],', ""],
    ["a status cause line is not bounded", ".slice(0, STATUS_TEXT_MAX)", ""],
    ["an arbitrary stderr line has no words", "return { kind: DAEMON_EXIT.kind, title: DAEMON_EXIT.title, action: DAEMON_EXIT.action, lines: [line] };", 'throw new Error("jarvis-setup: start-cause=" + cause + " has no words");'],
    ["a cause naming no step is taken", 'if (!Object.prototype.hasOwnProperty.call(REQUIRED, step)) throw new Error("jarvis-setup: cause=" + cause + " names no step");', ""],
    ["a required step reads as optional", 'if (!Object.prototype.hasOwnProperty.call(OPTIONAL, key)) throw new Error("jarvis-setup: step=" + key + " is not optional");', ""],
    ["auto names no tier of its own", 'return wanted === "auto" ? pick : wanted;', "return wanted;"],
    ["a ready wanted tier downloads again", "if (wantedTier(wanted, pick) === ready) return null;\n    return wanted", "return wanted"],
    ["auto passes its own name to setup", 'return wanted === "auto" ? [] : [wanted];', "return [wanted];"],
    ["the setting ignores what a run left ready", "if (wantedTier(wanted, pick) === ready) return null;\n    return ready ===", "return null;\n    return ready ==="],
    ["the setting follows a ready wanted tier", "if (wantedTier(wanted, pick) === ready) return null;\n    return ready ===", "return ready ==="],
    ["the ready pick is written by name", 'return ready === pick ? "auto" : ready;', "return ready;"],
    ["a stopped session offers no Start", '{ tone: "info", text: "Starts at the next boot", hint: SESSION_BOOT, action: "start" }', '{ tone: "info", text: "Starts at the next boot", hint: SESSION_BOOT }', "the action the row offers"],
    ["a failure offers no Retry", '"failed launch-failed": { tone: "danger", text: "Not started", detail: true, action: "retry" }', '"failed launch-failed": { tone: "danger", text: "Not started", detail: true }', "the action the row offers"],
    ["a missing tmux offers no install", 'hint: "No session can start without tmux.", action: "tmux" }', 'hint: "No session can start without tmux." }', "the action the row offers"],
    ["the boot setting hides a running session", '    if (row.wanted) value = wanted ?', '    if (row.wanted || !wanted) value = wanted ?', "the boot setting changes no row"],
    ["an answer outside the contract reads as a state", "    if (row === undefined) return failure;", '    if (row === undefined) return { tone: "ok", text: "Running", hint: "Planted." };', "outside the contract"],
    ["the package's failure line is dropped", 'var hint = row.detail ? (result.detail !== "" ? result.detail : SESSION_FAILED)', "var hint = row.detail ? SESSION_FAILED", "the package's own line is shown"],
    ["the unapplied selection is not shown", "    if (result.unapplied !== undefined) value.lines = [SESSION_BLOCKS[result.unapplied]];", "", "a selection that failed its check"],
    ["names too long for a hint are published", "hint === \"\" || hint.length > SESSION_HINT_MAX ?", "hint === \"\" ?", "the manifest judge accepts the row"],
    ["a starting session is not live", 'var SESSION_LIVE = ["running", "starting", "handing-over"];', 'var SESSION_LIVE = ["running", "handing-over"];', "the states of a session that lives"],
    ["the session field draws while the setting is off", "return wanted ? SESSION_MODES : [];", "return SESSION_MODES;", "the session field while the setting is false"]
];

const source = fs.readFileSync(file, "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-setup-gate-control-"));
try {
    const microphoneAction = path.join(path.dirname(file), "tui/check-microphone.sh");
    verifyMicrophoneAction(microphoneAction, temp);
    const wrongAction = path.join(temp, "wrong-microphone-action.sh");
    fs.writeFileSync(wrongAction, fs.readFileSync(microphoneAction, "utf8").replace("invoke check-microphone", "invoke talk-down"));
    assert.throws(() => verifyMicrophoneAction(wrongAction, temp), assert.AssertionError);
    console.log("test-jarvis-setup-gate: control=microphone-action-target rejected=true");
    const previewAction = path.join(path.dirname(file), "tui/preview-voice.sh");
    const editAction = path.join(path.dirname(file), "tui/edit-personality.sh");
    verifyPreviewAction(previewAction, temp);
    verifyEditAction(editAction, temp);
    console.log("test-jarvis-setup-gate: case=preview-and-edit-screens passed=true");
    for (const [name, script, verify, needle, replacement] of [
        ["preview-cost-question", previewAction, verifyPreviewAction, '  cloud) vgs_tui_confirm "This preview uses your OpenAI key and may cost money. Play it?" || exit 0 ;;\n', "  cloud) ;;\n"],
        ["preview-muted-cause", previewAction, verifyPreviewAction, '    "refused: preview=muted") vgs_tui_error "Jarvis is muted. Unmute Jarvis, then try again." ;;\n', ""],
        ["edit-gio-status", editAction, verifyEditAction, 'gio open "$file" 2>/dev/null || {', 'gio open "$file" 2>/dev/null || true || {'],
        ["edit-close-prompt", editAction, verifyEditAction, "trap 'status=$?; [[ $status == 0 ]] || vgs_tui_close_prompt \"$status\"' EXIT\n", ""]
    ]) {
        const source = fs.readFileSync(script, "utf8");
        assert.equal(source.split(needle).length, 2, name + " mutation match");
        const copy = path.join(temp, name + ".sh");
        fs.writeFileSync(copy, source.replace(needle, replacement));
        assert.throws(() => verify(copy, temp), assert.AssertionError, name + " must turn red");
        console.log("test-jarvis-setup-gate: control=" + name + " rejected=true");
    }
    // The Voice field offers the voices Jarvis publishes, the first standing
    // for the unset voice, keeps the configured voice while none are
    // published, and draws nothing then.
    const voiceOffers = [{ label: "Alloy, American English, female", value: "af_alloy" }, { label: "Heart, American English, female", value: "af_heart" }];
    assert.deepEqual(JSON.parse(JSON.stringify(judge.settingChoices(manifest, { voices: voiceOffers }, { ...manifest.settings, voice: "af_heart" }).voice)),
        [{ label: "Alloy, American English, female", value: "" }, { label: "Heart, American English, female", value: "af_heart" }]);
    assert.deepEqual(JSON.parse(JSON.stringify(judge.settingChoices(manifest, { voices: [] }, { ...manifest.settings, voice: "af_heart" }).voice)), [],
        "no published voices draw no Voice field, and the setting is not written");
    console.log("test-jarvis-setup-gate: case=voice-field passed=true");
    const serviceSource = fs.readFileSync(serviceFile, "utf8");
    verifyDictationStart(serviceSource);
    console.log("test-jarvis-setup-gate: case=dictation-start passed=true");
    for (const [label, needle, replacement] of [
        ["dictation-start-unwaited", 'if (pending === null || !waited && shell.dictation.state.phase === "unread") return;', "if (pending === null) return;"],
        ["dictation-start-locked", 'lockObservation() ? "refused: locked" : ', ""]]) {
        assert.equal(serviceSource.split(needle).length, 2, label + ": the text to replace must occur once");
        assert.throws(() => verifyDictationStart(serviceSource.replace(needle, replacement)), assert.AssertionError, label + " must turn red");
        console.log("test-jarvis-setup-gate: control=" + label + " rejected=true");
    }
    {
        const accountsSource = fs.readFileSync(accountsFile, "utf8");
        const needle = '        if (shell.status.set("voxtype", Gate.voxtypeValue(voiceProvider, missing)) !== "ok")\n            throw new Error("jarvis-accounts: status=refused");\n';
        assert.equal(accountsSource.split(needle).length, 2, "the voxtype row control's text occurs once");
        assert.throws(() => verifyDictation(load(file), serviceSource, accountsSource.replace(needle, "")), assert.AssertionError,
            "an account reader that publishes no voxtype row must turn red");
        console.log("test-jarvis-setup-gate: control=voxtype-row-unpublished rejected=true");
    }
    verifyHomeSwitch(serviceSource);
    console.log("test-jarvis-setup-gate: case=home-switch passed=true");
    {
        const needle = 'notice({ title: "Jarvis home not changed",';
        assert.equal(serviceSource.split(needle).length, 2);
        const changed = serviceSource.replace(needle, 'false && ' + needle);
        const copy = path.join(temp, "home-switch-no-notice.qml");
        fs.writeFileSync(copy, changed);
        assert.throws(() => verifyHomeSwitch(fs.readFileSync(copy, "utf8")), assert.AssertionError);
        console.log("test-jarvis-setup-gate: control=home-switch-notice rejected=true");
    }
    const accountsSource = fs.readFileSync(accountsFile, "utf8");
    const localRuntimeSource = fs.readFileSync(localRuntimeFile, "utf8");
    {
        const needle = 'const problem = Gate.startCause(setupCause);';
        assert.equal(localRuntimeSource.split(needle).length, 2);
        let failure = null;
        try { verifyProbeTimeoutConsumer(localRuntimeSource.replace(needle, 'const problem = { title: "Setup check timed out", action: "Turn Jarvis off and on again in Settings > Jarvis.", lines: ["jarvis: setup=probe-timeout"] };')); }
        catch (error) { failure = error; }
        assert.ok(failure instanceof assert.AssertionError);
        console.log("test-jarvis-setup-gate: control=LocalRuntime.qml check=probe-timeout-owner rejected=true");
    }
    for (const [target, original, needle, replacement] of [
        ["Service.qml", serviceSource, 'values.setupModel = Gate.modelStep(values.setupModel, shell.status.values["keys"], accountReader.modelAccess);', 'values.setupModel = values.setupModel;'],
        ["Accounts.qml", accountsSource, 'modelAccess = Gate.accountAccess(value.accounts);', 'modelAccess = { kind: "absent" };']
    ]) {
        assert.equal(original.split(needle).length, 2);
        const changed = original.replace(needle, replacement);
        assert.notEqual(changed, original);
        const copy = path.join(temp, target);
        fs.writeFileSync(copy, changed);
        let failure = null;
        try { verifyModelConsumers(load(file), target === "Service.qml" ? fs.readFileSync(copy, "utf8") : serviceSource,
            target === "Accounts.qml" ? fs.readFileSync(copy, "utf8") : accountsSource); }
        catch (error) { failure = error; }
        assert.ok(failure instanceof assert.AssertionError);
        assert.equal(failure.check, "setup-model-action");
        console.log("test-jarvis-setup-gate: control=" + target + " check=setup-model-action rejected=true");
    }
    for (const [target, original, needle, replacement] of [
        ["Service.qml", serviceSource, "voiceProvider: Gate.voiceProvider(shell.settings, accountReader.voiceKeys), dictation", "voiceProvider: shell.settings.voiceProvider, dictation"],
        ["Accounts.qml", accountsSource, "voiceKeys = value.voiceAccounts;", "voiceKeys = [];"],
        ["Accounts.qml", accountsSource, "voiceKeys = undefined;", "voiceKeys = [];"],
        ["Accounts.qml", accountsSource, "Gate.voiceKey(value.voiceAccounts)", "Gate.voiceKey([])"],
        ["Accounts.qml", accountsSource, "Gate.voiceKey(null)", "Gate.voiceKey([])"],
        ["Accounts.qml", accountsSource, "providers = value.providers;", "providers = {};"],
        ["Accounts.qml", accountsSource, "providers = {};", "providers = providers;"]
    ]) {
        assert.equal(original.split(needle).length, 2);
        let failure = null;
        try { verifyVoice(load(file), target === "Service.qml" ? original.replace(needle, replacement) : serviceSource,
            target === "Accounts.qml" ? original.replace(needle, replacement) : accountsSource); }
        catch (error) { failure = error; }
        assert.ok(failure instanceof assert.AssertionError);
        assert.equal(failure.check, "voice-default");
        console.log("test-jarvis-setup-gate: control=" + target + " check=voice-default rejected=true");
    }
    // The model and effort choice and its list read: one rule at a time.
    const providersSource = fs.readFileSync(providersFile, "utf8");
    const manifestFile = path.join(path.dirname(file), "manifest.json");
    const CHOICE_CONTROLS = [
        ["AccountProviders.js", 'var PREFERRED_MODELS = ["claude-fable-5-1", "claude-opus-5-5"];', 'var PREFERRED_MODELS = ["claude-opus-5-5", "claude-fable-5-1"];'],
        ["AccountProviders.js", 'var PREFERRED_MODELS = ["claude-fable-5-1", "claude-opus-5-5"];', 'var PREFERRED_MODELS = ["claude-fable-5-1"];'],
        ["AccountProviders.js", 'var PREFERRED_EFFORT = "high";', 'var PREFERRED_EFFORT = "medium";'],
        ["AccountProviders.js", '.replace(/\\[[^\\]]*\\]$/, "")', ""],
        ["AccountProviders.js", '.replace(/\\./g, "-")', ""],
        ["AccountProviders.js", "var first = preferred && offer.efforts.indexOf(PREFERRED_EFFORT) !== -1 ? PREFERRED_EFFORT", "var first = preferred ? PREFERRED_EFFORT"],
        ["AccountProviders.js", ": offer.efforts.indexOf(offer.effort) !== -1 ? offer.effort : OWN_EFFORT;", ": OWN_EFFORT;"],
        ["AccountProviders.js", "var ordered = preferred === null ? offers\n        : [preferred].concat(offers.filter(function (offer) { return offer !== preferred; }));", "var ordered = offers;"],
        ["AccountProviders.js", 'var chosen = ordered.filter(function (offer) { return settings.model === "" || offer.value === settings.model; })[0];', "var chosen = ordered[0];"],
        ["AccountProviders.js", "if (chosen === undefined) return { model: settings.model, effort: settings.effort, models: models, efforts: one(settings.effort) };", "if (chosen === undefined) chosen = ordered[0];"],
        ["AccountProviders.js", "if (chosen === undefined) return { model: settings.model, effort: settings.effort, models: models, efforts: one(settings.effort) };",
            "if (chosen === undefined) return { model: settings.model, effort: settings.effort, models: models, efforts: [] };"],
        ["AccountProviders.js", "var effort = efforts.some(function (level) { return level.value === settings.effort; }) ? settings.effort", 'var effort = settings.effort !== "" ? settings.effort'],
        ["AccountProviders.js", 'effort: effort === OWN_EFFORT ? "" : effort,', "effort: effort,"],
        ["AccountProviders.js", "PREFERRED_MODELS.some(function (id) { return namesModel(chosen.value, id); })", "chosen === ordered[0]"],
        ["AccountProviders.js", 'return level === OWN_EFFORT ? "Model default"', 'return level === OWN_EFFORT ? "default"'],
        ["AccountProviders.js", "Object.prototype.hasOwnProperty.call(EFFORT_LABELS, level) ? EFFORT_LABELS[level]", "false ? EFFORT_LABELS[level]"],
        ["AccountProviders.js", 'var failed = listed.kind === "failed";', 'var failed = listed.kind !== "none";'],
        ["AccountProviders.js", 'var mark = failed ? " (list not read)" : "";', 'var mark = "";'],
        ["AccountProviders.js", ': failed ? [{ label: "App default" + mark, value: OWN_MODEL }] : [],', ': true ? [{ label: "App default" + mark, value: OWN_MODEL }] : [],'],
        ["AccountProviders.js", ': failed ? [{ label: "App default" + mark, value: OWN_MODEL }] : [],', ": [],"],
        ["AccountProviders.js", "var runs = failed ? unlistedChoice(settings, provider) : settings;", "var runs = settings;"],
        ["AccountProviders.js", "var runs = failed ? unlistedChoice(settings, provider) : settings;", "var runs = unlistedChoice(settings, provider);"],
        ["AccountProviders.js", 'return effort === "" ? [] : [{ label: effortLabel(effort), value: effort }];', "return [{ label: effort, value: effort }];"],
        ["AccountProviders.js", "if (offers.length === 0) return { model: settings.model, effort: settings.effort, models: [], efforts: [] };", ""],
        ["AccountProviders.js", "if (offers.length === 0) return { model: settings.model, effort: settings.effort, models: [], efforts: [] };", 'if (offers.length === 0) return { model: "", effort: "", models: [], efforts: [] };'],
        ["AccountProviders.js", 'var PREFERRED_PROGRAM = "claude";', 'var PREFERRED_PROGRAM = "codex";'],
        ["AccountProviders.js", 'var model = settings.model !== "" ? "" :', "var model ="],
        ["AccountProviders.js", ": listedKeyModel(provider);", ': "";'],
        ["AccountProviders.js", "effort: settings.effort || PREFERRED_EFFORT };", "effort: PREFERRED_EFFORT };"],
        ["AccountProviders.js", "effort: settings.effort || PREFERRED_EFFORT };", "effort: settings.effort };"],
        ["Service.qml", "Providers.unlistedChoice(shell.settings, accountReader.providers[shell.settings.brain])),", "{}),"],
        ["Service.qml", "        delete settings.localTier;\n", ""],
        ["Service.qml", "Providers.unlistedChoice(shell.settings, accountReader.providers[shell.settings.brain])),", 'Providers.unlistedChoice(shell.settings, "claude")),'],
        ["Accounts.qml", "shell.settings, list, providers[brain])", "shell.settings, list)"],
        ["Accounts.qml", 'readonly property string wanted: shell !== null && shell.status.viewed ? brain : ""', "readonly property string wanted: brain"],
        ["Accounts.qml", "const changed = seenBrain !== null && seenBrain !== brain && shell.status.viewed;", "const changed = seenBrain !== null && seenBrain !== brain;"],
        ["Accounts.qml", "const changed = seenBrain !== null && seenBrain !== brain && shell.status.viewed;", "const changed = seenBrain !== brain && shell.status.viewed;"],
        ["Accounts.qml", "const changed = seenBrain !== null && seenBrain !== brain && shell.status.viewed;", "const changed = false;"],
        ["Accounts.qml", "        seenBrain = brain;\n", ""],
        ["Accounts.qml", "        Qt.callLater(save);\n", ""],
        ["Accounts.qml", "        Qt.callLater(save);\n", "        save();\n"],
        ["Accounts.qml", 'readonly property var list: listed.brain === brain ? listed : ({ kind: "none" })', "readonly property var list: listed"],
        ["Accounts.qml", 'list.kind === "read" ? choice : shell.settings;', "shell.settings;"],
        ["Accounts.qml", "if (wanted[key] !== shell.settings[key] && shell.configure.set", "if (shell.configure.set"],
        ["Accounts.qml", "            lister.dropped = true;\n", ""],
        ["Accounts.qml", "            lister.dropped = true;\n", "            lister.dropped = true;\n            lister.running = false;\n"],
        ["Accounts.qml", "                dropped = false;\n                root.readList();", "                dropped = false;"],
        ["Accounts.qml", 'listed = { brain: wanted, kind: wanted === "" ? "none" : "reading" };\n        if (wanted === "") return;', 'listed = { brain: wanted, kind: "reading" };'],
        ["Accounts.qml", '        lister.output = "";\n', ""],
        ["Accounts.qml", 'catch (error) { answer = { kind: "failed", reason: "helper" }; }', 'catch (error) { answer = { kind: "none" }; }'],
        ["Accounts.qml", 'if (answer.kind === "failed") console.warn("jarvis-accounts: models=" + answer.reason);', ""],
        ["Accounts.qml", "listed = Object.assign({ brain: listed.brain }, answer);", "listed = answer;"],
        ["Accounts.qml", 'shell.status.set("efforts", choice.efforts) !== "ok"', 'shell.status.set("efforts", []) !== "ok"'],
        ["manifest.json", '"optionsFrom": "efforts", "hideEmpty": true,', '"optionsFrom": "efforts",']
    ];
    for (const [index, [target, needle, replacement]] of CHOICE_CONTROLS.entries()) {
        const original = { "AccountProviders.js": providersSource, "Accounts.qml": accountsSource, "Service.qml": serviceSource, "manifest.json": fs.readFileSync(manifestFile, "utf8") }[target];
        assert.equal(original.split(needle).length, 2, "the text to replace occurs once: " + needle);
        const changed = original.replace(needle, () => replacement);
        // One file a control: require caches a module by its path.
        const copy = path.join(temp, "choice-" + index + "-" + target);
        fs.writeFileSync(copy, changed);
        let failure = null;
        // A manifest copy is read in place of the plugin's while the row runs.
        const readFile = fs.readFileSync;
        if (target === "manifest.json") fs.readFileSync = (name, ...rest) => readFile(name === manifestFile ? copy : name, ...rest);
        try {
            const providers = target === "AccountProviders.js" ? require(copy) : require(providersFile);
            verifyModelChoice(providers);
            verifyUnlisted(load(file), providers, target === "Service.qml" ? changed : serviceSource);
            verifyListRead(providers, target === "Accounts.qml" ? changed : accountsSource);
        } catch (error) { failure = error; }
        finally { fs.readFileSync = readFile; }
        assert.ok(failure instanceof assert.AssertionError, "the suite passed, or failed on no assertion, without: " + needle + (failure === null ? "" : ": " + failure));
        assert.equal(failure.check, "model-choice");
        console.log("test-jarvis-setup-gate: control=" + target + " check=model-choice rejected=true");
    }
    const needle = "row.status.find(entry => entry.key === key)";
    assert.equal(pageSource.split(needle).length, 2);
    const secondSource = pageSource.replace(needle, 'row.status.find(entry => entry.key === (key === "setupVoice" ? "localRuntime" : key))');
    assert.notEqual(secondSource, pageSource);
    const pageCopy = path.join(temp, "PluginPage.qml");
    fs.writeFileSync(pageCopy, secondSource);
    let failure = null;
    try { verifyVoiceConsumers(load(file), fs.readFileSync(pageCopy, "utf8")); }
    catch (error) { failure = error; }
    assert.ok(failure instanceof assert.AssertionError);
    assert.equal(failure.check, "setup-voice-consumer-source");
    assert.equal(failure.provider, "realtime");
    console.log("test-jarvis-setup-gate: control=second-voice-source check=setup-voice-consumer-source provider=realtime rejected=true");
    // The Agent fleet row's reader, backend/fleet-setup.js, run as the
    // service and the setup terminal run it, over a scratch HOME: no home,
    // a home without the mail tool, then the same home with it. Its control
    // is a copy whose status reads no tool.
    const backendDir = path.join(path.dirname(file), "backend");
    const fleetReader = helperFile => {
        const scratch = fs.mkdtempSync(path.join(temp, "fleet-home-"));
        const run = (verb, setting) => cp.spawnSync(process.execPath, [helperFile, "--tree", path.join(__dirname, ".."), verb, setting],
            { env: { PATH: process.env.PATH, HOME: scratch }, encoding: "utf8" });
        const status = setting => {
            const result = run("status", setting);
            assert.equal(result.status, 0, result.stderr);
            const value = JSON.parse(result.stdout);
            return value.hidden === true ? "hidden" : value.action === true ? "offered" : "other";
        };
        const answer = (verb, setting) => {
            const result = run(verb, setting);
            return [result.status, result.status === 0 ? result.stdout : result.stderr];
        };
        const folder = path.join(scratch, "Jarvis");
        const tool = path.join(folder, ".agents/skills/orch/scripts/lane-mail");
        for (const setting of ["", "Jarvis"]) {
            assert.equal(status(setting), "hidden", JSON.stringify(setting) + ": no home, no row");
            assert.deepEqual(answer("folder", setting), [1, "jarvis: fleet-setup=home-unchosen\n"]);
        }
        assert.equal(status("~/Jarvis"), "offered", "a home without the mail tool offers its setup");
        assert.deepEqual(answer("folder", "~/Jarvis"), [0, folder + "\n"]);
        assert.deepEqual(answer("tool", "~/Jarvis"), [1, "jarvis: fleet-setup=tool-absent\n"]);
        fs.mkdirSync(path.dirname(tool), { recursive: true });
        fs.writeFileSync(tool, "#!/bin/sh\n", { mode: 0o755 });
        assert.equal(status("~/Jarvis"), "offered", "a home that is no repository of its own still needs its setup");
        fs.mkdirSync(path.join(folder, ".git"));
        assert.equal(status("~/Jarvis"), "hidden", "a home with the mail tool needs no setup");
        assert.deepEqual(answer("tool", "~/Jarvis"), [0, tool + "\n"]);
        assert.deepEqual(answer("bogus", "~/Jarvis"), [2, "jarvis: fleet-setup=arguments\n"]);
    };
    fleetReader(path.join(backendDir, "fleet-setup.js"));
    {
        const plugin = path.join(temp, "fleet-plugin");
        fs.mkdirSync(path.join(plugin, "backend"), { recursive: true });
        for (const name of ["Core.js", "Home.js", "Tools.js"]) fs.copyFileSync(path.join(backendDir, name), path.join(plugin, "backend", name));
        fs.copyFileSync(file, path.join(plugin, "SetupGate.js"));
        const reader = fs.readFileSync(path.join(backendDir, "fleet-setup.js"), "utf8");
        const needle = "const tool = folder === null ? null : Home.mailTool(folder);";
        assert.equal(reader.split(needle).length, 2, "the fleet reader control's text occurs once");
        fs.writeFileSync(path.join(plugin, "backend/fleet-setup.js"), reader.replace(needle, "const tool = null;"));
        assert.throws(() => fleetReader(path.join(plugin, "backend/fleet-setup.js")), assert.AssertionError, "a reader that finds no tool turns red");
        console.log("test-jarvis-setup-gate: control=fleet-reader-tool rejected=true");
    }
    for (const [label, needle, replacement, assertion] of CONTROLS) {
        assert.equal(source.split(needle).length, 2, `control "${label}": the text to replace must occur once`);
        const changed = source.replace(needle, () => replacement);
        assert.notEqual(changed, source, `control "${label}": the copy changed`);
        const copy = path.join(temp, "SetupGate.js");
        fs.writeFileSync(copy, changed);
        let failure = null;
        try {
            verify(load(copy));
        } catch (e) {
            failure = e;
        }
        assert.ok(failure instanceof assert.AssertionError, `control "${label}": the suite passed on a copy without that rule` +
            (failure === null ? "" : ", or failed on something other than an assertion: " + failure));
        if (assertion !== undefined) assert.equal(failure.message.includes(assertion), true, label + ": the intended assertion fails");
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
console.log(`test-jarvis-setup-gate: ok cases=${SETUP.length + REQUIREMENT.length + READINESS.length + MODEL.length + VOICE.length + VOICE_KEY.length + START_CAUSES.length + CHOICE.length + UNLISTED.length + FLEET.length + DICTATION.length} controls=${CONTROLS.length + 10 + 55}`);
// The fleet setup terminal opens from the Agent fleet row alone: in
// MANIFEST, a judged manifest, the launcher lists no fleet TUI and the
// Settings page draws none while the row is hidden, and the offered row
// draws its button, whose press the core turns into that terminal.
function verifySetupButtons(gate, manifest) {
    for (const [label, home, tool, shown] of FLEET)
        for (const missing of [[], ["kendex"]]) {
            const tuis = judge.listedTuiRows(manifest, missing);
            assert.equal(tuis.some(tui => tui.name === "setup-fleet"), false, label + ": the launcher lists no fleet setup");
            const value = plain(gate.fleetStep(home, tool));
            const sections = settings.settingsSections(tuis, judge.statusRows(manifest, { setupFleet: value }, missing));
            const fleet = sections.flatMap(section => section.buttons).filter(button => button.name === "setup-fleet");
            const row = settingsRows(sections).find(item => item.key === "setupFleet");
            assert.deepEqual([fleet.length, row !== undefined && row.button !== null], [0, shown], label + ": only the shown fleet row draws its setup, missing " + missing);
            if (shown)
                assert.deepEqual(plain(judge.statusActionRequest(manifest, "vgs.jarvis", true, { setupFleet: value }, "setupFleet")), { ok: true, kind: "tui", name: "setup-fleet" },
                    label + ": the row's press opens the fleet setup");
        }
}
// Every cause the Setup table knows states one readiness on the bar and in
// the Setup status. Session's gate follows the daemon alone (jarvisd.js
// configured): up while its causes are none or only speech=local-loading,
// else down unconfigured. The shell's own cause, LocalRuntime.qml's
// setupCause, never reaches the daemon.
// Each DICTATION row through the shipped service's setup publication: the
// cause the daemon publishes is the summary's line, the Voice step names
// Set up dictation only where it is offered, and its press opens the core's
// dictation setup. The voxtype row offers its install while it is missing.
function verifyDictation(gate, serviceSource, accountsSource) {
    const publishSetup = serviceSource.match(/^    function publishSetup\(answer\) \{\n[\s\S]*?^    \}/m);
    const publishRequirements = accountsSource.match(/^    function publishRequirements\(\) \{\n[\s\S]*?^    \}/m);
    assert.ok(publishSetup && publishRequirements);
    for (const [label, voice, state, missing, cause, expect, offered] of DICTATION) {
        assert.equal(gate.dictationCause(voice, state), cause, label + ": the cause");
        const values = {};
        const shell = { settings: { voiceAccount: "" }, requirements: { missing }, status: { values, set: (key, value) => {
            assert.equal(judge.statusWrite(manifest, values, key, value).ok, true, label + ": accepted status " + key);
            values[key] = value;
            return "ok";
        } } };
        vm.runInNewContext("(" + publishSetup[0] + ")", { Gate: gate, shell, accountReader: { modelAccess: { kind: "checking" } },
            localRuntime: { setupCause: "" }, sessionState: null, setupAnswer: { kind: "checking" } })({ kind: "answered", causes: cause === "" ? [] : [cause] });
        const voice_ = plain(values.setupVoice);
        if (expect === "withheld")
            assert.deepEqual([voice_.tone, voice_.action, "hint" in voice_], ["warning", "dictation", false], label + ": the Voice step");
        else assert.deepEqual(voice_, plain({ entry: gate.DICTATION[cause], loading: gate.noAction(gate.LOADING), done: gate.noAction(gate.DONE) }[expect]), label + ": the Voice step");
        assert.equal(values.setup.lines, undefined, label + ": the summary draws no cause line");
        const row = judge.statusRows(manifest, values, missing).find(item => item.key === "setupVoice");
        assert.equal(row.action.offered && row.action.label === "Set up dictation", offered, label + ": Set up dictation");
        if (offered)
            assert.deepEqual(plain(judge.statusActionRequest(manifest, "vgs.jarvis", true, values, "setupVoice")),
                { ok: true, kind: "core", name: "dictation-setup" }, label + ": the press opens the core's setup");
        // The voxtype row, the account reader's, shows for the local voice.
        vm.runInNewContext("(function() { with(root) { return (" + publishRequirements[0] + ").call(root); } })()",
            { root: { shell, missing, voiceProvider: voice }, Gate: gate });
        const voxtype = judge.statusRows(manifest, values, missing).find(item => item.key === "voxtype");
        assert.deepEqual(voxtype === undefined ? "hidden" : voxtype.action.offered,
            voice !== "local" ? "hidden" : missing.includes("voxtype"), label + ": the voxtype row's install");
        assert.equal(gate.dictationRefusal(state ?? { daemon: "absent", device: "" }), cause === "speech=dictation-device" ? "refused: dictation=device" : "",
            label + ": the start the service refuses itself");
    }
}

// The service's dictation start against a stand-in of the core that, as
// DictationModel.start does, refuses a start while its read after the last
// recording's command runs (phase `unread`): a start that follows a cancel
// at once waits for the read and is taken, a read that outlasts the wait's
// bound answers the core's refusal, a second start answers the first, and a
// lock answers a waiting start.
function verifyDictationStart(serviceSource) {
    const pick = name => {
        const found = serviceSource.match(new RegExp("^    function " + name + "\\([^)]*\\) \\{\\n[\\s\\S]*?^    \\}", "m"));
        assert.ok(found, name);
        return found[0];
    };
    const source = pick("queueStart") + "\n" + pick("startDictation");
    const world = () => {
        const core = { phase: "unread", starts: 0 };
        const replies = [];
        const root = { pendingStart: null, childSerial: 1, lifetime: { kind: "ready" }, child: { running: true }, locked: false,
            shell: { dictation: { get state() { return { daemon: "ready", phase: core.phase, holder: "", device: "default" }; },
                start: mode => { core.starts++; assert.equal(mode, "text"); return core.phase === "unread" ? "refused: dictation=engine-busy state=unread" : "ok"; } } },
            startWait: { running: false, restart() { this.running = true; }, stop() { this.running = false; } },
            lockObservation: () => root.locked,
            reply: (message, result) => replies.push([message.id, result.answer]) };
        vm.runInNewContext("(function() { with(root) { " + source + "\n root.queueStart = queueStart; root.startDictation = startDictation; } })()",
            { root, Gate: load(file) });
        return { core, replies, root };
    };
    // A cancel followed at once by a start: the start waits for the read.
    let w = world();
    w.root.queueStart({ id: 1 });
    assert.deepEqual([w.replies, w.core.starts, w.root.startWait.running], [[], 0, true], "the start waits for the core's read");
    w.core.phase = "idle";
    w.root.startDictation(false);
    assert.deepEqual([w.replies, w.core.starts, w.root.startWait.running], [[[1, "ok"]], 1, false], "the read's end takes the start");
    // The bound passes while the core still reads: its refusal is answered.
    w = world();
    w.root.queueStart({ id: 2 });
    w.root.startDictation(true);
    assert.deepEqual(w.replies, [[2, "refused: dictation=engine-busy state=unread"]], "a read past the bound answers the refusal");
    // A start with no read pending is taken at once; a second start answers the first.
    w = world();
    w.core.phase = "idle";
    w.root.queueStart({ id: 3 });
    assert.deepEqual(w.replies, [[3, "ok"]], "a start with no read pending is taken at once");
    w.core.phase = "unread";
    w.root.queueStart({ id: 4 });
    w.root.queueStart({ id: 5 });
    assert.deepEqual(w.replies.slice(1), [[4, "refused: dictation=engine-busy state=unread"]], "a second start answers the first");
    // A lock answers the waiting start and starts nothing.
    w.root.locked = true;
    w.root.startDictation(true);
    assert.deepEqual(w.replies.slice(2), [[5, "refused: locked"]], "a lock starts no recording");
}

function verifyOneReadiness(gate) {
    const shellCause = /setupCause: timedOut \? "([^"]+)"/.exec(fs.readFileSync(localRuntimeFile, "utf8"))[1];
    const daemonCauses = [...Object.keys(gate.TODO), ...Object.keys(gate.HOME_TODO), ...Object.keys(gate.MEMORY),
        ...Object.keys(gate.DICTATION), "speech=local-loading", "speech=dictation-starting"];
    assert.equal(daemonCauses.includes(shellCause), false, "the shell's cause is no daemon cause");
    const sets = [[], [shellCause], ...daemonCauses.map(cause => [cause]), ...daemonCauses.map(cause => [shellCause, cause])];
    const keys = { talk: "Super+Right Alt", mute: "Super+Shift+Right Alt", stop: "Super+Alt+Period", confirm: "Super+Alt+Y" };
    for (const causes of sets) {
        const status = plain(gate.readiness({ kind: "answered", causes }));
        const configured = causes.every(cause => cause === shellCause || cause === "speech=local-loading");
        const state = Object.assign(plain(session.initial()), { gate: configured ? { kind: "up" } : { kind: "down", reason: "unconfigured" } });
        assert.equal(session.validate(state), true, causes.join(",") + ": a Session record");
        const bar = widget.view(Object.assign({ daemon: { tone: "info", text: "Ready" }, audio: { tone: "ok", text: "Devices" },
            detail: { phase: session.phaseOf(state), seq: 1, state } }, status), keys, "hold");
        assert.equal(bar.state === "ready", status.setup.tone === "ok", causes.join(",") + ": the bar and the Setup status state one readiness");
        if (causes.includes(shellCause) && bar.state === "ready")
            assert.equal(bar.tooltipDetails.includes(status.setup.hint), true, causes.join(",") + ": the bar shows the caution");
    }
}

function verifyChipTitles(gate) {
    const titles = gate.START_CAUSES.map(([, words]) => words.title).concat([gate.DAEMON_EXIT.title]);
    assert.equal(titles.length >= 6, true, "the start cause table is read");
    for (const title of titles)
        assert.equal(title.length <= CHIP_TITLE_MAX, true, JSON.stringify(title) + " fits the Setup status chip");
}

function verifyProbeTimeoutConsumer(source) {
    assert.equal(source.includes('Gate.startCause(setupCause)'), true,
        "probe timeout words come from SetupGate");
}
