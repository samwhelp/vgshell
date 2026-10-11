#!/usr/bin/env node
// The Cloud Sync runner, shell/plugins/vgs.cloud-sync/bin/cloud-sync, end to
// end against rclone's `local` backend: a Drive-side add and change reach
// the mirror after one run; a local edit since the last download keeps
// both versions and reads `local-edit`; a Drive deletion keeps the file and
// reads `removed-on-drive`; a rename reads `renamed` where the backend has
// object ids; a run during another is `busy` and starts no second copy; a
// run killed mid-copy reads as interrupted; pause persists across processes
// and a paused run copies nothing; an edit saved as a copy ends is kept as
// `local-edit` by the next run; offline and authorization failures keep
// the last success; the exclusions; pair validation; install, start, probe
// and status; the probe names a token's account; authorize stores the
// token Google's consent returns through secret-tool's stdin as the
// account's one item, named for the account Drive's about read returns,
// with the access token on curl's stdin; sign-out clears one direction;
// attention-seen keeps a notified key across renders until the key
// changes or a settled record needs nothing; two failing pairs keep one
// key through a run; and no credential value reaches an argv, a log line, a unit or
// the status record.
//
// Every case runs in its own scratch home and runtime directory with a PATH
// of stand-ins: `secret-tool` keeps items as files under the case's stub
// directory, `systemctl` records its calls, `curl` records its argv and
// stdin and answers Drive's about read, and `rclone` records its argv and
// RCLONE_* environment, swaps the drive remote for the local backend
// rooted at the case's fixture Drive and runs the host's rclone, except
// for `authorize`, which it answers itself with a fixture token, so no
// browser opens and no consent leaves the machine.
// No case reaches the user's keyring, systemd manager, rclone config or
// network.
//
// The controls at the end edit a copy of the runner, one rule at a time,
// and require the case that rule serves to fail on the copy.
"use strict";
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RUNNER = path.join(__dirname, "..", "shell", "plugins", "vgs.cloud-sync", "bin", "cloud-sync");

function which(command) {
    for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
        const candidate = path.join(dir, command);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
        } catch (_e) {
            // Keep looking.
        }
    }
    return null;
}

const HOST = {};
for (const tool of ["rclone", "flock", "bash", "mkfifo"]) {
    HOST[tool] = which(tool);
    if (HOST[tool] === null) {
        console.log("test-cloud-sync-runner: unavailable: " + tool + "=missing");
        process.exit(77);
    }
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "test-cloud-sync-runner-"));
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));

const SECRETS = {
    "pull-client-id": "fake-pull-client-7f3a",
    "pull-client-secret": "fake-pull-secret-91c2",
    "pull-token": "{\"access_token\":\"fake-access-55aa\",\"token_type\":\"Bearer\",\"refresh_token\":\"fake-refresh-d81e\",\"expiry\":\"2026-01-01T00:00:00Z\"}",
    "upload-client-id": "fake-upload-client-3b6c",
    "upload-client-secret": "fake-upload-secret-2e90",
    "upload-token": "{\"access_token\":\"fake-access-77bb\",\"token_type\":\"Bearer\",\"refresh_token\":\"fake-refresh-a4c1\",\"expiry\":\"2026-01-01T00:00:00Z\"}"
};
// The token the rclone stand-in's `authorize` prints, as rclone v1.75.1
// prints one: its JSON on one line between the paste lines.
const CONSENT_TOKEN = "{\"access_token\":\"fake-consent-access-c0de\",\"token_type\":\"Bearer\",\"refresh_token\":\"fake-consent-refresh-f00d\",\"expiry\":\"2026-10-10T13:00:00Z\"}";
const CONSENT_VALUES = ["fake-consent-access-c0de", "fake-consent-refresh-f00d"];
// The address the curl stand-in's about read answers with.
const ACCOUNT = "someone@example.com";
const ABOUT_URL = "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)";
// Text every log, record and unit of every case is checked against.
const SEEN = [];

// rclone v1.75.1's own lines: the first from a drive remote with a fake
// token under `unshare -rn` (no network), the second from an empty token.
const OFFLINE_LINE = "2026/10/10 11:53:47 CRITICAL: Failed to create file system for \"vgsdrive:Docs\": couldn't find root directory ID: Get \"https://www.googleapis.com/drive/v3/files/root?alt=json&fields=id&prettyPrint=false&supportsAllDrives=true\": couldn't fetch token: Post \"https://oauth2.googleapis.com/token\": dial tcp [2607:f8b0:400e:c0d::5f]:443: connect: cannot assign requested address";
const AUTH_LINE = "2026/10/10 11:53:57 CRITICAL: Failed to create file system for \"vgsdrive:Docs\": drive: failed when making oauth client: failed to create oauth client: empty token found - please run \"rclone config reconnect vgsdrive{XLZpn}:\"";

// ------------------------------------------------------------ the world

function write(file, text, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, { mode: mode || 0o644 });
}

function read(file) {
    return fs.readFileSync(file, "utf8");
}

let worlds = 0;
// A fresh home, runtime directory, stand-ins and fixture Drive.
function world(options) {
    const opts = Object.assign({ secrets: Object.keys(SECRETS), ids: false }, options || {});
    const root = path.join(scratch, "w" + (worlds += 1));
    const w = {
        root,
        home: path.join(root, "home"),
        run: path.join(root, "run"),
        stub: path.join(root, "stub"),
        bin: path.join(root, "bin"),
        drive: path.join(root, "drive")
    };
    for (const dir of [w.home, w.stub, w.bin, w.drive, path.join(w.stub, "secrets")]) fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(w.run, { recursive: true, mode: 0o700 });
    w.state = path.join(w.home, ".local", "state", "vgshell", "cloud-sync");
    w.mirror = path.join(w.home, "mirror", "docs");
    w.env = {
        PATH: w.bin,
        HOME: w.home,
        XDG_CONFIG_HOME: path.join(w.home, ".config"),
        XDG_STATE_HOME: path.join(w.home, ".local", "state"),
        XDG_DATA_HOME: path.join(w.home, ".local", "share"),
        XDG_RUNTIME_DIR: w.run,
        // The runner must not hand these to rclone.
        RCLONE_CONFIG: path.join(root, "leaked-config"),
        RCLONE_CONFIG_VGSDRIVE_TYPE: "s3"
    };
    fs.symlinkSync(HOST.flock, path.join(w.bin, "flock"));
    for (const account of opts.secrets) write(path.join(w.stub, "secrets", account), SECRETS[account]);
    if (opts.ids) write(path.join(w.stub, "ids"), "");
    // Each item is a file of the store: <account> holds one without a
    // `user` attribute, <account>.user.<address> one with it, and
    // <account>.locked marks the account's items locked. It prints as
    // libsecret's secret-tool does: the label and an unlocked item's secret
    // on stdout, the attributes and a lock failure on stderr.
    write(path.join(w.bin, "secret-tool"), `#!${process.execPath}
const fs = require("fs");
const path = require("path");
const store = ${JSON.stringify(path.join(w.stub, "secrets"))};
const calls = ${JSON.stringify(path.join(w.stub, "secret-tool.calls"))};
const args = process.argv.slice(2);
const items = account => fs.readdirSync(store).filter(n => n === account || n.startsWith(account + ".user.")).sort();
const keyed = (rest, more) => rest.length === 4 + more && rest[0] === "service" && rest[1] === "vgs-cloud-sync" && rest[2] === "account";
if (args[0] === "store") {
    const rest = args.slice(2);
    if (!String(args[1]).startsWith("--label=") || !(keyed(rest, 0) || keyed(rest, 2) && rest[4] === "user")) process.exit(2);
    fs.appendFileSync(calls, args.join(" ") + "\\n");
    fs.writeFileSync(path.join(store, rest.length === 6 ? rest[3] + ".user." + rest[5] : rest[3]), fs.readFileSync(0));
    process.exit(0);
}
if (args[0] === "clear") {
    const rest = args.slice(1);
    if (!keyed(rest, 0)) process.exit(2);
    fs.appendFileSync(calls, args.join(" ") + "\\n");
    // libsecret clears unlocked items alone, and exits 1 with no output
    // when it cleared none.
    const cleared = fs.existsSync(path.join(store, rest[3] + ".locked")) ? [] : items(rest[3]);
    for (const name of cleared) fs.unlinkSync(path.join(store, name));
    process.exit(cleared.length === 0 ? 1 : 0);
}
const all = args[1] === "--all";
const rest = args.slice(all ? 2 : 1);
if (args[0] !== "search" || !keyed(rest, 0)) process.exit(2);
const account = rest[3];
const locked = fs.existsSync(path.join(store, account + ".locked"));
let found = items(account);
if (locked && found.length === 0) found = [account];
for (const name of all ? found : found.slice(0, 1)) {
    process.stdout.write("[/org/freedesktop/secrets/collection/login/1]\\nlabel = VGS Cloud Sync " + account + "\\n" + (locked ? "" : "secret = " + fs.readFileSync(path.join(store, name), "utf8") + "\\n"));
    process.stderr.write("attribute.service = vgs-cloud-sync\\nattribute.account = " + account + "\\n" + (name === account ? "" : "attribute.user = " + name.slice(account.length + ".user.".length) + "\\n")
        + (locked ? "secret-tool: Cannot get secret of a locked object\\n" : ""));
}
`, 0o755);
    // Drive's about read: records its argv and stdin, then answers from
    // curl-mode: `fail` as curl does for a refused token, `bad` with an
    // address the judge refuses, else with ACCOUNT.
    write(path.join(w.bin, "curl"), `#!${process.execPath}
const fs = require("fs");
const stub = ${JSON.stringify(w.stub)};
fs.appendFileSync(stub + "/curl.calls", JSON.stringify({ argv: process.argv.slice(2), stdin: fs.readFileSync(0, "utf8") }) + "\\n");
const mode = fs.existsSync(stub + "/curl-mode") ? fs.readFileSync(stub + "/curl-mode", "utf8") : "";
if (mode === "fail") {
    process.stderr.write("curl: (22) The requested URL returned error: 401\\n");
    process.exit(22);
}
process.stdout.write(JSON.stringify({ user: { emailAddress: mode === "bad" ? "two@at@example.com" : ${JSON.stringify(ACCOUNT)} } }));
`, 0o755);
    write(path.join(w.bin, "systemctl"), `#!${HOST.bash}
printf '%s\\n' "$*" >>${JSON.stringify(path.join(w.stub, "systemctl.calls"))}
`, 0o755);
    // Each rclone call also records the status record's attention as the
    // run's own render left it.
    write(path.join(w.stub, "record.js"), `const fs = require("fs");
const env = {};
for (const name of Object.keys(process.env)) if (name.startsWith("RCLONE_")) env[name] = process.env[name];
const status = ${JSON.stringify(path.join(w.state, "status.json"))};
const attention = fs.existsSync(status) ? JSON.parse(fs.readFileSync(status, "utf8")).attention : null;
fs.appendFileSync(${JSON.stringify(path.join(w.stub, "rclone.calls"))}, JSON.stringify({ argv: process.argv.slice(2), env, attention }) + "\\n");
`);
    write(path.join(w.stub, "ids.js"), `const fs = require("fs");
const path = require("path");
const root = process.argv.slice(3).find(a => a.startsWith("vgsdrive:")).slice("vgsdrive:".length);
const items = JSON.parse(fs.readFileSync(0, "utf8"));
for (const item of items) item.ID = String(fs.statSync(path.join(process.argv[2], root, item.Path)).ino);
process.stdout.write(JSON.stringify(items));
`);
    // The rclone stand-in: `mode` prints a real failure line instead of
    // running; `block` holds the first copy until `release` is written.
    write(path.join(w.bin, "rclone"), `#!${HOST.bash}
stub=${JSON.stringify(w.stub)}
${JSON.stringify(process.execPath)} "$stub/record.js" "$@"
mode=""
[[ -f $stub/mode ]] && mode=$(<"$stub/mode")
if [[ $3 == authorize ]]; then
  printf 'Waiting for code...\\n' >&2
  [[ $mode == no-refresh ]] && token='{"access_token":"x","token_type":"Bearer"}' || token=${JSON.stringify(CONSENT_TOKEN)}
  printf 'Paste the following into your remote machine --->\\n%s\\n<---End paste\\n' "$token"
  exit 0
fi
case "$mode" in
  offline) printf '%s\\n' ${JSON.stringify(OFFLINE_LINE)} >&2; exit 1 ;;
  auth) printf '%s\\n' ${JSON.stringify(AUTH_LINE)} >&2; exit 1 ;;
esac
export RCLONE_CONFIG_VGSDRIVE_TYPE=local
unset RCLONE_CONFIG_VGSDRIVE_CLIENT_ID RCLONE_CONFIG_VGSDRIVE_CLIENT_SECRET RCLONE_CONFIG_VGSDRIVE_TOKEN RCLONE_CONFIG_VGSDRIVE_SCOPE
cd ${JSON.stringify(w.drive)} || exit 9
if [[ -f $stub/block && ! -e $stub/blocked && $3 == copy ]]; then
  : >"$stub/blocked"
  read -r _ <"$stub/release"
fi
if [[ -f $stub/ids && $3 == lsjson ]]; then
  set -o pipefail
  ${JSON.stringify(HOST.rclone)} "$@" | ${JSON.stringify(process.execPath)} "$stub/ids.js" ${JSON.stringify(w.drive)} "$@"
  exit
fi
${JSON.stringify(HOST.rclone)} "$@"
status=$?
# A user's save landing as the copy ends: once, the file the trigger names.
if [[ -f $stub/edit-after-copy && ! -e $stub/edited && $3 == copy ]]; then
  printf 'edited during the copy\n' >"$5/$(<"$stub/edit-after-copy")"
  : >"$stub/edited"
fi
: >"$stub/exited"
exit $status
`, 0o755);
    return w;
}

function cli(w, args, runner) {
    const out = childProcess.spawnSync(process.execPath, [runner || RUNNER].concat(args), { env: w.env, encoding: "utf8", timeout: 120000 });
    assert.notEqual(out.status, null, "runner " + args.join(" ") + " did not end: " + out.error);
    SEEN.push(out.stdout, out.stderr);
    return out;
}

function addPair(w, runner, pair) {
    const def = Object.assign({ id: "docs", label: "Documents", direction: "pull", remote: "Docs", local: w.mirror }, pair || {});
    const out = cli(w, ["pair-add", "--definition", JSON.stringify(def)], runner);
    assert.equal(out.status, 0, out.stderr);
    return def;
}

function status(w, runner) {
    const out = cli(w, ["status"], runner);
    assert.equal(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.deepEqual(parsed, JSON.parse(read(path.join(w.state, "status.json"))), "status prints what it writes");
    return parsed;
}

function jsonLines(file) {
    return fs.existsSync(file) ? read(file).trim().split("\n").map(line => JSON.parse(line)) : [];
}

function rcloneCalls(w) {
    return jsonLines(path.join(w.stub, "rclone.calls"));
}

// The stand-in keyring's items of DIRECTION's token, as their file names.
function tokenItems(w, direction) {
    return fs.readdirSync(path.join(w.stub, "secrets")).filter(n => n === direction + "-token" || n.startsWith(direction + "-token.user.")).sort();
}

function drive(w, rel, text, mtimeSeconds) {
    const file = path.join(w.drive, "Docs", rel);
    write(file, text);
    if (mtimeSeconds !== undefined) fs.utimesSync(file, mtimeSeconds, mtimeSeconds);
}

function mirrorFiles(w) {
    const found = [];
    const walk = rel => {
        for (const entry of fs.readdirSync(path.join(w.mirror, rel), { withFileTypes: true })) {
            const child = rel === "" ? entry.name : rel + "/" + entry.name;
            if (entry.isDirectory()) walk(child);
            else found.push(child);
        }
    };
    if (fs.existsSync(w.mirror)) walk("");
    return found.sort();
}

function runOk(w, runner, result) {
    const out = cli(w, ["run"], runner);
    assert.equal(out.stdout, "pair=docs result=" + (result || "idle") + "\n", out.stderr);
    return out;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Waits for FILE, the stand-in's acknowledgement that it reached its block.
async function waitFor(file, what) {
    const deadline = Date.now() + 30000;
    while (!fs.existsSync(file)) {
        if (Date.now() > deadline) throw new Error("timed out waiting for " + what);
        await sleep(20);
    }
}

// Lets a blocked stand-in go on; false when no reader is waiting.
function release(w) {
    let fd;
    try {
        fd = fs.openSync(path.join(w.stub, "release"), fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
    } catch (e) {
        if (e.code === "ENXIO") return false;
        throw e;
    }
    fs.writeSync(fd, "go\n");
    fs.closeSync(fd);
    return true;
}

function startBlocked(w, runner) {
    write(path.join(w.stub, "block"), "");
    const made = childProcess.spawnSync(HOST.mkfifo, [path.join(w.stub, "release")]);
    assert.equal(made.status, 0, String(made.stderr));
    const child = childProcess.spawn(process.execPath, [runner || RUNNER, "run"], { env: w.env, stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise(resolve => child.on("exit", resolve));
    const done = new Promise(resolve => {
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", d => { stdout += d; });
        child.stderr.on("data", d => { stderr += d; });
        child.on("close", (code, signal) => {
            SEEN.push(stdout, stderr);
            resolve({ code, signal, stdout, stderr });
        });
    });
    return { child, exited, done };
}

// ------------------------------------------------------------- the cases

// A Drive-side add and change reach the mirror after one run, through the
// drive remote rclone receives in its environment alone.
function caseCopy(runner) {
    const w = world();
    addPair(w, runner);
    drive(w, "a.txt", "one\n", 1700000000);
    runOk(w, runner);
    assert.deepEqual(mirrorFiles(w), ["a.txt"]);
    drive(w, "a.txt", "one, changed on Drive\n", 1700003600);
    drive(w, "b.txt", "added on Drive\n", 1700003600);
    runOk(w, runner);
    assert.equal(read(path.join(w.mirror, "a.txt")), "one, changed on Drive\n");
    assert.equal(read(path.join(w.mirror, "b.txt")), "added on Drive\n");
    // The unedited earlier download of a.txt is not kept as a conflict.
    assert.deepEqual(fs.readdirSync(path.join(w.state, "pairs", "docs", "conflicts")), []);
    const s = status(w, runner);
    assert.equal(s.pairs[0].state, "idle");
    assert.deepEqual(s.pairs[0].changes, { added: 1, updated: 1 });
    assert.deepEqual(s.conflicts, []);
    assert.equal(Date.parse(s.pairs[0].staleAfter) - Date.parse(s.pairs[0].lastSuccess), 2 * 3600 * 1000);
    const calls = rcloneCalls(w);
    assert.ok(calls.length >= 2);
    for (const call of calls) {
        assert.deepEqual(call.argv.slice(0, 2), ["--config", "/dev/null"]);
        assert.deepEqual(call.env, {
            RCLONE_CONFIG_VGSDRIVE_TYPE: "drive",
            RCLONE_CONFIG_VGSDRIVE_CLIENT_ID: SECRETS["pull-client-id"],
            RCLONE_CONFIG_VGSDRIVE_CLIENT_SECRET: SECRETS["pull-client-secret"],
            RCLONE_CONFIG_VGSDRIVE_TOKEN: SECRETS["pull-token"],
            RCLONE_CONFIG_VGSDRIVE_SCOPE: "drive.readonly"
        });
        const at = call.argv.indexOf("--drive-export-formats");
        assert.equal(call.argv[at + 1], "docx,xlsx,pptx,svg");
    }
    assert.ok(calls.some(c => c.argv[2] === "copy" && c.argv[3] === "vgsdrive:Docs" && c.argv[4] === w.mirror));
    return w;
}

// A local edit since the last download: Drive's version in the mirror, the
// edit kept in conflict storage outside it, reported as `local-edit`.
function caseLocalEdit(runner) {
    const w = world();
    addPair(w, runner);
    drive(w, "a.txt", "Drive version\n", 1700000000);
    runOk(w, runner);
    write(path.join(w.mirror, "a.txt"), "edited here, longer than before\n");
    runOk(w, runner);
    assert.equal(read(path.join(w.mirror, "a.txt")), "Drive version\n");
    const s = status(w, runner);
    assert.equal(s.conflicts.length, 1);
    const c = s.conflicts[0];
    assert.equal(c.kind, "local-edit");
    assert.equal(c.pair, "docs");
    assert.equal(c.path, "a.txt");
    assert.equal(c.localPath, path.join(w.mirror, "a.txt"));
    assert.ok(c.storedPath.startsWith(path.join(w.state, "pairs", "docs", "conflicts") + "/"));
    assert.equal(read(c.storedPath), "edited here, longer than before\n");
    assert.deepEqual(s.attention.reasons, ["conflicts"]);
    // The record holds on the next run, and leaves once the kept copy is
    // removed.
    runOk(w, runner);
    assert.equal(status(w, runner).conflicts.length, 1);
    fs.unlinkSync(c.storedPath);
    runOk(w, runner);
    assert.deepEqual(status(w, runner).conflicts, []);
}

// A local edit saved as a run's copy ends matches nothing Drive listed, so
// it does not become the baseline: the next run, which replaces it with
// Drive's version, keeps it as `local-edit`.
function caseEditDuringCopy(runner) {
    const w = world();
    addPair(w, runner);
    drive(w, "a.txt", "drive v1\n", 1700000000);
    runOk(w, runner);
    write(path.join(w.stub, "edit-after-copy"), "a.txt");
    runOk(w, runner);
    assert.equal(read(path.join(w.mirror, "a.txt")), "edited during the copy\n");
    runOk(w, runner);
    assert.equal(read(path.join(w.mirror, "a.txt")), "drive v1\n");
    const s = status(w, runner);
    assert.deepEqual(s.conflicts.map(c => [c.kind, c.path]), [["local-edit", "a.txt"]]);
    assert.equal(read(s.conflicts[0].storedPath), "edited during the copy\n");
}

// A Drive deletion keeps the local file and reads `removed-on-drive`; a
// rename reads `renamed` where the backend has object ids, and as a
// removal where it tracks by path.
function caseRemovedAndRenamed(runner) {
    for (const ids of [true, false]) {
        const w = world({ ids: ids });
        addPair(w, runner);
        drive(w, "a.txt", "stays\n", 1700000000);
        drive(w, "b.txt", "deleted on Drive\n", 1700000000);
        drive(w, "c.txt", "renamed on Drive\n", 1700000000);
        runOk(w, runner);
        fs.unlinkSync(path.join(w.drive, "Docs", "b.txt"));
        fs.renameSync(path.join(w.drive, "Docs", "c.txt"), path.join(w.drive, "Docs", "c2.txt"));
        runOk(w, runner);
        assert.deepEqual(mirrorFiles(w), ["a.txt", "b.txt", "c.txt", "c2.txt"]);
        assert.equal(read(path.join(w.mirror, "b.txt")), "deleted on Drive\n");
        const kinds = status(w, runner).conflicts.map(c => [c.kind, c.path, c.to === undefined ? null : c.to]);
        assert.deepEqual(kinds, ids
            ? [["removed-on-drive", "b.txt", null], ["renamed", "c.txt", "c2.txt"]]
            : [["removed-on-drive", "b.txt", null], ["removed-on-drive", "c.txt", null]]);
    }
}

// A run while another holds the pair's lock is `busy` (exit 75) and starts
// no rclone; the first run finishes.
async function caseBusy(runner) {
    const w = world();
    addPair(w, runner);
    drive(w, "a.txt", "one\n", 1700000000);
    const first = startBlocked(w, runner);
    try {
        await waitFor(path.join(w.stub, "blocked"), "the first copy");
        const before = rcloneCalls(w).length;
        assert.equal(status(w, runner).state, "running");
        const second = cli(w, ["run"], runner);
        assert.equal(second.status, 75, second.stderr);
        assert.equal(second.stdout, "pair=docs result=busy\n");
        assert.equal(rcloneCalls(w).length, before, "a busy run starts no rclone");
    } finally {
        if (release(w)) await first.done;
    }
    const ended = await first.done;
    assert.equal(ended.code, 0, ended.stderr);
    assert.deepEqual(mirrorFiles(w), ["a.txt"]);
}

// A runner killed mid-copy leaves its rclone holding the pair's lock: the
// pair reads `running` and a second run is busy while that copy goes on.
// Once it ends, the pair reads as interrupted, not done.
async function caseInterrupted(runner) {
    const w = world();
    addPair(w, runner);
    drive(w, "a.txt", "one\n", 1700000000);
    const first = startBlocked(w, runner);
    let released = false;
    try {
        await waitFor(path.join(w.stub, "blocked"), "the copy");
        first.child.kill("SIGKILL");
        await first.exited;
        assert.equal(status(w, runner).pairs[0].state, "running", "the orphaned copy holds the lock");
        const before = rcloneCalls(w).length;
        const second = cli(w, ["run"], runner);
        assert.equal(second.status, 75, second.stderr);
        assert.equal(second.stdout, "pair=docs result=busy\n");
        assert.equal(rcloneCalls(w).length, before, "no second copy starts beside the orphaned one");
        released = release(w);
        assert.ok(released, "the orphaned copy waits for its release");
        await waitFor(path.join(w.stub, "exited"), "the orphaned copy");
        // The stand-in writes its mark just before it exits and drops the
        // lock; the lock is read again until it is free.
        const deadline = Date.now() + 30000;
        let s = status(w, runner);
        while (s.pairs[0].state === "running" && Date.now() < deadline) {
            await sleep(20);
            s = status(w, runner);
        }
        assert.equal(s.pairs[0].state, "error");
        assert.equal(s.pairs[0].lastError.kind, "interrupted");
        assert.equal(s.pairs[0].lastSuccess, null);
    } finally {
        if (!released && release(w)) await waitFor(path.join(w.stub, "exited"), "the orphaned copy");
    }
}

// Pause is the runner's own record: a later process reads it, a paused run
// copies nothing, and resume lets the next run copy.
function casePause(runner) {
    const w = world();
    addPair(w, runner);
    let out = cli(w, ["pause"], runner);
    assert.equal(out.stdout, "paused=all\n", out.stderr);
    const s = JSON.parse(read(path.join(w.state, "status.json")));
    assert.equal(s.paused, true);
    assert.equal(s.pairs[0].state, "paused");
    drive(w, "a.txt", "one\n", 1700000000);
    out = runOk(w, runner, "paused");
    assert.equal(out.status, 0);
    assert.deepEqual(rcloneCalls(w), []);
    assert.deepEqual(mirrorFiles(w), []);
    assert.equal(cli(w, ["resume"], runner).stdout, "resumed=all\n");
    runOk(w, runner);
    assert.deepEqual(mirrorFiles(w), ["a.txt"]);
    // One pair alone.
    assert.equal(cli(w, ["pause", "--pair", "docs"], runner).stdout, "paused=docs\n");
    runOk(w, runner, "paused");
    assert.equal(status(w, runner).paused, false);
    assert.equal(cli(w, ["pause", "--pair", "nope"], runner).status, 1);
}

// Offline and refused authorization keep the last success and the mirror;
// a missing or locked credential runs no rclone.
function caseFailures(runner) {
    const rows = [
        { name: "offline", setup: w => write(path.join(w.stub, "mode"), "offline"), state: "offline", kind: "offline", rclone: true },
        { name: "rclone refuses the token", setup: w => write(path.join(w.stub, "mode"), "auth"), state: "authorization-required", kind: "authorization-refused", rclone: true },
        { name: "no credential", setup: w => fs.unlinkSync(path.join(w.stub, "secrets", "pull-token")), state: "authorization-required", kind: "credential-absent", account: "pull-token", rclone: false },
        { name: "locked store", setup: w => write(path.join(w.stub, "secrets", "pull-client-id.locked"), ""), state: "authorization-required", kind: "credential-locked", account: "pull-client-id", rclone: false }
    ];
    for (const row of rows) {
        const w = world();
        assert.equal(cli(w, ["install"], runner).status, 0);
        addPair(w, runner);
        drive(w, "a.txt", "one\n", 1700000000);
        runOk(w, runner);
        const success = status(w, runner).pairs[0].lastSuccess;
        drive(w, "b.txt", "not yet\n", 1700000000);
        row.setup(w);
        const calls = rcloneCalls(w).length;
        const out = cli(w, ["run"], runner);
        assert.equal(out.status, 1, row.name);
        assert.equal(out.stdout, "pair=docs result=" + row.state + "\n", row.name);
        assert.equal(rcloneCalls(w).length > calls, row.rclone, row.name);
        assert.deepEqual(mirrorFiles(w), ["a.txt"], row.name);
        const s = status(w, runner);
        assert.equal(s.state, row.state, row.name);
        assert.equal(s.pairs[0].lastSuccess, success, row.name);
        assert.equal(s.lastSuccess, success, row.name);
        assert.equal(s.pairs[0].lastError.kind, row.kind, row.name);
        if (row.account !== undefined) assert.equal(s.pairs[0].lastError.account, row.account, row.name);
        if (row.state === "authorization-required") assert.deepEqual(s.attention.reasons, ["authorization-required"], row.name);
        // The same cause again keeps the attention key, so the plugin does
        // not notify again for it.
        assert.equal(cli(w, ["run"], runner).stdout, "pair=docs result=" + row.state + "\n", row.name);
        assert.deepEqual(status(w, runner).attention, s.attention, row.name + ": a repeated failure keeps the key");
    }
    // Another cause changes the key.
    const w = world();
    assert.equal(cli(w, ["install"], runner).status, 0);
    addPair(w, runner);
    drive(w, "a.txt", "one\n", 1700000000);
    runOk(w, runner);
    write(path.join(w.stub, "mode"), "auth");
    cli(w, ["run"], runner);
    const refused = status(w, runner).attention.key;
    fs.unlinkSync(path.join(w.stub, "mode"));
    fs.unlinkSync(path.join(w.stub, "secrets", "pull-token"));
    cli(w, ["run"], runner);
    assert.notEqual(status(w, runner).attention.key, refused, "a new cause changes the key");
    // Offline with a kept conflict: the conflict alone needs the user, so
    // repeated offline runs keep the key.
    const v = world();
    assert.equal(cli(v, ["install"], runner).status, 0);
    addPair(v, runner);
    drive(v, "a.txt", "one\n", 1700000000);
    runOk(v, runner);
    write(path.join(v.mirror, "a.txt"), "edited here, longer than before\n");
    runOk(v, runner);
    const kept = status(v, runner).attention;
    assert.deepEqual(kept.reasons, ["conflicts"]);
    write(path.join(v.stub, "mode"), "offline");
    cli(v, ["run"], runner);
    cli(v, ["run"], runner);
    assert.deepEqual(status(v, runner).attention, kept, "offline runs keep the conflicts' key");
}

const EXCLUDED = ["~$draft.docx", ".~lock.sheet.ods#", "notes.swp", "notes.txt~", ".#notes.txt", "big.iso.partial", "file.crdownload",
    ".git/config", "sub/.git/HEAD", ".agents/state.json", "local/derived/text.md", "archive/legacy-backups/2019.zip", "sub/key.pem",
    "server.key", "credentials.json", "token.json", "client_secret_123.json", ".env", ".env.local", "id_ed25519"];
const KEPT = ["keep.txt", "archive/2020/keep.pdf", "sub/report.docx"];

// What never enters the mirror and never leaves the upload folder.
function caseExclusions(runner) {
    const w = world();
    addPair(w, runner);
    for (const rel of EXCLUDED.concat(KEPT)) drive(w, rel, "x " + rel + "\n", 1700000000);
    runOk(w, runner);
    assert.deepEqual(mirrorFiles(w), KEPT.slice().sort());
    const uploads = path.join(w.home, "inbox", "agent-uploads");
    // A `.git` at the upload folder's own root makes it a repository root,
    // which the pair rules refuse; a nested one is excluded.
    for (const rel of EXCLUDED.filter(rel => rel !== ".git/config").concat(KEPT)) write(path.join(uploads, rel), "u " + rel + "\n");
    addPair(w, runner, { id: "uploads", label: "Agent uploads", direction: "upload", remote: "Inbox/agent-uploads", local: uploads });
    const out = cli(w, ["run", "--pair", "uploads"], runner);
    assert.equal(out.stdout, "pair=uploads result=idle\n", out.stderr);
    const sent = [];
    const walk = (dir, rel) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const child = rel === "" ? entry.name : rel + "/" + entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), child);
            else sent.push(child);
        }
    };
    walk(path.join(w.drive, "Inbox", "agent-uploads"), "");
    assert.deepEqual(sent.sort(), KEPT.slice().sort());
    const call = rcloneCalls(w).find(c => c.argv[2] === "copy" && c.argv[3] === uploads);
    assert.equal(call.argv[4], "vgsdrive:Inbox/agent-uploads");
    assert.equal(call.env.RCLONE_CONFIG_VGSDRIVE_SCOPE, "drive.file");
    assert.equal(call.env.RCLONE_CONFIG_VGSDRIVE_CLIENT_ID, SECRETS["upload-client-id"]);
    assert.equal(call.env.RCLONE_CONFIG_VGSDRIVE_TOKEN, SECRETS["upload-token"]);
    assert.ok(!call.argv.some(a => a.startsWith("--drive-import-formats")));
}

// Each refusal of a pair, against an existing pair `docs`.
function validationRows(w) {
    const repoDir = path.join(w.home, "repo");
    fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
    fs.mkdirSync(path.join(w.home, "projects", "deep", "personal", ".git"), { recursive: true });
    return [
        { rule: null, def: { id: "uploads", direction: "upload", remote: "Inbox/agent-uploads", local: path.join(w.home, "inbox") } },
        { rule: "shape", def: { extra: true } },
        { rule: "id", def: { id: "Bad_Id" } },
        { rule: "label", def: { label: "" } },
        { rule: "direction", def: { direction: "both" } },
        { rule: "drive-root", def: { remote: "" } },
        { rule: "remote", def: { remote: "Other/../Docs" } },
        { rule: "local", def: { local: "mirror/other" } },
        { rule: "home-or-above", def: { local: w.home } },
        { rule: "home-or-above", def: { local: "/" } },
        { rule: "home-or-above", def: { local: path.dirname(w.home) } },
        { rule: "repository-root", def: { local: repoDir } },
        { rule: "state-overlap", def: { local: path.join(w.state, "elsewhere") } },
        { rule: "vgs-overlap", def: { local: path.join(w.home, ".local", "share", "vgshell", "cloud-sync", "engine") } },
        { rule: "vgs-overlap", def: { local: path.join(w.home, ".config") } },
        { rule: "unit-overlap", def: { local: path.join(w.home, ".config", "systemd", "user") } },
        { rule: "repository-inside", def: { local: w.home + "/projects" } },
        { rule: "duplicate-id", def: { id: "docs" } },
        { rule: "local-overlap", def: { local: path.join(w.mirror, "sub") } },
        { rule: "remote-overlap", def: { remote: "Docs/Sub" } }
    ].map(row => Object.assign(row, { def: Object.assign({ id: "other", label: "Other", direction: "pull", remote: "Other", local: path.join(w.home, "mirror", "other") }, row.def) }));
}

function caseValidation(runner, onlyRule) {
    const w = world();
    addPair(w, runner);
    const before = read(path.join(w.home, ".config", "vgshell", "cloud-sync", "pairs.json"));
    for (const row of validationRows(w)) {
        if (onlyRule !== undefined && row.rule !== onlyRule) continue;
        const out = cli(w, ["pair-add", "--definition", JSON.stringify(row.def)], runner);
        if (row.rule === null) {
            assert.equal(out.status, 0, out.stderr);
            assert.equal(cli(w, ["pair-remove", row.def.id], runner).status, 0);
            continue;
        }
        assert.equal(out.status, 1, "rule " + row.rule + " " + JSON.stringify(row.def));
        const refused = /^cloud-sync: refused: pair=\S+ rule=(\S+)$/m.exec(out.stderr);
        assert.ok(refused !== null, out.stderr);
        assert.equal(refused[1], row.rule, JSON.stringify(row.def));
        assert.equal(read(path.join(w.home, ".config", "vgshell", "cloud-sync", "pairs.json")), before);
    }
    if (onlyRule !== undefined) return;
    // A hand-edited list that breaks a rule runs nothing and reads as an
    // error.
    write(path.join(w.home, ".config", "vgshell", "cloud-sync", "pairs.json"), JSON.stringify({ pairs: [{ id: "all", label: "All", direction: "pull", remote: "", local: w.mirror }] }));
    const out = cli(w, ["run"], runner);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /^cloud-sync: refused: pair=all rule=drive-root$/m);
    assert.deepEqual(rcloneCalls(w), []);
    const s = status(w, runner);
    assert.equal(s.state, "error");
    assert.equal(s.lastError.kind, "pairs-invalid");
    // Removing a pair deletes no file.
    const v = world();
    addPair(v, runner);
    drive(v, "a.txt", "one\n", 1700000000);
    runOk(v, runner);
    assert.equal(cli(v, ["pair-remove", "docs"], runner).stdout, "removed=docs\n");
    assert.deepEqual(mirrorFiles(v), ["a.txt"]);
    assert.equal(status(v, runner).state, "not-set-up");
}

// install writes both units and enables the timer through systemctl;
// start asks systemd for the same service; the units name the engine copy
// and hold no credential.
function caseInstall(runner) {
    const w = world();
    assert.equal(status(w, runner).state, "not-set-up");
    let out = cli(w, ["start"], runner);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /^cloud-sync: refused: units=absent$/m);
    out = cli(w, ["install"], runner);
    assert.equal(out.stdout, "installed=vgs-cloud-sync.timer changed=2\n", out.stderr);
    const unitDir = path.join(w.home, ".config", "systemd", "user");
    const service = read(path.join(unitDir, "vgs-cloud-sync.service"));
    const timer = read(path.join(unitDir, "vgs-cloud-sync.timer"));
    SEEN.push(service, timer);
    const engines = fs.readdirSync(path.join(w.home, ".local", "share", "vgshell", "cloud-sync", "engine"));
    assert.equal(engines.length, 1);
    const engine = path.join(w.home, ".local", "share", "vgshell", "cloud-sync", "engine", engines[0], "cloud-sync");
    assert.equal(read(engine), read(runner || RUNNER));
    assert.ok((fs.statSync(engine).mode & 0o111) !== 0);
    const lines = service.split("\n");
    assert.ok(lines.includes("Type=oneshot"));
    assert.ok(lines.includes("ExecStart=\"" + process.execPath + "\" \"" + engine + "\" \"run\""));
    assert.ok(lines.includes("SuccessExitStatus=75"));
    assert.ok(timer.split("\n").includes("OnCalendar=hourly"));
    assert.ok(timer.split("\n").includes("Persistent=true"));
    assert.deepEqual(read(path.join(w.stub, "systemctl.calls")).trim().split("\n"), ["--user daemon-reload", "--user enable --now vgs-cloud-sync.timer"]);
    addPair(w, runner);
    assert.equal(cli(w, ["pairs", "--lines"], runner).stdout, "docs\tDocuments\n", "the Remove a folder pair list");
    assert.equal(status(w, runner).units, "installed");
    out = cli(w, ["install"], runner);
    assert.equal(out.stdout, "installed=vgs-cloud-sync.timer changed=0\n");
    out = cli(w, ["start"], runner);
    assert.equal(out.stdout, "started=vgs-cloud-sync.service\n", out.stderr);
    assert.deepEqual(read(path.join(w.stub, "systemctl.calls")).trim().split("\n").slice(2), ["--user enable --now vgs-cloud-sync.timer", "--user start --no-block vgs-cloud-sync.service"]);
    write(path.join(unitDir, "vgs-cloud-sync.service"), service.replace(engines[0], "0000000000000000"));
    const s = status(w, runner);
    assert.equal(s.units, "stale");
    assert.deepEqual(s.attention.reasons, ["units-stale"]);
}

// The probe reads presence alone, a locked item included, and a token's
// `user` attribute when it holds an address, a locked item's too.
function caseProbe(runner) {
    const w = world({ secrets: ["pull-client-id", "pull-client-secret"] });
    write(path.join(w.stub, "secrets", "pull-token.user." + ACCOUNT), SECRETS["pull-token"]);
    write(path.join(w.stub, "secrets", "pull-token.locked"), "");
    addPair(w, runner);
    let out = cli(w, ["probe"], runner);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), { credentials: [
        { account: "pull-client-id", presence: "present", needed: true },
        { account: "pull-client-secret", presence: "present", needed: true },
        { account: "pull-token", presence: "locked", needed: true, user: ACCOUNT },
        { account: "upload-client-id", presence: "absent", needed: false },
        { account: "upload-client-secret", presence: "absent", needed: false },
        { account: "upload-token", presence: "absent", needed: false }
    ] });
    // A token without `user`, and one whose `user` is no address, carry none.
    const v = world({ secrets: ["pull-token"] });
    write(path.join(v.stub, "secrets", "upload-token.user.not an address"), SECRETS["upload-token"]);
    out = cli(v, ["probe"], runner);
    assert.equal(out.status, 0, out.stderr);
    const rows = JSON.parse(out.stdout).credentials.filter(c => c.account.endsWith("-token"));
    assert.deepEqual(rows, [
        { account: "pull-token", presence: "present", needed: false },
        { account: "upload-token", presence: "present", needed: false }
    ]);
}

// authorize reads the direction's client from the keyring, hands it to
// `rclone authorize drive` in the environment alone with the direction's
// scope, and stores the token rclone prints through secret-tool's stdin,
// byte for byte, never printing it. A missing client secret starts no
// consent, and a token without a refresh token is not stored.
//
// The token item names the account Drive's about read returns as its
// `user`, and is the account's one item: an older one without `user`, or
// of another user, is gone. The access token reaches curl on stdin alone.
// A failed read, or an address the judge refuses, still stores the token,
// without `user`, and logs one keyed line.
function caseAuthorize(runner) {
    const w = world({ secrets: ["pull-client-id", "pull-client-secret", "upload-client-id", "upload-client-secret"] });
    write(path.join(w.stub, "secrets", "pull-token"), "an older sign-in");
    write(path.join(w.stub, "secrets", "pull-token.user.other@example.com"), "another account's sign-in");
    for (const direction of ["pull", "upload"]) {
        const out = cli(w, ["authorize", direction], runner);
        assert.equal(out.stdout, "authorized=" + direction + "\n", out.stderr);
        assert.deepEqual(tokenItems(w, direction), [direction + "-token.user." + ACCOUNT]);
        assert.equal(read(path.join(w.stub, "secrets", direction + "-token.user." + ACCOUNT)), CONSENT_TOKEN);
        assert.ok(!out.stdout.includes("fake-consent") && !out.stderr.includes("fake-consent"), "the token is printed");
        assert.ok(!/^cloud-sync: account=/m.test(out.stderr), out.stderr);
    }
    const reads = jsonLines(path.join(w.stub, "curl.calls"));
    assert.equal(reads.length, 2);
    for (const call of reads) {
        assert.ok(!call.argv.some(a => CONSENT_VALUES.some(v => a.includes(v))), "the token is in curl's argv: " + JSON.stringify(call.argv));
        assert.equal(call.stdin, "Authorization: Bearer " + CONSENT_VALUES[0] + "\n");
        assert.deepEqual([call.argv[0], call.argv[call.argv.length - 1]], ["-q", ABOUT_URL]);
        assert.ok(call.argv.includes("--max-time"));
    }
    const calls = rcloneCalls(w);
    assert.deepEqual(calls.map(c => c.argv), [["--config", "/dev/null", "authorize", "drive"], ["--config", "/dev/null", "authorize", "drive"]]);
    assert.deepEqual(calls.map(c => c.env), ["pull", "upload"].map(d => ({
        RCLONE_DRIVE_CLIENT_ID: SECRETS[d + "-client-id"],
        RCLONE_DRIVE_CLIENT_SECRET: SECRETS[d + "-client-secret"],
        RCLONE_DRIVE_SCOPE: d === "pull" ? "drive.readonly" : "drive.file"
    })));
    const stores = read(path.join(w.stub, "secret-tool.calls")).trim().split("\n");
    assert.deepEqual(stores, [].concat(...["pull", "upload"].map(d => [
        "clear service vgs-cloud-sync account " + d + "-token",
        "store --label=VGS Cloud Sync " + d + "-token service vgs-cloud-sync account " + d + "-token user " + ACCOUNT
    ])));
    for (const row of [{ mode: "fail", reason: "curl-failed exit=22" }, { mode: "bad", reason: "address-invalid" }]) {
        const u = world({ secrets: ["pull-client-id", "pull-client-secret"] });
        write(path.join(u.stub, "secrets", "pull-token.user.other@example.com"), "another account's sign-in");
        write(path.join(u.stub, "curl-mode"), row.mode);
        const out = cli(u, ["authorize", "pull"], runner);
        assert.equal(out.stdout, "authorized=pull\n", out.stderr);
        assert.deepEqual(tokenItems(u, "pull"), ["pull-token"], row.mode);
        assert.equal(read(path.join(u.stub, "secrets", "pull-token")), CONSENT_TOKEN, row.mode);
        assert.deepEqual(out.stderr.split("\n").filter(l => l.startsWith("cloud-sync: account=")), ["cloud-sync: account=unread reason=" + row.reason], row.mode);
    }
    const v = world({ secrets: ["pull-client-id"] });
    let out = cli(v, ["authorize", "pull"], runner);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /^cloud-sync: refused: credential=absent account=pull-client-secret$/m);
    assert.deepEqual(rcloneCalls(v), []);
    const x = world({ secrets: ["pull-client-id", "pull-client-secret"] });
    write(path.join(x.stub, "mode"), "no-refresh");
    out = cli(x, ["authorize", "pull"], runner);
    assert.match(out.stderr, /^cloud-sync: refused: authorize=no-token$/m);
    assert.ok(!fs.existsSync(path.join(x.stub, "secrets", "pull-token")));
}

// sign-out clears every item of one direction's token and leaves the other
// direction and the client keys; that direction's pairs read as needing a
// sign-in at once, their last success kept. A locked item is not cleared,
// and sign-out says so.
function caseSignOut(runner) {
    const w = world();
    write(path.join(w.stub, "secrets", "pull-token.user." + ACCOUNT), SECRETS["pull-token"]);
    assert.equal(cli(w, ["install"], runner).status, 0);
    addPair(w, runner);
    const uploads = path.join(w.home, "inbox");
    fs.mkdirSync(uploads, { recursive: true });
    addPair(w, runner, { id: "uploads", label: "Agent uploads", direction: "upload", remote: "Inbox", local: uploads });
    drive(w, "a.txt", "one\n", 1700000000);
    const ran = cli(w, ["run"], runner);
    assert.equal(ran.status, 0, ran.stderr);
    const before = status(w, runner);
    const out = cli(w, ["sign-out", "pull"], runner);
    assert.equal(out.stdout, "signed-out=pull\n", out.stderr);
    assert.deepEqual(tokenItems(w, "pull"), []);
    assert.deepEqual(tokenItems(w, "upload"), ["upload-token"]);
    for (const account of ["pull-client-id", "pull-client-secret"]) assert.ok(fs.existsSync(path.join(w.stub, "secrets", account)), account);
    const s = JSON.parse(read(path.join(w.state, "status.json")));
    const docs = s.pairs.find(p => p.id === "docs");
    assert.equal(docs.state, "authorization-required");
    assert.deepEqual([docs.lastError.kind, docs.lastError.account], ["credential-absent", "pull-token"]);
    assert.equal(docs.lastSuccess, before.pairs.find(p => p.id === "docs").lastSuccess);
    assert.deepEqual(s.pairs.find(p => p.id === "uploads"), before.pairs.find(p => p.id === "uploads"));
    assert.deepEqual(status(w, runner).pairs, s.pairs, "the next render keeps it");
    assert.deepEqual([s.attention.reasons, s.attention.notified], [["authorization-required"], true], "the user's own sign-out notifies nothing");
    assert.deepEqual(mirrorFiles(w), ["a.txt"]);
    // A sign-in again: the direction's pairs leave the sign-in state at
    // once, their last success kept; the other direction stays as it was.
    const back = cli(w, ["authorize", "pull"], runner);
    assert.equal(back.stdout, "authorized=pull\n", back.stderr);
    const t = JSON.parse(read(path.join(w.state, "status.json")));
    const signedIn = t.pairs.find(p => p.id === "docs");
    assert.deepEqual([signedIn.state, signedIn.lastError, signedIn.lastSuccess], ["idle", null, docs.lastSuccess]);
    assert.deepEqual(t.pairs.find(p => p.id === "uploads"), before.pairs.find(p => p.id === "uploads"));
    assert.equal(t.attention, null);
    const v = world();
    write(path.join(v.stub, "secrets", "pull-token.locked"), "");
    const locked = cli(v, ["sign-out", "pull"], runner);
    assert.equal(locked.status, 1);
    assert.match(locked.stderr, /^cloud-sync: refused: credential=locked account=pull-token$/m);
    assert.equal(cli(v, ["sign-out", "both"], runner).status, 2);
}

// pairs-reset is only for an invalid list: it keeps the damaged bytes,
// starts a valid empty list, refreshes status and lets pair changes work
// again. A valid or absent list is never reset.
function casePairsReset(runner) {
    const w = world();
    const file = path.join(w.home, ".config", "vgshell", "cloud-sync", "pairs.json");
    const damaged = "{\"pairs\": [";
    write(file, damaged);
    const out = cli(w, ["pairs-reset"], runner);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^reset=pairs\.json\.damaged-\d{8}T\d{6}Z\n$/);
    const keptName = out.stdout.trim().slice("reset=".length);
    const kept = path.join(path.dirname(file), keptName);
    assert.equal(fs.existsSync(kept), true, "the damaged file is kept");
    assert.equal(read(kept), damaged, "the damaged bytes are kept exactly");
    assert.deepEqual(JSON.parse(read(file)), { pairs: [] });
    const rendered = JSON.parse(read(path.join(w.state, "status.json")));
    assert.equal(rendered.lastError, null);
    assert.deepEqual(rendered.pairs, []);
    addPair(w, runner);
    const validBefore = read(file);
    const refused = cli(w, ["pairs-reset"], runner);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /^cloud-sync: refused: pairs=valid$/m);
    assert.equal(read(file), validBefore, "a valid list is unchanged");
    assert.deepEqual(fs.readdirSync(path.dirname(file)).filter(name => name.startsWith("pairs.json.damaged-")).sort(), [keptName]);

    const absent = world();
    const absentFile = path.join(absent.home, ".config", "vgshell", "cloud-sync", "pairs.json");
    const absentOut = cli(absent, ["pairs-reset"], runner);
    assert.equal(absentOut.status, 1);
    assert.match(absentOut.stderr, /^cloud-sync: refused: pairs=valid$/m);
    assert.equal(fs.existsSync(absentFile), false, "an absent list stays absent");

    assert.equal(cli(world(), ["pairs-reset", "extra"], runner).status, 2);
}

// attention-seen marks the record's key notified across renders, pause
// and resume, and a process that reads it afresh; a new key reads
// notified=false again.
function caseAttention(runner) {
    const w = world();
    assert.equal(cli(w, ["install"], runner).status, 0);
    addPair(w, runner);
    drive(w, "a.txt", "one\n", 1700000000);
    runOk(w, runner);
    assert.equal(status(w, runner).attention, null);
    write(path.join(w.mirror, "a.txt"), "edited here, longer than before\n");
    runOk(w, runner);
    const first = status(w, runner).attention;
    assert.deepEqual([first.reasons, first.notified], [["conflicts"], false]);
    const out = cli(w, ["attention-seen", first.key], runner);
    assert.equal(out.stdout, "seen=" + first.key + "\n", out.stderr);
    const seen = Object.assign({}, first, { notified: true });
    assert.deepEqual(JSON.parse(read(path.join(w.state, "status.json"))).attention, seen, "attention-seen rewrites the record");
    assert.deepEqual(status(w, runner).attention, seen, "a second render keeps it");
    for (const args of [["pause"], ["resume"], ["pause", "--pair", "docs"], ["resume", "--pair", "docs"]]) {
        assert.equal(cli(w, args, runner).status, 0);
        assert.deepEqual(status(w, runner).attention, seen, args.join(" ") + " keeps it");
    }
    write(path.join(w.stub, "mode"), "auth");
    cli(w, ["run"], runner);
    const next = status(w, runner).attention;
    assert.notEqual(next.key, first.key);
    assert.equal(next.notified, false, "a new key is not notified");
    for (const bad of [[], ["nope"], [first.key, "extra"]]) assert.equal(cli(w, ["attention-seen"].concat(bad), runner).status, 2, JSON.stringify(bad));
    // A failure that recovers and returns the same way notifies again.
    const u = world();
    assert.equal(cli(u, ["install"], runner).status, 0);
    addPair(u, runner);
    drive(u, "a.txt", "one\n", 1700000000);
    runOk(u, runner);
    write(path.join(u.stub, "mode"), "auth");
    cli(u, ["run"], runner);
    const refused = status(u, runner).attention;
    assert.equal(cli(u, ["attention-seen", refused.key], runner).status, 0);
    assert.equal(status(u, runner).attention.notified, true);
    fs.unlinkSync(path.join(u.stub, "mode"));
    runOk(u, runner);
    assert.equal(status(u, runner).attention, null);
    write(path.join(u.stub, "mode"), "auth");
    cli(u, ["run"], runner);
    const again = status(u, runner).attention;
    assert.deepEqual([again.key, again.notified], [refused.key, false], "a returned failure is not notified");
}

// Two pairs refused at once keep one attention key through a whole run:
// the renders as each pair starts and ends, which the rclone stand-in
// records, and the one after it.
function caseRunKey(runner) {
    const w = world();
    assert.equal(cli(w, ["install"], runner).status, 0);
    addPair(w, runner);
    const uploads = path.join(w.home, "inbox");
    fs.mkdirSync(uploads, { recursive: true });
    addPair(w, runner, { id: "up", label: "Agent uploads", direction: "upload", remote: "Inbox", local: uploads });
    write(path.join(w.stub, "mode"), "auth");
    cli(w, ["run"], runner);
    const settled = status(w, runner).attention;
    assert.deepEqual(settled.reasons, ["authorization-required"]);
    const before = rcloneCalls(w).length;
    const out = cli(w, ["run"], runner);
    assert.equal(out.stdout, "pair=docs result=authorization-required\npair=up result=authorization-required\n", out.stderr);
    const during = rcloneCalls(w).slice(before).map(c => c.attention === null ? null : c.attention.key);
    assert.equal(during.length, 2);
    assert.deepEqual(during.concat([status(w, runner).attention.key]), [settled.key, settled.key, settled.key]);
}

// No credential value in any argv, log line, unit or status record.
function caseNoLeak() {
    for (const dir of fs.readdirSync(scratch)) {
        const statusFile = path.join(scratch, dir, "home", ".local", "state", "vgshell", "cloud-sync", "status.json");
        if (fs.existsSync(statusFile)) SEEN.push(read(statusFile));
        for (const name of ["rclone.calls", "curl.calls"])
            for (const call of jsonLines(path.join(scratch, dir, "stub", name))) SEEN.push(JSON.stringify(call.argv));
    }
    assert.ok(SEEN.length > 50);
    for (const text of SEEN) {
        for (const [account, value] of Object.entries(SECRETS))
            assert.ok(!String(text).includes(value), "the value of " + account + " leaked");
        for (const value of CONSENT_VALUES) assert.ok(!String(text).includes(value), "the consent token leaked");
    }
}

// ----------------------------------------------------------- the controls

// A copy of the runner with FROM replaced by TO, COUNT times.
function mutant(name, from, to, count) {
    const text = read(RUNNER);
    const found = text.split(from).length - 1;
    assert.equal(found, count === undefined ? 1 : count, "control " + name + " matches " + found + " times");
    const dir = fs.mkdtempSync(path.join(scratch, "control-"));
    const file = path.join(dir, "cloud-sync");
    fs.writeFileSync(file, text.split(from).join(to), { mode: 0o755 });
    assert.notEqual(read(file), text);
    return file;
}

async function mustFail(name, runner, fn) {
    let failedWith = null;
    try {
        await fn(runner);
    } catch (e) {
        failedWith = e;
    }
    assert.ok(failedWith instanceof assert.AssertionError, "control " + name + ": the case passed against the broken runner" + (failedWith ? ": " + failedWith : ""));
}

async function controls() {
    await mustFail("copy", mutant("copy", "rclone([\"copy\", remotePath(pair), pair.local,", "rclone([\"copy\", \"--dry-run\", remotePath(pair), pair.local,"), caseCopy);
    await mustFail("edit during the copy", mutant("edit during the copy", "const baseline = matches ? { size: item.Size, mtimeMs: modTime, hash: md5, id: item.ID || null } : old;", "const baseline = { size: st.size, mtimeMs: Math.floor(st.mtimeMs), hash: matches ? md5 : null, id: item.ID || null };"), caseEditDuringCopy);
    await mustFail("attention key", mutant("attention key", "conflicts.map(c => [c.kind, c.pair, c.path, c.since]), cause])", "conflicts.map(c => [c.kind, c.pair, c.path, c.since]), lastError])"), caseFailures);
    await mustFail("orphaned copy lock", mutant("orphaned copy lock", "stdio: [\"ignore\", \"pipe\", \"pipe\", lock] });", "stdio: [\"ignore\", \"pipe\", \"pipe\"] });"), caseInterrupted);
    await mustFail("local-edit", mutant("local-edit", "const unedited = base !== undefined", "const unedited = true || base !== undefined"), caseLocalEdit);
    await mustFail("lock", mutant("lock", "if (out.status === 0) return fd;", "if (out.status === 0 || true) return fd;"), caseBusy);
    await mustFail("pause", mutant("pause", "if (isPaused(control, pair.id)) return \"paused\";", ""), casePause);
    await mustFail("exclusions", mutant("exclusions", "return [].concat(...EXCLUDES.map(pattern => [\"--exclude\", pattern]));", "return [];"), caseExclusions);
    await mustFail("renamed", mutant("renamed", "for (const item of listing) if (item.ID) pathOfId[item.ID] = item.Path;", ""), caseRemovedAndRenamed);
    await mustFail("failure table", mutant("failure table", "const row = FAILURES.find(r => r.pattern.test(stderr));", "const row = undefined;"), caseFailures);
    await mustFail("authorize store", mutant("authorize store", "{ input: token, encoding", "{ input: token + \"\\n\", encoding"), caseAuthorize);
    await mustFail("authorize scope", mutant("authorize scope", "RCLONE_DRIVE_SCOPE: SCOPES[direction]", "RCLONE_DRIVE_SCOPE: \"drive\""), caseAuthorize);
    await mustFail("token off curl's argv", mutant("token off curl's argv", "\"--header\", \"@-\", ABOUT_URL]", "\"--header\", \"Authorization: Bearer \" + access, ABOUT_URL]"), caseAuthorize);
    await mustFail("user attribute", mutant("user attribute", ".concat(read.kind === \"read\" ? [\"user\", read.address] : [])", ".concat([])"), caseAuthorize);
    await mustFail("one token item", mutant("one token item", "clearAccount(tool, account);\n    const attributes", "const attributes"), caseAuthorize);
    await mustFail("unread logged", mutant("unread logged", "if (read.kind === \"unread\") log(\"account=unread reason=\" + read.reason);", ""), caseAuthorize);
    await mustFail("address judge", mutant("address judge", "function validAddress(value) {\n    return ", "function validAddress(value) {\n    return typeof value === \"string\" || "), caseAuthorize);
    await mustFail("probe user", mutant("probe user", "if (part === \"token\" && probed.user !== null) row.user = probed.user;", ""), caseProbe);
    await mustFail("sign-out clears", mutant("sign-out clears", "clearAccount(tool, account);\n    const left", "const left"), caseSignOut);
    await mustFail("sign-out direction", mutant("sign-out direction", "if (pair.direction !== direction || lockHeld(pairLock(pair.id))) continue;\n            writePairState(pair.id, failed(", "if (lockHeld(pairLock(pair.id))) continue;\n            writePairState(pair.id, failed("), caseSignOut);
    await mustFail("sign-out locked", mutant("sign-out locked", "if (left === \"locked\") refuse(\"credential=locked account=\" + account);", ""), caseSignOut);
    await mustFail("notified", mutant("notified", "notified: control.notifiedKey === key", "notified: false"), caseAttention);
    await mustFail("attention-seen writes", mutant("attention-seen writes", "writeJson(controlFile, Object.assign(readControl(), { notifiedKey: words[0] }));", ""), caseAttention);
    await mustFail("nothing to clear", mutant("nothing to clear", "if (out.status === 1 && out.stderr === \"\") return;", ""), caseAuthorize);
    await mustFail("running pair stands", mutant("running pair stands", "p.state === \"running\" && p.lastError !== null ? failureState(p.lastError.kind) : p.state", "p.state"), caseRunKey);
    await mustFail("cause by pair id", mutant("cause by pair id", ".sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);", ".sort((a, b) => String(b.lastError.at).localeCompare(String(a.lastError.at))).slice(0, 1);"), caseRunKey);
    await mustFail("re-arm", mutant("re-arm", "if (control.notifiedKey !== null) writeJson(controlFile, Object.assign(control, { notifiedKey: null }));", ""), caseAttention);
    await mustFail("sign-out notified", mutant("sign-out notified", "if (after !== null && (before === null || before.notified)) writeJson(", "if (false) writeJson("), caseSignOut);
    await mustFail("sign-in resets", mutant("sign-in resets", "if (state.state === \"authorization-required\") writePairState(", "if (false) writePairState("), caseSignOut);
    await mustFail("pause keeps notified", mutant("pause keeps notified", "paused ? control.pausedPairs : [], notifiedKey: control.notifiedKey }", "paused ? control.pausedPairs : [] }"), caseAttention);
    await mustFail("child environment", mutant("child environment", "const env = { LANG: \"C.UTF-8\" };", "const env = Object.assign({ LANG: \"C.UTF-8\" }, process.env);"), caseCopy);
    await mustFail("pairs-reset keeps the damaged file", mutant("pairs-reset keeps the damaged file", "fs.renameSync(pairsFile, kept);\n        writeJson(pairsFile, { pairs: [] });", "writeJson(pairsFile, { pairs: [] });"), casePairsReset);
    await mustFail("pairs-reset refuses a valid list", mutant("pairs-reset refuses a valid list", "if (read.error === null) refuse(\"pairs=valid\");", "if (false) refuse(\"pairs=valid\");"), casePairsReset);
    const rules = [...new Set(validationRows(world()).map(row => row.rule).filter(rule => rule !== null))];
    for (const rule of rules) {
        const text = read(RUNNER);
        const target = ["duplicate-id", "local-overlap", "remote-overlap"].indexOf(rule) !== -1 ? "return refusal(a, \"" + rule + "\")" : "return refusal(pair, \"" + rule + "\")";
        await mustFail("rule " + rule, mutant("rule " + rule, target, "(0)", text.split(target).length - 1 || 1), r => caseValidation(r, rule));
    }
}

async function main() {
    caseCopy();
    caseLocalEdit();
    caseEditDuringCopy();
    caseRemovedAndRenamed();
    await caseBusy();
    await caseInterrupted();
    casePause();
    caseFailures();
    caseExclusions();
    caseValidation();
    caseInstall();
    caseProbe();
    caseAuthorize();
    caseSignOut();
    casePairsReset();
    caseAttention();
    caseRunKey();
    caseNoLeak();
    await controls();
    console.log("test-cloud-sync-runner: ok");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
