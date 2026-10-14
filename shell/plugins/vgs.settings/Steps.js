.pragma library

// One page judge owns placement and required readiness. The manifest judge
// validates every reference before these manager rows reach the page.
function requirementApplies(requirement) { return requirement.state !== "present"; }
function declaresStep(entry) { return entry.setup === true; }
function stepOpen(entry) { return entry.report !== "reported" || entry.tone !== "success"; }
function stepRank(entry) { return stepOpen(entry) ? 0 : 1; }
// What a Setup step draws of ENTRY for PLUGIN, { enabled, name, error }:
// To do or Done, and under the chip the published state's own text, or,
// while the plugin is on and has published nothing for the step, why:
// ERROR, why it was not built, or that it has not reported yet
// (waitingLine).
function stepView(entry, timeText, plugin) {
    var view = statusView(entry, timeText);
    view.text = stepOpen(entry) ? "To do" : "Done";
    view.tone = stepOpen(entry) ? "warning" : "success";
    // The published state explains the work beneath the two-state chip.
    if (entry.report === "reported" && entry.type === "state" && entry.value.text !== "" && entry.value.text !== view.text)
        view.lines = [entry.value.text].concat(view.lines);
    if (entry.report !== "reported" && plugin.enabled)
        view.lines = [plugin.error !== "" ? plugin.error : waitingLine(plugin.name)];
    return view;
}
function waitingLine(name) { return name + " has not reported this step yet"; }
function detailEntries(status) {
    return status.filter(function (entry) { return !declaresStep(entry) && entry.setting === "" && entry.step === ""; });
}
function detailRequirements(requirements) { return requirements.filter(function (entry) { return entry.optional && entry.setting === ""; }); }
// The action that opens the plugin's notice for every missing or outdated
// tool, the one install action of Setup's Tools step and of a field's
// tools line.
var REVIEW_LABEL = "Review all missing or outdated tools";
function reviewButton() { return { kind: "tools", key: "tools", name: "", label: REVIEW_LABEL, tone: "", enabled: true, reason: "" }; }
// REQUIREMENTS by title, each that is missing or outdated marked so.
function toolsText(requirements) {
    return requirements.map(function (row) { return row.title + (row.state === "outdated" ? " (outdated)" : row.state === "missing" ? " (missing)" : ""); }).join(", ");
}
function requirementStep(requirements) {
    var required = requirements.filter(function (row) { return !row.optional; });
    if (required.length === 0) return null;
    var lacking = required.filter(requirementApplies);
    return { done: lacking.length === 0, label: "Tools", text: lacking.length === 0 ? "Done" : "To do",
        tone: lacking.length === 0 ? "success" : "warning",
        hint: lacking.length === 0 ? "Every required tool is installed" : toolsText(lacking),
        button: lacking.length === 0 ? null : reviewButton() };
}
function setupSections(tuis, status, requirements) {
    var steps = status.filter(declaresStep);
    var ordered = steps.filter(stepOpen).concat(steps.filter(function (entry) { return !stepOpen(entry); }));
    var items = [];
    ordered.forEach(function (entry) {
        items.push({ key: entry.key, slot: entry.key + ":" + stepRank(entry), keys: false, entry: entry,
            label: entry.label, step: true, button: stepButton(entry), aside: asideButton(entry) });
        status.filter(function (keyList) { return keyList.step === entry.key; }).forEach(function (keyList) {
            items.push({ key: keyList.key, slot: keyList.key, keys: true, entry: keyList, label: keyList.label, step: false, button: null, aside: null });
        });
    });
    var tools = requirementStep(requirements === undefined ? [] : requirements);
    if (tools !== null) {
        var toolEntry = { key: "required-tools", label: tools.label, type: "state", setup: true, report: "reported", tone: tools.tone,
            value: { text: "" }, hint: tools.hint, info: "", link: null, action: null, aside: null };
        var toolItem = { key: toolEntry.key, slot: toolEntry.key + ":" + tools.done, keys: false, tools: true, entry: toolEntry,
            label: tools.label, step: true, button: tools.button, aside: null };
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
// The action ENTRY's line offers while the plugin is on: { kind, key,
// name, label, tone, enabled, reason }. A primary status action always
// uses the status route, including when it opens a TUI, so its refusal
// and the successful retry belong to the same entry. Null while none is
// offered.
function stepButton(entry) {
    if (entry.action === null || !entry.action.offered) return null;
    return { kind: "status", key: entry.key + " " + entry.action.label, name: entry.action.tui,
        label: entry.action.label, tone: entry.action.tone, enabled: true, reason: "" };
}
function asideButton(entry) {
    if (entry.aside === null || !entry.aside.offered) return null;
    return { kind: "tui", key: entry.key + " " + entry.aside.label, name: entry.aside.tui, label: entry.aside.label, tone: entry.aside.tone, enabled: true, reason: "" };
}
// The one action a page offers for a plugin that is off, which turns it on
// through the Enabled switch's route, and why its screens take no press.
function turnOn(name) { return { kind: "enable", key: "enable", name: "", label: "Turn on " + name, tone: "", enabled: true, reason: "" }; }
function offReason(name) { return "Turn on " + name + " first"; }
// The action a line draws for PLUGIN, { enabled, name }: BUTTON, the one
// its entry offers, while the plugin is on; while it is off, Turn on for a
// line that holds work (OPEN), a To do step or an action field, else none,
// since the page reads the plugin's settings alone while it is off.
function lineAction(button, open, plugin) {
    if (!plugin.enabled) return open ? turnOn(plugin.name) : null;
    return button;
}
// The listed screens TUIS that NAMES holds, as buttons: disabled while
// PLUGIN is off, with the reason.
function screenButtons(tuis, names, plugin) {
    return tuis.filter(function (tui) { return names.indexOf(tui.name) !== -1; }).map(function (tui) {
        return { kind: "tui", key: tui.name + " " + tui.label + " " + plugin.enabled, name: tui.name, label: tui.label, tone: "", enabled: plugin.enabled, reason: plugin.enabled ? "" : offReason(plugin.name) };
    });
}
// The listed screens a page draws apart from its fields: PLACE "Settings",
// a configuration screen's More settings link, or "Details", a task, each
// one no status entry and no field declares.
function freeScreens(tuis, status, place, plugin) {
    var declared = [];
    status.forEach(function (entry) { declared = declared.concat(entry.declaredTuis); });
    return screenButtons(tuis, tuis.filter(function (tui) {
        return declared.indexOf(tui.name) === -1 && (place === "Settings" ? tui.settings : !tui.settings && tui.setting === "");
    }).map(function (tui) { return tui.name; }), plugin);
}
// Why BUTTONS take no press, "" while they do: they all take none while
// their plugin is off, for one reason (screenButtons).
function withheldHint(buttons) {
    var held = buttons.filter(function (button) { return !button.enabled; });
    return held.length === 0 ? "" : held[0].reason;
}

// What a Settings page draws for FIELD, one row of the manager row's
// `fieldRows` (PluginLogic.fieldRows), from ROW, that manager row, for
// PLUGIN, { enabled, name }: the lines under the field's control, in drawn
// order, each { slot, kind, label, key, hint, lines, action, aside, more }.
// An action field has no control, so its first line is its head and takes
// the field's label: its own entry's line, else its screens', else its
// tools'. `kind` is `own`, the field's one entry, with no label of its own
// beside a control; `entry`, one of two or more, with its label; `keys`, a
// key list; `screens`, the field's listed screens; or `tools`, its optional
// tools by title, with the Review action while one is missing or outdated.
// KEY names the entry the line draws, HINT what the line reads where its
// entry has no hint, or what a line with no entry reads, LINES what it
// reads under that, ACTION and ASIDE its actions (lineAction), and MORE its
// further actions.
function featureRow(field, row, plugin) {
    var spec = row.schema[field.key], acting = spec.type === "action";
    var description = spec.description === undefined ? "" : spec.description;
    var head = acting;
    var lines = [];
    function entryOf(key) { return row.status.find(function (entry) { return entry.key === key; }) || null; }
    // An entry the row no longer holds, such as a state published hidden,
    // draws no line.
    function entryLine(kind, key, label) {
        var entry = entryOf(key);
        if (entry === null) return;
        lines.push({ slot: kind + " " + key, kind: kind, label: label, key: key, hint: head ? description : "", lines: [],
            action: lineAction(stepButton(entry), head, plugin), aside: plugin.enabled ? asideButton(entry) : null, more: [] });
        head = false;
    }
    if (field.own !== "") entryLine("own", field.own, acting ? spec.label : "");
    field.entries.forEach(function (key) {
        var entry = entryOf(key);
        if (entry !== null) entryLine("entry", key, entry.label);
    });
    field.keyLists.forEach(function (key) {
        if (entryOf(key) !== null) lines.push({ slot: "keys " + key, kind: "keys", label: "", key: key, hint: "", lines: [], action: null, aside: null, more: [] });
    });
    var screens = screenButtons(row.tuis, field.screens, plugin);
    if (screens.length > 0) {
        var off = head && !plugin.enabled;
        lines.push({ slot: "screens", kind: "screens", label: head ? spec.label : "", key: "", hint: head ? description : withheldHint(screens), lines: [],
            action: off ? turnOn(plugin.name) : null, aside: null, more: off ? [] : screens });
        head = false;
    }
    var tools = row.requirements.filter(function (requirement) { return field.tools.indexOf(requirement.name) !== -1; });
    if (tools.length > 0) {
        var review = tools.some(requirementApplies) ? reviewButton() : null;
        var enable = head && !plugin.enabled;
        lines.push({ slot: "tools", kind: "tools", label: head ? spec.label : "", key: "", hint: "Tools: " + toolsText(tools),
            lines: head && description !== "" ? [description] : [], action: enable ? turnOn(plugin.name) : review, aside: null,
            more: enable && review !== null ? [review] : [] });
    }
    return lines;
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
