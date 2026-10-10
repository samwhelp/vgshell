#!/usr/bin/env node
// vgs.cloud-sync's pure decisions, shell/plugins/vgs.cloud-sync/
// CloudSyncLogic.js: the judge of the runner's status record and probe
// answer, the headline, the status values the service publishes, what the
// bar widget, its tooltip and the window draw, the notification, and when
// idle data turns old. One table holds a row per state of the sync and
// pins the headline's words and tone; every surface (the bar's tone, icon
// and count, the tooltip's title, the window's subtitle and the Settings
// `sync` value) must read that one headline. The words are pinned because
// the issue (VGS-1314) makes them the contract of the four surfaces. The
// tooltip and the Settings lines never carry a file name, and the Google
// account a sign-in stored reaches the sign-in hint alone.
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
const ADDRESS = "a.person@example.com";

// A record as bin/cloud-sync renderStatus writes it: a download pair that
// synced an hour ago, an upload pair whose sign-in Google refused, and one
// conflict of each kind.
const DOCS = { id: "docs", label: "Documents", direction: "pull", state: "idle", lastSuccess: iso(NOW - HOUR), staleAfter: iso(NOW + HOUR), lastError: null, changes: { added: 1, updated: 0 } };
const INBOX = { id: "inbox", label: "Agent uploads", direction: "upload", state: "authorization-required", lastSuccess: iso(NOW - 2 * HOUR), staleAfter: iso(NOW), lastError: { kind: "authorization-refused", at: iso(NOW - 60000), exit: 1 }, changes: null };
const CONFLICTS = [
    { kind: "local-edit", pair: "docs", pairLabel: "Documents", path: "taxes/2025.xlsx", localPath: "/home/me/gdrive/taxes/2025.xlsx", storedPath: "/home/me/.local/state/vgshell/cloud-sync/pairs/docs/conflicts/20261010T110000Z-7/taxes/2025.xlsx", since: iso(NOW - HOUR) },
    { kind: "removed-on-drive", pair: "docs", pairLabel: "Documents", path: "old.txt", localPath: "/home/me/gdrive/old.txt", since: iso(NOW - HOUR) },
    { kind: "renamed", pair: "inbox", pairLabel: "Agent uploads", path: "a.txt", to: "b.txt", localPath: "/home/me/outbox/a.txt", since: iso(NOW - HOUR) }
];
function record(over) {
    return Object.assign({
        state: "authorization-required",
        paused: false,
        units: "installed",
        lastSuccess: iso(NOW - HOUR),
        staleAfter: iso(NOW + HOUR),
        lastError: { kind: "authorization-refused", at: iso(NOW - 60000), pair: "inbox", exit: 1 },
        pairs: [DOCS, INBOX],
        conflicts: CONFLICTS,
        attention: { reasons: ["authorization-required", "conflicts"], key: "0123456789abcdef", notified: false },
        writtenAt: iso(NOW)
    }, over || {});
}
// A world with nothing wrong: one current download pair, no conflict.
const WELL = { state: "idle", lastError: null, pairs: [DOCS], conflicts: [], attention: null };
const well = over => record(Object.assign({}, WELL, over || {}));

// The probe answer: every key present, the download token with the
// account it signed in as, every key needed.
const ACCOUNTS = ["pull-client-id", "pull-client-secret", "pull-token", "upload-client-id", "upload-client-secret", "upload-token"];
function probe(over) {
    return { credentials: ACCOUNTS.map(account => Object.assign({ account, presence: "present", needed: true }, account === "pull-token" ? { user: ADDRESS } : {}, (over || {})[account] || {})) };
}

// The bar's tone for each headline tone, stated here apart from the logic.
const BAR = { ok: "calm", info: "calm", warning: "warning", danger: "danger" };

const SIGNED_OUT = "Google Drive is not signed in for Download. Select Sign in on the Cloud Sync page in Settings.";
const INVALID = "The folder pair list is not valid, so Cloud Sync copies nothing.";
const signedOut = { kind: "credential-absent", account: "pull-token" };
// The pair list the runner could not read: it reads no pair and refuses
// every pair change (bin/cloud-sync readPairs).
const invalid = () => record({ state: "error", lastError: { kind: "pairs-invalid", detail: "pair=docs rule=repository-inside" }, pairs: [], conflicts: [], attention: { reasons: ["error"], key: "k", notified: false } });

// One row per state of the sync: the record, then the headline's text,
// tone and icon every surface must show, the Settings hint, and whether
// the bar hides its icon.
const STATES = [
    ["first run", { state: "not-set-up", units: "absent", lastSuccess: null, staleAfter: null, lastError: null, pairs: [], conflicts: [], attention: null }, "Not set up", "warning", "cloud", undefined, true],
    ["no keys", well({ state: "authorization-required", pairs: [Object.assign({}, DOCS, { state: "authorization-required", lastError: { kind: "credential-absent", account: "pull-client-id" } })], lastError: { kind: "credential-absent", account: "pull-client-id", pair: "docs" } }), "Sign-in needed", "danger", "cloud-alert", "A Google Drive key is missing. Add it on the Cloud Sync page in Settings."],
    ["no folder pair", { state: "not-set-up", units: "installed", lastSuccess: null, staleAfter: null, lastError: null, pairs: [], conflicts: [], attention: null }, "No folder pairs", "warning", "cloud", undefined, true],
    ["pair list not readable", invalid(), "Sync failed", "danger", "cloud-alert", INVALID, false],
    ["signed out", well({ state: "authorization-required", pairs: [Object.assign({}, DOCS, { state: "authorization-required", lastError: signedOut })], lastError: Object.assign({ pair: "docs" }, signedOut) }), "Sign-in needed", "danger", "cloud-alert", SIGNED_OUT],
    ["syncing while another pair needs a sign-in", record({ state: "running", pairs: [Object.assign({}, DOCS, { state: "running" }), INBOX], conflicts: [] }), "Sign-in needed", "danger", "cloud-alert", "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings."],
    ["syncing while another pair failed", well({ state: "running", pairs: [Object.assign({}, DOCS, { state: "running" }), Object.assign({}, INBOX, { state: "error", lastError: { kind: "source-missing" } })], lastError: { kind: "source-missing", pair: "inbox" }, conflicts: CONFLICTS.slice(0, 1) }), "Sync failed", "danger", "cloud-alert", "A Google Drive folder of a folder pair does not exist."],
    ["empty review", well(), "Up to date", "ok", "cloud-check", undefined],
    ["data old", well({ staleAfter: iso(NOW) }), "Out of date", "warning", "cloud-alert", undefined],
    ["never synced", well({ lastSuccess: null, staleAfter: null }), "Not synced yet", "info", "cloud", undefined],
    ["syncing", well({ state: "running" }), "Syncing", "info", "cloud-sync", undefined],
    ["paused", well({ state: "paused", paused: true }), "Paused", "info", "cloud-off", undefined],
    ["error", well({ state: "error", lastError: { kind: "source-missing", pair: "docs" } }), "Sync failed", "danger", "cloud-alert", "A Google Drive folder of a folder pair does not exist."],
    ["offline", well({ state: "offline", lastError: { kind: "offline", pair: "docs" } }), "Offline", "warning", "cloud-off", "Google Drive cannot be reached. Cloud Sync tries again at the next sync."],
    ["sign-in needed", record({ conflicts: [] }), "Sign-in needed", "danger", "cloud-alert", "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings."],
    ["set up with files to review", well({ conflicts: CONFLICTS.slice(0, 2) }), "2 files to review", "warning", "cloud-alert", "Open Cloud Sync to review them."],
    ["one file to review", well({ conflicts: CONFLICTS.slice(1, 2) }), "1 file to review", "warning", "cloud-alert", "Open Cloud Sync to review them."],
    ["files to review while paused", well({ state: "paused", paused: true, conflicts: CONFLICTS.slice(0, 2) }), "2 files to review", "warning", "cloud-alert", "Open Cloud Sync to review them."],
    ["sign-in needed with files to review", record(), "Sign-in needed", "danger", "cloud-alert", "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings."]
];

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
        ["a pair of no direction", JSON.stringify(record({ pairs: [Object.assign({}, DOCS, { direction: "both" })] })), "status=pairs"],
        ["a conflict with a relative path", JSON.stringify(record({ conflicts: [Object.assign({}, CONFLICTS[1], { localPath: "gdrive/old.txt" })] })), "status=conflicts"],
        ["a local edit with no kept copy", JSON.stringify(record({ conflicts: [Object.assign({}, CONFLICTS[0], { storedPath: undefined })] })), "status=conflicts"],
        ["attention with no key", JSON.stringify(record({ attention: { reasons: [], notified: false } })), "status=attention"],
        ["attention with no notified", JSON.stringify(record({ attention: { reasons: [], key: "k" } })), "status=attention"]
    ];
    for (const [label, text, error] of bad) same(L.parseStatus(text), { ok: false, error }, label);

    // The probe judge: a token's row may carry the account it signed in
    // as; no other row may, and a value that is no address is refused.
    const judged = L.parseProbe(JSON.stringify(probe({ "pull-token": { presence: "locked" } })));
    assert.equal(judged.ok, true, JSON.stringify(judged));
    same(judged.presence["pull-token"], { presence: "locked", needed: true, user: ADDRESS });
    assert.equal(Object.prototype.hasOwnProperty.call(judged.presence["upload-token"], "user"), false, "no user read leaves it out");
    same(L.parseProbe(JSON.stringify({ credentials: probe().credentials.slice(1) })), { ok: false, error: "probe=missing account=pull-client-id" });
    same(L.parseProbe(JSON.stringify({ credentials: [{ account: "pull-token", presence: "maybe", needed: true }] })), { ok: false, error: "probe=credential" });
    const users = [
        ["a user on a client row", { "pull-client-id": { user: ADDRESS } }, "probe=user account=pull-client-id"],
        ["two @", { "upload-token": { user: "a@b@example.com" } }, "probe=user account=upload-token"],
        ["no @", { "upload-token": { user: "a.person.example.com" } }, "probe=user account=upload-token"],
        ["a line break", { "upload-token": { user: "a.person@example.com\nx" } }, "probe=user account=upload-token"],
        ["empty", { "upload-token": { user: "" } }, "probe=user account=upload-token"],
        ["too long", { "upload-token": { user: "a".repeat(243) + "@example.com" } }, "probe=user account=upload-token"],
        ["not text", { "upload-token": { user: 7 } }, "probe=user account=upload-token"]
    ];
    for (const [label, over, error] of users) same(L.parseProbe(JSON.stringify(probe(over))), { ok: false, error }, label);
    assert.equal(L.parseProbe(JSON.stringify(probe({ "upload-token": { user: "a".repeat(242) + "@example.com" } }))).ok, true, "254 characters fit");

    // A pair's state: idle reads by the data's age.
    const pairStates = [
        ["idle, current", "idle", NOW + 1, "Up to date", "ok"],
        ["idle, old", "idle", NOW, "Out of date", "warning"],
        ["idle, never synced", "idle", null, "Not synced yet", "info"],
        ["running", "running", null, "Syncing", "info"],
        ["paused", "paused", null, "Paused", "info"],
        ["offline", "offline", null, "Offline", "warning"],
        ["sign-in", "authorization-required", null, "Sign-in needed", "danger"],
        ["failed", "error", null, "Sync failed", "danger"]
    ];
    for (const [label, state, staleAfter, text, tone] of pairStates) {
        const v = L.stateView(state, staleAfter, NOW);
        same([v.text, v.tone], [text, tone], label);
    }
    assert.throws(() => L.stateView("busy", null, NOW), /state "busy"/);

    // The headline, and every surface reading it.
    assert.equal(L.headline(undefined, NOW), null, "no record, no headline");
    for (const [label, rec, text, tone, icon, hint, hidden] of STATES) {
        const cloud = L.cloudValue(rec, "");
        const head = L.headline(cloud, NOW);
        same([head.text, head.tone, head.icon], [text, tone, icon], label + ": headline");
        const sync = L.statusValues(rec, null, "", NOW).sync;
        same([sync.text, sync.tone, sync.hint], [text, tone, hint], label + ": the Settings sync value");
        const window = L.windowStatus(cloud, NOW, Timestamp.text);
        same([window.text, window.tone], [text, tone], label + ": the window subtitle");
        const tip = L.widgetTooltip(cloud, NOW, Timestamp.text);
        assert.equal(tip.title, "Cloud Sync: " + text, label + ": the tooltip title");
        const bar = L.widgetView(cloud, NOW);
        if (hidden === true) {
            assert.equal(bar.hidden, true, label + ": no folder pair hides the icon");
            continue;
        }
        same([bar.hidden, bar.tone, bar.icon, bar.badge], [false, BAR[tone], icon, cloud.conflictCount > 0 ? String(cloud.conflictCount) : ""], label + ": the bar");
        assert.equal(bar.spinning, rec.state === "running", label + ": the spinner");
    }

    // The published values of the record and the probe.
    const presence = L.parseProbe(JSON.stringify(probe())).presence;
    const values = L.statusValues(good.record, presence, "", NOW);
    same(Object.keys(values).sort(), ["cloud", "download", "downloadKeys", "lastSync", "pairs", "schedule", "sync", "upload", "uploadKeys"]);
    same(values.sync.lines, ["Documents: Up to date", "Agent uploads: Sign-in needed"], "a line per pair, up to date on its own line");
    assert.equal(values.lastSync, NOW - HOUR);
    same(Object.keys(L.statusValues(null, null, "", NOW)), [], "nothing is published before the first answers");
    same(Object.keys(L.statusValues(null, presence, "", NOW)).sort(), ["download", "downloadKeys", "upload", "uploadKeys"]);

    // schedule: the hourly units.
    const hourly = "Cloud Sync runs every hour while you are logged in.";
    same(L.scheduleValue("installed"), { tone: "ok", text: "On", hint: hourly });
    same(L.scheduleValue("absent"), { tone: "warning", text: "Not set up", action: true, hint: hourly });
    same(L.scheduleValue("stale"), { tone: "warning", text: "Needs setup", action: true, hint: hourly });
    same(values.schedule, L.scheduleValue("installed"));

    // pairs: each pair's direction, Add while none, Remove once one exists.
    const pairsOf = rec => L.pairsValue(L.cloudValue(rec, ""));
    same(pairsOf(well({ state: "not-set-up", pairs: [] })), { tone: "warning", text: "None", action: "add", hint: "Add a folder pair to choose what Cloud Sync keeps in step." });
    same(values.pairs, { tone: "ok", text: "2 folder pairs", lines: ["Documents: Download", "Agent uploads: Upload"], action: "remove" });
    same(pairsOf(well()).text, "1 folder pair");
    same(pairsOf(invalid()), { tone: "danger", text: "Not readable", hint: INVALID }, "an unreadable list offers no change the runner refuses");
    assert.equal(L.pairListValid(L.cloudValue(invalid(), "")), false);
    assert.equal(L.pairListValid(L.cloudValue(well(), "")), true);

    // downloadKeys and uploadKeys: each direction's client, the account
    // the masked field stores; an unused key says so once a pair exists.
    same(values.downloadKeys, [{ label: "Client ID", value: "present", secret: "pull-client-id" }, { label: "Client secret", value: "present", secret: "pull-client-secret" }]);
    same(values.uploadKeys, [{ label: "Client ID", value: "present", secret: "upload-client-id" }, { label: "Client secret", value: "present", secret: "upload-client-secret" }]);
    const onlyDownload = L.parseProbe(JSON.stringify(probe({ "upload-client-id": { needed: false, presence: "absent" }, "upload-client-secret": { needed: false }, "upload-token": { needed: false } }))).presence;
    same(L.keyItems(onlyDownload, "upload").map(k => [k.secret, k.value, k.hint]), [["upload-client-id", "absent", "No folder pair uses this key now."], ["upload-client-secret", "present", "No folder pair uses this key now."]], "an unused key says so");
    assert.ok(L.keyItems(onlyDownload, "pull").every(k => k.hint === undefined), "a used key carries no hint");
    const noPair = L.parseProbe(JSON.stringify({ credentials: probe().credentials.map(c => Object.assign({}, c, { needed: false })) })).presence;
    assert.ok(L.keyItems(noPair, "upload").every(k => k.hint === undefined), "with no folder pair no key reads unused");

    // download and upload: the sign-in of each direction.
    const withUser = (user, extra) => L.parseProbe(JSON.stringify(probe(Object.assign({ "upload-token": user === undefined ? {} : { user } }, extra || {})))).presence;
    const signIn = [
        ["keyring locked", withUser(undefined, { "upload-token": { presence: "locked" } }), null, { tone: "warning", text: "Keyring locked", hint: "Unlock your keyring to sync." }],
        ["keyring unreadable", withUser(undefined, { "upload-client-id": { presence: "unavailable" } }), null, { tone: "warning", text: "Unknown", hint: "VGS cannot read your keyring." }],
        ["no client", withUser(undefined, { "upload-client-secret": { presence: "absent" }, "upload-token": { presence: "absent" } }), null, { tone: "info", text: "Not signed in", hint: "Add the client ID and secret first." }],
        ["no sign-in", withUser(undefined, { "upload-token": { presence: "absent" } }), null, { tone: "warning", text: "Not signed in", action: "signIn" }],
        ["refused", withUser(ADDRESS), good.record, { tone: "danger", text: "Sign-in refused", action: "reconnect", hint: "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings." }],
        ["signed in with the account", withUser(ADDRESS), null, { tone: "ok", text: "Signed in", hint: "Signed in as " + ADDRESS + ".", action: "signOut" }],
        ["signed in, account unknown", withUser(undefined), null, { tone: "ok", text: "Signed in", hint: "Signed in.", action: "signOut" }],
        ["signed in, account too long for a hint", withUser("a".repeat(200) + "@example.com"), null, { tone: "ok", text: "Signed in", hint: "Signed in.", action: "signOut" }]
    ];
    for (const [label, p, rec, want] of signIn) same(L.signInValue(p, "upload", rec), want, "upload: " + label);
    same(values.download, { tone: "ok", text: "Signed in", hint: "Signed in as " + ADDRESS + ".", action: "signOut" }, "the download pair is not refused");
    same(values.upload, { tone: "danger", text: "Sign-in refused", action: "reconnect", hint: "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings." });
    // The account reaches the sign-in hint alone.
    for (const key of Object.keys(values).filter(k => k !== "download" && k !== "upload"))
        assert.ok(!JSON.stringify(values[key]).includes(ADDRESS), "the account shows in " + key);

    // The window's data: times as milliseconds, each conflict with the
    // folders Open folders opens, the list capped under the ceiling.
    const cloud = values.cloud;
    same(cloud.conflicts.map(c => c.dirs), [
        ["/home/me/gdrive/taxes", "/home/me/.local/state/vgshell/cloud-sync/pairs/docs/conflicts/20261010T110000Z-7/taxes"],
        ["/home/me/gdrive"],
        ["/home/me/outbox"]
    ]);
    assert.equal(cloud.conflicts[2].to, "b.txt");
    const many = record({ conflicts: Array.from({ length: 500 }, (_, i) => Object.assign({}, CONFLICTS[1], { path: "f" + i + ".txt", localPath: "/home/me/gdrive/" + "x".repeat(3000) + "/f" + i + ".txt" })) });
    const capped = L.cloudValue(many, "");
    assert.equal(capped.conflictCount, 500);
    assert.ok(capped.conflicts.length > 0 && capped.conflicts.length <= L.CONFLICTS_MAX);
    assert.ok(JSON.stringify(capped).length <= L.CLOUD_BYTES_MAX, "the data stays under its ceiling");
    assert.equal(L.moreConflicts(capped), (500 - capped.conflicts.length) + " more files to review");

    // Writes: a key the next values lack is cleared with null.
    same(L.changedKeys({ sync: 1, lastSync: 5 }, { sync: 1 }), ["lastSync"]);
    same(L.changedKeys({ lastSync: null }, { lastSync: null }), []);

    // The tooltip: pairs and states, never a file name; the count of files
    // to review when the headline does not say it.
    const tip = L.widgetTooltip(cloud, NOW, Timestamp.text);
    same(tip.details.split("\n"), ["Documents: Up to date", "Agent uploads: Sign-in needed", "3 files to review", "Last sync " + Timestamp.text(NOW - HOUR, NOW)]);
    same(L.widgetTooltip(L.cloudValue(well({ conflicts: CONFLICTS.slice(0, 2) }), ""), NOW, Timestamp.text).details.split("\n"), ["Documents: Up to date", "Last sync " + Timestamp.text(NOW - HOUR, NOW)], "the headline says the count once");
    same(L.widgetTooltip(undefined, NOW, Timestamp.text), { title: "Cloud Sync", details: "" });
    for (const text of [tip.title, tip.details].concat(values.sync.lines))
        for (const c of CONFLICTS) assert.ok(!text.includes(c.path) && !text.includes(c.localPath), "a file name shows: " + text);

    // The window: the subtitle's lines, each pair's direction in the long
    // form, the review list under each pair's label.
    const subtitle = w => w.lines.map(l => [l.text, l.tone]);
    same(subtitle(L.windowStatus(cloud, NOW, Timestamp.text)), [
        ["Last complete sync " + Timestamp.text(NOW - HOUR, NOW), ""],
        ["Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings.", "danger"]
    ]);
    same(subtitle(L.windowStatus(L.cloudValue(well({ state: "paused", paused: true, lastSuccess: null, staleAfter: null }), "VGS could not pause Cloud Sync."), NOW, Timestamp.text)), [
        ["No complete sync yet", ""], ["The hourly sync copies nothing until you resume it.", ""], ["VGS could not pause Cloud Sync.", "danger"]
    ], "a paused headline");
    same(subtitle(L.windowStatus(L.cloudValue(well({ state: "paused", paused: true, conflicts: CONFLICTS.slice(0, 1) }), ""), NOW, Timestamp.text)), [
        ["Last complete sync " + Timestamp.text(NOW - HOUR, NOW), ""], ["Paused. The hourly sync copies nothing until you resume it.", ""]
    ], "files to review while paused say the pause");
    same(L.windowStatus(L.cloudValue(well({ state: "offline", lastError: { kind: "offline" } }), ""), NOW, Timestamp.text).lines[1], { text: "Google Drive cannot be reached. Cloud Sync tries again at the next sync.", tone: "" });
    same(L.pairRow(cloud.pairs[0], NOW), { id: "docs", label: "Documents", secondary: "Download: Google Drive to this computer", icon: "folder-down", text: "Up to date", tone: "success" });
    same(L.pairRow(cloud.pairs[1], NOW), { id: "inbox", label: "Agent uploads", secondary: "Upload: this computer to Google Drive", icon: "folder-up", text: "Sign-in needed", tone: "danger" });
    same(L.conflictGroups(cloud.conflicts).map(g => [g.label, g.rows.map(r => [r.label, r.secondary])]), [
        ["Documents", [["taxes/2025.xlsx", "Changed here and on Google Drive"], ["old.txt", "Removed from Google Drive"]]],
        ["Agent uploads", [["a.txt", "Renamed on Google Drive to b.txt"]]]
    ]);
    same(L.conflictGroups(cloud.conflicts)[1].rows[0].dirs, ["/home/me/outbox"]);

    // The notification: one per reason in order of need.
    same(L.notification(good.record), { title: "Cloud Sync needs a sign-in", message: "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings.", tone: "danger" });
    same(L.notification(record({ attention: { reasons: ["conflicts"], key: "k", notified: false } })), { title: "Cloud Sync kept files for review", message: "3 files to review. Open Cloud Sync to see them.", tone: "warning" });
    same(L.notification(record({ lastError: { kind: "offline" }, attention: { reasons: ["error"], key: "k", notified: false } })).tone, "danger");
    same(L.notification(record({ attention: { reasons: ["units-stale"], key: "k", notified: false } })), { title: "Cloud Sync needs setup", message: "Select Set up hourly sync on the Cloud Sync page in Settings.", tone: "warning" });
    assert.equal(L.notification(record({ attention: null })), null);
    same(L.notification(record({ lastError: Object.assign({ pair: "docs" }, signedOut) })).message, SIGNED_OUT, "a missing token is a sign-in");
    assert.equal(L.errorText({ kind: "credential-absent", account: "upload-token" }), "Google Drive is not signed in for Upload. Select Sign in on the Cloud Sync page in Settings.");
    assert.equal(L.errorText({ kind: "credential-absent", account: "upload-client-id" }), "A Google Drive key is missing. Add it on the Cloud Sync page in Settings.");

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
    ["the judge needs attention.notified", "\n        && typeof doc.attention.notified === \"boolean\")", ")"],
    ["a local edit keeps its stored path", "&& (c.kind !== \"local-edit\" || (isText(c.storedPath) && c.storedPath.charAt(0) === \"/\"))", ""],
    ["an address holds one @", " && value.split(\"@\").length === 2", ""],
    ["only a token's row carries a user", "(!/-token$/.test(c.account) || !isAddress(c.user))", "!isAddress(c.user)"],
    ["idle data reads by its age", "return now < staleAfter ? CURRENT : OUT_OF_DATE;", "return CURRENT;"],
    ["units absent read not set up, not no folder pair", "return cloud.units === \"absent\" ?", "return false ?"],
    ["a sign-in needed or a failure wins over files to review", "if (danger.length > 0) return", "if (false) return"],
    ["another pair's failure wins over a running sync", "return cloud.state === state || cloud.pairs.some(function (p) { return p.state === state; });", "return cloud.state === state;"],
    ["a missing token reads as a sign-in", "if (error.kind === \"credential-absent\" && hasOwn(TOKEN_DIRECTION, error.account))", "if (false)"],
    ["the published error keeps its account", "return isText(error.account) ? { kind: error.kind, account: error.account } : { kind: error.kind };", "return { kind: error.kind };"],
    ["an unreadable pair list offers no change", "if (!pairListValid(cloud)) return { tone: \"danger\"", "if (false) return { tone: \"danger\""],
    ["an unreadable pair list keeps the bar", "(cloud.pairs.length === 0 && pairListValid(cloud))", "cloud.pairs.length === 0"],
    ["files to review win over the state", "if (cloud.conflictCount > 0) return {", "if (false) return {"],
    ["the bar reads the headline", "var head = headline(cloud, now);\n    return { hidden: false", "var head = stateView(cloud.state, cloud.staleAfter, now);\n    return { hidden: false"],
    ["the tooltip reads the headline", "var head = headline(cloud, now);\n    var lines = pairLines(cloud.pairs, now);", "var head = stateView(cloud.state, cloud.staleAfter, now);\n    var lines = pairLines(cloud.pairs, now);"],
    ["the window reads the headline", "var head = headline(cloud, now);\n    var lines = [{", "var head = stateView(cloud.state, cloud.staleAfter, now);\n    var lines = [{"],
    ["the Settings sync value reads the headline", "var head = headline(cloud, now);\n    var value = {", "var head = stateView(cloud.state, cloud.staleAfter, now);\n    var value = {"],
    ["Set up hourly sync while the units are absent", "text: \"Not set up\", action: true,", "text: \"Not set up\","],
    ["Sign in again for a refused sign-in", "if (refused) return", "if (false) return"],
    ["the account reaches the sign-in hint", "var named = user === undefined ? \"\" : \"Signed in as \" + user + \".\";", "var named = \"\";"],
    ["a hint over its ceiling falls back", "named !== \"\" && named.length <= HINT_MAX ? named", "named !== \"\" ? named"],
    ["a locked keyring comes first", "if (states.indexOf(\"locked\") !== -1) return", "if (false) return"],
    ["a local edit opens its kept copy's folder", "if (conflict.kind === \"local-edit\") dirs.push(dirname(conflict.storedPath));", ""],
    ["the review list stays under its ceiling", "while (value.conflicts.length > 0 && JSON.stringify(value).length > CLOUD_BYTES_MAX) value.conflicts.pop();", ""],
    ["a cleared key is written as null", "if (!hasOwn(next, k) && previous[k] !== null) keys.push(k);", ""],
    ["the tooltip names pairs, not files", "var lines = pairLines(cloud.pairs, now);\n    if (cloud.conflictCount > 0 && head.cause", "var lines = pairLines(cloud.pairs, now).concat(cloud.conflicts.map(function (c) { return c.path; }));\n    if (cloud.conflictCount > 0 && head.cause"],
    ["the window says a pause", "    if (cloud.paused)\n", "    if (false)\n"],
    ["a review group holds each pair's files", "if (group === undefined) {", "if (true) {"],
    ["a sign-in notifies first", "if (reasons.indexOf(\"authorization-required\") !== -1)\n", "if (false)\n"],
    ["no file to review draws no count", "cloud.conflictCount > 0 ? String(cloud.conflictCount) : \"\"", "String(cloud.conflictCount)"],
    ["no folder pair hides the icon", "if (cloud === undefined || cloud === null || (cloud.pairs.length === 0 && pairListValid(cloud))) return", "if (cloud === undefined || cloud === null) return"],
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
