.pragma library

// One page judge owns placement and required readiness. The manifest judge
// validates every reference before these manager rows reach the page.
function requirementApplies(requirement) { return requirement.state !== "present"; }
function listsKeys(entry) { return entry.type === "presenceList"; }
function declaresStep(entry) { return entry.setup === true; }
function stepOpen(entry) { return entry.report !== "reported" || entry.tone !== "success"; }
function stepRank(entry) { return stepOpen(entry) ? 0 : 1; }
function stepView(entry, timeText) {
    var view = statusView(entry, timeText);
    view.text = stepOpen(entry) ? "To do" : "Done";
    view.tone = stepOpen(entry) ? "warning" : "success";
    // The published state explains the work beneath the two-state chip.
    if (entry.report === "reported" && entry.type === "state" && entry.value.text !== "" && entry.value.text !== view.text)
        view.lines = [entry.value.text].concat(view.lines);
    return view;
}
function detailEntries(status) {
    return status.filter(function (entry) { return !declaresStep(entry) && entry.setting === "" && entry.step === ""; });
}
function settingEntries(status, key) { return status.filter(function (entry) { return entry.setting === key; }); }
function settingRequirements(requirements, key) { return requirements.filter(function (entry) { return entry.optional && entry.setting === key; }); }
function detailRequirements(requirements) { return requirements.filter(function (entry) { return entry.optional && entry.setting === ""; }); }
function requirementStep(requirements) {
    var required = requirements.filter(function (row) { return !row.optional; });
    if (required.length === 0) return null;
    var lacking = required.filter(requirementApplies);
    return { done: lacking.length === 0, label: "Tools", text: lacking.length === 0 ? "Done" : "To do",
        tone: lacking.length === 0 ? "success" : "warning",
        hint: lacking.length === 0 ? "Every required tool is available" : lacking.map(function (row) { return row.name + (row.state === "outdated" ? " (outdated)" : " (missing)"); }).join(", "),
        button: lacking.length === 0 ? "" : "Review all missing or outdated tools" };
}
function setupSections(tuis, status, requirements) {
    var steps = status.filter(declaresStep);
    var ordered = steps.filter(stepOpen).concat(steps.filter(function (entry) { return !stepOpen(entry); }));
    var items = [];
    ordered.forEach(function (entry) {
        items.push({ key: entry.key, slot: entry.key + ":" + stepRank(entry), keys: false, entry: entry,
            label: entry.label, step: true, button: stepButton(tuis, entry), aside: asideButton(entry) });
        status.filter(function (keyList) { return keyList.step === entry.key; }).forEach(function (keyList) {
            items.push({ key: keyList.key, slot: keyList.key, keys: true, entry: keyList, label: keyList.label, step: false, button: null, aside: null });
        });
    });
    var tools = requirementStep(requirements === undefined ? [] : requirements);
    if (tools !== null) {
        var toolEntry = { key: "required-tools", label: tools.label, type: "state", setup: true, report: "reported", tone: tools.tone,
            value: { text: "" }, hint: tools.hint, info: "", link: null, action: null, aside: null };
        var toolItem = { key: toolEntry.key, slot: toolEntry.key + ":" + tools.done, keys: false, tools: true, entry: toolEntry,
            label: tools.label, step: true, button: tools.done ? null : { name: "", label: tools.button, tone: "" }, aside: null };
        var firstDone = items.findIndex(function (item) { return !item.keys && !stepOpen(item.entry); });
        if (!tools.done && firstDone !== -1) items.splice(firstDone, 0, toolItem);
        else items.push(toolItem);
    }
    return items.length === 0 ? [] : [{ title: "Setup", items: items, buttons: [] }];
}
function setupNeeds(status, requirements, enabled) {
    return { open: enabled && (status.some(function (entry) { return declaresStep(entry) && stepOpen(entry); })
        || requirements.some(function (entry) { return !entry.optional && requirementApplies(entry); })) };
}
function setupTab(sections, requirements) { return sections.length > 0 || requirements.some(function (row) { return !row.optional; }); }
function stepButton(tuis, entry) {
    if (entry.action === null || !entry.action.offered) return null;
    var tui = entry.action.tui === "" ? undefined : tuis.find(function (row) { return row.name === entry.action.tui; });
    return { key: entry.key + " " + entry.action.label, name: tui === undefined ? "" : tui.name, label: entry.action.label, tone: entry.action.tone };
}
function asideButton(entry) {
    if (entry.aside === null || !entry.aside.offered) return null;
    return { name: entry.aside.tui, label: entry.aside.label, tone: entry.aside.tone };
}
function freeScreens(tuis, status, place) {
    var declared = [];
    status.forEach(function (entry) { declared = declared.concat(entry.declaredTuis); });
    return tuis.filter(function (tui) {
        return declared.indexOf(tui.name) === -1 && (place === "Settings" ? tui.settings : place === "Details" ? !tui.settings && tui.setting === "" : tui.setting === place);
    }).map(function (tui) {
        var enabled = tui.withheld === "";
        return { key: tui.name + " " + tui.label + " " + enabled, name: tui.name, label: tui.label, tone: "", enabled: enabled, reason: enabled ? "" : tui.withheld };
    });
}
function withheldHint(buttons) {
    return buttons.filter(function (button) { return !button.enabled; }).map(function (button) { return button.label + ": " + button.reason; }).join(" ");
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
// tone, text, lines, muted, items }, `link` the words of the hint that
// open an address, { text, url } or null, `tone` "" for a value drawn as
// text, `lines` a state's
// further lines and `items` a presence list's items with the `key` each
// keeps across writes (itemsKeyed). TIME_TEXT spells a `time` value for
// people. An entry the plugin has not published reads "Not reported".
function statusView(entry, timeText) {
    if (entry === null) return { label: "", hint: "", info: "", link: null, tone: "", text: "", lines: [], muted: true, items: [] };
    var out = { label: entry.label, hint: entry.hint, info: entry.info, link: entry.link, tone: "", text: "Not reported", lines: [], muted: true, items: [] };
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
function itemView(item, setup) {
    if (setup) {
        var done = item.value === "present";
        var reason = done ? "" : PRESENCE_WORDS[item.value];
        return { tone: done ? "success" : "warning", text: done ? "Done" : "To do", reason: reason };
    }
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
