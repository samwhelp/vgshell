.pragma library

// vgs.cloud-sync's pure decisions, run under node by
// scripts/test-cloud-sync-logic.js: the one judge of the runner's status
// record and probe answer, the status values the service publishes from
// them, and what the bar widget, the window and the notification draw from
// those values. The runner, bin/cloud-sync, owns every rule about the
// sync; this file only reads its answers.

// The runner's overall states and a pair's states (bin/cloud-sync,
// renderStatus).
var STATES = ["idle", "running", "paused", "offline", "authorization-required", "error", "not-set-up"];
var PAIR_STATES = ["idle", "running", "paused", "offline", "authorization-required", "error"];
var UNITS = ["installed", "absent", "stale"];
var DIRECTIONS = ["pull", "upload"];
var CONFLICT_KINDS = ["local-edit", "removed-on-drive", "renamed"];
var PRESENCES = ["present", "absent", "locked", "unavailable"];
// The credential accounts of the manifest's `secrets`, in the order the
// Setup section lists them (bin/cloud-sync probe prints the same set).
var ACCOUNTS = ["pull-client-id", "pull-client-secret", "pull-token", "upload-client-id", "upload-client-secret", "upload-token"];

// The conflicts the window lists: the published values share one 64 KiB
// ceiling (PluginLogic.STATUS_MAX_BYTES) with the rest, and a removed
// Drive folder can make thousands. The window states the rest as a count.
var CONFLICTS_MAX = 20;
var CLOUD_BYTES_MAX = 40000;

// What each state reads as and the tone it takes: `tone` is a status
// `state` tone (PluginLogic.STATUS_STATE_TONES). `idle` reads by the data's
// age (freshness).
var STATE_VIEW = {
    running: { text: "Syncing", tone: "info", icon: "cloud-sync" },
    paused: { text: "Paused", tone: "info", icon: "cloud-off" },
    offline: { text: "Offline", tone: "warning", icon: "cloud-off" },
    "authorization-required": { text: "Sign-in needed", tone: "danger", icon: "cloud-alert" },
    error: { text: "Sync failed", tone: "danger", icon: "cloud-alert" },
    "not-set-up": { text: "Not set up", tone: "warning", icon: "cloud" }
};
var CURRENT = { text: "Up to date", tone: "ok", icon: "cloud-check" };
var OUT_OF_DATE = { text: "Out of date", tone: "warning", icon: "cloud-alert" };
var NOT_SYNCED = { text: "Not synced yet", tone: "info", icon: "cloud" };
// A status state tone as a Badge tone.
var BADGE_TONES = { ok: "success", info: "info", warning: "warning", danger: "danger" };

// A run's last error, as plain text a user reads. A kind not listed here is
// a sync error.
var ERROR_TEXT = {
    offline: "Google Drive cannot be reached. Cloud Sync tries again at the next sync.",
    "authorization-refused": "Google Drive did not accept the sign-in. Connect Google Drive again.",
    "credential-absent": "A Google Drive key is missing. Add it under Setup in Settings.",
    "credential-locked": "Your keyring is locked. Unlock it to sync.",
    "source-missing": "A Google Drive folder of a folder pair does not exist.",
    "rclone-missing": "rclone is not installed.",
    "secret-tool-missing": "VGS cannot read your keyring.",
    "secret-tool-failed": "VGS cannot read your keyring.",
    "secret-tool-timeout": "VGS cannot read your keyring.",
    interrupted: "The last sync stopped before it finished.",
    "pairs-invalid": "The folder pair list is not valid. Add the folder pairs again."
};
var ERROR_DEFAULT = "The sync stopped with an error. Cloud Sync tries again at the next sync.";

var CONFLICT_TEXT = {
    "local-edit": "Changed here and on Google Drive",
    "removed-on-drive": "Removed from Google Drive",
    renamed: "Renamed on Google Drive"
};

// What a failed request to the runner reads as, by its operation.
var PROBLEM_TEXT = {
    start: "VGS could not start a sync.",
    pause: "VGS could not pause Cloud Sync.",
    resume: "VGS could not resume Cloud Sync.",
    status: "VGS could not read the Cloud Sync status.",
    probe: "VGS could not check the Google Drive keys."
};

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
    return typeof value === "string";
}

function isTime(value) {
    return value === null || (isText(value) && !isNaN(Date.parse(value)));
}

function msOf(iso) {
    return iso === null ? null : Date.parse(iso);
}

function dirname(file) {
    var at = file.lastIndexOf("/");
    return at <= 0 ? "/" : file.slice(0, at);
}

function errorOk(value) {
    return value === null || (isObject(value) && isText(value.kind));
}

function pairOk(p) {
    return isObject(p) && isText(p.id) && isText(p.label) && DIRECTIONS.indexOf(p.direction) !== -1
        && PAIR_STATES.indexOf(p.state) !== -1 && isTime(p.lastSuccess) && isTime(p.staleAfter) && errorOk(p.lastError);
}

function conflictOk(c) {
    return isObject(c) && CONFLICT_KINDS.indexOf(c.kind) !== -1 && isText(c.pairLabel) && isText(c.path)
        && isText(c.localPath) && c.localPath.charAt(0) === "/"
        && (c.kind !== "local-edit" || (isText(c.storedPath) && c.storedPath.charAt(0) === "/"))
        && (c.kind !== "renamed" || isText(c.to)) && isTime(c.since);
}

// The one judge of the runner's status record, status.json or `status`'s
// line (bin/cloud-sync renderStatus): { ok: true, record } or
// { ok: false, error } naming the first field that does not fit.
function parseStatus(text) {
    var doc;
    try {
        doc = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: "status=not-json" };
    }
    if (!isObject(doc)) return { ok: false, error: "status=shape" };
    if (STATES.indexOf(doc.state) === -1) return { ok: false, error: "status=state" };
    if (typeof doc.paused !== "boolean") return { ok: false, error: "status=paused" };
    if (UNITS.indexOf(doc.units) === -1) return { ok: false, error: "status=units" };
    if (!isTime(doc.lastSuccess) || !isTime(doc.staleAfter)) return { ok: false, error: "status=time" };
    if (!errorOk(doc.lastError)) return { ok: false, error: "status=lastError" };
    if (!Array.isArray(doc.pairs) || !doc.pairs.every(pairOk)) return { ok: false, error: "status=pairs" };
    if (!Array.isArray(doc.conflicts) || !doc.conflicts.every(conflictOk)) return { ok: false, error: "status=conflicts" };
    if (doc.attention !== null && !(isObject(doc.attention) && Array.isArray(doc.attention.reasons) && isText(doc.attention.key)))
        return { ok: false, error: "status=attention" };
    return { ok: true, record: doc };
}

// The one judge of `probe`'s line: { ok: true, presence: { account:
// { presence, needed } } } or { ok: false, error }.
function parseProbe(text) {
    var doc;
    try {
        doc = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: "probe=not-json" };
    }
    if (!isObject(doc) || !Array.isArray(doc.credentials)) return { ok: false, error: "probe=shape" };
    var presence = {};
    for (var i = 0; i < doc.credentials.length; i++) {
        var c = doc.credentials[i];
        if (!isObject(c) || ACCOUNTS.indexOf(c.account) === -1 || PRESENCES.indexOf(c.presence) === -1 || typeof c.needed !== "boolean")
            return { ok: false, error: "probe=credential" };
        presence[c.account] = { presence: c.presence, needed: c.needed };
    }
    for (var a = 0; a < ACCOUNTS.length; a++)
        if (!hasOwn(presence, ACCOUNTS[a])) return { ok: false, error: "probe=missing account=" + ACCOUNTS[a] };
    return { ok: true, presence: presence };
}

// What STATE reads as, the data's age deciding an idle one: { text, tone,
// icon }. STALE_AFTER and NOW are epoch milliseconds, STALE_AFTER null
// before the first success.
function stateView(state, staleAfter, now) {
    if (state !== "idle") {
        if (!hasOwn(STATE_VIEW, state)) throw new Error("cloud-sync: state " + JSON.stringify(state) + " is not one of " + STATES.join(", "));
        return STATE_VIEW[state];
    }
    if (staleAfter === null) return NOT_SYNCED;
    return now < staleAfter ? CURRENT : OUT_OF_DATE;
}

function badgeTone(tone) {
    return BADGE_TONES[tone];
}

function errorText(error) {
    if (error === null) return "";
    return hasOwn(ERROR_TEXT, error.kind) ? ERROR_TEXT[error.kind] : ERROR_DEFAULT;
}

function conflictText(kind) {
    return CONFLICT_TEXT[kind];
}

function problemText(operation, firstLine) {
    if (operation === "") return "";
    if (operation === "start" && firstLine.indexOf("units=absent") !== -1) return "Set up Cloud Sync first.";
    return hasOwn(PROBLEM_TEXT, operation) ? PROBLEM_TEXT[operation] : "VGS could not reach Cloud Sync.";
}

// The folders "Open for review" opens for CONFLICT: the mirror's folder,
// and for a local edit also the folder that keeps the local version.
function reviewDirs(conflict) {
    var dirs = [dirname(conflict.localPath)];
    if (conflict.kind === "local-edit") dirs.push(dirname(conflict.storedPath));
    return dirs;
}

// The status action RECORD offers (the manifest's `sync` actions): Set up
// while the units are not what install writes now; Connect for the first
// pair whose token is missing or refused, once its client is stored.
function syncAction(record) {
    if (record.units !== "installed") return "setup";
    for (var i = 0; i < record.pairs.length; i++) {
        var p = record.pairs[i];
        var e = p.lastError;
        if (p.state !== "authorization-required" || e === null) continue;
        if (e.kind === "authorization-refused" || (e.kind === "credential-absent" && e.account === p.direction + "-token"))
            return p.direction === "pull" ? "connectDrive" : "connectUpload";
    }
    return "";
}

// The published `cloud` data the widget and the window draw: the record
// with times as epoch milliseconds, the review list capped, each conflict
// with the folders Open for review opens, and the last failed request.
function cloudValue(record, problem) {
    var conflicts = record.conflicts.slice(0, CONFLICTS_MAX).map(function (c) {
        var out = { kind: c.kind, pairLabel: c.pairLabel, path: c.path, since: msOf(c.since), dirs: reviewDirs(c) };
        if (c.kind === "renamed") out.to = c.to;
        return out;
    });
    var value = {
        state: record.state,
        paused: record.paused,
        units: record.units,
        lastSuccess: msOf(record.lastSuccess),
        staleAfter: msOf(record.staleAfter),
        lastError: record.lastError === null ? null : { kind: record.lastError.kind },
        pairs: record.pairs.map(function (p) {
            return { id: p.id, label: p.label, direction: p.direction, state: p.state, lastSuccess: msOf(p.lastSuccess), staleAfter: msOf(p.staleAfter), lastError: p.lastError === null ? null : { kind: p.lastError.kind } };
        }),
        conflicts: conflicts,
        conflictCount: record.conflicts.length,
        problem: problem
    };
    while (value.conflicts.length > 0 && JSON.stringify(value).length > CLOUD_BYTES_MAX) value.conflicts.pop();
    return value;
}

// Each pair's line as the Settings status and the tooltip show it: its
// label and state, never a file name.
function pairLines(pairs, now) {
    return pairs.map(function (p) {
        return p.label + ": " + stateView(p.state, p.staleAfter, now).text;
    });
}

function reviewLine(count) {
    return count === 1 ? "1 file to review" : count + " files to review";
}

// The values the service publishes (the manifest's `status`): `sync`, the
// Setup section's status with its step; `keys`, the presence of each
// stored key; `cloud`, the data the widget and the window draw; and
// `lastSync`, the time of the last complete sync, or null to clear it.
// RECORD and PRESENCE are null until their first answer, which leaves
// their values out.
function statusValues(record, presence, problem, now) {
    var values = {};
    if (record !== null) {
        var cloud = cloudValue(record, problem);
        var view = stateView(cloud.state, cloud.staleAfter, now);
        var lines = pairLines(cloud.pairs, now);
        if (cloud.conflictCount > 0) lines.push(reviewLine(cloud.conflictCount));
        var sync = { tone: view.tone, text: view.text };
        // A state's lines are at most PluginLogic.STATUS_LIST_MAX.
        if (lines.length > 0) sync.lines = lines.slice(0, 64);
        if (cloud.pairs.length === 0) sync.hint = "Add a folder pair to choose what Cloud Sync keeps in step.";
        else if (cloud.lastError !== null) sync.hint = errorText(cloud.lastError);
        var action = syncAction(record);
        if (action !== "") sync.action = action;
        values.sync = sync;
        values.cloud = cloud;
        values.lastSync = cloud.lastSuccess;
    }
    if (presence !== null) values.keys = keyItems(presence);
    return values;
}

var KEY_LABELS = {
    "pull-client-id": "Download client ID",
    "pull-client-secret": "Download client secret",
    "pull-token": "Download sign-in",
    "upload-client-id": "Upload client ID",
    "upload-client-secret": "Upload client secret",
    "upload-token": "Upload sign-in"
};

// The `keys` presence list: one item per account, its presence and the
// account the Setup section's masked field stores. A key no folder pair
// uses says so.
function keyItems(presence) {
    return ACCOUNTS.map(function (account) {
        var item = { label: KEY_LABELS[account], value: presence[account].presence, secret: account };
        if (!presence[account].needed) item.hint = "No folder pair uses this key now.";
        return item;
    });
}

// The status keys whose value differs between PREVIOUS and NEXT, the
// values last published and those to publish: a key NEXT lacks and
// PREVIOUS holds is written as null, which clears it.
function changedKeys(previous, next) {
    var keys = Object.keys(next).filter(function (k) { return JSON.stringify(previous[k]) !== JSON.stringify(next[k]); });
    Object.keys(previous).forEach(function (k) {
        if (!hasOwn(next, k) && previous[k] !== null) keys.push(k);
    });
    return keys;
}

// The bar widget: { icon, tone, spinning, badge }, tone one of calm,
// warning and danger. CLOUD is the published value, undefined before the
// first.
function widgetView(cloud, now) {
    if (cloud === undefined) return { icon: "cloud", tone: "calm", spinning: false, badge: 0 };
    var view = stateView(cloud.state, cloud.staleAfter, now);
    var tone = view.tone === "danger" ? "danger" : view.tone === "warning" || cloud.conflictCount > 0 ? "warning" : "calm";
    return { icon: view.icon, tone: tone, spinning: cloud.state === "running", badge: cloud.conflictCount };
}

// The widget's tooltip: its title and one line per pair, its label and
// state, then the last sync's time in the shell's wording (TIME_TEXT).
function widgetTooltip(cloud, now, timeText) {
    if (cloud === undefined) return { title: "Cloud Sync", details: "" };
    var view = stateView(cloud.state, cloud.staleAfter, now);
    var lines = pairLines(cloud.pairs, now);
    if (cloud.conflictCount > 0) lines.push(reviewLine(cloud.conflictCount));
    if (cloud.lastSuccess !== null) lines.push("Last sync " + timeText(cloud.lastSuccess, now));
    return { title: "Cloud Sync: " + view.text, details: lines.join("\n") };
}

// The window's Status rows: [{ label, text, tone }], tone "" for plain text
// or a Badge tone for a chip.
function statusRows(cloud, now, timeText) {
    var view = stateView(cloud.state, cloud.staleAfter, now);
    var rows = [{ label: "Status", text: view.text, tone: badgeTone(view.tone) }];
    rows.push({ label: "Last sync", text: cloud.lastSuccess === null ? "Never" : timeText(cloud.lastSuccess, now), tone: "" });
    var fresh = cloud.staleAfter === null ? "No data yet" : now < cloud.staleAfter ? "Current" : "Older than two hours";
    rows.push({ label: "Data", text: fresh, tone: "" });
    if (cloud.lastError !== null) rows.push({ label: "Last problem", text: errorText(cloud.lastError), tone: "" });
    return rows;
}

// One folder pair's row in the window: { label, secondary, icon, text,
// tone }.
function pairRow(pair, now, timeText) {
    var view = stateView(pair.state, pair.staleAfter, now);
    var direction = pair.direction === "pull" ? "From Google Drive" : "To Google Drive";
    var last = pair.lastSuccess === null ? "not synced yet" : "last sync " + timeText(pair.lastSuccess, now);
    return { label: pair.label, secondary: direction + ", " + last, icon: pair.direction === "pull" ? "folder-down" : "folder-up", text: view.text, tone: badgeTone(view.tone) };
}

// One conflict's row in the window: its path, and what happened in which
// pair.
function conflictRow(conflict) {
    var what = conflictText(conflict.kind);
    if (conflict.kind === "renamed") what += " to " + conflict.to;
    return { label: conflict.path, secondary: what + ", " + conflict.pairLabel };
}

// The line under the review list when it shows only part of the list.
function moreConflicts(cloud) {
    var rest = cloud.conflictCount - cloud.conflicts.length;
    return rest <= 0 ? "" : rest === 1 ? "1 more file to review" : rest + " more files to review";
}

// The notification RECORD asks for while it needs the user, or null:
// { title, message, tone }.
function notification(record) {
    if (record.attention === null) return null;
    var reasons = record.attention.reasons;
    if (reasons.indexOf("authorization-required") !== -1)
        return { title: "Cloud Sync needs a sign-in", message: errorText(record.lastError === null ? { kind: "authorization-refused" } : record.lastError), tone: "danger" };
    if (reasons.indexOf("error") !== -1)
        return { title: "Cloud Sync failed", message: errorText(record.lastError), tone: "danger" };
    if (reasons.indexOf("conflicts") !== -1)
        return { title: "Cloud Sync kept files for review", message: reviewLine(record.conflicts.length) + ". Open Cloud Sync to see them.", tone: "warning" };
    if (reasons.indexOf("units-stale") !== -1)
        return { title: "Cloud Sync needs setup", message: "Select Set up Cloud Sync on the Cloud Sync page in Settings.", tone: "warning" };
    return null;
}

// The epoch milliseconds at which RECORD's idle data turns old, after NOW,
// or null: the service republishes then, since nothing else changes.
function nextStale(record, now) {
    var times = [record.staleAfter].concat(record.pairs.map(function (p) { return p.staleAfter; }))
        .map(msOf).filter(function (t) { return t !== null && t > now; });
    return times.length === 0 ? null : Math.min.apply(null, times);
}
