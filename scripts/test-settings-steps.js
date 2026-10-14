#!/usr/bin/env node
// Exercises the production page judge with PluginLogic manager rows.
// Required work alone creates Setup. Unknown and blocked required work
// stays open; optional work belongs beside its Settings field or in
// Details. Required tools form one persistent step. Expected placements
// are independent data. The source check reaches the actual Setup body:
// it proves that body declares no boxed Button, not rendered behavior.
// Each control edits production source and fails its named assertion.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");
const root = path.join(__dirname, "..");
const file = path.join(root, "shell/plugins/vgs.settings/Steps.js");
const pageFile = path.join(root, "shell/plugins/vgs.settings/PluginPage.qml");
const producer = load(path.join(root, "shell/Core/PluginLogic.js"));
const same = (got, want, message) => assert.deepEqual(JSON.parse(JSON.stringify(got)), want, message);
const manifest = {
    requirements: producer.normalRequirements([
        { command: "required-a", purpose: "Basic work" },
        { command: "required-b", purpose: "Basic work" },
        { command: "optional-tool", optional: true, purpose: "Optional feature", setting: "feature" },
        { command: "automatic-tool", optional: true, purpose: "Automatic alternative" }
    ]),
    tui: { required: { requires: [] }, feature: { requires: [] } },
    status: {
        model: { type: "state", label: "Model", setup: true, action: { label: "Set model", tui: "required" } },
        home: { type: "state", label: "Home", setup: true },
        optional: { type: "state", label: "Feature", setting: "feature", action: { label: "Configure feature", tui: "feature" } },
        keys: { type: "presenceList", label: "Provider keys", setting: "feature" },
        connection: { type: "state", label: "Connection", setup: true },
        connectionKeys: { type: "presenceList", label: "Connection keys", step: "connection" },
        fact: { type: "state", label: "Automatic work" }
    }
};
const screens = [
    { name: "required", label: "Set model", settings: false, setting: "", withheld: "" },
    { name: "feature", label: "Configure feature", settings: false, setting: "feature", withheld: "" },
    { name: "configure", label: "Configure", settings: true, setting: "", withheld: "" },
    { name: "task", label: "Run task", settings: false, setting: "", withheld: "Needs a tool" },
    { name: "extra", label: "Feature action", settings: false, setting: "feature", withheld: "" }
];
const ready = { tone: "ok", text: "Ready", action: false };
const blocked = { tone: "warning", text: "Waiting for account" };
const allDone = { model: ready, home: ready, connection: ready, optional: { tone: "warning", text: "Feature unavailable", action: true }, fact: { tone: "danger", text: "Alternative unavailable" } };
const homeUnreported = Object.fromEntries(Object.entries(allDone).filter(([key]) => key !== "home"));
const rows = values => producer.statusRows(manifest, values, []);
const requirements = missing => producer.requirementRows(manifest, missing, {});
const items = sections => sections.flatMap(section => section.items);

function verify(logic) {
    const status = rows(allDone), sections = logic.setupSections(screens, status);
    same(items(sections).map(item => item.key), ["model", "home", "connection", "connectionKeys"], "optional entries never draw on Setup");
    same(logic.settingEntries(status, "feature").map(entry => entry.key), ["optional", "keys"], "optional actions and keys stay beside the Settings choice");
    same(logic.detailEntries(status).map(entry => entry.key), ["fact"], "Details excludes Setup and Settings entries");
    same(logic.setupTab(sections, []), true, "completed required steps keep Setup");
    same(logic.setupTab([], requirements([])), true, "present required tools keep Setup");
    const optionalOnly = requirements(["optional-tool"]).filter(row => row.optional);
    same(logic.setupTab([], optionalOnly), false, "optional tools never create Setup");
    same(logic.requirementStep(optionalOnly), null, "optional tools never create the Tools step");
    same(logic.settingRequirements(requirements([]), "feature").map(row => row.name), ["optional-tool"], "optional tools follow the feature field");
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
        ["present", [], [true, "Tools", "Done", "success", ""]],
        ["missing", ["required-a", "required-b", "optional-tool"], [false, "Tools", "To do", "warning", "Review all missing or outdated tools"]]
    ]) {
        const step = logic.requirementStep(requirements(missing));
        assert.notEqual(step, null, "Tools: " + label);
        same([step.done, step.label, step.text, step.tone, step.button], want, "Tools: " + label);
        if (missing.length) same(step.hint, "required-a (missing), required-b (missing)", "Tools names only required tools");
    }
    const outdated = requirements([]).map(row => Object.assign({}, row, { state: row.name === "required-b" ? "outdated" : "present" }));
    same(logic.requirementStep(outdated).done, false, "outdated required tools stay open");
    same(logic.requirementStep(outdated).hint, "required-b (outdated)", "Tools identifies outdated tools");
    same(logic.setupNeeds(status, outdated, true), { open: true }, "outdated required tools warn");
    same(items(logic.setupSections(screens, status, requirements(["required-a"]))).map(item => item.key), ["required-tools", "model", "home", "connection", "connectionKeys"], "pending Tools precede completed required steps");
    same(items(logic.setupSections(screens, status, requirements([]))).map(item => item.key), ["model", "home", "connection", "connectionKeys", "required-tools"], "completed Tools retain their one step");
    const openRows = rows(Object.assign({}, allDone, { home: blocked, model: { tone: "warning", text: "Needs a key", action: true, lines: ["Open Settings"] } }));
    same(items(logic.setupSections(screens, rows(Object.assign({}, allDone, { home: blocked })))).map(item => item.key), ["home", "model", "connection", "connectionKeys"], "Home-only blocker is first");
    const model = openRows.find(entry => entry.key === "model"), view = logic.stepView(model, String);
    same([view.text, view.tone, view.lines], ["To do", "warning", ["Needs a key", "Open Settings"]], "pending chip keeps explanation");
    const complete = logic.stepView(status.find(entry => entry.key === "model"), String);
    same([complete.text, complete.tone], ["Done", "success"], "completed chip uses two-state vocabulary");
    same(logic.stepView(rows({}).find(entry => entry.key === "home"), String).text, "To do", "unreported required chip stays To do");
    same(items(logic.setupSections(screens, openRows)).find(item => item.key === "model").button.label, "Set model", "offered action stays on its required row");
    same(items(sections).find(item => item.key === "model").button, null, "unoffered required action draws nowhere");
    same(logic.freeScreens(screens, status, "Settings").map(screen => screen.name), ["configure"], "settings screens stay in More settings");
    same(logic.freeScreens(screens, status, "feature").map(screen => screen.name), ["extra"], "feature screen stays beside its Settings choice");
    same(logic.freeScreens(screens, status, "Details").map(screen => [screen.name, screen.enabled]), [["task", false]], "task screens alone stay in Details");
    same(logic.withheldHint(logic.freeScreens(screens, status, "Details")), "Run task: Needs a tool", "withheld task retains its reason");
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
verify(load(file));
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
    ["withheld task is enabled", 'var enabled = tui.withheld === "";', 'var enabled = true;', "task screens alone stay in Details"],
    ["More settings leaves Settings", 'place === "Settings" ? tui.settings', 'place === "Settings" ? false', "settings screens stay in More settings"],
    ["required keys keep ordinary chips", 'if (setup) {', 'if (false) {', "required stored key uses Done"]
];
const source = fs.readFileSync(file, "utf8");
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
try {
    for (const [label, needle, replacement, failure] of controls) {
        assert.equal(source.split(needle).length, 2, `${label}: source mutation must match once`);
        const mutant = path.join(temp, "Steps.js");
        fs.writeFileSync(mutant, source.replace(needle, () => replacement));
        mustFail(label, () => verify(load(mutant)), failure);
    }
    const page = fs.readFileSync(pageFile, "utf8"), needle = "id: setupPage";
    assert.equal(page.split(needle).length, 2, "boxed-action-on-Setup: production body must match once");
    const mutant = path.join(temp, "PluginPage.qml");
    fs.writeFileSync(mutant, page.replace(needle, needle + '\n Button { text: "Set up" }'));
    mustFail("boxed-action-on-Setup", () => verifyPage(fs.readFileSync(mutant, "utf8")), "Setup actions never declare a boxed Button");
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`test-settings-steps: ok controls=${controls.length + 1}`);
