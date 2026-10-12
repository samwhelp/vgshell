.pragma library

// The one rule for when a plugin page shows a setup step (D061), pure so
// scripts/test-settings-steps.js runs it under node: a step's button shows
// only while its value offers it: a `presence` while `absent` and a `state`
// while it carries `action: true` or names one of its entry's actions, so a
// failing state its writer gives no action shows none. The core decides when
// a step applies (PluginLogic.statusActionOffered, SECRET_ACCESS,
// requirementRows); this file decides what the page then draws, and where:
// a setup step, a stored key and a setup screen on the Setup tab, a state
// outside them on Details, and the requirements on Setup when the page has
// that tab, else on Details. It also judges what a plugin still asks of
// its user (setupNeeds), which the plugin list marks its row with.

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
// plugin's stored keys and tokens: a page draws each on its Setup tab,
// where a key is added, replaced and removed, and every other entry
// read-only on Details (detailEntries), but for the entries of
// SETUP_GROUP, the Setup tab's headline and steps, and the states of a
// keyed group (keyedGroups), which the Setup tab draws beside its keys. No
// entry draws on both tabs.
function keyEntries(status) {
    return status.filter(listsKeys);
}
function detailEntries(status) {
    var keyed = keyedGroups(status);
    return status.filter(function (entry) {
        if (inKeyedGroup(entry, keyed)) return false;
        if (entry.group === SETUP_GROUP) return false;
        return !listsKeys(entry);
    });
}

// The groups of STATUS, other than "" and SETUP_GROUP, that hold a key
// list, in the order of their first entry: each is a section of the
// Setup tab, titled with the group, so a key and the step that uses it
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

// The status sections of the Setup tab for TUIS, a manager row's listed
// TUIs (PluginLogic.listedTuiRows), and STATUS, its status rows, in drawn
// order, each { title, items, buttons }:
// - STATUS_TITLE: SETUP_GROUP's first entry, under its own label, with no
//   step;
// - SETUP_GROUP: each further entry of that group as a step row, the open
//   ones (stepOpen) first and each kind in manifest order, then the
//   key lists of group "" or SETUP_GROUP, then `buttons`, the headline's
//   offered action and the screens no step row draws and no danger step
//   owns now (flowButtons);
// - each keyed group (keyedGroups): its key lists and states in manifest
//   order, each state a step row.
// A section with no item and no button is left out. Each item is { key,
// keys, entry, label, step, button }: `key` the entry's, `keys` whether it
// draws as a key list, `step` whether its offered action draws beside it,
// `button` that action (stepButton) or null. The page's one primary action
// belongs to the first open required step in that order, while its action
// is offered and not danger; an optional row action takes it only while
// no required step is open (markPrimary). Flow screens stay secondary.
function setupSections(tuis, status) {
    var keyed = keyedGroups(status);
    var setup = status.filter(function (entry) { return entry.group === SETUP_GROUP && !listsKeys(entry); });
    function row(entry, step) {
        return { key: entry.key, keys: false, entry: entry, label: entry.label, step: step, button: step ? stepButton(tuis, entry) : null };
    }
    function keys(entry) {
        return { key: entry.key, keys: true, entry: entry, label: entry.label, step: false, button: null };
    }
    var steps = setup.slice(1);
    var setupItems = steps.filter(stepOpen).concat(steps.filter(function (entry) { return !stepOpen(entry); })).map(function (entry) { return row(entry, true); })
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
    var buttons = flowButtons(tuis, status, beside, setup.length > 0 ? setup[0] : null);
    if (setupItems.length > 0 || buttons.length > 0) out.push({ title: SETUP_GROUP, items: setupItems, buttons: buttons });
    out = out.concat(groups);
    markPrimary(out);
    return out;
}

// Whether ENTRY, a status row the Setup tab draws as its headline or as a
// step, is open: reported in the warning or the danger tone, which a plugin
// gives a step its user has still to do. An optional step reads info, a
// done one success, and a disabled plugin reports none.
function stepOpen(entry) {
    return entry.tone === "warning" || entry.tone === "danger";
}

// What a plugin still asks of its user, for STATUS and REQUIREMENTS, its
// manager row's status and requirement rows, and ENABLED, whether it is
// on: { open, optional }. `open` holds while a required tool is missing or
// outdated (requirementApplies) or a headline or step of the Setup tab is
// open (stepOpen); the plugin list then draws Setup needed on the row and
// a click on the row opens Setup. `optional` counts the optional tools
// that are missing, which the list marks with its warning icon. A plugin
// that is off asks nothing: both read as none until it is turned on.
function setupNeeds(status, requirements, enabled) {
    if (!enabled) return { open: false, optional: 0 };
    var keyed = keyedGroups(status);
    return {
        open: requirements.some(function (requirement) { return !requirement.optional && requirementApplies(requirement); })
            || status.some(function (entry) { return stepOpen(entry) && !listsKeys(entry) && (entry.group === SETUP_GROUP || inKeyedGroup(entry, keyed)); }),
        optional: requirements.filter(function (requirement) { return requirement.optional && requirement.state === "missing"; }).length
    };
}

// Whether a plugin's page has a Setup tab, for SECTIONS, its setupSections,
// and REQUIREMENTS, its requirement rows: while it has a step, a stored key
// or a setup screen to draw, or a tool to install or update. The
// Requirements section draws on that tab, so its install action never
// draws on Details, which holds what a user reads.
function setupTab(sections, requirements) {
    return sections.length > 0 || requirements.some(requirementApplies);
}

// Whether a step of SECTIONS, a page's setupSections, holds the page's one
// primary action (markPrimary); the Requirements section's action is then
// secondary on the Setup tab.
function stepHoldsPrimary(sections) {
    return sections.some(function (section) {
        return section.items.some(function (item) { return item.button !== null && item.button.primary; });
    });
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
// out each listed TUI a step row draws beside it, BESIDE, and each listed
// TUI a danger row declares while it offers another TUI as the repair:
// first the offered action of HEADLINE, the entry the Status section draws
// with no step, or null, when it opens no listed screen (stepButton), a
// press the manager's act on `status`, the entry's key; then each TUI an
// offered action opens (a row's action names a TUI only
// while it is offered), in status order, as that step, with the action's
// label and tone; then every other TUI in manifest order, with its entry's
// label.
// Such another TUI that lacks a requirement takes no press and reads the
// core's reason, the TUI's `withheld`: its press would only raise the
// notice the step installs from; an offered step always takes its press.
// Each { key, name, status, label, tone, offered, primary, enabled,
// reason }, `status` "" for a screen, `key` naming the action as drawn, so
// a change of label or state draws it anew (markPrimary sets it).
function flowButtons(tuis, status, beside, headline) {
    var out = [];
    var step = headline === null ? null : stepButton(tuis, headline);
    if (step !== null && step.name === "")
        out.push({ key: "", name: "", status: headline.key, label: step.label, tone: step.tone, offered: true, primary: false, enabled: true, reason: "" });
    function has(name) { return beside.indexOf(name) !== -1 || out.some(function (button) { return button.status === "" && button.name === name; }); }
    function blockedByDangerRow(name) {
        return status.some(function (entry) {
            return entry.tone === "danger" && entry.action !== null && true === entry.action.offered && entry.action.tui !== "" && entry.action.tui !== name
                && entry.declaredTuis !== undefined && entry.declaredTuis.indexOf(name) !== -1;
        });
    }
    function add(tui, label, tone, offered) {
        var enabled = offered || tui.withheld === "";
        out.push({ key: "", name: tui.name, status: "", label: label, tone: tone, offered: offered, primary: false, enabled: enabled, reason: enabled ? "" : tui.withheld });
    }
    status.forEach(function (entry) {
        if (entry.action === null || entry.action.tui === "") return;
        var tui = tuis.filter(function (t) { return t.name === entry.action.tui; })[0];
        if (tui !== undefined && !has(tui.name)) add(tui, entry.action.label, entry.action.tone, true);
    });
    tuis.forEach(function (tui) { if (!has(tui.name) && !blockedByDangerRow(tui.name)) add(tui, tui.label, "", false); });
    return out;
}

// Choose the first open required step before inspecting its action. An
// actionless step cannot hand its primary to a later step or Flow screen.
// The core's success tone marks completion and info marks optional steps.
// Each Flow button keeps its drawing key, with secondary weight.
function markPrimary(sections) {
    var first = null;
    sections.some(function (section) {
        return section.items.some(function (item) {
            if (!item.step || item.entry.tone === "info" || item.entry.tone === "success") return false;
            first = item;
            return true;
        });
    });
    if (first === null) sections.some(function (section) {
        return section.items.some(function (item) {
            if (item.step && item.entry.tone === "info" && item.button !== null && item.button.tone !== "danger") {
                first = item;
                return true;
            }
            return false;
        });
    });
    if (first !== null && first.button !== null && first.button.tone !== "danger") first.button.primary = true;
    sections.forEach(function (section) {
        section.buttons.forEach(function (button) { button.key = button.name + " " + button.label + " " + button.enabled + " " + button.tone + " " + button.primary + " " + button.status; });
    });
}
