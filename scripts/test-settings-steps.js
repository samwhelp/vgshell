#!/usr/bin/env node
// The Settings page's setup-step rule, shell/plugins/vgs.settings/Steps.js,
// under node: a status row, a presence list's item and a requirement each
// show their step button only while it applies, and an entry that lists a
// plugin's stored keys draws in the Setup section alone. The rows are the core's
// own, PluginLogic.statusRows and requirementRows over a manifest written
// here, so the rule is read against what the Settings page is handed; every
// expected value is written out by hand.
//
// The controls at the end edit a copy of the rule, one rule at a time, and
// require this suite to fail on each copy.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");

const file = path.join(__dirname, "..", "shell", "plugins", "vgs.settings", "Steps.js");
const producer = load(path.join(__dirname, "..", "shell", "Core", "PluginLogic.js"));
const same = (got, want, message) => assert.deepEqual(JSON.parse(JSON.stringify(got)), want, message);

const MANIFEST = {
    requirements: [
        { command: "acme-tool", optional: true, purpose: "A tool" },
        { command: "acme-other", optional: false, purpose: "Another tool" }
    ],
    tui: { setup: { script: "tui/setup.sh", title: "Set up", size: "default", presentation: "full", entry: null, requires: null } },
    status: {
        token: { type: "presence", label: "Token", action: { label: "Set up token", tui: "setup" } },
        warden: { type: "state", label: "Warden", group: "Setup", action: { label: "Set up", tui: "setup" } },
        bare: { type: "state", label: "Bare", action: { label: "Fix", tui: "setup" } },
        pending: { type: "count", label: "Pending", hint: "Read the vendor page.", link: { text: "vendor page", url: "https://vendor.example/pending" } },
        accounts: { type: "presenceList", label: "Accounts" }
    }
};

// A status entry's step: [label, key, published values, { offered }].
const ENTRIES = [
    ["an absent presence offers its step", "token", { token: "absent" }, { offered: true }],
    ["a present presence shows none", "token", { token: "present" }, { offered: false }],
    ["a locked presence shows none", "token", { token: "locked" }, { offered: false }],
    ["a state that calls for its action offers it", "warden", { warden: { tone: "info", text: "Not set up", action: true } }, { offered: true }],
    ["a healthy state shows none", "warden", { warden: { tone: "ok", text: "Running" } }, { offered: false }],
    ["a failing state its writer gives no action shows none", "warden", { warden: { tone: "danger", text: "Could not read status" } }, { offered: false }],
    ["an unreported entry shows none", "warden", {}, { offered: false }],
    ["an offered action without a command offers the button", "bare", { bare: { tone: "warning", text: "Broken", action: true } }, { offered: true }],
    ["an entry without an action offers nothing", "pending", { pending: 3 }, { offered: false }]
];

// The manager row's listed setup screens.
const TUIS = [
    { name: "setup", label: "Set up again", icon: "download", withheld: "" },
    { name: "configure", label: "Configure", icon: "sliders-horizontal", withheld: "" }
];
// The same screens while the requirements both need are missing, as
// PluginLogic.listedTuiRows marks them.
const WITHHELD = TUIS.map(tui => Object.assign({}, tui, { withheld: "Needs acme-other. Install requirements first." }));
const BUTTONS = [
    ["a state that calls for its step draws it first, with its label", { warden: { tone: "warning", text: "Not set up", action: true } }, [], [["setup", "Set up"], ["configure", "Configure"]]],
    ["a ready state draws every screen in manifest order", { warden: { tone: "ok", text: "Ready" } }, [], [["setup", "Set up again"], ["configure", "Configure"]]],
    ["nothing published draws every screen", {}, [], [["setup", "Set up again"], ["configure", "Configure"]]],
    ["a withheld step keeps its place with the withheld label", { warden: { tone: "warning", text: "Not set up", action: true } }, ["acme-other"], [["setup", "Install requirements"], ["configure", "Configure"]]],
    ["two entries offering one screen draw it once, the first's", { token: "absent", warden: { tone: "warning", text: "Not set up", action: true } }, [], [["setup", "Set up token"], ["configure", "Configure"]]]
];

// MANIFEST with its requirements as the judge hands them on, which a
// withheld step reads.
const NORMAL = Object.assign({}, MANIFEST, { requirements: producer.normalRequirements(MANIFEST.requirements) });

// A page with setup steps: a summary, then two steps of the Setup group,
// and an entry elsewhere that offers the first step's screen too.
const STEPPED = {
    requirements: [{ name: "acme-tool", bus: null, packages: {}, optional: true, purpose: "A tool", floor: "1.0.0" }],
    tui: {
        keys: { script: "tui/keys.sh", title: "Add key", size: "default", presentation: "full", entry: null, requires: null },
        browser: { script: "tui/browser.sh", title: "Set up browser", size: "default", presentation: "full", entry: null, requires: null },
        accounts: { script: "tui/accounts.sh", title: "Accounts", size: "default", presentation: "full", entry: null, requires: null }
    },
    status: {
        summary: { type: "state", label: "Setup", group: "Setup" },
        model: { type: "state", label: "AI model", group: "Setup", actions: { key: { label: "Add key", tui: "keys" }, update: { label: "Update tool", install: ["acme-tool"] } } },
        browser: { type: "state", label: "Browser", group: "Setup", action: { label: "Set up browser", tui: "browser" } },
        keyStore: { type: "state", label: "API keys", action: { label: "Add key", tui: "keys" } }
    }
};
const STEPPED_TUIS = [
    { name: "keys", label: "Add key", icon: "key-round", withheld: "" },
    { name: "browser", label: "Set up browser", icon: "globe", withheld: "" },
    { name: "accounts", label: "Accounts", icon: "users", withheld: "" }
];
const TODO = { tone: "warning", text: "To do", action: true };
// The AI model step names the action that applies.
const KEY = { tone: "warning", text: "To do", action: "key" };
const NO_STEP = { tone: "ok", text: "Done" };
const DONE = { tone: "ok", text: "Done", action: false };
// [label, manifest, listed screens, published values, the rows of the
// Status and Setup sections as [label, step, button name and label or
// null], the Flow's actions as [name, label]].
const ROWS = [
    ["a step to do draws its screen beside it, once", STEPPED, STEPPED_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, model: KEY, browser: DONE, keyStore: { tone: "info", text: "No key", action: true } },
        [["Setup", false, null], ["AI model", true, ["keys", "Add key"]], ["Browser", true, null]],
        [["browser", "Set up browser"], ["accounts", "Accounts"]]],
    ["every step done draws no button beside a step", STEPPED, STEPPED_TUIS,
        { summary: { tone: "ok", text: "Ready" }, model: NO_STEP, browser: DONE, keyStore: { tone: "ok", text: "1 key", action: true } },
        [["Setup", false, null], ["AI model", true, null], ["Browser", true, null]],
        [["keys", "Add key"], ["browser", "Set up browser"], ["accounts", "Accounts"]]],
    ["two steps to do each draw their own screen", STEPPED, STEPPED_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, model: KEY, browser: TODO },
        [["Setup", false, null], ["AI model", true, ["keys", "Add key"]], ["Browser", true, ["browser", "Set up browser"]]],
        [["accounts", "Accounts"]]],
    ["a step whose offered action opens no screen draws that action, and the Flow keeps every screen", STEPPED, STEPPED_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, model: { tone: "warning", text: "To do", action: "update" }, browser: DONE },
        [["Setup", false, null], ["AI model", true, ["", "Update tool"]], ["Browser", true, null]],
        [["keys", "Add key"], ["browser", "Set up browser"], ["accounts", "Accounts"]]],
    ["a single Setup entry is the Status section, its screen in the Flow", MANIFEST, TUIS,
        { warden: { tone: "warning", text: "Not set up", action: true } },
        [["Warden", false, null]],
        [["setup", "Set up"], ["configure", "Configure"]]],
    ["a step whose screen is listed with no entry draws it as the manager's act", STEPPED, STEPPED_TUIS.filter(tui => tui.name !== "browser"),
        { summary: { tone: "warning", text: "Not ready" }, model: NO_STEP, browser: TODO },
        [["Setup", false, null], ["AI model", true, null], ["Browser", true, ["", "Set up browser"]]],
        [["keys", "Add key"], ["accounts", "Accounts"]]]
];

// A plugin whose keys the core stores in two groups of their own, each
// with its sign-in step, beside a Setup group with a headline and a step,
// and a key list of no group.
const GROUPED = {
    requirements: [],
    secrets: { service: "acme-drive", label: "Acme key" },
    tui: {
        pairs: { script: "tui/pairs.sh", title: "Pairs", size: "default", presentation: "full", entry: null, requires: null },
        connect: { script: "tui/connect.sh", title: "Sign in", size: "default", presentation: "full", entry: null, requires: null },
        out: { script: "tui/out.sh", title: "Sign out", size: "default", presentation: "full", entry: null, requires: null }
    },
    status: {
        sync: { type: "state", label: "Sync", group: "Setup" },
        pairs: { type: "state", label: "Pairs", group: "Setup", actions: { add: { label: "Add a pair", tui: "pairs" }, remove: { label: "Remove a pair", tui: "pairs", tone: "danger" } } },
        down: { type: "state", label: "Sign-in", group: "Download", actions: { signIn: { label: "Sign in", tui: "connect" }, signOut: { label: "Sign out", tui: "out", tone: "danger" } } },
        downKeys: { type: "presenceList", label: "Keys", group: "Download" },
        downCount: { type: "count", label: "Files", group: "Download" },
        downMore: { type: "presenceList", label: "More keys", group: "Download" },
        upKeys: { type: "presenceList", label: "Keys", group: "Upload" },
        up: { type: "state", label: "Sign-in", group: "Upload", action: { label: "Sign in", tui: "connect" } },
        other: { type: "presenceList", label: "Other keys" },
        last: { type: "time", label: "Last sync" }
    }
};
const GROUPED_TUIS = [{ name: "pairs", label: "Folder pairs", icon: "folder", withheld: "" }, { name: "connect", label: "Connect", icon: "log-in", withheld: "" }];
// [label, published values, the sections as [title, items as [key, keys
// or the button as [name, label, tone, primary] or null], Flow as [name,
// label, tone, primary]]].
const SECTIONS = [
    ["the headline, the steps and keys of Setup, then each keyed group in manifest order",
        { sync: { tone: "ok", text: "Up to date" }, pairs: { tone: "ok", text: "2 pairs", action: "remove" }, down: { tone: "warning", text: "Not signed in", action: "signIn" }, up: { tone: "warning", text: "Not signed in", action: true } },
        [["Status", [["sync", null]], []],
            ["Setup", [["pairs", ["pairs", "Remove a pair", "danger", false]], ["other", "keys"]], []],
            ["Download", [["down", ["connect", "Sign in", "", true]], ["downKeys", "keys"], ["downMore", "keys"]], []],
            ["Upload", [["upKeys", "keys"], ["up", ["connect", "Sign in", "", false]]], []]]],
    ["a danger step before a plain one leaves the primary to the plain one, and a plain Setup step takes it first",
        { sync: { tone: "ok", text: "Up to date" }, pairs: { tone: "warning", text: "None", action: "add" }, down: { tone: "ok", text: "Signed in", action: "signOut" }, up: { tone: "warning", text: "Not signed in", action: true } },
        [["Status", [["sync", null]], []],
            ["Setup", [["pairs", ["pairs", "Add a pair", "", true]], ["other", "keys"]], []],
            ["Download", [["down", ["", "Sign out", "danger", false]], ["downKeys", "keys"], ["downMore", "keys"]], []],
            ["Upload", [["upKeys", "keys"], ["up", ["connect", "Sign in", "", false]]], []]]],
    ["with no step offered no action is primary and the screen of no step draws in the Flow",
        { sync: { tone: "ok", text: "Up to date" }, pairs: { tone: "ok", text: "2 pairs" }, down: { tone: "ok", text: "Signed in" } },
        [["Status", [["sync", null]], []],
            ["Setup", [["pairs", null], ["other", "keys"]], [["pairs", "Folder pairs", "", false], ["connect", "Connect", "", false]]],
            ["Download", [["down", null], ["downKeys", "keys"], ["downMore", "keys"]], []],
            ["Upload", [["upKeys", "keys"], ["up", null]], []]]]
];
// The Flow's offered screen after every step row, and a danger one never
// primary: [label, manifest, listed screens, values, the Flow as [name,
// label, tone, primary]].
const FLOWS = [
    ["the offered screen of an entry on Details is the primary", MANIFEST, TUIS, { warden: { tone: "ok", text: "Ready" }, token: "absent" },
        [["setup", "Set up token", "", true], ["configure", "Configure", "", false]]],
    ["a listed screen no step offers is never the primary", MANIFEST, TUIS, { warden: { tone: "ok", text: "Ready" } },
        [["setup", "Set up again", "", false], ["configure", "Configure", "", false]]],
    ["a danger screen in the Flow is drawn in its tone and never primary",
        Object.assign({}, MANIFEST, { status: { warden: { type: "state", label: "Warden", group: "Setup" }, out: { type: "state", label: "Account", action: { label: "Sign out", tui: "setup", tone: "danger" } } } }), TUIS,
        { warden: { tone: "ok", text: "Ready" }, out: { tone: "ok", text: "Signed in", action: true } },
        [["setup", "Sign out", "danger", false], ["configure", "Configure", "", false]]]
];

// A plugin that stores keys: a state and the presence list of its accounts.
const KEYED = {
    requirements: [],
    tui: {},
    secrets: { service: "acme-keys", label: "Acme key" },
    status: {
        check: { type: "state", label: "Check" },
        keys: { type: "presenceList", label: "Acme keys" }
    }
};
// A plugin that stores keys through a setup screen of its own: its manifest
// groups their presence list under Setup, beside a state of that group and
// a presence list that lists no key.
const OWN = {
    requirements: [],
    tui: {},
    status: {
        summary: { type: "state", label: "Setup", group: "Setup" },
        keys: { type: "presenceList", label: "Provider keys", group: "Setup" },
        accounts: { type: "presenceList", label: "Accounts", group: "AI model" }
    }
};
// A presence list's item as a line draws it: [label, item, { tone, text }].
const ITEMS = [
    ["a secret nothing is stored for draws no chip", { label: "A", value: "absent", secret: "acme:a" }, { tone: "", text: "" }],
    ["a stored secret draws its chip", { label: "A", value: "present", secret: "acme:a" }, { tone: "success", text: "Present" }],
    ["a locked secret draws its chip", { label: "A", value: "locked", secret: "acme:a" }, { tone: "info", text: "Locked" }],
    ["a signed-out account keeps its chip", { label: "A", value: "signed-out", secret: "acme:a" }, { tone: "warning", text: "Signed out" }],
    ["an absent item that is no secret keeps its chip", { label: "A", value: "absent" }, { tone: "warning", text: "Absent" }]
];

// The Flow of the Setup section settingsSections draws for TUIS and STATUS.
function flowOf(logic, tuis, status) {
    const setup = logic.settingsSections(tuis, status).find(section => section.title === "Setup");
    return setup === undefined ? [] : setup.buttons;
}

function verify(logic) {
    const hintSpec = { hintFrom: "warden" };
    for (const [label, values, want] of [
        ["discovery pending", {}, ""],
        ["no supported card", { warden: { tone: "info", text: "Not found", hint: "No supported graphics card found." } }, "No supported graphics card found."],
        ["supported card", { warden: { tone: "ok", text: "Available", hint: "" } }, ""]
    ]) {
        same(logic.settingHint(hintSpec, producer.statusRows(MANIFEST, values, [])), want, "settingHint: " + label);
    }
    same(logic.settingHint(hintSpec, []), "", "a disabled or removed state gives no live hint");
    same(logic.settingHint({ description: "Fixed guidance" }, []), "Fixed guidance", "existing fixed descriptions still draw");
    same(logic.settingHint({}, []), "", "a field without guidance draws none");
    for (const [label, key, values, want] of ENTRIES) {
        const row = producer.statusRows(MANIFEST, values, []).find(entry => entry.key === key);
        same(logic.statusStep(row), want, label);
    }
    // The Status section takes the Setup group's first entry alone.
    same(logic.settingsSections(TUIS, producer.statusRows(MANIFEST, {}, [])).map(section => [section.title, section.items.map(item => item.key)]),
        [["Status", ["warden"]], ["Setup", []]], "the Status section takes the Setup group's entry");
    same(logic.settingsSections([], producer.statusRows(KEYED, {}, []).filter(entry => entry.key === "check")), [], "a plugin with no Setup entry, key or screen draws no status section");
    // keyEntries and detailEntries: the entry that lists the stored keys
    // draws with the setup, and every other entry on Details.
    const keyed = producer.statusRows(KEYED, {}, []);
    same([logic.keyEntries(keyed).map(entry => entry.key), logic.detailEntries(keyed).map(entry => entry.key)], [["keys"], ["check"]], "the stored keys' entry leaves Details for the Setup section");
    const own = producer.statusRows(OWN, {}, []);
    same([logic.keyEntries(own).map(entry => entry.key), logic.detailEntries(own).map(entry => entry.key), logic.settingsSections([], own).map(section => [section.title, section.items.map(item => [item.key, item.keys])])],
        [["keys"], ["summary", "accounts"], [["Status", [["summary", false]]], ["Setup", [["keys", true]]]]], "a presence list grouped under Setup draws as stored keys, off Details and off the step rows");
    const plain = producer.statusRows(MANIFEST, {}, []);
    same([logic.keyEntries(plain).map(entry => entry.key), logic.detailEntries(plain).map(entry => entry.key)], [[], ["token", "warden", "bare", "pending", "accounts"]], "a plugin that stores no key keeps every entry on Details");
    for (const [label, item, want] of ITEMS) {
        const drawn = producer.statusRows(KEYED, { keys: [item] }, []).find(entry => entry.key === "keys").value[0];
        same(logic.itemView(drawn), want, "itemView: " + label);
    }
    // The Flow: [label, published values, missing requirements, the
    // actions as [name, label]]. The manager row lists setup and
    // configure; a step is drawn first, with its action's label.
    for (const [label, values, missing, want] of BUTTONS) {
        const buttons = flowOf(logic, TUIS, producer.statusRows(NORMAL, values, missing));
        same(buttons.map(b => [b.name, b.label]), want, "Flow: " + label);
    }
    // A withheld screen draws disabled with its reason, but for the step an
    // offered action names, which installs what it lacks.
    const withheld = flowOf(logic, WITHHELD, producer.statusRows(NORMAL, { warden: { tone: "warning", text: "Not set up", action: true } }, ["acme-other"]));
    same(withheld.map(b => [b.name, b.enabled, b.reason !== ""]), [["setup", true, false], ["configure", false, true]], "Flow: a withheld screen draws disabled with a reason, the step stays active");
    same(flowOf(logic, TUIS, producer.statusRows(NORMAL, {}, [])).map(b => [b.enabled, b.reason]), [[true, ""], [true, ""]], "Flow: a screen that lacks nothing takes a press");
    same(new Set(flowOf(logic, TUIS, producer.statusRows(MANIFEST, { warden: { tone: "warning", text: "Not set up", action: true } }, [])).concat(flowOf(logic, TUIS, producer.statusRows(MANIFEST, {}, [])))
        .map(b => b.key)).size, 3, "Flow: a step and the same screen's plain button are drawn as different buttons");
    same(new Set([{ token: "absent" }, { warden: { tone: "warning", text: "Not set up", action: true } }]
        .map(values => flowOf(logic, TUIS, producer.statusRows(MANIFEST, values, []))[0].key)).size, 2, "Flow: two steps of one screen under different labels are drawn as different buttons");
    // The same offered screen, primary while no step row offers one and not
    // beside a step row that does, is drawn anew as its weight changes.
    const keyStep = { tone: "info", text: "No key", action: true };
    same([{ model: NO_STEP, keyStore: keyStep }, { model: { tone: "warning", text: "To do", action: "update" }, keyStore: keyStep }]
        .map(values => flowOf(logic, STEPPED_TUIS, producer.statusRows(STEPPED, values, []))[0]).map(b => [b.label, b.primary, b.key === undefined]),
        [["Add key", true, false], ["Add key", false, false]], "Flow: an offered screen is primary only while no step before it is");
    same(new Set([{ model: NO_STEP, keyStore: keyStep }, { model: { tone: "warning", text: "To do", action: "update" }, keyStore: keyStep }]
        .map(values => flowOf(logic, STEPPED_TUIS, producer.statusRows(STEPPED, values, []))[0].key)).size, 2, "Flow: a screen that changes weight is drawn anew");
    // The Status and Setup sections: the first Setup entry is the Status
    // section's row under its own label, each further one a step under its
    // own label with its offered screen beside it, which the Flow then
    // leaves out.
    for (const [label, manifest, tuis, values, rows, flow] of ROWS) {
        const status = producer.statusRows(manifest, values, []);
        same(logic.settingsSections(tuis, status).filter(section => section.title === "Status" || section.title === "Setup")
            .reduce((all, section) => all.concat(section.items.filter(item => !item.keys)), [])
            .map(row => [row.label, row.step, row.button === null ? null : [row.button.name, row.button.label]]), rows, "rows: " + label);
        same(flowOf(logic, tuis, status).map(b => [b.name, b.label]), flow, "Flow beside steps: " + label);
    }
    // Each keyed group is a section after Setup, its key lists and states
    // in manifest order, and the one primary is the first offered step
    // that is no danger.
    for (const [label, values, want] of SECTIONS) {
        const status = producer.statusRows(GROUPED, values, []);
        const drawn = logic.settingsSections(GROUPED_TUIS, status).map(section => [section.title,
            section.items.map(item => [item.key, item.keys ? "keys" : item.button === null ? null : [item.button.name, item.button.label, item.button.tone, item.button.primary]]),
            section.buttons.map(b => [b.name, b.label, b.tone, b.primary])]);
        same(drawn, want, "settingsSections: " + label);
        same(logic.detailEntries(status).map(entry => entry.key), ["sync", "pairs", "downCount", "last"], "a keyed group's keys and states leave Details: " + label);
    }
    for (const [label, manifest, tuis, values, want] of FLOWS)
        same(flowOf(logic, tuis, producer.statusRows(manifest, values, [])).map(b => [b.name, b.label, b.tone, b.primary]), want, "primary: " + label);
    // statusView: what a line draws of a state, with its lines.
    same(logic.statusView(producer.statusRows(MANIFEST, { warden: { tone: "ok", text: "Ready", lines: ["v1"] } }, []).find(e => e.key === "warden"), String),
        { label: "Warden", hint: "", info: "", link: null, offered: false, tone: "success", text: "Ready", lines: ["v1"], muted: false, items: [] }, "a reported state draws its text, tone and lines");
    same(logic.statusView(producer.statusRows(MANIFEST, {}, []).find(e => e.key === "warden"), String).text, "Not reported", "an unreported entry reads Not reported");
    same(logic.statusView(producer.statusRows(MANIFEST, { pending: 2 }, []).find(e => e.key === "pending"), String).link,
        { text: "vendor page", url: "https://vendor.example/pending" }, "a line draws its entry's link");
    const declared = { requirements: producer.normalRequirements(MANIFEST.requirements) };
    const requirements = producer.requirementRows(declared, ["acme-tool"], {});
    same(requirements.map(logic.requirementApplies), [true, false], "the install step applies to the missing requirement alone");
    // requirementStep by what the scan read: [label, rows, the button or null].
    const state = (name, value) => Object.assign({}, requirements.find(row => row.name === name), { state: value });
    for (const [label, rows, button] of [
        ["no step while every requirement is present", [state("acme-tool", "present")], null],
        ["a missing requirement is installed", [state("acme-tool", "missing")], "Install all missing"],
        ["an outdated requirement is updated", [state("acme-tool", "outdated"), state("acme-tool", "present")], "Update all outdated"],
        ["a missing requirement beside an outdated one is installed first", [state("acme-tool", "outdated"), state("acme-tool", "missing")], "Install all missing"]])
        same((step => step === null ? null : step.button)(logic.requirementStep(rows)), button, "requirementStep: " + label);
}

verify(load(file));

// Each control removes one rule from a copy of the logic and keeps the
// text around it. The suite must fail on every copy.
const CONTROLS = [
    ["an outdated requirement takes the step", 'return requirement.state !== "present";', 'return requirement.state === "missing";'],
    ["only outdated requirements read as an update", 'if (lacking.some(function (requirement) { return requirement.state === "missing"; }))', "if (true)"],
    ["a line drops its entry's link", "info: entry.info, link: entry.link, offered:", "info: entry.info, link: null, offered:"],
    ["a live hint is drawn", 'return entry === undefined || entry.report !== "reported" ? "" : entry.hint;', 'return "";'],
    ["a declared action is always offered", "entry.action !== null && entry.action.offered", "entry.action !== null"],
    ["a present requirement still offers its install", "return requirement.state !== \"present\";", "return true;"],
    ["the Setup section takes every group", "entry.group === SETUP_GROUP && !listsKeys(entry)", "!listsKeys(entry)"],
    ["the stored keys draw among the step rows too", "entry.group === SETUP_GROUP && !listsKeys(entry)", "entry.group === SETUP_GROUP"],
    ["every entry draws among the stored keys", "return status.filter(listsKeys);", "return status;"],
    ["the stored keys' entry stays on Details", "return !listsKeys(entry);", "return true;"],
    ["the core's stored keys stay on Details", "return entry.secrets || (", "return ("],
    ["a plugin's own stored keys stay on Details", ' || (entry.type === "presenceList" && entry.group === SETUP_GROUP)', ""],
    ["a Setup state draws among the stored keys", 'entry.type === "presenceList" && entry.group === SETUP_GROUP', "entry.group === SETUP_GROUP"],
    ["a presence list of any group draws among the stored keys", 'entry.type === "presenceList" && entry.group === SETUP_GROUP', 'entry.type === "presenceList"'],
    ["a secret nothing is stored for draws its chip", 'if (item.access === "connect" && item.value === "absent") return { tone: "", text: "" };', ""],
    ["a signed-out account loses its chip", 'item.access === "connect" && item.value === "absent"', 'item.access === "connect"'],
    ["an offered step keeps its screen's label", "add(tui, entry.action.label, entry.action.tone, true);", "add(tui, tui.label, entry.action.tone, true);"],
    ["an offered screen drops its tone", "add(tui, entry.action.label, entry.action.tone, true);", "add(tui, entry.action.label, \"\", true);"],
    ["a screen draws twice", "if (tui !== undefined && !has(tui.name))", "if (tui !== undefined)"],
    ["a button's key ignores its label and state", 'button.key = button.name + " " + button.label + " " + button.enabled', 'button.key = button.name + " " + button.enabled'],
    ["a button's key ignores its weight", ' + " " + button.primary;', ";"],
    ["a withheld screen takes a press", "var enabled = offered || tui.withheld === \"\";", "var enabled = true;"],
    ["the step is withheld too", "var enabled = offered || tui.withheld === \"\";", "var enabled = tui.withheld === \"\";"],
    ["a withheld screen gives no reason", "reason: enabled ? \"\" : tui.withheld", "reason: \"\""],
    ["a state draws no lines", "if (entry.value.lines !== undefined) out.lines = entry.value.lines;", ""],
    ["a step drops its button", "button: step ? stepButton(tuis, entry) : null", "button: null"],
    ["a step's action that opens no listed screen draws no button", 'var name = tui === undefined ? "" : tui.name;', 'if (tui === undefined) return null;\n    var name = tui.name;'],
    ["a step drops its tone", "tone: entry.action.tone, primary: false };", "tone: \"\", primary: false };"],
    ["a step draws an action its value does not offer", "if (entry.action === null || !entry.action.offered) return null;", "if (entry.action === null) return null;"],
    ["a step's screen draws in the Flow too", "beside.indexOf(name) !== -1 || ", ""],
    ["the Status row reads Status", "label: entry.label, step: step,", 'label: step ? entry.label : "Status", step: step,'],
    ["the first Setup entry draws as a step", "items: [row(setup[0], false)]", "items: [row(setup[0], true)]"],
    ["the first Setup entry draws among the steps too", "var setupItems = setup.slice(1).map(", "var setupItems = setup.map("],
    ["a keyed group's entries stay on Details", "        if (inKeyedGroup(entry, keyed)) return false;\n", ""],
    ["the keys of no group draw as their own section", 'if (entry.group !== "" && entry.group !== SETUP_GROUP && out.indexOf', "if (out.indexOf"],
    ["a keyed group draws twice", " && out.indexOf(entry.group) === -1) out.push(entry.group);", ") out.push(entry.group);"],
    ["every entry of a keyed group draws in its section", '(listsKeys(entry) || entry.type === "state")', "true"],
    ["a keyed group's keys draw in Setup too", "keyEntries(status).filter(function (entry) { return keyed.indexOf(entry.group) === -1; })", "keyEntries(status)"],
    ["a keyed group draws its keys first", "status.filter(function (entry) { return entry.group === group && inKeyedGroup(entry, keyed); })", "status.filter(function (entry) { return entry.group === group && inKeyedGroup(entry, keyed); }).sort(function (a, b) { return listsKeys(b) - listsKeys(a); })"],
    ["a keyed group's step screen draws in the Flow too", "setupItems.concat.apply(setupItems, groups.map(function (section) { return section.items; }))", "setupItems"],
    ["an empty Setup section draws", "if (setupItems.length > 0 || buttons.length > 0) out.push", "if (true) out.push"],
    ["a danger action is primary", 'if (found || button.tone === "danger") return;', "if (found) return;"],
    ["every action is primary", 'if (found || button.tone === "danger") return;', 'if (button.tone === "danger") return;'],
    ["a screen no step offers is primary", "section.buttons.forEach(function (button) { if (button.offered) mark(button); });", "section.buttons.forEach(function (button) { mark(button); });"],
    ["no action is primary", "        button.primary = true;\n", ""]
];

const source = fs.readFileSync(file, "utf8");
const scratchRoot = path.join(__dirname, "..", "tmp");
fs.mkdirSync(scratchRoot, { recursive: true });
const temp = fs.mkdtempSync(path.join(scratchRoot, "settings-steps-control-"));
try {
    for (const [label, needle, replacement] of CONTROLS) {
        assert.equal(source.split(needle).length, 2, `control "${label}": the text to replace must occur once`);
        const mutant = path.join(temp, "Steps.js");
        fs.writeFileSync(mutant, source.replace(needle, () => replacement));
        let failed = false;
        try {
            verify(load(mutant));
        } catch (e) {
            failed = true;
        }
        assert.ok(failed, `control "${label}": the suite passed on logic without that rule`);
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
console.log(`test-settings-steps: ok entries=${ENTRIES.length} rows=${ROWS.length} sections=${SECTIONS.length} controls=${CONTROLS.length}`);
