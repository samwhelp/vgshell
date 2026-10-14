#!/usr/bin/env node
// Exercises the production page judge with PluginLogic manager rows.
// Required work alone creates Setup. Unknown and blocked required work
// stays open; optional work belongs beside its Settings field or in
// Details. Required tools form one persistent step. Every To do step and
// every Settings line that holds work draws an action that takes a press,
// with the plugin on and off; a line whose feature is set up draws none.
// Expected placements and actions are independent data. The source check
// reaches the actual Setup body: it proves that body declares no boxed
// Button, not rendered behavior. Each control edits production source and
// fails its named assertion.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");
const root = path.join(__dirname, "..");
const file = path.join(root, "shell/plugins/vgs.settings/Steps.js");
const producerFile = path.join(root, "shell/Core/PluginLogic.js");
const pageFile = path.join(root, "shell/plugins/vgs.settings/PluginPage.qml");
const same = (got, want, message) => assert.deepEqual(JSON.parse(JSON.stringify(got)), want, message);
const REVIEW = "Review all missing or outdated tools";
const TURN_ON = "Turn on Fixture";
const schema = {
    feature: { type: "boolean", label: "Feature", description: "Turns the feature on" },
    owned: { type: "action", label: "Owned", description: "Acts through its state" },
    screened: { type: "action", label: "Screened", description: "Opens its screen" },
    tooled: { type: "action", label: "Tooled", description: "Uses its tools" }
};
const entry = (label, more) => Object.assign({ label: label, icon: "wrench", group: "Fixture" }, more);
const tui = {
    required: { entry: entry("Set model"), requires: [] },
    feature: { entry: entry("Configure feature", { setting: "feature" }), requires: [] },
    configure: { entry: entry("Configure", { settings: true }), requires: [] },
    task: { entry: entry("Sign in"), requires: ["optional-tool"] },
    chore: { entry: entry("Run chore"), requires: [] },
    extra: { entry: entry("Feature action", { setting: "feature" }), requires: [] },
    opener: { entry: entry("Open screen", { setting: "screened" }), requires: [] },
    fixing: { entry: null, requires: [] }
};
const status = {
    model: { type: "state", label: "Model", setup: true, action: { label: "Set model", tui: "required" } },
    home: { type: "state", label: "Home", setup: true, hint: "Choose a home folder first" },
    account: { type: "state", label: "Account", setup: true, actions: { signIn: { label: "Sign in", tui: "task" }, key: { label: "Add key", tui: "required" } } },
    optional: { type: "state", label: "Feature state", setting: "feature", action: { label: "Configure feature", tui: "feature" } },
    keys: { type: "presenceList", label: "Provider keys", setting: "feature" },
    ownedState: { type: "state", label: "Owned state", setting: "owned", action: { label: "Fix owned", tui: "fixing" } },
    connection: { type: "state", label: "Connection", setup: true },
    connectionKeys: { type: "presenceList", label: "Connection keys", step: "connection" },
    fact: { type: "state", label: "Automatic work" }
};
const ready = { tone: "ok", text: "Ready", action: false };
const blocked = { tone: "warning", text: "Waiting for account" };
const allDone = { model: ready, home: ready, account: ready, connection: ready, ownedState: ready,
    optional: { tone: "warning", text: "Feature unavailable", action: true }, fact: { tone: "danger", text: "Alternative unavailable" } };
const homeUnreported = Object.fromEntries(Object.entries(allDone).filter(([key]) => key !== "home"));
const on = { enabled: true, name: "Fixture", error: "" };
const off = { enabled: false, name: "Fixture", error: "" };
const items = sections => sections.flatMap(section => section.items);
// What LINES offer to press: [label, takes a press] per action, in order.
const offers = lines => lines.flatMap(line => [line.action, line.aside].concat(line.more).filter(button => button !== null).map(button => [button.label, button.enabled]));

function verify(logic, producer) {
    const manifest = {
        status: status, tui: tui,
        requirements: producer.normalRequirements([
            { command: "required-a", purpose: "Basic work" },
            { command: "required-b", purpose: "Basic work" },
            { command: "optional-tool", optional: true, purpose: "Optional feature", setting: "feature" },
            { dbus: { bus: "system", name: "org.example.Tool", label: "Tool service" }, optional: true, purpose: "Its own feature", setting: "tooled" },
            { command: "automatic-tool", optional: true, purpose: "Automatic alternative" }
        ])
    };
    const fields = producer.fieldRows(schema, status, manifest.requirements, tui);
    const screens = producer.listedTuis(manifest);
    const rows = values => producer.statusRows(manifest, values);
    const requirements = missing => producer.requirementRows(manifest, missing, {});
    const page = (values, missing) => ({ schema: schema, status: rows(values), tuis: screens, requirements: requirements(missing) });
    const lines = (key, values, missing, plugin) => logic.featureRow(fields.find(field => field.key === key), page(values, missing), plugin);

    const status0 = rows(allDone), sections = logic.setupSections(screens, status0);
    same(items(sections).map(item => item.key), ["model", "home", "account", "connection", "connectionKeys"], "optional entries never draw on Setup");
    same(lines("feature", allDone, [], on).map(line => [line.kind, line.key]), [["own", "optional"], ["keys", "keys"], ["screens", ""], ["tools", ""]], "optional actions and keys stay beside the Settings choice");
    same(logic.detailEntries(status0).map(entry => entry.key), ["fact"], "Details excludes Setup and Settings entries");
    same(logic.setupTab(sections, []), true, "completed required steps keep Setup");
    same(logic.setupTab([], requirements([])), true, "present required tools keep Setup");
    const optionalOnly = requirements(["optional-tool"]).filter(row => row.optional);
    same(logic.setupTab([], optionalOnly), false, "optional tools never create Setup");
    same(logic.requirementStep(optionalOnly), null, "optional tools never create the Tools step");
    same(logic.detailRequirements(requirements([])).map(row => row.name), ["automatic-tool"], "automatic alternatives are Details facts");
    for (const [label, values, missing, enabled, expected] of [
        ["all required work ready", allDone, [], true, false],
        ["only Home blocked", Object.assign({}, allDone, { home: blocked }), [], true, true],
        ["Home not reported", homeUnreported, [], true, true],
        ["failed required step", Object.assign({}, allDone, { model: { tone: "danger", text: "Refused" } }), [], true, true],
        ["required tool missing", allDone, ["required-a"], true, true],
        ["only optional tool missing", allDone, ["optional-tool"], true, false],
        ["disabled plugin", {}, ["required-a"], false, false]
    ]) same(logic.setupNeeds(rows(values), requirements(missing), enabled), { open: expected }, "readiness: " + label);
    for (const [label, missing, want] of [
        ["present", [], [true, "Tools", "Done", "success", null]],
        ["missing", ["required-a", "required-b", "optional-tool"], [false, "Tools", "To do", "warning", [REVIEW, true]]]
    ]) {
        const step = logic.requirementStep(requirements(missing));
        assert.notEqual(step, null, "Tools: " + label);
        same([step.done, step.label, step.text, step.tone, step.button === null ? null : [step.button.label, step.button.enabled]], want, "Tools: " + label);
        if (missing.length) same(step.hint, "required-a (missing), required-b (missing)", "Tools names only required tools");
    }
    const outdated = requirements([]).map(row => Object.assign({}, row, { state: row.name === "required-b" ? "outdated" : "present" }));
    same(logic.requirementStep(outdated).done, false, "outdated required tools stay open");
    same(logic.requirementStep(outdated).hint, "required-b (outdated)", "Tools identifies outdated tools");
    same(logic.setupNeeds(status0, outdated, true), { open: true }, "outdated required tools warn");
    same(items(logic.setupSections(screens, status0, requirements(["required-a"]))).map(item => item.key), ["required-tools", "model", "home", "account", "connection", "connectionKeys"], "pending Tools precede completed required steps");
    same(items(logic.setupSections(screens, status0, requirements([]))).map(item => item.key), ["model", "home", "account", "connection", "connectionKeys", "required-tools"], "completed Tools retain their one step");
    const openRows = rows(Object.assign({}, allDone, { home: blocked, model: { tone: "warning", text: "Needs a key", action: true, lines: ["Open Settings"] } }));
    same(items(logic.setupSections(screens, rows(Object.assign({}, allDone, { home: blocked })))).map(item => item.key), ["home", "model", "account", "connection", "connectionKeys"], "Home-only blocker is first");
    const model = openRows.find(entry => entry.key === "model"), view = logic.stepView(model, String, on);
    same([view.text, view.tone, view.lines], ["To do", "warning", ["Needs a key", "Open Settings"]], "pending chip keeps explanation");
    const complete = logic.stepView(status0.find(entry => entry.key === "model"), String, on);
    same([complete.text, complete.tone], ["Done", "success"], "completed chip uses two-state vocabulary");
    same(logic.stepView(rows({}).find(entry => entry.key === "home"), String, off).text, "To do", "unreported required chip stays To do");

    // Setup steps: what each To do step offers to press, with the plugin
    // on and off. The page draws a step's own action while on and Turn on
    // while off (Steps.lineAction); the Tools step's Review takes a press
    // in every state.
    const stepOffers = (values, missing, plugin) => items(logic.setupSections(screens, rows(values), requirements(missing))).filter(item => !item.keys).map(item => {
        const button = item.tools === true ? item.button : logic.lineAction(item.button, logic.stepOpen(item.entry), plugin);
        return [item.key, button === null ? null : [button.label, button.enabled]];
    });
    same(stepOffers({}, ["required-a"], off), [["model", [TURN_ON, true]], ["home", [TURN_ON, true]], ["account", [TURN_ON, true]], ["connection", [TURN_ON, true]], ["required-tools", [REVIEW, true]]],
        "off: every To do step offers Turn on Fixture");
    same(stepOffers(Object.assign({}, allDone, { model: { tone: "warning", text: "Needs a key", action: true } }), [], on).find(([key]) => key === "model"), ["model", ["Set model", true]],
        "on: an offered step draws its own action");
    // Account's Sign in opens a screen that needs a missing optional tool;
    // the step offers it, and its press asks for the tool first.
    const signIn = rows(Object.assign({}, allDone, { account: { tone: "warning", text: "Signed out", action: "signIn" } })).find(entry => entry.key === "account");
    const signInButton = logic.stepButton(screens, signIn);
    same([signInButton === null ? null : [signInButton.label, signInButton.enabled, signInButton.name], signIn.hint.includes(REVIEW)],
        [["Sign in", true, "task"], false], "on: a step whose screen lacks an optional tool offers its own action");
    const byHand = rows(Object.assign({}, allDone, { home: blocked })).find(entry => entry.key === "home");
    same([logic.stepButton(screens, byHand), logic.stepView(byHand, String, on).hint !== ""], [null, true], "on: a by-hand step draws its explanation");
    const waiting = logic.stepView(rows({}).find(entry => entry.key === "home"), String, on);
    same(waiting.lines.map(line => line.includes(on.name)), [true], "on, unreported: the step names the wait");
    same(logic.stepView(rows({}).find(entry => entry.key === "home"), String, Object.assign({}, on, { error: "This plugin could not start." })).lines,
        ["This plugin could not start."], "on, unreported after a failed build: the step names the failure");
    same(logic.stepView(rows({}).find(entry => entry.key === "home"), String, off).lines, [], "off: an unreported step names no wait");
    same(items(sections).find(item => item.key === "model").button, null, "unoffered required action draws nowhere");

    // Settings lines: [name, field, published values, missing tools, the
    // plugin, what its lines offer]. A line that holds work offers a press;
    // one whose feature is set up offers none (the owner's reading of an
    // action row whose feature is set up: it reads its state alone).
    for (const [name, key, values, missing, plugin, want] of [
        ["off: an action row with its own state", "owned", {}, [], off, [[TURN_ON, true]]],
        ["off: an action row with only a screen", "screened", {}, [], off, [[TURN_ON, true]]],
        ["off: an action row with only tools, one missing", "tooled", {}, ["org.example.Tool"], off, [[TURN_ON, true], [REVIEW, true]]],
        ["off: an action row with only tools, all present", "tooled", {}, [], off, [[TURN_ON, true]]],
        ["off: a choice's screen takes no press and its tools still install", "feature", {}, ["optional-tool"], off, [["Feature action", false], [REVIEW, true]]],
        ["on: an action row offers its state's action", "owned", Object.assign({}, allDone, { ownedState: { tone: "warning", text: "Broken", action: true } }), [], on, [["Fix owned", true]]],
        ["on: an action row whose feature is set up offers nothing", "owned", allDone, [], on, []],
        ["on: an action row not reported yet offers nothing", "owned", {}, [], on, []],
        ["on: an action row with only a screen offers it", "screened", allDone, [], on, [["Open screen", true]]],
        ["on: an action row with a missing tool offers Review", "tooled", allDone, ["org.example.Tool"], on, [[REVIEW, true]]],
        ["on: an action row whose tools are present offers nothing", "tooled", allDone, [], on, []],
        ["on: a choice offers its action, its screen and Review", "feature", allDone, ["optional-tool"], on, [["Configure feature", true], ["Feature action", true], [REVIEW, true]]],
        ["on: a choice that is set up offers its screen alone", "feature", Object.assign({}, allDone, { optional: ready }), [], on, [["Feature action", true]]]
    ]) same(offers(lines(key, values, missing, plugin)), want, "Settings: " + name);
    same(lines("feature", allDone, [], on).find(line => line.kind === "own").label, "", "an own state draws no label of its own");
    same(lines("owned", allDone, [], on).map(line => [line.kind, line.label]), [["own", "Owned"]], "an action row's own state is its head, under the field's label");
    same(lines("feature", allDone, [], on).find(line => line.kind === "screens").more.map(button => button.name), ["extra"], "a screen stays in its field's row");
    same(lines("tooled", allDone, ["org.example.Tool"], on).map(line => [line.label, line.hint, line.lines]), [["Tooled", "Tools: Tool service (missing)", ["Uses its tools"]]],
        "a tools row names its tools by title under the field's label");
    const offScreens = lines("feature", {}, [], off).find(line => line.kind === "screens");
    same([offScreens.more[0].reason !== "", offScreens.hint === offScreens.more[0].reason], [true, true], "off: a screen that takes no press names why");
    same(logic.freeScreens(screens, status0, "Settings", on).map(screen => screen.name), ["configure"], "settings screens stay in More settings");
    same(logic.freeScreens(screens, status0, "Details", on).map(screen => [screen.name, screen.enabled]), [["chore", true]], "task screens alone stay in Details");
    for (const place of ["Settings", "Details"]) {
        const held = logic.freeScreens(screens, status0, place, off);
        same([held.every(screen => !screen.enabled && screen.reason !== ""), logic.withheldHint(held) !== ""], [true, true], "off: " + place + " screens take no press and name why");
        same(logic.withheldHint(logic.freeScreens(screens, status0, place, on)), "", "on: " + place + " screens name no reason");
    }
    same(logic.itemView({ access: "connect", value: "absent", tone: "info" }), { tone: "", text: "" }, "absent stored key gives Add key its place");
    same(logic.itemView({ access: "disconnect", value: "present", tone: "success" }, true), { tone: "success", text: "Done", reason: "" }, "required stored key uses Done");
    same(logic.itemView({ access: "connect", value: "locked", tone: "info" }, true), { tone: "warning", text: "To do", reason: "Locked" }, "required blocked key keeps its reason outside the chip");
    same(logic.itemsKeyed([{ secret: "provider:key", label: "Provider" }, { secret: "", label: "Local" }, { secret: "", label: "Local" }]).map(item => item.key), ["secret provider:key", "label Local", "label Local 2"], "stored key rows keep stable identities");
}

// Mask comments and strings before counting braces, so explanatory text
// cannot change the source check's reach.
function setupBody(source) {
    const masked = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, text => text.replace(/[^\n]/g, " "));
    const match = /\bColumn\s*\{\s*id:\s*setupPage\b/.exec(masked);
    assert.ok(match, "Setup source check locates the actual Setup body");
    const start = masked.indexOf("{", match.index);
    let depth = 1, end = start + 1;
    for (; depth > 0 && end < masked.length; end++) {
        if (masked[end] === "{") depth++;
        if (masked[end] === "}") depth--;
    }
    assert.equal(depth, 0, "Setup source check reaches the body's closing brace");
    return masked.slice(start + 1, end - 1);
}
function verifyPage(source) { assert.doesNotMatch(setupBody(source), /\bButton\s*\{/, "Setup actions never declare a boxed Button"); }
verify(load(file), load(producerFile));
verifyPage(fs.readFileSync(pageFile, "utf8"));
const controls = [
    ["optional-on-Setup", 'return entry.setup === true;', 'return entry.setup === true || entry.setting !== "";', "optional entries never draw on Setup"],
    ["Details duplicates required step", '!declaresStep(entry) && ', '', "Details excludes Setup and Settings entries"],
    ["blocked required work marked done", 'entry.report !== "reported" || entry.tone !== "success"', 'entry.report !== "reported"', "only Home blocked"],
    ["unknown required work marked done", 'entry.report !== "reported" || entry.tone !== "success"', 'entry.report === "reported" && entry.tone !== "success"', "Home not reported"],
    ["optional tool creates Setup", 'requirements.some(function (row) { return !row.optional; })', 'requirements.length > 0', "optional tools never create Setup"],
    ["optional tool becomes required Tools", 'requirements.filter(function (row) { return !row.optional; })', 'requirements.slice()', "optional tools never create the Tools step"],
    ["ready tools drop Tools", 'if (required.length === 0) return null;', 'if (required.length === 0 || required.every(function (row) { return row.state === "present"; })) return null;', "Tools: present"],
    ["optional tool warns", '!entry.optional && requirementApplies(entry)', 'requirementApplies(entry)', "only optional tool missing"],
    ["disabled plugin warns", 'open: enabled && (', 'open: (', "disabled plugin"],
    ["outdated tool passes", 'return requirement.state !== "present";', 'return requirement.state === "missing";', "outdated required tools stay open"],
    ["pending chip leaks status words", 'view.text = stepOpen(entry) ? "To do" : "Done";', 'view.text = entry.value.text;', "pending chip keeps explanation"],
    ["completed chip stays pending", 'view.text = stepOpen(entry) ? "To do" : "Done";', 'view.text = "To do";', "completed chip uses two-state vocabulary"],
    ["open steps follow completed ones", 'steps.filter(stepOpen).concat(steps.filter(function (entry) { return !stepOpen(entry); }))', 'steps.filter(function (entry) { return !stepOpen(entry); }).concat(steps.filter(stepOpen))', "Home-only blocker is first"],
    ["pending Tools follow completed steps", 'if (!tools.done && firstDone !== -1)', 'if (false)', "pending Tools precede completed required steps"],
    ["keys leave their required step", 'keyList.step === entry.key', 'false', "optional entries never draw on Setup"],
    ["unoffered action is drawn", 'entry.action === null || !entry.action.offered', 'entry.action === null', "unoffered required action draws nowhere"],
    ["a set-up row draws its declared action dead", 'action: lineAction(stepButton(row.tuis, entry), head, plugin)', 'action: lineAction(stepButton(row.tuis, entry) || (entry.action === null ? null : { kind: "status", key: "dead", name: "", label: entry.action.label, tone: "", enabled: false, reason: "" }), head, plugin)', "Settings: on: an action row whose feature is set up offers nothing"],
    ["More settings leaves Settings", 'place === "Settings" ? tui.settings', 'place === "Settings" ? false', "settings screens stay in More settings"],
    ["required keys keep ordinary chips", 'if (setup) {', 'if (false) {', "required stored key uses Done"],
    ["a plugin that is off offers nothing", 'if (!plugin.enabled) return open ? turnOn(plugin.name) : null;', 'if (!plugin.enabled) return null;', "off: every To do step offers Turn on Fixture"],
    ["an action row's head offers no Turn on", 'action: lineAction(stepButton(row.tuis, entry), head, plugin)', 'action: lineAction(stepButton(row.tuis, entry), false, plugin)', "Settings: off: an action row with its own state"],
    ["a tools row offers no Turn on", 'var enable = head && !plugin.enabled;', 'var enable = false;', "Settings: off: an action row with only tools, one missing"],
    ["Review takes no press while the plugin is off", 'var review = tools.some(requirementApplies) ? reviewButton() : null;', 'var review = tools.some(requirementApplies) ? Object.assign(reviewButton(), { enabled: plugin.enabled }) : null;', "Settings: off: an action row with only tools, one missing"],
    ["Review draws while every tool is present", 'var review = tools.some(requirementApplies) ? reviewButton() : null;', 'var review = reviewButton();', "Settings: off: an action row with only tools, all present"],
    ["an own state takes its entry's label", 'entryLine("own", field.own, acting ? spec.label : "");', 'entryLine("own", field.own, entryOf(field.own).label);', "an own state draws no label of its own"],
    ["a field's screens leave its row", 'var screens = screenButtons(row.tuis, field.screens, plugin);', 'var screens = [];', "optional actions and keys stay beside the Settings choice"],
    ["a screen that is off names no reason", 'reason: plugin.enabled ? "" : offReason(plugin.name)', 'reason: ""', "off: a screen that takes no press names why"],
    ["a screen takes a press while the plugin is off", 'enabled: plugin.enabled, reason:', 'enabled: true, reason:', "Settings: off: a choice's screen takes no press and its tools still install"],
    ["an unreported step names no wait", 'if (entry.report !== "reported" && plugin.enabled)', 'if (false)', "on, unreported: the step names the wait"],
    ["a failed build reads as a wait", 'plugin.error !== "" ? plugin.error : ', '', "on, unreported after a failed build: the step names the failure"],
    ["tools read by their names", 'return row.title + (row.state', 'return row.name + (row.state', "a tools row names its tools by title under the field's label"]
];
// Each producer control edits PluginLogic, whose rows the page draws.
const producerControls = [
    ["a step whose screen needs an optional tool is withheld", "            action: statusRowAction(entry, value),",
        "            action: statusRowAction(entry, statusEntryActions(entry).some(function (a) { return a.action.tui !== undefined && (manifest.tui[a.action.tui].requires || []).some(function (name) { return manifest.requirements.some(function (r) { return r.optional && r.name === name; }); }); }) ? null : value),",
        "on: a step whose screen lacks an optional tool offers its own action"]
];
const temp = fs.mkdtempSync(path.join("/tmp", "settings-steps-control-"));
function mustFail(label, run, message) {
    let failed = false;
    try { run(); } catch (error) {
        assert.ok(error instanceof assert.AssertionError, `${label}: control must fail an assertion, not loading or execution: ${error}`);
        assert.ok(error.message.includes(message), `${label}: its named rule must reject the defect: ${error.message}`);
        failed = true;
    }
    assert.ok(failed, `${label}: the planted defect passed`);
}
function mutant(source, label, needle, replacement, name) {
    assert.equal(source.split(needle).length, 2, `${label}: source mutation must match once`);
    const copy = path.join(temp, name);
    fs.writeFileSync(copy, source.replace(needle, () => replacement));
    return copy;
}
try {
    const source = fs.readFileSync(file, "utf8"), producerSource = fs.readFileSync(producerFile, "utf8");
    for (const [label, needle, replacement, failure] of controls)
        mustFail(label, () => verify(load(mutant(source, label, needle, replacement, "Steps.js")), load(producerFile)), failure);
    // The producer's copy imports its neighbours by relative path, so it
    // stands in a tree of links to theirs.
    const core = path.join(temp, "shell", "Core");
    fs.mkdirSync(core, { recursive: true });
    for (const dir of ["Commons", "Ui"]) fs.symlinkSync(path.join(root, "shell", dir), path.join(temp, "shell", dir));
    for (const name of fs.readdirSync(path.join(root, "shell", "Core")).filter(name => name.endsWith(".js") && name !== "PluginLogic.js"))
        fs.symlinkSync(path.join(root, "shell", "Core", name), path.join(core, name));
    for (const [label, needle, replacement, failure] of producerControls)
        mustFail(label, () => verify(load(file), load(mutant(producerSource, label, needle, replacement, path.join("shell", "Core", "PluginLogic.js")))), failure);
    const page = fs.readFileSync(pageFile, "utf8"), needle = "id: setupPage";
    assert.equal(page.split(needle).length, 2, "boxed-action-on-Setup: production body must match once");
    const pageMutant = path.join(temp, "PluginPage.qml");
    fs.writeFileSync(pageMutant, page.replace(needle, needle + '\n Button { text: "Set up" }'));
    mustFail("boxed-action-on-Setup", () => verifyPage(fs.readFileSync(pageMutant, "utf8")), "Setup actions never declare a boxed Button");
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`test-settings-steps: ok controls=${controls.length + producerControls.length + 1}`);
