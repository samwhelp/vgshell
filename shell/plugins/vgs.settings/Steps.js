.pragma library

// The one rule for when a plugin page shows a setup step (D061), pure so
// scripts/test-settings-steps.js runs it under node: a step's button shows
// only while its value offers it: a `presence` while `absent` and a `state`
// while it carries `action: true` or names one of its entry's actions, so a
// failing state its writer gives no action shows none. The core decides when
// a step applies (PluginLogic.statusActionOffered, SECRET_ACCESS,
// requirementRows); this file decides what the page then draws, and where:
// a stored key on the Settings tab, in the Setup section or its group's
// own section, and a state on Details.

// What the line of ENTRY, one row of PluginLogic.statusRows, draws of its
// step: { offered }, whether the action's button shows.
function statusStep(entry) {
    var offered = entry.action !== null && entry.action.offered;
    return { offered: offered };
}

// Whether the Requirements section's step applies to REQUIREMENT, one row
// of PluginLogic.requirementRows: while its requirement is missing or
// outdated.
function requirementApplies(requirement) {
    return requirement.state !== "present";
}

// What the Requirements section's step row draws for REQUIREMENTS, a plugin's
// rows: null while the step applies to none, else { label, hint, button,
// icon }, the install's words while one is missing and the update's once
// each one the step applies to is outdated. Either button asks the core for
// the one notice, which installs first and then updates.
function requirementStep(requirements) {
    var lacking = requirements.filter(requirementApplies);
    if (lacking.length === 0) return null;
    if (lacking.some(function (requirement) { return requirement.state === "missing"; }))
        return { label: "Missing", hint: "Review the missing tools before you install them.", button: "Install all missing", icon: "download" };
    return { label: "Outdated", hint: "Review the outdated tools before you update them.", button: "Update all outdated", icon: "refresh-cw" };
}

// The words a `presence` value reads as on the page.
var PRESENCE_WORDS = { present: "Present", absent: "Absent", locked: "Locked", unavailable: "Unavailable", unsafe: "Unsafe", "signed-out": "Signed out" };

// A schema field's guidance: its fixed description, or the live hint of
// its declared state row. Discovery and disabled plugins report no state.
function settingHint(spec, status) {
    if (spec.hintFrom === undefined) return spec.description === undefined ? "" : spec.description;
    var entry = status.find(function (row) { return row.key === spec.hintFrom; });
    return entry === undefined || entry.report !== "reported" ? "" : entry.hint;
}

// What a page draws of ENTRY, one row of PluginLogic.statusRows, or null
// for a row whose entry left the manager row: { label, hint, info, link,
// offered, tone, text, lines, muted, items }, `link` the words of the hint
// that open an address, { text, url } or null, `offered` its step's
// (statusStep), `tone` "" for a value drawn as text, `lines` a state's
// further lines and `items` a presence list's items with the `key` each
// keeps across writes (itemsKeyed). TIME_TEXT spells a `time` value for
// people. An entry the plugin has not published reads "Not reported".
function statusView(entry, timeText) {
    if (entry === null) return { label: "", hint: "", info: "", link: null, offered: false, tone: "", text: "", lines: [], muted: true, items: [] };
    var out = { label: entry.label, hint: entry.hint, info: entry.info, link: entry.link, offered: statusStep(entry).offered, tone: "", text: "Not reported", lines: [], muted: true, items: [] };
    if (entry.report !== "reported") return out;
    out.muted = false;
    out.tone = entry.tone;
    switch (entry.type) {
    case "presence": out.text = PRESENCE_WORDS[entry.value]; return out;
    case "presenceList":
        out.items = itemsKeyed(entry.value);
        out.text = entry.value.length === 0 ? "None detected" : "";
        out.muted = true;
        return out;
    case "state":
        out.text = entry.value.text;
        if (entry.value.lines !== undefined) out.lines = entry.value.lines;
        return out;
    case "text": out.text = entry.value; return out;
    case "count": out.text = String(entry.value); return out;
    case "time": out.text = timeText(entry.value); return out;
    }
    console.error("Steps: no rule for status type " + JSON.stringify(entry.type));
    out.text = "";
    return out;
}

// What a line draws of ITEM's presence, one item of a presence list:
// { tone, text }, its chip, or neither for a secret nothing is stored for,
// whose line offers Add key in the chip's place.
function itemView(item) {
    if (item.access === "connect" && item.value === "absent") return { tone: "", text: "" };
    return { tone: item.tone, text: PRESENCE_WORDS[item.value] };
}

// ITEMS, a presence list's, each with the `key` a line keeps across
// writes, so a status write elsewhere, which hands the page new objects,
// keeps each line's delegate, an open masked field and what it holds with
// it: its secret's account, else its label, with its count among earlier
// equal names after a second one.
function itemsKeyed(items) {
    var seen = Object.create(null);
    return items.map(function (item) {
        var name = item.secret !== "" ? "secret " + item.secret : "label " + item.label;
        seen[name] = (seen[name] || 0) + 1;
        return Object.assign({ key: seen[name] === 1 ? name : name + " " + seen[name] }, item);
    });
}

// The status group whose first entry a page draws as its own Status
// section, the plugin's headline state, and whose further entries open its
// Setup section as step rows, so the state a setup step changes reads
// beside the step.
var SETUP_GROUP = "Setup";
// The title of the section that holds SETUP_GROUP's first entry.
var STATUS_TITLE = "Status";

// Whether ENTRY, one of a manager row's status rows, lists keys and tokens
// the plugin stores: the presence list of a manifest that declares
// `secrets` (PluginLogic.statusRows' `secrets`), whose keys the core
// stores, or a presence list its manifest groups under SETUP_GROUP, the
// keys a plugin stores through a setup screen of its own.
function listsKeys(entry) {
    return entry.secrets || (entry.type === "presenceList" && entry.group === SETUP_GROUP);
}

// The entries of STATUS, a manager row's status rows, that list the
// plugin's stored keys and tokens: a page draws each on its Settings tab,
// where a key is added, replaced and removed, and every other entry
// read-only on Details (detailEntries), but for the states of a keyed
// group (keyedGroups), which the Settings tab draws beside its keys.
function keyEntries(status) {
    return status.filter(listsKeys);
}
function detailEntries(status) {
    var keyed = keyedGroups(status);
    return status.filter(function (entry) {
        if (inKeyedGroup(entry, keyed)) return false;
        return !listsKeys(entry);
    });
}

// The groups of STATUS, other than "" and SETUP_GROUP, that hold a key
// list, in the order of their first entry: each is a section of the
// Settings tab, titled with the group, so a key and the step that uses it
// read under one heading.
function keyedGroups(status) {
    var out = [];
    keyEntries(status).forEach(function (entry) {
        if (entry.group !== "" && entry.group !== SETUP_GROUP && out.indexOf(entry.group) === -1) out.push(entry.group);
    });
    return out;
}

// Whether ENTRY draws in the section of one of KEYED, keyedGroups' groups:
// a key list or a state of such a group. Another type stays on Details.
function inKeyedGroup(entry, keyed) {
    return keyed.indexOf(entry.group) !== -1 && (listsKeys(entry) || entry.type === "state");
}

// The status sections of the Settings tab for TUIS, a manager row's listed
// TUIs (PluginLogic.listedTuiRows), and STATUS, its status rows, in drawn
// order, each { title, items, buttons }:
// - STATUS_TITLE: SETUP_GROUP's first entry, under its own label, with no
//   step;
// - SETUP_GROUP: each further entry of that group as a step row, then the
//   key lists of group "" or SETUP_GROUP, then `buttons`, the screens no
//   step row draws (flowButtons);
// - each keyed group (keyedGroups): its key lists and states in manifest
//   order, each state a step row.
// A section with no item and no button is left out. Each item is { key,
// keys, entry, label, step, button }: `key` the entry's, `keys` whether it
// draws as a key list, `step` whether its offered action draws beside it,
// `button` that action (stepButton) or null. The page's one primary action
// is the first offered one in that order whose tone is not danger, an
// optional step's only while no other is offered (markPrimary).
function settingsSections(tuis, status) {
    var keyed = keyedGroups(status);
    var setup = status.filter(function (entry) { return entry.group === SETUP_GROUP && !listsKeys(entry); });
    function row(entry, step) {
        return { key: entry.key, keys: false, entry: entry, label: entry.label, step: step, button: step ? stepButton(tuis, entry) : null };
    }
    function keys(entry) {
        return { key: entry.key, keys: true, entry: entry, label: entry.label, step: false, button: null };
    }
    var setupItems = setup.slice(1).map(function (entry) { return row(entry, true); })
        .concat(keyEntries(status).filter(function (entry) { return keyed.indexOf(entry.group) === -1; }).map(keys));
    var groups = keyed.map(function (group) {
        return { title: group, buttons: [], items: status.filter(function (entry) { return entry.group === group && inKeyedGroup(entry, keyed); })
            .map(function (entry) { return listsKeys(entry) ? keys(entry) : row(entry, true); }) };
    });
    var beside = [];
    setupItems.concat.apply(setupItems, groups.map(function (section) { return section.items; })).forEach(function (item) {
        if (item.button !== null && item.button.name !== "") beside.push(item.button.name);
    });
    var out = [];
    if (setup.length > 0) out.push({ title: STATUS_TITLE, items: [row(setup[0], false)], buttons: [] });
    var buttons = flowButtons(tuis, status, beside);
    if (setupItems.length > 0 || buttons.length > 0) out.push({ title: SETUP_GROUP, items: setupItems, buttons: buttons });
    out = out.concat(groups);
    markPrimary(out);
    return out;
}

// The action beside step ENTRY, or null while its value offers none:
// { key, name, label, tone, primary }, `name` the listed TUI of TUIS the
// offered action opens, a press the manager's openTui, or "" for an action
// that opens no listed screen, such as a screen with no `entry`, the
// plugin's own requirement commands or a system step, whose press the page
// hands the manager's act; `tone` "" or "danger"; `primary` markPrimary's.
function stepButton(tuis, entry) {
    if (entry.action === null || !entry.action.offered) return null;
    var tui = entry.action.tui === "" ? undefined : tuis.filter(function (t) { return t.name === entry.action.tui; })[0];
    var name = tui === undefined ? "" : tui.name;
    return { key: entry.key + " " + entry.action.label, name: name, label: entry.action.label, tone: entry.action.tone, primary: false };
}

// The Setup section's actions for TUIS and STATUS, in drawn order, leaving
// out each listed TUI a step row draws beside it, BESIDE: first each TUI
// an offered action opens (a row's action names a TUI only while it is
// offered), in status order, as that step, with the action's label and
// tone; then every other TUI in manifest order, with its entry's label.
// Such another TUI that lacks a requirement takes no press and reads the
// core's reason, the TUI's `withheld`: its press would only raise the
// notice the step installs from; an offered step always takes its press.
// Each { key, name, label, tone, offered, primary, enabled, reason }, `key`
// naming the action as drawn, so a change of label, state or weight draws
// it anew (markPrimary sets it).
function flowButtons(tuis, status, beside) {
    var out = [];
    function has(name) { return beside.indexOf(name) !== -1 || out.some(function (button) { return button.name === name; }); }
    function add(tui, label, tone, offered) {
        var enabled = offered || tui.withheld === "";
        out.push({ key: "", name: tui.name, label: label, tone: tone, offered: offered, primary: false, enabled: enabled, reason: enabled ? "" : tui.withheld });
    }
    status.forEach(function (entry) {
        if (entry.action === null || entry.action.tui === "") return;
        var tui = tuis.filter(function (t) { return t.name === entry.action.tui; })[0];
        if (tui !== undefined && !has(tui.name)) add(tui, entry.action.label, entry.action.tone, true);
    });
    tuis.forEach(function (tui) { if (!has(tui.name)) add(tui, tui.label, "", false); });
    return out;
}

// Mark the one primary action of SECTIONS, settingsSections' list: the
// first offered step action in drawn order, the step rows of a section and
// then its offered buttons, whose tone is not danger, so the next step
// reads first and a removal is never the page's main action. A step whose
// state reads info is optional, such as a sign-in the plugin works
// without: it is primary only while no other step offers an action, so an
// open required step after it reads first. Each button of a section's
// `buttons` then takes its key.
function markPrimary(sections) {
    var found = false;
    function mark(button) {
        if (found || button.tone === "danger") return;
        button.primary = true;
        found = true;
    }
    [false, true].forEach(function (optional) {
        sections.forEach(function (section) {
            section.items.forEach(function (item) { if (item.button !== null && (item.entry.tone === "info") === optional) mark(item.button); });
            if (!optional) section.buttons.forEach(function (button) { if (button.offered) mark(button); });
        });
    });
    sections.forEach(function (section) {
        section.buttons.forEach(function (button) { button.key = button.name + " " + button.label + " " + button.enabled + " " + button.tone + " " + button.primary; });
    });
}
