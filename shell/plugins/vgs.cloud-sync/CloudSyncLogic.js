.pragma library

// vgs.cloud-sync's pure decisions, run under node by
// scripts/test-cloud-sync-logic.js: the one judge of the runner's status
// record and probe answer, the status values the service publishes from
// them, and what the bar widget, the window and the notification draw from
// those values. `headline` is the one statement of where the sync stands:
// the bar, its tooltip, the window and the Settings `sync` value all read
// it. The runner, bin/cloud-sync, owns every rule about the sync; this
// file only reads its answers.

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
// A state's lines and hint, PluginLogic.STATUS_LIST_MAX and
// STATUS_HINT_MAX: a longer value is refused whole.
var LINES_MAX = 64;
var HINT_MAX = 200;
// A Google account address as the runner stores it on a token
// (bin/cloud-sync authorize): printable, at most 254 characters, one `@`.
var ADDRESS_MAX = 254;
var NOT_PRINTABLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

// What each state reads as and the tone it takes: `tone` is a status
// `state` tone (PluginLogic.STATUS_STATE_TONES). `idle` reads by the data's
// age (freshness). A pair reads by these; the whole sync by `headline`.
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
var NO_PAIRS = { text: "No folder pairs", tone: "warning", icon: "cloud" };
// The direction of a pair, in the words every surface uses.
var DIRECTION_WORD = { pull: "Download", upload: "Upload" };
var DIRECTION_LONG = { pull: "Download: Google Drive to this computer", upload: "Upload: this computer to Google Drive" };
// A status state tone as a Badge tone.
var BADGE_TONES = { ok: "success", info: "info", warning: "warning", danger: "danger" };

// A run's last error, as plain text a user reads. A kind not listed here is
// a sync error.
var ERROR_TEXT = {
    offline: "Google Drive cannot be reached. Cloud Sync tries again at the next sync.",
    "authorization-refused": "Google Drive did not accept the sign-in. Select Sign in again on the Cloud Sync page in Settings.",
    "credential-absent": "A Google Drive key is missing. Add it on the Cloud Sync page in Settings.",
    "credential-locked": "Your keyring is locked. Unlock it to sync.",
    "source-missing": "A Google Drive folder of a folder pair does not exist.",
    "rclone-missing": "rclone is not installed.",
    "secret-tool-missing": "VGS cannot read your keyring.",
    "secret-tool-failed": "VGS cannot read your keyring.",
    "secret-tool-timeout": "VGS cannot read your keyring.",
    interrupted: "The last sync stopped before it finished.",
    "pairs-invalid": "The folder pair list is not valid, so Cloud Sync copies nothing."
};
var ERROR_DEFAULT = "The sync stopped with an error. Cloud Sync tries again at the next sync.";
// A missing token is a missing sign-in of its direction, not a key to add.
var TOKEN_DIRECTION = { "pull-token": "Download", "upload-token": "Upload" };

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

var SCHEDULE_HINT = "Cloud Sync runs every hour while you are logged in.";
var NO_PAIRS_HINT = "Add a folder pair to choose what Cloud Sync keeps in step.";
var REVIEW_HINT = "Open Cloud Sync to review them.";
var UNUSED_KEY_HINT = "No folder pair uses this key now.";

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
    if (doc.attention !== null && !(isObject(doc.attention) && Array.isArray(doc.attention.reasons) && isText(doc.attention.key)
        && typeof doc.attention.notified === "boolean"))
        return { ok: false, error: "status=attention" };
    return { ok: true, record: doc };
}

// A Google account address a token carries, as the runner judges it.
function isAddress(value) {
    return isText(value) && value.length > 0 && value.length <= ADDRESS_MAX && !NOT_PRINTABLE.test(value) && value.split("@").length === 2;
}

// The one judge of `probe`'s line: { ok: true, presence: { account:
// { presence, needed, user? } } } or { ok: false, error }. Only a token's
// row carries `user`, the account it signed in as, and only when the
// runner read it.
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
        if (hasOwn(c, "user") && (!/-token$/.test(c.account) || !isAddress(c.user)))
            return { ok: false, error: "probe=user account=" + c.account };
        presence[c.account] = { presence: c.presence, needed: c.needed };
        if (hasOwn(c, "user")) presence[c.account].user = c.user;
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
    if (error.kind === "credential-absent" && hasOwn(TOKEN_DIRECTION, error.account))
        return "Google Drive is not signed in for " + TOKEN_DIRECTION[error.account] + ". Select Sign in on the Cloud Sync page in Settings.";
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


// The folders Open folders opens for CONFLICT: the mirror's folder, and
// for a local edit also the folder that keeps the local version.
function reviewDirs(conflict) {
    var dirs = [dirname(conflict.localPath)];
    if (conflict.kind === "local-edit") dirs.push(dirname(conflict.storedPath));
    return dirs;
}

// An error as the published data carries it: its kind, and the account
// it names, which errorText reads.
function publishedError(error) {
    if (error === null) return null;
    return isText(error.account) ? { kind: error.kind, account: error.account } : { kind: error.kind };
}

// Whether the runner could read the pair list; while it cannot, it
// refuses every pair change too.
function pairListValid(cloud) {
    return cloud.lastError === null || cloud.lastError.kind !== "pairs-invalid";
}

// The published `cloud` data the widget and the window draw: the record
// with times as epoch milliseconds, the review list capped, each conflict
// with the folders Open folders opens, and the last failed request.
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
        lastError: publishedError(record.lastError),
        pairs: record.pairs.map(function (p) {
            return { id: p.id, label: p.label, direction: p.direction, state: p.state, lastSuccess: msOf(p.lastSuccess), staleAfter: msOf(p.staleAfter), lastError: publishedError(p.lastError) };
        }),
        conflicts: conflicts,
        conflictCount: record.conflicts.length,
        problem: problem
    };
    while (value.conflicts.length > 0 && JSON.stringify(value).length > CLOUD_BYTES_MAX) value.conflicts.pop();
    return value;
}

function reviewLine(count) {
    return count === 1 ? "1 file to review" : count + " files to review";
}

// Where the whole sync stands: { text, tone, icon, cause }, or null before
// the first record. CLOUD is the published `cloud` value. Hourly sync not
// set up comes first, then no folder pair, then a sign-in needed or a
// failed sync, of the whole sync or of any pair, since the runner ranks a
// running pair above another pair's failure; then files to review, then
// the state, an idle one by the data's age. "Up to date" is a pair's word
// while files wait for review. `cause` is the state, `no-pairs` or
// `review`.
function headline(cloud, now) {
    if (cloud === undefined || cloud === null) return null;
    if (cloud.state === "not-set-up")
        return cloud.units === "absent" ? withCause(STATE_VIEW["not-set-up"], "not-set-up") : withCause(NO_PAIRS, "no-pairs");
    var danger = DANGER_STATES.filter(function (state) {
        return cloud.state === state || cloud.pairs.some(function (p) { return p.state === state; });
    });
    if (danger.length > 0) return withCause(STATE_VIEW[danger[0]], danger[0]);
    if (cloud.conflictCount > 0) return { text: reviewLine(cloud.conflictCount), tone: "warning", icon: "cloud-alert", cause: "review" };
    return withCause(stateView(cloud.state, cloud.staleAfter, now), cloud.state);
}

// The states that need the user, in the runner's order (PAIR_PRECEDENCE).
var DANGER_STATES = ["authorization-required", "error"];

function withCause(view, cause) {
    return { text: view.text, tone: view.tone, icon: view.icon, cause: cause };
}

// The sentence that gives HEAD's cause, or "": what to do with files to
// review, or the last error behind a failure or an offline sync.
function headlineHint(cloud, head) {
    if (head.cause === "review") return REVIEW_HINT;
    if (head.tone === "danger" || head.cause === "offline") return errorText(cloud.lastError);
    return "";
}

// Each pair's line as the Settings status and the tooltip show it: its
// label and state, never a file name.
function pairLines(pairs, now) {
    return pairs.map(function (p) {
        return p.label + ": " + stateView(p.state, p.staleAfter, now).text;
    });
}

// The `sync` value: the headline, a line per pair and the headline's cause.
function syncValue(cloud, now) {
    var head = headline(cloud, now);
    var value = { tone: head.tone, text: head.text };
    if (cloud.pairs.length > 0) value.lines = pairLines(cloud.pairs, now).slice(0, LINES_MAX);
    var hint = headlineHint(cloud, head);
    if (hint !== "") value.hint = hint;
    return value;
}

// The `schedule` value: whether the hourly units are what install writes
// now, with Set up hourly sync while they are not.
function scheduleValue(units) {
    if (units === "installed") return { tone: "ok", text: "On", hint: SCHEDULE_HINT };
    if (units === "absent") return { tone: "warning", text: "Not set up", action: true, hint: SCHEDULE_HINT };
    if (units === "stale") return { tone: "warning", text: "Needs setup", action: true, hint: SCHEDULE_HINT };
    throw new Error("cloud-sync: units " + JSON.stringify(units) + " is not one of " + UNITS.join(", "));
}

// The `pairs` value of CLOUD: each pair's label and direction, with Add a
// folder pair while there is none and Remove a folder pair once one
// exists; while the runner cannot read the list it offers neither, since
// it refuses both.
function pairsValue(cloud) {
    if (!pairListValid(cloud)) return { tone: "danger", text: "Not readable", hint: errorText(cloud.lastError) };
    var pairs = cloud.pairs;
    if (pairs.length === 0) return { tone: "warning", text: "None", action: "add", hint: NO_PAIRS_HINT };
    return {
        tone: "ok",
        text: pairs.length === 1 ? "1 folder pair" : pairs.length + " folder pairs",
        lines: pairs.map(function (p) { return p.label + ": " + DIRECTION_WORD[p.direction]; }).slice(0, LINES_MAX),
        action: "remove"
    };
}

// The `downloadKeys` or `uploadKeys` presence list of DIRECTION, `pull` or
// `upload`: its client ID and secret, each with the account the masked
// field stores. Once a folder pair exists, a key no folder pair uses says
// so.
function keyItems(presence, direction) {
    var anyNeeded = ACCOUNTS.some(function (account) { return presence[account].needed; });
    return [["Client ID", direction + "-client-id"], ["Client secret", direction + "-client-secret"]].map(function (pair) {
        var account = pair[1];
        var item = { label: pair[0], value: presence[account].presence, secret: account };
        if (anyNeeded && !presence[account].needed) item.hint = UNUSED_KEY_HINT;
        return item;
    });
}

// The `download` or `upload` sign-in value of DIRECTION, `pull` or
// `upload`, from the probe's PRESENCE and RECORD, null before its first
// answer: a locked or unreadable keyring first, then a missing client,
// then a missing sign-in, then one Google refused for a pair of this
// direction. A signed-in hint names the account the runner stored with
// the token, when it has one; no other value carries it.
function signInValue(presence, direction, record) {
    var states = [direction + "-client-id", direction + "-client-secret", direction + "-token"].map(function (a) { return presence[a].presence; });
    if (states.indexOf("locked") !== -1) return { tone: "warning", text: "Keyring locked", hint: "Unlock your keyring to sync." };
    if (states.indexOf("unavailable") !== -1) return { tone: "warning", text: "Unknown", hint: "VGS cannot read your keyring." };
    if (states[0] !== "present" || states[1] !== "present") return { tone: "info", text: "Not signed in", hint: "Add the client ID and secret first." };
    if (states[2] !== "present") return { tone: "warning", text: "Not signed in", action: "signIn" };
    var refused = record !== null && record.pairs.some(function (p) {
        return p.direction === direction && p.state === "authorization-required" && p.lastError !== null && p.lastError.kind === "authorization-refused";
    });
    if (refused) return { tone: "danger", text: "Sign-in refused", action: "reconnect", hint: errorText({ kind: "authorization-refused" }) };
    var user = presence[direction + "-token"].user;
    var named = user === undefined ? "" : "Signed in as " + user + ".";
    return { tone: "ok", text: "Signed in", hint: named !== "" && named.length <= HINT_MAX ? named : "Signed in.", action: "signOut" };
}

// The values the service publishes (the manifest's `status`): from the
// record, `sync`, the headline; `schedule`, the hourly units; `pairs`;
// `cloud`, the data the widget and the window draw; and `lastSync`, the
// time of the last complete sync, or null to clear it. From the probe,
// each direction's key list and sign-in. RECORD and PRESENCE are null
// until their first answer, which leaves their values out.
function statusValues(record, presence, problem, now) {
    var values = {};
    if (record !== null) {
        var cloud = cloudValue(record, problem);
        values.sync = syncValue(cloud, now);
        values.schedule = scheduleValue(record.units);
        values.pairs = pairsValue(cloud);
        values.cloud = cloud;
        values.lastSync = cloud.lastSuccess;
    }
    if (presence !== null) {
        values.downloadKeys = keyItems(presence, "pull");
        values.download = signInValue(presence, "pull", record);
        values.uploadKeys = keyItems(presence, "upload");
        values.upload = signInValue(presence, "upload", record);
    }
    return values;
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

// A headline tone as the bar draws it.
var BAR_TONES = { ok: "calm", info: "calm", warning: "warning", danger: "danger" };

// The bar widget: { hidden, icon, tone, spinning, badge }, the headline's
// icon and tone (calm, warning or danger), and badge the count of files to
// review as BarItem's `count` text, "" for none. The icon is hidden until
// a folder pair exists, so a bar that places it before setup shows nothing
// to act on, but not while the pair list cannot be read. CLOUD is the
// published value, undefined before the first.
function widgetView(cloud, now) {
    if (cloud === undefined || cloud === null || (cloud.pairs.length === 0 && pairListValid(cloud))) return { hidden: true, icon: "cloud", tone: "calm", spinning: false, badge: "" };
    var head = headline(cloud, now);
    return { hidden: false, icon: head.icon, tone: BAR_TONES[head.tone], spinning: cloud.state === "running", badge: cloud.conflictCount > 0 ? String(cloud.conflictCount) : "" };
}

// The widget's tooltip: the headline as its title, then one line per pair,
// its label and state, the files to review when the headline does not say
// so, and the last sync's time in the shell's wording (TIME_TEXT).
function widgetTooltip(cloud, now, timeText) {
    if (cloud === undefined || cloud === null) return { title: "Cloud Sync", details: "" };
    var head = headline(cloud, now);
    var lines = pairLines(cloud.pairs, now);
    if (cloud.conflictCount > 0 && head.cause !== "review") lines.push(reviewLine(cloud.conflictCount));
    if (cloud.lastSuccess !== null) lines.push("Last sync " + timeText(cloud.lastSuccess, now));
    return { title: "Cloud Sync: " + head.text, details: lines.join("\n") };
}

// The window's subtitle: { text, tone, lines }, the headline, then
// [{ text, tone }] lines, tone "" or "danger": the last complete sync,
// the pause, the last error and the last failed request.
function windowStatus(cloud, now, timeText) {
    var head = headline(cloud, now);
    var lines = [{ text: cloud.lastSuccess === null ? "No complete sync yet" : "Last complete sync " + timeText(cloud.lastSuccess, now), tone: "" }];
    if (cloud.paused)
        lines.push({ text: (head.cause === "paused" ? "" : "Paused. ") + "The hourly sync copies nothing until you resume it.", tone: "" });
    if (cloud.lastError !== null) lines.push({ text: errorText(cloud.lastError), tone: head.tone === "danger" ? "danger" : "" });
    if (cloud.problem !== "") lines.push({ text: cloud.problem, tone: "danger" });
    return { text: head.text, tone: head.tone, lines: lines };
}

// One folder pair's row in the window: { id, label, secondary, icon, text,
// tone }, its direction in the long form and its state as a Badge tone.
function pairRow(pair, now) {
    var view = stateView(pair.state, pair.staleAfter, now);
    return { id: pair.id, label: pair.label, secondary: DIRECTION_LONG[pair.direction], icon: pair.direction === "pull" ? "folder-down" : "folder-up", text: view.text, tone: badgeTone(view.tone) };
}

// One conflict's row in the window: its path, and what happened.
function conflictRow(conflict) {
    var what = conflictText(conflict.kind);
    if (conflict.kind === "renamed") what += " to " + conflict.to;
    return { label: conflict.path, secondary: what, dirs: conflict.dirs };
}

// The review list by folder pair, in the order the list first names each:
// [{ label, rows }], so a pair's label stands on its own line.
function conflictGroups(conflicts) {
    var groups = [];
    conflicts.forEach(function (c) {
        var group = groups.find(function (g) { return g.label === c.pairLabel; });
        if (group === undefined) {
            group = { label: c.pairLabel, rows: [] };
            groups.push(group);
        }
        group.rows.push(conflictRow(c));
    });
    return groups;
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
        return { title: "Cloud Sync needs setup", message: "Select Set up hourly sync on the Cloud Sync page in Settings.", tone: "warning" };
    return null;
}

// The epoch milliseconds at which RECORD's idle data turns old, after NOW,
// or null: the service republishes then, since nothing else changes.
function nextStale(record, now) {
    var times = [record.staleAfter].concat(record.pairs.map(function (p) { return p.staleAfter; }))
        .map(msOf).filter(function (t) { return t !== null && t > now; });
    return times.length === 0 ? null : Math.min.apply(null, times);
}
