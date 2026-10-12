#!/usr/bin/env node
// The Settings page's setup-step rule, shell/plugins/vgs.settings/Steps.js,
// under node: a status row, a presence list's item and a requirement each
// show their step button only while it applies, an entry that lists a
// plugin's stored keys draws in the Setup section alone, an entry that
// declares an action draws as a step on Setup and never on Details, and
// one judge says what a plugin still asks of its user and whether its page
// has a Setup tab. The rows are the core's
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

// A page whose one Setup entry, the Status section's row, offers by its
// value an action that opens no screen or one that opens a listed screen.
const HEADED = {
    requirements: [{ name: "acme-tool", bus: null, packages: {}, optional: true, purpose: "A tool", floor: "1.0.0" }],
    tui: { configure: { script: "tui/configure.sh", title: "Configure", size: "default", presentation: "full", entry: null, requires: null } },
    status: { setup: { type: "state", label: "Setup", group: "Setup", actions: { allow: { label: "Allow tool", system: "i2c-dev" }, configure: { label: "Finish", tui: "configure" } } } }
};
const HEADED_TUIS = [{ name: "configure", label: "Configure", icon: "sliders-horizontal", withheld: "" }];
// [label, published values, the Flow as [name, status, label, enabled]].
const HEADED_FLOW = [
    ["the headline's action that opens no screen draws as the entry's act, and the screen it declares draws only while offered", { setup: { tone: "warning", text: "To do", action: "allow" } }, [["", "setup", "Allow tool", true]]],
    ["the headline's action that opens a screen draws as that screen", { setup: { tone: "warning", text: "To do", action: "configure" } }, [["configure", "", "Finish", true]]],
    ["a headline that offers none draws no screen it declares", { setup: { tone: "ok", text: "Ready" } }, []]
];

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
const WITHHELD = TUIS.map(tui => Object.assign({}, tui, { withheld: "Needs acme-other. Install all missing first." }));
const BUTTONS = [
    ["a state that calls for its step draws it first, with its label", { warden: { tone: "warning", text: "Not set up", action: true } }, [], [["setup", "Set up"], ["configure", "Configure"]]],
    ["a ready state draws only the screens no entry declares", { warden: { tone: "ok", text: "Ready" } }, [], [["configure", "Configure"]]],
    ["nothing published draws only the screens no entry declares", {}, [], [["configure", "Configure"]]],
    ["a withheld step draws no button: Install all missing installs what it lacks", { warden: { tone: "warning", text: "Not set up", action: true } }, ["acme-other"], [["configure", "Configure"]]],
    ["a screen another entry offers on its own row draws in the Flow as the headline's alone", { token: "absent", warden: { tone: "warning", text: "Not set up", action: true } }, [], [["setup", "Set up"], ["configure", "Configure"]]]
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
        model: { type: "state", label: "AI model", group: "Setup", actions: { key: { label: "Add key", tui: "keys" }, allow: { label: "Allow tool", system: "i2c-dev" } } },
        browser: { type: "state", label: "Browser", group: "Setup", action: { label: "Set up browser", tui: "browser" } },
        keyStore: { type: "state", label: "API keys", action: { label: "Add key", tui: "keys" } }
    }
};
const STEPPED_TUIS = [
    { name: "keys", label: "Add key", icon: "key-round", withheld: "" },
    { name: "browser", label: "Set up browser", icon: "globe", withheld: "" },
    { name: "accounts", label: "Accounts", icon: "users", withheld: "" }
];
// A row that declares a listed screen and an unlisted repair screen: while
// danger and offering repair, the listed screen does not apply.
const DECLARED_FLOW = {
    requirements: [],
    tui: {
        listed: { script: "tui/listed.sh", title: "Listed screen", size: "default", presentation: "full", entry: null, requires: null },
        repair: { script: "tui/repair.sh", title: "Repair", size: "default", presentation: "full", entry: null, requires: null }
    },
    status: {
        summary: { type: "state", label: "Setup", group: "Setup" },
        gate: { type: "state", label: "Gate", group: "Setup", actions: { listed: { label: "Open listed screen", tui: "listed" }, repair: { label: "Repair", tui: "repair" } } }
    }
};
const DECLARED_FLOW_TUIS = [{ name: "listed", label: "Listed screen", icon: "list", withheld: "" }];
const TODO = { tone: "warning", text: "To do", action: true };
// The AI model step names the action that applies.
const KEY = { tone: "warning", text: "To do", action: "key" };
const NO_STEP = { tone: "ok", text: "Done" };
const DONE = { tone: "ok", text: "Done", action: false };
// [label, manifest, listed screens, published values, the rows of the
// Status and Setup sections as [label, step, button name and label or
// null], the Flow's actions as [name, label]].
const ROWS = [
    ["each step that offers a screen draws it beside its own row, a step of no group among the Setup group's", STEPPED, STEPPED_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, model: KEY, browser: DONE, keyStore: { tone: "info", text: "No key", action: true } },
        [["Setup", false, null], ["AI model", true, ["keys", "Add key"]], ["API keys", true, ["keys", "Add key"]], ["Browser", true, null]],
        [["accounts", "Accounts"]]],
    ["every step done draws no button beside a step and no screen a step declares", STEPPED, STEPPED_TUIS,
        { summary: { tone: "ok", text: "Ready" }, model: NO_STEP, browser: DONE, keyStore: { tone: "ok", text: "1 key" } },
        [["Setup", false, null], ["AI model", true, null], ["Browser", true, null], ["API keys", true, null]],
        [["accounts", "Accounts"]]],
    ["an optional step that offers its action draws above a done step declared first", STEPPED, STEPPED_TUIS,
        { summary: { tone: "ok", text: "Ready" }, model: NO_STEP, browser: { tone: "info", text: "Optional", action: true } },
        [["Setup", false, null], ["Browser", true, ["browser", "Set up browser"]], ["AI model", true, null], ["API keys", true, null]],
        [["accounts", "Accounts"]]],
    ["an optional step that offers no action keeps its manifest place among the done steps", STEPPED, STEPPED_TUIS,
        { summary: { tone: "ok", text: "Ready" }, model: NO_STEP, browser: { tone: "info", text: "Optional" } },
        [["Setup", false, null], ["AI model", true, null], ["Browser", true, null], ["API keys", true, null]],
        [["accounts", "Accounts"]]],
    ["two steps to do each draw their own screen", STEPPED, STEPPED_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, model: KEY, browser: TODO },
        [["Setup", false, null], ["AI model", true, ["keys", "Add key"]], ["Browser", true, ["browser", "Set up browser"]], ["API keys", true, null]],
        [["accounts", "Accounts"]]],
    ["a step whose offered action opens no screen draws that action, and the Flow keeps the screen of no entry", STEPPED, STEPPED_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, model: { tone: "warning", text: "To do", action: "allow" }, browser: DONE },
        [["Setup", false, null], ["AI model", true, ["", "Allow tool"]], ["Browser", true, null], ["API keys", true, null]],
        [["accounts", "Accounts"]]],
    ["a single Setup entry is the Status section, its screen in the Flow", MANIFEST, TUIS,
        { warden: { tone: "warning", text: "Not set up", action: true } },
        [["Warden", false, null], ["Token", true, null], ["Bare", true, null]],
        [["setup", "Set up"], ["configure", "Configure"]]],
    ["a step whose screen is listed with no entry draws it as the manager's act", STEPPED, STEPPED_TUIS.filter(tui => tui.name !== "browser"),
        { summary: { tone: "warning", text: "Not ready" }, model: NO_STEP, browser: TODO },
        [["Setup", false, null], ["Browser", true, ["", "Set up browser"]], ["AI model", true, null], ["API keys", true, null]],
        [["accounts", "Accounts"]]],
    ["a danger step's repair hides the listed screen it declares from the Flow", DECLARED_FLOW, DECLARED_FLOW_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, gate: { tone: "danger", text: "Broken", action: "repair" } },
        [["Setup", false, null], ["Gate", true, ["", "Repair"]]],
        []],
    ["a listed declared screen still draws beside the row when it applies", DECLARED_FLOW, DECLARED_FLOW_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, gate: { tone: "warning", text: "To do", action: "listed" } },
        [["Setup", false, null], ["Gate", true, ["listed", "Open listed screen"]]],
        []]
];

// An optional step, one whose state reads info, declared before a required
// one: [label, published values, the Setup section's step rows in drawn
// order, the open ones first, as [key, the button as [label, primary] or
// null]]. STEPPED's step of no group, keyStore, reads done under every row
// and draws last.
const OPTIONAL = { tone: "info", text: "Optional", action: "key" };
// SetupGate.voiceCheck publishes an ok state with a repeat action. The
// manager's real statusRows below normalizes that state tone to success.
const REPEAT = { tone: "ok", text: "Ready", action: "key" };
const BROWSER_REPEAT = { tone: "ok", text: "Ready", action: true };
const PRIMARY = [
    ["an open required step draws before the optional one declared first and takes the primary", { summary: { tone: "warning", text: "Not ready" }, model: OPTIONAL, browser: TODO },
        [["browser", ["Set up browser", true]], ["model", ["Add key", false]], ["keyStore", null]]],
    ["an optional row action is primary while no required step is open", { summary: { tone: "ok", text: "Ready" }, model: OPTIONAL, browser: DONE },
        [["model", ["Add key", true]], ["browser", null], ["keyStore", null]]],
    ["an unfinished required step draws before the completed repeat declared first, which stays secondary", { model: REPEAT, browser: TODO },
        [["browser", ["Set up browser", true]], ["model", ["Add key", false]], ["keyStore", null]]],
    ["only completed repeats leave the page without a primary", { model: REPEAT, browser: BROWSER_REPEAT },
        [["model", ["Add key", false]], ["browser", ["Set up browser", false]], ["keyStore", null]]],
    ["an optional step that offers its action draws above a completed repeat declared first, which stays secondary", { model: REPEAT, browser: { tone: "info", text: "Optional", action: true } },
        [["browser", ["Set up browser", true]], ["model", ["Add key", false]], ["keyStore", null]]],
    ["an optional row before a completed repeat remains primary", { model: OPTIONAL, browser: BROWSER_REPEAT },
        [["model", ["Add key", true]], ["browser", ["Set up browser", false]], ["keyStore", null]]],
    ["an unfinished required step before a completed repeat remains primary", { model: KEY, browser: BROWSER_REPEAT },
        [["model", ["Add key", true]], ["browser", ["Set up browser", false]], ["keyStore", null]]],
    ["the first open required step keeps primary ahead of another offered step", { model: KEY, browser: TODO },
        [["model", ["Add key", true]], ["browser", ["Set up browser", false]], ["keyStore", null]]],
    ["a first required step without an action leaves a later required action secondary", { model: { tone: "warning", text: "To do" }, browser: TODO },
        [["model", null], ["browser", ["Set up browser", false]], ["keyStore", null]]],
    ["a first required step without an action leaves an optional action secondary", { model: { tone: "warning", text: "To do" }, browser: { tone: "info", text: "Optional", action: true } },
        [["model", null], ["browser", ["Set up browser", false]], ["keyStore", null]]]
];

// Jarvis's SetupGate produces a ready Voice repeat, an actionless model
// while account discovery is pending, and an optional local runtime Flow.
const VOICE_SETUP = {
    requirements: [],
    tui: {
        "setup-local": { script: "tui/setup-local.sh", title: "Set up local voice", size: "default", presentation: "full", entry: null, requires: null },
        "check-microphone": { script: "tui/check-microphone.sh", title: "Check microphone", size: "default", presentation: "full", entry: null, requires: null }
    },
    status: {
        setup: { type: "state", label: "Setup", group: "Setup" },
        setupModel: { type: "state", label: "AI model", group: "Setup" },
        setupVoice: { type: "state", label: "Voice", group: "Setup", actions: { setup: { label: "Set up local voice", tui: "setup-local" }, check: { label: "Check microphone", tui: "check-microphone" } } },
        localRuntime: { type: "state", label: "Local voice", action: { label: "Set up local voice", tui: "setup-local" } }
    }
};

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
    ["an optional danger row leaves primary to the next optional row when no required step is open",
        { sync: { tone: "ok", text: "Ready" }, pairs: { tone: "ok", text: "Done" }, down: { tone: "info", text: "Optional", action: "signOut" }, up: { tone: "info", text: "Optional", action: true } },
        [["Status", [["sync", null]], []],
            ["Setup", [["pairs", null], ["other", "keys"]], []],
            ["Download", [["down", ["", "Sign out", "danger", false]], ["downKeys", "keys"], ["downMore", "keys"]], []],
            ["Upload", [["upKeys", "keys"], ["up", ["connect", "Sign in", "", true]]], []]]],
    ["a first open required danger action leaves later required actions secondary",
        { sync: { tone: "warning", text: "Not ready" }, pairs: { tone: "warning", text: "Needs attention", action: "remove" }, down: { tone: "warning", text: "Not signed in", action: "signIn" }, up: { tone: "warning", text: "Not signed in", action: true } },
        [["Status", [["sync", null]], []],
            ["Setup", [["pairs", ["pairs", "Remove a pair", "danger", false]], ["other", "keys"]], []],
            ["Download", [["down", ["connect", "Sign in", "", false]], ["downKeys", "keys"], ["downMore", "keys"]], []],
            ["Upload", [["upKeys", "keys"], ["up", ["connect", "Sign in", "", false]]], []]]],
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
    ["with no step offered no action is primary and no screen a step declares draws in the Flow",
        { sync: { tone: "ok", text: "Up to date" }, pairs: { tone: "ok", text: "2 pairs" }, down: { tone: "ok", text: "Signed in" } },
        [["Status", [["sync", null]], []],
            ["Setup", [["pairs", null], ["other", "keys"]], []],
            ["Download", [["down", null], ["downKeys", "keys"], ["downMore", "keys"]], []],
            ["Upload", [["upKeys", "keys"], ["up", null]], []]]]
];
// The Flow's offered screen after every step row, and a danger one never
// primary: [label, manifest, listed screens, values, the Flow as [name,
// label, tone, primary]].
const FLOWS = [
    ["the offered screen of a step outside the Setup group draws on its row, not in the Flow", MANIFEST, TUIS, { warden: { tone: "ok", text: "Ready" }, token: "absent" },
        [["configure", "Configure", "", false]]],
    ["a listed screen no entry declares is never the primary", MANIFEST, TUIS, { warden: { tone: "ok", text: "Ready" } },
        [["configure", "Configure", "", false]]],
    ["the headline's danger screen in the Flow is drawn in its tone and never primary",
        Object.assign({}, MANIFEST, { status: { warden: { type: "state", label: "Warden", group: "Setup", action: { label: "Sign out", tui: "setup", tone: "danger" } } } }), TUIS,
        { warden: { tone: "warning", text: "Needs attention", action: true } },
        [["setup", "Sign out", "danger", false], ["configure", "Configure", "", false]]],
    ["a danger row offering a repair hides the listed screen it declares", DECLARED_FLOW, DECLARED_FLOW_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, gate: { tone: "danger", text: "Broken", action: "repair" } },
        []],
    ["a row offering the listed action draws it beside the row", DECLARED_FLOW, DECLARED_FLOW_TUIS,
        { summary: { tone: "warning", text: "Not ready" }, gate: { tone: "warning", text: "To do", action: "listed" } },
        []],
    ["a done row offering another action draws the listed screen it declares nowhere", DECLARED_FLOW, DECLARED_FLOW_TUIS,
        { summary: { tone: "ok", text: "Ready" }, gate: { tone: "ok", text: "Done", action: "repair" } },
        []],
    ["a completed repeat in the Flow stays secondary without an unfinished step", MANIFEST, TUIS,
        { warden: BROWSER_REPEAT }, [["setup", "Set up", "", false], ["configure", "Configure", "", false]]]
];

// A plugin whose steps stand outside the Setup group: a state of no group
// and a state and a presence of a group of their own, each with an action,
// beside entries of both that declare none.
const MOVED = {
    requirements: [],
    tui: { allow: { script: "tui/allow.sh", title: "Allow", size: "default", presentation: "full", entry: null, requires: null } },
    status: {
        health: { type: "state", label: "Health" },
        capture: { type: "state", label: "Capture", action: { label: "Allow capture", tui: "allow" } },
        apple: { type: "state", label: "Apple displays", group: "Access", action: { label: "Allow", tui: "allow" } },
        seen: { type: "count", label: "Displays", group: "Access" },
        bus: { type: "state", label: "Bus", group: "Access" },
        tool: { type: "presence", label: "Tool", group: "Access", action: { label: "Install", tui: "allow" } }
    }
};
const MOVED_TUIS = [{ name: "allow", label: "Allow", icon: "shield", withheld: "" }];
// [label, published values, the Setup tab's sections as [title, items as
// [key, step, the button as [name, label, primary] or null], Flow]]. The
// entries Details draws are the same under every row.
const MOVES = [
    ["offered steps draw their actions on Setup, each group under its own title",
        { health: { tone: "warning", text: "Slow" }, capture: { tone: "warning", text: "Not allowed", action: true }, apple: { tone: "warning", text: "No access", action: true }, seen: 2, bus: { tone: "ok", text: "Found" }, tool: "absent" },
        [["Setup", [["capture", true, ["allow", "Allow capture", true]]], []],
            ["Access", [["apple", true, ["allow", "Allow", false]], ["tool", true, ["allow", "Install", false]]], []]]],
    ["done steps keep their rows on Setup with no action",
        { health: { tone: "ok", text: "Good" }, capture: { tone: "ok", text: "Allowed" }, apple: { tone: "ok", text: "Allowed" }, seen: 2, bus: { tone: "ok", text: "Found" }, tool: "present" },
        [["Setup", [["capture", true, null]], []], ["Access", [["apple", true, null], ["tool", true, null]], []]]],
    ["steps that have not reported keep their rows on Setup",
        {},
        [["Setup", [["capture", true, null]], []], ["Access", [["apple", true, null], ["tool", true, null]], []]]]
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
// A plugin whose keys the core stores in a group of their own, beside a
// state of that group that declares no action and a count.
const KEYED_GROUP = {
    requirements: [],
    tui: {},
    secrets: { service: "acme-drive", label: "Acme key" },
    status: {
        quota: { type: "state", label: "Quota", group: "Drive" },
        files: { type: "count", label: "Files", group: "Drive" },
        keys: { type: "presenceList", label: "Keys", group: "Drive" }
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

// A plugin with nothing to set up: a state and a count on Details, and the
// tools it needs, as the judge hands them on. FLOORED's each carry a floor.
const TOOLS = [
    { command: "acme-tool", optional: true, purpose: "A tool" },
    { command: "acme-other", optional: false, purpose: "Another tool" },
    { command: "acme-extra", optional: true, purpose: "An extra tool" }
];
const PLAIN = {
    requirements: producer.normalRequirements(TOOLS),
    tui: {},
    status: { health: { type: "state", label: "Health" }, pending: { type: "count", label: "Pending" } }
};
const WARN = { tone: "warning", text: "To do" };
const BROKEN = { tone: "danger", text: "Broken" };
const READY = { tone: "ok", text: "Ready" };
const OPTIONAL_STEP = { tone: "info", text: "Optional" };
// What a plugin asks of its user and whether its page has a Setup tab:
// [label, manifest, listed screens, published values, the missing
// requirement names, the command versions read, enabled, { open, optional },
// the Setup tab].
const FLOORED = Object.assign({}, PLAIN, { requirements: producer.normalRequirements(TOOLS.map(entry => Object.assign({ floor: "2.0.0" }, entry))) });
const NEEDS = [
    ["a plugin with no setup material has no Setup tab and asks nothing", PLAIN, [], { health: WARN, pending: 2 }, [], {}, true, { open: false, optional: 0 }, false],
    ["a missing optional tool marks the row, raises no Setup needed and gives the page its Setup tab", PLAIN, [], {}, ["acme-tool"], {}, true, { open: false, optional: 1 }, true],
    ["each missing optional tool is counted", PLAIN, [], {}, ["acme-tool", "acme-extra"], {}, true, { open: false, optional: 2 }, true],
    ["a missing required tool opens the setup", PLAIN, [], {}, ["acme-other"], {}, true, { open: true, optional: 0 }, true],
    ["an outdated required tool opens the setup", FLOORED, [], {}, [], { "acme-other": "acme-other 1.4.0" }, true, { open: true, optional: 0 }, true],
    ["an outdated optional tool is not counted as missing and keeps the Setup tab for its update", FLOORED, [], {}, [], { "acme-tool": "acme-tool 1.4.0" }, true, { open: false, optional: 0 }, true],
    ["a plugin that is off asks nothing and keeps its Setup tab", PLAIN, [], {}, ["acme-tool", "acme-other"], {}, false, { open: false, optional: 0 }, true],
    ["a headline in the warning tone opens the setup", STEPPED, STEPPED_TUIS, { summary: WARN, model: NO_STEP, browser: DONE }, [], {}, true, { open: true, optional: 0 }, true],
    ["a step in the danger tone opens the setup", STEPPED, STEPPED_TUIS, { summary: READY, model: BROKEN, browser: DONE }, [], {}, true, { open: true, optional: 0 }, true],
    ["a step outside the Setup group that is open and offers no action opens nothing", STEPPED, STEPPED_TUIS, { summary: READY, model: NO_STEP, browser: DONE, keyStore: WARN }, [], {}, true, { open: false, optional: 0 }, true],
    ["a step outside the Setup group that is open and offers its action opens the setup", STEPPED, STEPPED_TUIS, { summary: READY, model: NO_STEP, browser: DONE, keyStore: TODO }, [], {}, true, { open: true, optional: 0 }, true],
    ["an optional step outside the Setup group that offers its action opens nothing", STEPPED, STEPPED_TUIS, { summary: READY, model: NO_STEP, browser: DONE, keyStore: { tone: "info", text: "No key", action: true } }, [], {}, true, { open: false, optional: 0 }, true],
    ["an absent presence that offers its step in a group of its own opens the setup", MOVED, MOVED_TUIS, { tool: "absent" }, [], {}, true, { open: true, optional: 0 }, true],
    ["an open state that declares no step, in a group that holds steps, opens nothing", MOVED, MOVED_TUIS, { bus: WARN, health: WARN }, [], {}, true, { open: false, optional: 0 }, true],
    ["a plugin whose only setup material is a step outside the Setup group has a Setup tab", MOVED, [], {}, [], {}, true, { open: false, optional: 0 }, true],
    ["an optional step opens nothing", STEPPED, STEPPED_TUIS, { summary: READY, model: OPTIONAL_STEP, browser: DONE }, [], {}, true, { open: false, optional: 0 }, true],
    ["steps that have not reported open nothing", STEPPED, STEPPED_TUIS, {}, [], {}, true, { open: false, optional: 0 }, true],
    ["a keyed group's state in the warning tone opens the setup", GROUPED, GROUPED_TUIS, { sync: READY, pairs: READY, down: WARN }, [], {}, true, { open: true, optional: 0 }, true],
    ["a stored key that is absent opens nothing", GROUPED, GROUPED_TUIS, { sync: READY, pairs: READY, down: READY, downKeys: [{ label: "A", value: "absent", secret: "acme:a" }], other: [{ label: "B", value: "signed-out" }] }, [], {}, true, { open: false, optional: 0 }, true],
    ["a plugin whose only setup material is a stored key has a Setup tab", KEYED, [], {}, [], {}, true, { open: false, optional: 0 }, true],
    ["a plugin whose only setup material is a listed screen has a Setup tab", PLAIN, TUIS, {}, [], {}, true, { open: false, optional: 0 }, true]
];

// The Flow of the Setup section setupSections draws for TUIS and STATUS.
function flowOf(logic, tuis, status) {
    const setup = logic.setupSections(tuis, status).find(section => section.title === "Setup");
    return setup === undefined ? [] : setup.buttons;
}

function verify(logic) {
    const ready = { setup: { tone: "warning", text: "Not ready" }, setupModel: { tone: "warning", text: "To do" },
        setupVoice: { tone: "ok", text: "Ready", action: "check" }, localRuntime: { tone: "info", text: "Optional", action: true } };
    const jarvisTuis = [{ name: "setup-local", label: "Set up local voice", withheld: "" }, { name: "check-microphone", label: "Check microphone", withheld: "" }];
    const jarvisSections = logic.setupSections(jarvisTuis, producer.statusRows(VOICE_SETUP, ready, []));
    same(jarvisSections.flatMap(section => section.items.filter(item => item.button !== null).map(item => item.button).concat(section.buttons))
        .filter(button => button.primary).length, 0, "Jarvis actionless required model reserves no filled button");
    const jarvisSetup = jarvisSections.find(section => section.title === "Setup");
    same(jarvisSetup.items.filter(item => item.key === "setupModel" || item.key === "setupVoice")
        .map(item => [item.key, item.entry.tone, item.button === null ? null : [item.button.name, item.button.primary]]),
        [["setupModel", "warning", null], ["setupVoice", "success", ["check-microphone", false]]], "Jarvis Ready voice after an actionless required AI model");
    same(jarvisSetup.buttons, [], "Jarvis draws Set up local voice in no Flow while Voice is done: Voice and Local voice declare it");
    same(jarvisSetup.items.filter(item => item.key === "localRuntime").map(item => [item.step, item.button.name, item.button.label, item.button.primary]),
        [[true, "setup-local", "Set up local voice", false]], "Jarvis's optional local voice offers its screen on its own Setup step");
    same(logic.detailEntries(producer.statusRows(VOICE_SETUP, ready, [])), [], "Jarvis's local voice leaves Details with its action");
    // An entry that declares an action is a Setup step under every value,
    // and Details holds the entries that declare none.
    for (const [label, values, want] of MOVES) {
        const status = producer.statusRows(MOVED, values, []);
        same(logic.setupSections(MOVED_TUIS, status).map(section => [section.title,
            section.items.map(item => [item.key, item.step, item.button === null ? null : [item.button.name, item.button.label, item.button.primary]]),
            section.buttons.map(b => b.name)]), want, "moved steps: " + label);
        same(logic.detailEntries(status).map(entry => [entry.key, entry.action]), [["health", null], ["seen", null], ["bus", null]], "Details draws the entries that declare no action: " + label);
    }
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
    // setupNeeds and setupTab, over the core's own rows.
    for (const [label, manifest, tuis, values, missing, versions, enabled, needs, tab] of NEEDS) {
        const status = producer.statusRows(manifest, values, missing);
        const requirements = producer.requirementRows(manifest, missing, versions);
        same(logic.setupNeeds(status, requirements, enabled), needs, "setupNeeds: " + label);
        same(logic.setupTab(logic.setupSections(tuis, status), requirements), tab, "setupTab: " + label);
    }
    // stepHoldsPrimary: the Requirements action is the page's primary only
    // while no step holds it.
    for (const [label, values, want] of [
        ["an open step with an action holds the primary", { summary: WARN, model: KEY, browser: DONE }, true],
        ["done steps hold none", { summary: READY, model: NO_STEP, browser: DONE }, false],
        ["completed repeats, whose actions stay secondary, hold none", { summary: READY, model: REPEAT, browser: BROWSER_REPEAT }, false]])
        same(logic.stepHoldsPrimary(logic.setupSections(STEPPED_TUIS, producer.statusRows(STEPPED, values, []))), want, "stepHoldsPrimary: " + label);
    // A step whose screen lacks a requirement is withheld: it draws no
    // button, so Install all missing is the page's one main action.
    const lackingKeys = Object.assign({}, STEPPED, { tui: Object.assign({}, STEPPED.tui, { keys: Object.assign({}, STEPPED.tui.keys, { requires: ["acme-tool"] }) }) });
    const lackingSections = logic.setupSections(STEPPED_TUIS, producer.statusRows(lackingKeys, { summary: WARN, model: KEY, browser: DONE }, ["acme-tool"]));
    same([lackingSections.find(section => section.title === "Setup").items.find(item => item.key === "model").button, logic.stepHoldsPrimary(lackingSections)], [null, false],
        "stepHoldsPrimary: a withheld step draws no button and holds none");
    for (const [label, key, values, want] of ENTRIES) {
        const row = producer.statusRows(MANIFEST, values, []).find(entry => entry.key === key);
        same(logic.statusStep(row), want, label);
    }
    // The Status section takes the Setup group's first entry alone.
    same(logic.setupSections(TUIS, producer.statusRows(MANIFEST, {}, [])).map(section => [section.title, section.items.map(item => item.key)]),
        [["Status", ["warden"]], ["Setup", ["token", "bare"]]], "the Status section takes the Setup group's entry, and the Setup section the steps of no group");
    same(logic.setupSections([], producer.statusRows(KEYED, {}, []).filter(entry => entry.key === "check")), [], "a plugin with no Setup entry, key or screen draws no status section");
    // keyEntries and detailEntries: the entry that lists the stored keys
    // draws with the setup, and every other entry on Details.
    const keyed = producer.statusRows(KEYED, {}, []);
    same([logic.keyEntries(keyed).map(entry => entry.key), logic.detailEntries(keyed).map(entry => entry.key)], [["keys"], ["check"]], "the stored keys' entry leaves Details for the Setup section");
    const own = producer.statusRows(OWN, {}, []);
    same([logic.keyEntries(own).map(entry => entry.key), logic.detailEntries(own).map(entry => entry.key), logic.setupSections([], own).map(section => [section.title, section.items.map(item => [item.key, item.keys])])],
        [["keys"], ["accounts"], [["Status", [["summary", false]]], ["Setup", [["keys", true]]]]], "a presence list grouped under Setup draws as stored keys, off Details and off the step rows, and the Setup headline off Details");
    const drive = producer.statusRows(KEYED_GROUP, {}, []);
    same([logic.detailEntries(drive).map(entry => entry.key), logic.setupSections([], drive).map(section => [section.title, section.items.map(item => [item.key, item.keys])])],
        [["files"], [["Drive", [["quota", false], ["keys", true]]]]], "a keyed group's state that declares no action draws beside its keys, off Details");
    const plain = producer.statusRows(MANIFEST, {}, []);
    same([logic.keyEntries(plain).map(entry => entry.key), logic.detailEntries(plain).map(entry => entry.key)], [[], ["pending", "accounts"]], "a plugin that stores no key keeps on Details every entry outside the Setup group that declares no action");
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
    // A withheld screen draws disabled with its reason, the screen of a
    // withheld step too: the core offers no step whose screen lacks a
    // requirement, and the Requirements section installs it.
    const withheld = flowOf(logic, WITHHELD, producer.statusRows(NORMAL, { warden: { tone: "warning", text: "Not set up", action: true } }, ["acme-other"]));
    same(withheld.map(b => [b.name, b.enabled, b.reason !== ""]), [["configure", false, true]], "Flow: a withheld screen draws disabled with a reason, and a withheld step draws no button");
    same(flowOf(logic, TUIS, producer.statusRows(NORMAL, {}, [])).map(b => [b.enabled, b.reason]), [[true, ""]], "Flow: a screen that lacks nothing takes a press");
    same(flowOf(logic, HEADED_TUIS.map(tui => Object.assign({}, tui, { withheld: "Needs acme-tool. Install all missing first." })), producer.statusRows(HEADED, { setup: { tone: "warning", text: "To do", action: "allow" } }, []))
        .map(b => [b.name, b.enabled]), [["", true]], "Flow: the headline's act takes its press while a screen is withheld");
    // Two acts of one headline under two labels, each opening no screen.
    const twoActs = Object.assign({}, HEADED, { status: { setup: Object.assign({}, HEADED.status.setup, { actions: Object.assign({ enable: { label: "Enable tool", system: "apple-displays" } }, HEADED.status.setup.actions) }) } });
    same(new Set(["allow", "enable"].map(action => flowOf(logic, HEADED_TUIS, producer.statusRows(twoActs, { setup: { tone: "warning", text: "To do", action: action } }, []))[0])
        .map(b => b.name + " " + b.enabled + " " + b.key)).size, 2, "Flow: one act of one state under two labels is drawn as two buttons");
    // The Status and Setup sections: the first Setup entry is the Status
    // section's row under its own label, each further one a step under its
    // own label with its offered screen beside it, which the Flow then
    // leaves out.
    for (const [label, manifest, tuis, values, rows, flow] of ROWS) {
        const status = producer.statusRows(manifest, values, []);
        same(logic.setupSections(tuis, status).filter(section => section.title === "Status" || section.title === "Setup")
            .reduce((all, section) => all.concat(section.items.filter(item => !item.keys)), [])
            .map(row => [row.label, row.step, row.button === null ? null : [row.button.name, row.button.label]]), rows, "rows: " + label);
        same(flowOf(logic, tuis, status).map(b => [b.name, b.label]), flow, "Flow beside steps: " + label);
    }
    for (const [label, values, want] of HEADED_FLOW)
        same(flowOf(logic, HEADED_TUIS, producer.statusRows(HEADED, values, [])).map(b => [b.name, b.status, b.label, b.enabled]), want, "headline Flow: " + label);
    same(new Set([{ setup: { tone: "warning", text: "To do", action: "allow" } }, { setup: { tone: "warning", text: "To do", action: "configure" } }]
        .flatMap(values => flowOf(logic, HEADED_TUIS, producer.statusRows(HEADED, values, [])).map(b => b.key))).size, 2, "headline Flow: the entry's act and a screen are drawn as different buttons");
    // Each keyed group is a section after Setup, its key lists and states
    // in manifest order, and the one primary is the first offered step
    // that is no danger.
    for (const [label, values, want] of SECTIONS) {
        const status = producer.statusRows(GROUPED, values, []);
        const drawn = logic.setupSections(GROUPED_TUIS, status).map(section => [section.title,
            section.items.map(item => [item.key, item.keys ? "keys" : item.button === null ? null : [item.button.name, item.button.label, item.button.tone, item.button.primary]]),
            section.buttons.map(b => [b.name, b.label, b.tone, b.primary])]);
        same(drawn, want, "setupSections: " + label);
        same(logic.detailEntries(status).map(entry => entry.key), ["downCount", "last"], "the Setup group and a keyed group's keys and states leave Details: " + label);
    }
    for (const [label, values, want] of PRIMARY)
        same(logic.setupSections(STEPPED_TUIS, producer.statusRows(STEPPED, Object.assign({ keyStore: NO_STEP }, values), [])).find(section => section.title === "Setup").items
            .map(item => [item.key, item.button === null ? null : [item.button.label, item.button.primary]]), want, "primary: " + label);
    for (const [label, manifest, tuis, values, want] of FLOWS)
        same(flowOf(logic, tuis, producer.statusRows(manifest, values, [])).map(b => [b.name, b.label, b.tone, b.primary]), want, "primary: " + label);
    const completedFlow = flowOf(logic, TUIS, producer.statusRows(MANIFEST, { warden: BROWSER_REPEAT }, []))[0];
    same([completedFlow.name, completedFlow.enabled], ["setup", true], "a secondary completed repeat remains offered and enabled");
    // statusView: what a line draws of a state, with its lines.
    same(logic.statusView(producer.statusRows(MANIFEST, { warden: { tone: "ok", text: "Ready", lines: ["v1"] } }, []).find(e => e.key === "warden"), String),
        { label: "Warden", hint: "", info: "", link: null, tone: "success", text: "Ready", lines: ["v1"], muted: false, items: [] }, "a reported state draws its text, tone and lines");
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
    ["a line drops its entry's link", "info: entry.info, link: entry.link, tone:", "info: entry.info, link: null, tone:"],
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
    ["a button's key ignores its label and state", 'button.key = button.name + " " + button.label + " " + button.enabled', 'button.key = button.name + " " + button.enabled'],
    ["a withheld screen takes a press", "var enabled = tui.withheld === \"\";", "var enabled = true;"],
    ["the headline's offered screen is withheld too", "tone: step.tone, primary: false, enabled: true,", "tone: step.tone, primary: false, enabled: tuis.every(function (t) { return t.withheld === \"\"; }),"],
    ["a withheld screen gives no reason", "reason: enabled ? \"\" : tui.withheld", "reason: \"\""],
    ["a state draws no lines", "if (entry.value.lines !== undefined) out.lines = entry.value.lines;", ""],
    ["a step drops its button", "button: step ? stepButton(tuis, entry) : null", "button: null"],
    ["a step's action that opens no listed screen draws no button", 'var name = tui === undefined ? "" : tui.name;', 'if (tui === undefined) return null;\n    var name = tui.name;'],
    ["a step drops its tone", "tone: entry.action.tone, primary: false };", "tone: \"\", primary: false };"],
    ["a step draws an action its value does not offer", "if (entry.action === null || !entry.action.offered) return null;", "if (entry.action === null) return null;"],
    ["a screen an entry declares draws in the Flow too", "        if (declared.indexOf(tui.name) !== -1) return;\n", ""],
    ["only the first entry's screens count as declared", "declared = declared.concat(entry.declaredTuis);", "if (declared.length === 0) declared = entry.declaredTuis;"],
    ["the headline's offered action draws nothing", "if (step !== null)\n        out.push", "if (false)\n        out.push"],
    ["the headline's action that opens a screen draws as an act", 'status: step.name === "" ? headline.key : ""', "status: headline.key"],
    ["the headline's act names no entry", 'status: step.name === "" ? headline.key : ""', 'status: ""'],
    ["the Status row reads Status", "label: entry.label, step: step,", 'label: step ? entry.label : "Status", step: step,'],
    ["the first Setup entry draws as a step", "items: [row(setup[0], false)]", "items: [row(setup[0], true)]"],
    ["the first Setup entry draws among the steps too", "var steps = setup.slice(1).concat(", "var steps = setup.concat("],
    ["a keyed group's entries stay on Details", "        if (inKeyedGroup(entry, keyed)) return false;\n", ""],
    ["a Setup step draws on Details too", "        if (entry.group === SETUP_GROUP) return false;\n", ""],
    ["the keys of no group draw as their own section", 'if (entry.group !== "" && entry.group !== SETUP_GROUP && out.indexOf', "if (out.indexOf"],
    ["a keyed group draws twice", " && out.indexOf(entry.group) === -1) out.push(entry.group);", ") out.push(entry.group);"],
    ["every entry of a keyed group draws in its section", '(listsKeys(entry) || entry.type === "state")', "true"],
    ["a keyed group's keys draw in Setup too", "keyEntries(status).filter(function (entry) { return keyed.indexOf(entry.group) === -1; })", "keyEntries(status)"],
    ["a keyed group draws its keys first", "status.filter(function (entry) { return entry.group === group && (inKeyedGroup(entry, keyed) || declaresStep(entry)); })", "status.filter(function (entry) { return entry.group === group && (inKeyedGroup(entry, keyed) || declaresStep(entry)); }).sort(function (a, b) { return listsKeys(b) - listsKeys(a); })"],
    ["an empty Setup section draws", "if (setupItems.length > 0 || buttons.length > 0) out.push", "if (true) out.push"],
    ["a danger action is primary", 'first.button.tone !== "danger"', "true"],
    ["the last required action is primary", "            return true;\n        });\n    });\n    if (first === null)", "            return false;\n        });\n    });\n    if (first === null)"],
    ["a completed repeat is primary", ' || item.entry.tone === "success"', ""],
    ["a non-step summary claims the primary", "!item.step || ", ""],
    ["a first actionless required step hands primary to another action", "if (!item.step ||", "if (item.button === null || !item.step ||"],
    ["an optional step claims the primary", ' || item.entry.tone === "info"', ""],
    ["an optional row loses primary while no required step is open", "if (first === null) sections.some", "if (false) sections.some"],
    ["an optional danger row blocks the next optional row", ' && item.button.tone !== "danger"', ""],
    ["a Flow button claims the primary", 'button.key = button.name + " " + button.label', 'button.primary = true; button.key = button.name + " " + button.label'],
    ["no action is primary", "first.button.primary = true;", "{}"],
    ["the done steps draw first", "var setupItems = [0, 1, 2].map(", "var setupItems = [2, 1, 0].map("],
    ["the done steps draw nowhere", "var setupItems = [0, 1, 2].map(", "var setupItems = [0, 1].map("],
    ["an open step ranks with the optional ones", "    if (stepOpen(entry)) return 0;\n", ""],
    ["an optional step that offers its action ranks with the done ones", 'return entry.tone !== "success" && statusStep(entry).offered ? 1 : 2;', "return 2;"],
    ["a done step that offers its action ranks with the optional ones", 'return entry.tone !== "success" && statusStep(entry).offered ? 1 : 2;', "return statusStep(entry).offered ? 1 : 2;"],
    ["an optional step that offers no action ranks above the done ones", 'return entry.tone !== "success" && statusStep(entry).offered ? 1 : 2;', 'return entry.tone !== "success" ? 1 : 2;'],
    ["an optional step is open", 'return entry.tone === "warning" || entry.tone === "danger";', 'return entry.tone === "warning" || entry.tone === "danger" || entry.tone === "info";'],
    ["a danger step is not open", ' || entry.tone === "danger";', ";"],
    ["a warning step is not open", 'return entry.tone === "warning" || ', "return "],
    ["a plugin that is off asks for its setup", "if (!enabled) return { open: false, optional: 0 };", ""],
    ["a missing optional tool raises Setup needed", "return !requirement.optional && requirementApplies(requirement);", "return requirementApplies(requirement);"],
    ["a missing required tool raises no Setup needed", "return !requirement.optional && requirementApplies(requirement); })\n            || ", "return false; })\n            || "],
    ["an open step raises no Setup needed", "status.some(function (entry) { return stepOpen(entry) && !listsKeys(entry)", "status.some(function (entry) { return false && !listsKeys(entry)"],
    ["a state on Details raises Setup needed", " && (entry.group === SETUP_GROUP || inKeyedGroup(entry, keyed) || (declaresStep(entry) && statusStep(entry).offered)); }),", "; }),"],
    ["a keyed group's state raises no Setup needed", "(entry.group === SETUP_GROUP || inKeyedGroup(entry, keyed) || (", "(entry.group === SETUP_GROUP || ("],
    ["an entry with an action stays on Details", "        if (declaresStep(entry)) return false;\n", ""],
    ["an entry that declares no action draws as a step", "return entry.action !== null;", "return true;"],
    ["a step of no group draws in no section", '.concat(status.filter(function (entry) { return entry.group === "" && declaresStep(entry); }))', ""],
    ["a group that holds steps and no key is no section", "return listsKeys(entry) || declaresStep(entry); });", "return listsKeys(entry); });"],
    ["a group's section drops its steps", "(inKeyedGroup(entry, keyed) || declaresStep(entry)); })", "inKeyedGroup(entry, keyed); })"],
    ["a moved step that offers no action raises Setup needed", " && statusStep(entry).offered)); }),", ")); }),"],
    ["a moved step that is open and offered raises no Setup needed", " || (declaresStep(entry) && statusStep(entry).offered)); }),", "); }),"],
    ["a required tool is counted as optional", 'return requirement.optional && requirement.state === "missing";', 'return requirement.state === "missing";'],
    ["an outdated optional tool is counted as missing", 'return requirement.optional && requirement.state === "missing";', "return requirement.optional && requirementApplies(requirement);"],
    ["no missing optional tool is counted", 'return requirement.optional && requirement.state === "missing"; }).length', 'return requirement.optional && requirement.state === "missing"; }).length * 0'],
    ["every page has a Setup tab", "return sections.length > 0 || requirements.some(requirementApplies);", "return true;"],
    ["a tool to install gives no Setup tab", "return sections.length > 0 || requirements.some(requirementApplies);", "return sections.length > 0;"],
    ["setup material gives no Setup tab", "return sections.length > 0 || requirements.some(requirementApplies);", "return requirements.some(requirementApplies);"],
    ["no step holds the primary", "return item.button !== null && item.button.primary; });", "return false; });"],
    ["every step action holds the primary", "return item.button !== null && item.button.primary; });", "return item.button !== null; });"]
];

const source = fs.readFileSync(file, "utf8");
const scratchRoot = "/tmp";
const temp = fs.mkdtempSync(path.join(scratchRoot, "settings-steps-control-"));
try {
    for (const [label, needle, replacement, failure] of CONTROLS) {
        assert.equal(source.split(needle).length, 2, `control "${label}": the text to replace must occur once`);
        const mutant = path.join(temp, "Steps.js");
        fs.writeFileSync(mutant, source.replace(needle, () => replacement));
        let failed = false;
        try {
            verify(load(mutant));
        } catch (e) {
            assert.ok(e instanceof assert.AssertionError, `control "${label}": must fail an assertion, not loading or execution`);
            if (failure !== undefined) assert.ok(e.message.includes(failure), `control "${label}": the named fixture must reject the defect`);
            failed = true;
        }
        assert.ok(failed, `control "${label}": the suite passed on logic without that rule`);
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
console.log(`test-settings-steps: ok entries=${ENTRIES.length} rows=${ROWS.length} sections=${SECTIONS.length} moves=${MOVES.length} primary=${PRIMARY.length} needs=${NEEDS.length} controls=${CONTROLS.length}`);
