#!/usr/bin/env node
// The Start Jarvis at boot helper, backend/session-start.js, run as the
// shell runs it, with AgentProfiles.js's session forms and
// TaskRunner.session. A fixture `claude` stands in for
// the account's program and tmux is the J09 world's own server on a scratch
// socket, never the caller's. No vendor program, account, network or live
// session. A control runs a private copy of the plugin with one planted
// defect.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const tree = path.resolve(__dirname, "..");
const plugin = path.join(tree, "shell/plugins/vgs.jarvis");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The fixture program: one line per start in its working folder, then it
// holds its session open until the test releases it.
const programFixture = `#!/usr/bin/env python3
import json, os, pathlib, sys, time
cwd = pathlib.Path.cwd()
line = json.dumps({"argv": sys.argv[1:], "cwd": str(cwd), "account": os.environ.get("CLAUDE_CONFIG_DIR")})
fd = os.open(cwd / "starts.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
os.write(fd, (line + "\\n").encode())
os.close(fd)
while not (cwd / "release").exists():
    time.sleep(0.02)
`;

async function inside() {
    const root = process.env.JARVIS_TEST_ROOT;
    const home = process.env.HOME;
    const env = { ...process.env };
    const folder = path.join(home, "Jarvis");
    const account = path.join(home, ".claude");
    for (const directory of [folder, account, path.join(home, ".codex")]) fs.mkdirSync(directory);
    // An account's id as the Jarvis page saves it (Accounts.js identity).
    const cli = (provider, directory) => "cli:" + crypto.createHash("sha256")
        .update(JSON.stringify([provider, directory])).digest("hex").slice(0, 32);
    const claude = cli("claude", account);
    require(path.join(plugin, "backend/Core.js")).use(tree);
    const { Accounts } = require(path.join(plugin, "backend/Accounts.js"));
    const judge = new Accounts(path.join(process.env.XDG_STATE_HOME, "vgshell/jarvis"), env);
    const local = judge.localRows().map(({ row, label, source }) => judge.account(row, label, { kind: "found" }, source).id)[0];
    assert.equal(typeof local, "string");
    let cases = 0, controls = 0;

    const tmux = args => cp.spawnSync("tmux", args, { env, encoding: "utf8", timeout: 10000 });
    const sessions = () => {
        const listed = tmux(["list-sessions", "-F", "#{session_name}"]);
        return listed.status === 0 ? listed.stdout.split("\n").filter(Boolean) : [];
    };
    const starts = () => fs.existsSync(path.join(folder, "starts.log"))
        ? fs.readFileSync(path.join(folder, "starts.log"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
    async function until(label, read) {
        for (let attempt = 0; attempt < 500; attempt++) {
            const value = read();
            if (value) return value;
            await sleep(20);
        }
        assert.fail(label + " did not happen");
    }
    // End the session and forget its starts, so each case meets no session.
    async function reset() {
        fs.writeFileSync(path.join(folder, "release"), "");
        await until("the session ends", () => sessions().length === 0);
        fs.rmSync(path.join(folder, "release"));
        fs.rmSync(path.join(folder, "starts.log"), { force: true });
    }
    // One helper run from DIRECTORY, a plugin tree: its answer's kind.
    function helper(directory, args, extra = {}) {
        const result = cp.spawnSync(process.execPath, [path.join(directory, "backend/session-start.js"), "--tree", tree, ...args],
            { env: { ...env, ...extra }, encoding: "utf8", timeout: 30000 });
        assert.equal(result.status, 0, "the helper answers: " + result.stderr);
        return JSON.parse(result.stdout).kind;
    }

    // A start makes one session that runs the account's program in the home
    // folder; a second start, a `vgshell restart`, makes no second one.
    async function once(directory) {
        assert.equal(helper(directory, ["check", claude, "~/Jarvis"]), "ready");
        assert.deepEqual(sessions(), [], "a check starts nothing");
        assert.equal(helper(directory, ["start", claude, "~/Jarvis", "resume"]), "started");
        const first = await until("the program starts", () => starts()[0]);
        assert.deepEqual(first, { argv: ["--continue"], cwd: folder, account });
        assert.deepEqual(sessions(), ["jarvis"]);
        assert.equal(helper(directory, ["start", claude, "~/Jarvis", "resume"]), "running", "a second start finds the session");
        assert.equal(helper(directory, ["start", claude, "~/Jarvis", "new"]), "running");
        assert.deepEqual(sessions(), ["jarvis"], "a second start makes no second session");
        assert.equal(starts().length, 1, "a second start runs no second program");
        await reset();
        cases++;
    }
    async function fresh(directory) {
        assert.equal(helper(directory, ["start", claude, folder, "new"]), "started");
        assert.deepEqual((await until("the program starts", () => starts()[0])).argv, [], "a new session takes no resume form");
        await reset();
        cases++;
    }
    // Each row: what no start can use, and the answer that names it.
    const refusals = [
        ["no-account", ["", "~/Jarvis"], {}],
        ["no-account", [cli("claude", path.join(home, ".claude-gone")), "~/Jarvis"], {}],
        ["not-app", [local, "~/Jarvis"], {}],
        ["no-home", [claude, ""], {}],
        ["no-home", [claude, "~/Absent"], {}],
        ["no-home", [claude, "/outside"], {}],
        ["program-missing", [cli("codex", path.join(home, ".codex")), "~/Jarvis"], {}],
        ["tmux-missing", [claude, "~/Jarvis"], { PATH: path.join(root, "standins") }]
    ];
    function refused(directory, rows = refusals) {
        for (const [kind, args, extra] of rows)
            for (const verb of [["check"], ["start", "resume"]]) {
                assert.equal(helper(directory, [verb[0], ...args, ...verb.slice(1)], extra), kind, kind + " " + verb[0]);
                assert.deepEqual(sessions(), [], kind + " starts nothing");
                cases++;
            }
    }

    await once(plugin);
    await fresh(plugin);
    refused(plugin);

    async function control(name, file, needle, replacement, check) {
        const source = fs.readFileSync(path.join(plugin, file), "utf8");
        assert.equal(source.split(needle).length - 1, 1, name + " match");
        const copy = path.join(root, "control-" + name);
        fs.cpSync(plugin, copy, { recursive: true });
        fs.writeFileSync(path.join(copy, file), source.replace(needle, replacement));
        await assert.rejects(async () => check(copy), error => {
            assert.ok(error instanceof assert.AssertionError, name + " must turn red, not crash: " + error.stack);
            console.log("test-jarvis-session-start: control=" + name + " killed by=" + JSON.stringify(error.message.split("\n")[0]));
            return true;
        });
        if (sessions().length > 0 || fs.existsSync(path.join(folder, "starts.log"))) await reset();
        controls++;
    }
    await control("duplicate-start", "backend/TaskRunner.js",
        'if (found.signal === null && found.code === 0) return "running";', "", once);
    await control("resume-form", "backend/AgentProfiles.js", 'resume: ["claude", "--continue"]', 'resume: ["claude"]', once);
    await control("account-folder", "backend/session-start.js",
        '["env", row.account.variable + "=" + resolved.source.directory]', '["env", "UNUSED=1"]', once);
    await control("mode", "backend/session-start.js", 'mode === "new" ? row.session.fresh : row.session.resume', "row.session.resume", fresh);
    await control("not-app", "backend/session-start.js", 'if (resolved.source.kind !== "cli") return answer("not-app");', "",
        copy => refused(copy, [refusals[2]]));
    await control("home-folder", "backend/session-start.js",
        "folder === null || !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()", "folder === null",
        copy => refused(copy, [refusals[4]]));
    tmux(["kill-server"]);
    console.log("test-jarvis-session-start: ok cases=" + cases + " controls=" + controls);
}

function main() {
    if (process.argv[2] === "--inside") return inside().catch(error => { console.error(error); process.exit(1); });
    const parent = require("node:os").tmpdir();
    const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "js-")));
    try {
        const standins = path.join(root, "standins");
        fs.mkdirSync(standins);
        fs.writeFileSync(path.join(standins, "claude"), programFixture, { mode: 0o755 });
        const result = cp.spawnSync("/bin/bash", [path.join(tree, "scripts/lib/jarvis-env.sh"), standins,
            "--", "node", __filename, "--inside"], {
            env: { PATH: "/usr/bin:/bin", HOME: root, JARVIS_TEST_SCRATCH_ROOT: root },
            encoding: "utf8", timeout: 300000
        });
        process.stdout.write(result.stdout || "");
        process.stderr.write(result.stderr || "");
        if (result.error) throw result.error;
        assert.equal(result.signal, null);
        process.exitCode = result.status;
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
