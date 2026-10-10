#!/usr/bin/env node
// The Cloud Sync runner, shell/plugins/vgs.cloud-sync/bin/cloud-sync, end to
// end against rclone's `local` backend: a Drive-side add and change reach
// the mirror after one run; a local edit since the last download keeps
// both versions and reads `local-edit`; a Drive deletion keeps the file and
// reads `removed-on-drive`; a rename reads `renamed` where the backend has
// object ids; a run during another is `busy` and starts no second copy; a
// run killed mid-copy reads as interrupted; pause persists across processes
// and a paused run copies nothing; offline and authorization failures keep
// the last success; the exclusions; pair validation; install, start, probe
// and status; authorize stores the token Google's consent returns through
// secret-tool's stdin; and no credential value reaches an argv, a log
// line, a unit or the status record.
//
// Every case runs in its own scratch home and runtime directory with a PATH
// of stand-ins: `secret-tool` answers from fake values under the case's
// stub directory, `systemctl` records its calls, and `rclone` records its
// argv and RCLONE_* environment, swaps the drive remote for the local
// backend rooted at the case's fixture Drive and runs the host's rclone,
// except for `authorize`, which it answers itself with a fixture token, so
// no browser opens and no consent leaves the machine.
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
    write(path.join(w.bin, "secret-tool"), `#!${HOST.bash}
store=${JSON.stringify(path.join(w.stub, "secrets"))}
if [[ $1 == store ]]; then
  [[ $2 == --label=* && $3 == service && $4 == vgs-cloud-sync && $5 == account && $# -eq 6 ]] || exit 2
  printf '%s\n' "$*" >>${JSON.stringify(path.join(w.stub, "secret-tool.calls"))}
  # The stand-ins' PATH holds no cat; read keeps every byte but NUL.
  IFS= read -r -d '' value || true
  printf '%s' "$value" >"$store/$6"
  exit 0
fi
[[ $1 == search && $2 == service && $3 == vgs-cloud-sync && $4 == account && $# -eq 5 ]] || exit 2
account=$5
if [[ -f $store/$account.locked ]]; then
  printf '[/org/freedesktop/secrets/collection/login/1]\\nlabel = VGS Cloud Sync %s\\n' "$account"
  printf 'attribute.service = vgs-cloud-sync\\nattribute.account = %s\\nsecret-tool: Cannot get secret of a locked object\\n' "$account" >&2
elif [[ -f $store/$account ]]; then
  printf '[/org/freedesktop/secrets/collection/login/1]\\nlabel = VGS Cloud Sync %s\\nsecret = %s\\n' "$account" "$(<"$store/$account")"
  printf 'attribute.service = vgs-cloud-sync\\nattribute.account = %s\\n' "$account" >&2
fi
exit 0
`, 0o755);
    write(path.join(w.bin, "systemctl"), `#!${HOST.bash}
printf '%s\\n' "$*" >>${JSON.stringify(path.join(w.stub, "systemctl.calls"))}
`, 0o755);
    write(path.join(w.stub, "record.js"), `const fs = require("fs");
const env = {};
for (const name of Object.keys(process.env)) if (name.startsWith("RCLONE_")) env[name] = process.env[name];
fs.appendFileSync(${JSON.stringify(path.join(w.stub, "rclone.calls"))}, JSON.stringify({ argv: process.argv.slice(2), env }) + "\\n");
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

function rcloneCalls(w) {
    const file = path.join(w.stub, "rclone.calls");
    return fs.existsSync(file) ? read(file).trim().split("\n").map(line => JSON.parse(line)) : [];
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

// A run killed mid-copy leaves no `running` behind: the lock dies with it.
async function caseInterrupted(runner) {
    const w = world();
    addPair(w, runner);
    drive(w, "a.txt", "one\n", 1700000000);
    const first = startBlocked(w, runner);
    try {
        await waitFor(path.join(w.stub, "blocked"), "the copy");
        first.child.kill("SIGKILL");
        // The orphaned stand-in holds the dead runner's pipes open, so its
        // exit, not their close, ends the run.
        await first.exited;
        const s = status(w, runner);
        assert.equal(s.pairs[0].state, "error");
        assert.equal(s.pairs[0].lastError.kind, "interrupted");
        assert.equal(s.pairs[0].lastSuccess, null);
    } finally {
        if (release(w)) await waitFor(path.join(w.stub, "exited"), "the orphaned copy");
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
    }
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

// The probe reads presence alone, a locked item included.
function caseProbe(runner) {
    const w = world({ secrets: ["pull-client-id", "pull-client-secret", "pull-token"] });
    write(path.join(w.stub, "secrets", "pull-token.locked"), "");
    addPair(w, runner);
    const out = cli(w, ["probe"], runner);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), { credentials: [
        { account: "pull-client-id", presence: "present", needed: true },
        { account: "pull-client-secret", presence: "present", needed: true },
        { account: "pull-token", presence: "locked", needed: true },
        { account: "upload-client-id", presence: "absent", needed: false },
        { account: "upload-client-secret", presence: "absent", needed: false },
        { account: "upload-token", presence: "absent", needed: false }
    ] });
}

// authorize reads the direction's client from the keyring, hands it to
// `rclone authorize drive` in the environment alone with the direction's
// scope, and stores the token rclone prints through secret-tool's stdin,
// byte for byte, never printing it. A missing client secret starts no
// consent, and a token without a refresh token is not stored.
function caseAuthorize(runner) {
    const w = world({ secrets: ["pull-client-id", "pull-client-secret", "upload-client-id", "upload-client-secret"] });
    for (const direction of ["pull", "upload"]) {
        const out = cli(w, ["authorize", direction], runner);
        assert.equal(out.stdout, "authorized=" + direction + "\n", out.stderr);
        assert.equal(read(path.join(w.stub, "secrets", direction + "-token")), CONSENT_TOKEN);
        assert.ok(!out.stdout.includes("fake-consent") && !out.stderr.includes("fake-consent"), "the token is printed");
    }
    const calls = rcloneCalls(w);
    assert.deepEqual(calls.map(c => c.argv), [["--config", "/dev/null", "authorize", "drive"], ["--config", "/dev/null", "authorize", "drive"]]);
    assert.deepEqual(calls.map(c => c.env), ["pull", "upload"].map(d => ({
        RCLONE_DRIVE_CLIENT_ID: SECRETS[d + "-client-id"],
        RCLONE_DRIVE_CLIENT_SECRET: SECRETS[d + "-client-secret"],
        RCLONE_DRIVE_SCOPE: d === "pull" ? "drive.readonly" : "drive.file"
    })));
    const stores = read(path.join(w.stub, "secret-tool.calls")).trim().split("\n");
    assert.deepEqual(stores, ["pull", "upload"].map(d => "store --label=VGS Cloud Sync " + d + "-token service vgs-cloud-sync account " + d + "-token"));
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

// No credential value in any argv, log line, unit or status record.
function caseNoLeak() {
    for (const dir of fs.readdirSync(scratch)) {
        const statusFile = path.join(scratch, dir, "home", ".local", "state", "vgshell", "cloud-sync", "status.json");
        if (fs.existsSync(statusFile)) SEEN.push(read(statusFile));
        const calls = path.join(scratch, dir, "stub", "rclone.calls");
        if (fs.existsSync(calls)) for (const line of read(calls).trim().split("\n")) SEEN.push(JSON.stringify(JSON.parse(line).argv));
    }
    assert.ok(SEEN.length > 50);
    for (const text of SEEN)
        for (const [account, value] of Object.entries(SECRETS))
            assert.ok(!String(text).includes(value), "the value of " + account + " leaked");
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
    await mustFail("local-edit", mutant("local-edit", "const unedited = base !== undefined", "const unedited = true || base !== undefined"), caseLocalEdit);
    await mustFail("lock", mutant("lock", "if (out.status === 0) return fd;", "if (out.status === 0 || true) return fd;"), caseBusy);
    await mustFail("pause", mutant("pause", "if (isPaused(control, pair.id)) return \"paused\";", ""), casePause);
    await mustFail("exclusions", mutant("exclusions", "return [].concat(...EXCLUDES.map(pattern => [\"--exclude\", pattern]));", "return [];"), caseExclusions);
    await mustFail("renamed", mutant("renamed", "for (const item of listing) if (item.ID) pathOfId[item.ID] = item.Path;", ""), caseRemovedAndRenamed);
    await mustFail("failure table", mutant("failure table", "const row = FAILURES.find(r => r.pattern.test(stderr));", "const row = undefined;"), caseFailures);
    await mustFail("authorize store", mutant("authorize store", "{ input: token, encoding", "{ input: token + \"\\n\", encoding"), caseAuthorize);
    await mustFail("authorize scope", mutant("authorize scope", "RCLONE_DRIVE_SCOPE: SCOPES[direction]", "RCLONE_DRIVE_SCOPE: \"drive\""), caseAuthorize);
    await mustFail("child environment", mutant("child environment", "const env = { LANG: \"C.UTF-8\" };", "const env = Object.assign({ LANG: \"C.UTF-8\" }, process.env);"), caseCopy);
    const rules = [...new Set(validationRows(world()).map(row => row.rule).filter(rule => rule !== null))];
    for (const rule of rules) {
        const text = read(RUNNER);
        const target = rule === "duplicate-id" || rule.endsWith("-overlap") && rule !== "state-overlap" ? "return refusal(a, \"" + rule + "\")" : "return refusal(pair, \"" + rule + "\")";
        await mustFail("rule " + rule, mutant("rule " + rule, target, "(0)", text.split(target).length - 1 || 1), r => caseValidation(r, rule));
    }
}

async function main() {
    caseCopy();
    caseLocalEdit();
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
    caseNoLeak();
    await controls();
    console.log("test-cloud-sync-runner: ok");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
