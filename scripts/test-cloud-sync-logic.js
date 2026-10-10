#!/usr/bin/env node
// vgs.cloud-sync's pure decisions, shell/plugins/vgs.cloud-sync/
// CloudSyncLogic.js: the judge of the runner's status record and probe
// answer, the status values the service publishes, the Setup step it
// offers, what the bar widget, its tooltip and the window draw, the
// notification, and when idle data turns old. The tooltip and the
// Settings lines never carry a file name.
// Controls edit a copy of the logic, one rule each, and require this suite
// to fail on it.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { load } = require("../bin/lib/qml-library.js");

const file = path.join(__dirname, "..", "shell", "plugins", "vgs.cloud-sync", "CloudSyncLogic.js");
const Timestamp = load(path.join(__dirname, "..", "shell", "Commons", "Timestamp.js"));
const same = (got, want, message) => assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), message || "");

const NOW = Date.parse("2026-10-10T12:00:00Z");
const HOUR = 3600 * 1000;
const iso = ms => new Date(ms).toISOString();

// A record as bin/cloud-sync renderStatus writes it: a download pair that
// synced an hour ago, an upload pair whose sign-in Google refused, and one
// conflict of each kind.
function record(over) {
    return Object.assign({
        state: "authorization-required",
        paused: false,
        units: "installed",
        lastSuccess: iso(NOW - HOUR),
        staleAfter: iso(NOW + HOUR),
        lastError: { kind: "authorization-refused", at: iso(NOW - 60000), pair: "inbox", exit: 1 },
        pairs: [
            { id: "docs", label: "Documents", direction: "pull", state: "idle", lastSuccess: iso(NOW - HOUR), staleAfter: iso(NOW + HOUR), lastError: null, changes: { added: 1, updated: 0 } },
            { id: "inbox", label: "Agent uploads", direction: "upload", state: "authorization-required", lastSuccess: iso(NOW - 2 * HOUR), staleAfter: iso(NOW), lastError: { kind: "authorization-refused", at: iso(NOW - 60000), exit: 1 }, changes: null }
        ],
        conflicts: [
            { kind: "local-edit", pair: "docs", pairLabel: "Documents", path: "taxes/2025.xlsx", localPath: "/home/me/gdrive/taxes/2025.xlsx", storedPath: "/home/me/.local/state/vgshell/cloud-sync/pairs/docs/conflicts/20261010T110000Z-7/taxes/2025.xlsx", since: iso(NOW - HOUR) },
            { kind: "removed-on-drive", pair: "docs", pairLabel: "Documents", path: "old.txt", localPath: "/home/me/gdrive/old.txt", since: iso(NOW - HOUR) },
            { kind: "renamed", pair: "docs", pairLabel: "Documents", path: "a.txt", to: "b.txt", localPath: "/home/me/gdrive/a.txt", since: iso(NOW - HOUR) }
        ],
        attention: { reasons: ["authorization-required", "conflicts"], key: "0123456789abcdef" },
        writtenAt: iso(NOW)
    }, over || {});
}

const PROBE = { credentials: ["pull-client-id", "pull-client-secret", "pull-token", "upload-client-id", "upload-client-secret", "upload-token"]
    .map(account => ({ account, presence: account === "upload-token" ? "absent" : account === "pull-token" ? "locked" : "present", needed: !account.startsWith("upload") || true })) };

function verify(L) {
    // The record judge: the runner's record passes; each malformed field
    // is named.
    const good = L.parseStatus(JSON.stringify(record()));
    assert.equal(good.ok, true, JSON.stringify(good));
    const bad = [
        ["not JSON", "{", "status=not-json"],
        ["an unknown state", JSON.stringify(record({ state: "busy" })), "status=state"],
        ["paused as text", JSON.stringify(record({ paused: "no" })), "status=paused"],
        ["unknown units", JSON.stringify(record({ units: "maybe" })), "status=units"],
        ["a time that is no time", JSON.stringify(record({ lastSuccess: "yesterday" })), "status=time"],
        ["a pair of no direction", JSON.stringify(record({ pairs: [Object.assign({}, record().pairs[0], { direction: "both" })] })), "status=pairs"],
        ["a conflict with a relative path", JSON.stringify(record({ conflicts: [Object.assign({}, record().conflicts[1], { localPath: "gdrive/old.txt" })] })), "status=conflicts"],
        ["a local edit with no kept copy", JSON.stringify(record({ conflicts: [Object.assign({}, record().conflicts[0], { storedPath: undefined })] })), "status=conflicts"],
        ["attention with no key", JSON.stringify(record({ attention: { reasons: [] } })), "status=attention"]
    ];
    for (const [label, text, error] of bad) same(L.parseStatus(text), { ok: false, error }, label);

    // The probe judge.
    const probe = L.parseProbe(JSON.stringify(PROBE));
    assert.equal(probe.ok, true);
    assert.equal(probe.presence["pull-token"].presence, "locked");
    same(L.parseProbe(JSON.stringify({ credentials: PROBE.credentials.slice(1) })), { ok: false, error: "probe=missing account=pull-client-id" });
    same(L.parseProbe(JSON.stringify({ credentials: [{ account: "pull-token", presence: "maybe", needed: true }] })), { ok: false, error: "probe=credential" });

    // States: idle reads by the data's age.
    const states = [
        ["idle, current", "idle", NOW + 1, "Up to date", "ok"],
        ["idle, old", "idle", NOW, "Out of date", "warning"],
        ["idle, never synced", "idle", null, "Not synced yet", "info"],
        ["running", "running", null, "Syncing", "info"],
        ["paused", "paused", null, "Paused", "info"],
        ["offline", "offline", null, "Offline", "warning"],
        ["sign-in", "authorization-required", null, "Sign-in needed", "danger"],
        ["failed", "error", null, "Sync failed", "danger"],
        ["not set up", "not-set-up", null, "Not set up", "warning"]
    ];
    for (const [label, state, staleAfter, text, tone] of states) {
        const v = L.stateView(state, staleAfter, NOW);
        same([v.text, v.tone], [text, tone], label);
    }
    assert.throws(() => L.stateView("busy", null, NOW), /state "busy"/);

    // The published values.
    const values = L.statusValues(good.record, probe.presence, "", NOW);
    same(values.sync, {
        tone: "danger", text: "Sign-in needed",
        lines: ["Documents: Up to date", "Agent uploads: Sign-in needed", "3 files to review"],
        hint: "Google Drive did not accept the sign-in. Connect Google Drive again.",
        action: "connectUpload"
    }, "the Setup status names each pair and offers the refused direction's Connect");
    assert.equal(values.lastSync, NOW - HOUR);
    same(values.keys.map(k => [k.secret, k.value]), [["pull-client-id", "present"], ["pull-client-secret", "present"], ["pull-token", "locked"], ["upload-client-id", "present"], ["upload-client-secret", "present"], ["upload-token", "absent"]]);
    assert.ok(values.keys.every(k => k.hint === undefined), "every key is needed");
    const unused = L.parseProbe(JSON.stringify({ credentials: PROBE.credentials.map(c => Object.assign({}, c, { needed: !c.account.startsWith("upload") })) }));
    same(L.statusValues(null, unused.presence, "", NOW).keys.filter(k => k.hint !== undefined).map(k => k.secret), ["upload-client-id", "upload-client-secret", "upload-token"], "an unused key says so");
    const none = L.parseProbe(JSON.stringify({ credentials: PROBE.credentials.map(c => Object.assign({}, c, { needed: false })) }));
    assert.ok(L.statusValues(null, none.presence, "", NOW).keys.every(k => k.hint === undefined), "with no folder pair no key reads unused");
    same(Object.keys(L.statusValues(null, null, "", NOW)), [], "nothing is published before the first answers");

    // The Setup step: Set up while the units are not installed; Connect for
    // a refused or missing token; none for a missing client or a locked
    // keyring, whose fix is a key or an unlock.
    const step = [
        ["units absent", { units: "absent" }, "setup"],
        ["units stale", { units: "stale" }, "setup"],
        ["download token refused", { pairs: [Object.assign({}, record().pairs[0], { state: "authorization-required", lastError: { kind: "authorization-refused" } })] }, "connectDrive"],
        ["download token missing", { pairs: [Object.assign({}, record().pairs[0], { state: "authorization-required", lastError: { kind: "credential-absent", account: "pull-token" } })] }, "connectDrive"],
        ["client missing", { pairs: [Object.assign({}, record().pairs[0], { state: "authorization-required", lastError: { kind: "credential-absent", account: "pull-client-id" } })] }, ""],
        ["keyring locked", { pairs: [Object.assign({}, record().pairs[0], { state: "authorization-required", lastError: { kind: "credential-locked", account: "pull-token" } })] }, ""],
        ["all well", { pairs: [record().pairs[0]] }, ""]
    ];
    for (const [label, over, want] of step) assert.equal(L.syncAction(record(over)), want, label);
    assert.equal(L.statusValues(record({ units: "installed", pairs: [record().pairs[0]] }), null, "", NOW).sync.action, undefined, "no step leaves no action");
    assert.equal(L.statusValues(record({ pairs: [] }), null, "", NOW).sync.hint, "Add a folder pair to choose what Cloud Sync keeps in step.");

    // The window's data: times as milliseconds, each conflict with the
    // folders Open for review opens, the list capped under the ceiling.
    const cloud = values.cloud;
    same(cloud.conflicts.map(c => c.dirs), [
        ["/home/me/gdrive/taxes", "/home/me/.local/state/vgshell/cloud-sync/pairs/docs/conflicts/20261010T110000Z-7/taxes"],
        ["/home/me/gdrive"],
        ["/home/me/gdrive"]
    ]);
    assert.equal(cloud.conflicts[2].to, "b.txt");
    const many = record({ conflicts: Array.from({ length: 500 }, (_, i) => Object.assign({}, record().conflicts[1], { path: "f" + i + ".txt", localPath: "/home/me/gdrive/" + "x".repeat(3000) + "/f" + i + ".txt" })) });
    const capped = L.cloudValue(many, "");
    assert.equal(capped.conflictCount, 500);
    assert.ok(capped.conflicts.length > 0 && capped.conflicts.length <= L.CONFLICTS_MAX);
    assert.ok(JSON.stringify(capped).length <= L.CLOUD_BYTES_MAX, "the data stays under its ceiling");
    assert.equal(L.moreConflicts(capped), (500 - capped.conflicts.length) + " more files to review");

    // Writes: a key the next values lack is cleared with null.
    same(L.changedKeys({ sync: 1, lastSync: 5 }, { sync: 1 }), ["lastSync"]);
    same(L.changedKeys({ lastSync: null }, { lastSync: null }), []);

    // The widget and its tooltip: labels and states, never a file name.
    same(L.widgetView(cloud, NOW), { hidden: false, icon: "cloud-alert", tone: "danger", spinning: false, badge: "3" });
    same(L.widgetView(L.cloudValue(record({ state: "running", conflicts: [] }), ""), NOW), { hidden: false, icon: "cloud-sync", tone: "calm", spinning: true, badge: "" }, "no file to review draws no count");
    same(L.widgetView(L.cloudValue(record({ state: "idle", attention: null }), ""), NOW), { hidden: false, icon: "cloud-check", tone: "warning", spinning: false, badge: "3" }, "files to review warn");
    same(L.widgetView(undefined, NOW), { hidden: true, icon: "cloud", tone: "calm", spinning: false, badge: "" });
    assert.equal(L.widgetView(L.cloudValue(record({ state: "not-set-up", pairs: [], conflicts: [] }), ""), NOW).hidden, true, "no folder pair hides the icon");
    const tip = L.widgetTooltip(cloud, NOW, Timestamp.text);
    assert.equal(tip.title, "Cloud Sync: Sign-in needed");
    same(tip.details.split("\n"), ["Documents: Up to date", "Agent uploads: Sign-in needed", "3 files to review", "Last sync " + Timestamp.text(NOW - HOUR, NOW)]);
    for (const text of [tip.title, tip.details].concat(values.sync.lines))
        for (const c of record().conflicts) assert.ok(!text.includes(c.path) && !text.includes(c.localPath), "a file name shows: " + text);

    // The window's rows.
    same(L.statusRows(cloud, NOW, Timestamp.text).map(r => [r.label, r.text, r.tone]), [
        ["Status", "Sign-in needed", "danger"], ["Last sync", Timestamp.text(NOW - HOUR, NOW), ""], ["Data", "Current", ""],
        ["Last problem", "Google Drive did not accept the sign-in. Connect Google Drive again.", ""]
    ]);
    same(L.pairRow(cloud.pairs[1], NOW, Timestamp.text), { label: "Agent uploads", secondary: "To Google Drive, last sync " + Timestamp.text(NOW - 2 * HOUR, NOW), icon: "folder-up", text: "Sign-in needed", tone: "danger" });
    same(L.conflictRow(cloud.conflicts[2]), { label: "a.txt", secondary: "Renamed on Google Drive to b.txt, Documents" });

    // The notification: one per reason in order of need.
    same(L.notification(good.record), { title: "Cloud Sync needs a sign-in", message: "Google Drive did not accept the sign-in. Connect Google Drive again.", tone: "danger" });
    same(L.notification(record({ attention: { reasons: ["conflicts"], key: "k" } })), { title: "Cloud Sync kept files for review", message: "3 files to review. Open Cloud Sync to see them.", tone: "warning" });
    same(L.notification(record({ lastError: { kind: "offline" }, attention: { reasons: ["error"], key: "k" } })).tone, "danger");
    same(L.notification(record({ attention: { reasons: ["units-stale"], key: "k" } })).title, "Cloud Sync needs setup");
    assert.equal(L.notification(record({ attention: null })), null);

    // A failed request reads as a sentence.
    assert.equal(L.problemText("start", "start exit=1 cloud-sync: refused: units=absent"), "Set up Cloud Sync first.");
    assert.equal(L.problemText("pause", "pause exit=1 cloud-sync: refused: state-lock=timeout"), "VGS could not pause Cloud Sync.");
    assert.equal(L.problemText("", ""), "");

    // The next moment idle data turns old.
    assert.equal(L.nextStale(record(), NOW), NOW + HOUR);
    assert.equal(L.nextStale(record({ staleAfter: null, pairs: [] }), NOW), null);
}

verify(load(file));

const controls = [
    ["the judge refuses an unknown state", "if (STATES.indexOf(doc.state) === -1) return", "if (false) return"],
    ["a local edit keeps its stored path", "&& (c.kind !== \"local-edit\" || (isText(c.storedPath) && c.storedPath.charAt(0) === \"/\"))", ""],
    ["idle data reads by its age", "return now < staleAfter ? CURRENT : OUT_OF_DATE;", "return CURRENT;"],
    ["Set up while the units are not installed", "if (record.units !== \"installed\") return \"setup\";", ""],
    ["Connect only for a refused or missing token", "if (e.kind === \"authorization-refused\" || (e.kind === \"credential-absent\" && e.account === p.direction + \"-token\"))", "if (true)"],
    ["a local edit opens its kept copy's folder", "if (conflict.kind === \"local-edit\") dirs.push(dirname(conflict.storedPath));", ""],
    ["the review list stays under its ceiling", "while (value.conflicts.length > 0 && JSON.stringify(value).length > CLOUD_BYTES_MAX) value.conflicts.pop();", ""],
    ["a cleared key is written as null", "if (!hasOwn(next, k) && previous[k] !== null) keys.push(k);", ""],
    ["files to review warn in the bar", "view.tone === \"warning\" || cloud.conflictCount > 0 ? \"warning\"", "view.tone === \"warning\" ? \"warning\""],
    ["the tooltip names pairs, not files", "var lines = pairLines(cloud.pairs, now);\n    if (cloud.conflictCount > 0) lines.push(reviewLine(cloud.conflictCount));\n    if (cloud.lastSuccess", "var lines = pairLines(cloud.pairs, now).concat(cloud.conflicts.map(function (c) { return c.path; }));\n    if (cloud.conflictCount > 0) lines.push(reviewLine(cloud.conflictCount));\n    if (cloud.lastSuccess"],
    ["a sign-in notifies first", "if (reasons.indexOf(\"authorization-required\") !== -1)\n", "if (false)\n"],
    ["no file to review draws no count", "cloud.conflictCount > 0 ? String(cloud.conflictCount) : \"\"", "String(cloud.conflictCount)"],
    ["no folder pair hides the icon", "if (cloud === undefined || cloud.pairs.length === 0) return", "if (cloud === undefined) return"],
    ["with no folder pair no key reads unused", "if (anyNeeded && !presence[account].needed)", "if (!presence[account].needed)"]
];

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "test-cloud-sync-logic-"));
try {
    const source = fs.readFileSync(file, "utf8");
    for (const [label, needle, replacement] of controls) {
        const count = source.split(needle).length - 1;
        assert.equal(count, 1, "control pattern occurs once: " + label);
        const dir = fs.mkdtempSync(path.join(scratch, "control-"));
        const mutant = path.join(dir, "CloudSyncLogic.js");
        fs.writeFileSync(mutant, source.replace(needle, replacement));
        assert.notEqual(fs.readFileSync(mutant, "utf8"), source);
        let red = false;
        try { verify(load(mutant)); } catch (e) { red = e instanceof assert.AssertionError; }
        assert.equal(red, true, "control fails without rule: " + label);
    }
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}

console.log("test-cloud-sync-logic: ok");
