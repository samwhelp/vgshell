#!/usr/bin/env node
// session-control.js --tree ABSOLUTE_VGS_TREE VERB ARGS..., the one caller
// of the Jarvis package's session command, `jarvis-session` in the home
// folder (Home.sessionCommand). The package owns the user's Jarvis session:
// its record, its tmux session, resume and hand-over. This file starts no
// program but that command, and reads no answer but its contract's.
// ACCOUNT is the plugin's `brain` setting, HOME its `home` setting, MODE
// "resume" or "new".
//   status HOME                      reads the session; starts nothing
//   build ACCOUNT HOME MODE BOOT     the service's build: `start --origin
//                                    app-on` after the app's Off, else
//                                    `start --origin boot` while BOOT is
//                                    "on", else a status read
//   start ACCOUNT HOME MODE          `start --origin manual`
//   change OLD ACCOUNT HOME MODE     a changed account or home: while a
//                                    session lives in OLD, checks the new
//                                    selection, stops the old session and
//                                    starts the new one; else a status read
//   stop HOME [app-off]              `stop`, with the app's Off recorded
// Each verb prints one JSON line and exits 0:
//   { kind: "answer", state, reason, detail, names: { home, account } }
//     the package's answer, names those of the recorded session or null;
//     `unapplied`, a block, is added when the selection failed its check
//     and the session that lives stays as it is
//   { kind: "blocked", block }  "no-account", "not-app", "no-home" or
//     "package": no call can be made
//   { kind: "failed" }  the command ran outside its contract
// Arguments it cannot read exit 2 with a keyed line.
"use strict";
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// The contract's closed table: each state with its reasons.
const STATES = Object.freeze({
    running: ["resumed", "new-no-record", "new-history-gone", "new-selection-changed", "new-requested", "existing"],
    starting: ["launching"],
    "handing-over": ["succession"],
    stopping: ["stop-requested"],
    stopped: ["never-started", "stopped", "ended"],
    off: ["app-off"],
    blocked: ["app-off", "name-conflict", "record-unreadable", "sign-in-required", "selection-conflict", "tmux-missing", "app-missing"],
    failed: ["launch-failed", "handover-failed"]
});
const LIVE = ["running", "starting", "handing-over"];
// One command run: a bound on a stalled command, not a latency budget.
const COMMAND_MS = 60000;
const OUTPUT_BYTES = 16384;

/** The contract's one object from a run's stdout, or null for anything else. */
function accepted(text) {
    if (!/^[^\n]+\n$/.test(text)) return null;
    let value;
    try { value = JSON.parse(text); } catch { return null; }
    const optional = field => value[field] === null || typeof value[field] === "string";
    if (value === null || typeof value !== "object" || Array.isArray(value) || value.v !== 1
            || !Object.hasOwn(STATES, value.state) || !STATES[value.state].includes(value.reason)
            || !["home", "harness", "account"].every(optional) || typeof value.detail !== "string") return null;
    return value;
}

async function main() {
    const [flag, tree, verb, ...args] = process.argv.slice(2);
    const shapes = { status: 1, build: 4, start: 3, change: 4, stop: [1, 2] };
    if (flag !== "--tree" || !path.isAbsolute(tree || "") || !Object.hasOwn(shapes, verb)
            || ![].concat(shapes[verb]).includes(args.length)
            || (verb === "build" && !["on", "off"].includes(args[3]))
            || (["build", "start"].includes(verb) && !["resume", "new"].includes(args[2]))
            || (verb === "change" && !["resume", "new"].includes(args[3]))
            || (verb === "stop" && args.length === 2 && args[1] !== "app-off")) {
        process.stderr.write("jarvis: session-control=arguments\n");
        return 2;
    }
    require("./Core.js").use(tree);
    const { Accounts, provider } = require("./Accounts.js");
    const Home = require("./Home.js");
    const user = process.env.HOME;
    // The session is the user's own program, so the command takes the
    // user's session environment, XDG_SESSION_ID for its boot receipt among
    // it, less what marks the shell's own processes and a tmux pane the
    // shell was restarted from.
    const { TMUX, TMUX_PANE, VGSHELL_RUNNER_PID, ...environment } = process.env;

    const blocked = block => ({ kind: "blocked", block });
    const short = value => value === user || value.startsWith(user + "/") ? "~" + value.slice(user.length) : value;
    const answer = value => ({ kind: "answer", state: value.state, reason: value.reason, detail: value.detail,
        names: value.home === null || value.harness === null || value.account === null ? null
            : { home: short(value.home), account: provider(value.harness).label + ", " + short(value.account) } });

    // The home folder a setting names with its session command, or a block.
    function place(setting) {
        let folder = null;
        try { folder = Home.resolve(setting, user); }
        catch (error) {
            // A setting the daemon refuses is the home row's to show.
            if (!/^jarvis: home=/.test(error.message)) throw error;
        }
        if (folder === null || !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) return blocked("no-home");
        const command = Home.sessionCommand(folder);
        return command === null ? blocked("package") : { folder, command };
    }
    // The app account a setting names, or a block.
    function account(setting) {
        const state = path.join(process.env.XDG_STATE_HOME || path.join(user, ".local/state"), "vgshell/jarvis");
        const resolved = setting === "" ? null : new Accounts(state, process.env).resolve(setting);
        if (resolved === null) return blocked("no-account");
        return resolved.source.kind === "cli" ? { harness: resolved.provider, directory: resolved.source.directory } : blocked("not-app");
    }
    // One run of the command by argument list in its home: the contract's
    // object for exit 0 or 1, else null.
    function run(at, words) {
        return new Promise(resolve => {
            const child = cp.spawn(at.command, words.concat(["--home", at.folder]), { cwd: at.folder, env: environment, stdio: ["ignore", "pipe", "ignore"] });
            let out = "";
            const timer = setTimeout(() => child.kill("SIGKILL"), COMMAND_MS);
            child.stdout.setEncoding("utf8");
            child.stdout.on("data", text => { if (out.length <= OUTPUT_BYTES) out += text; });
            child.on("error", () => { clearTimeout(timer); resolve(null); });
            child.on("close", (code, signal) => {
                clearTimeout(timer);
                resolve(signal === null && (code === 0 || code === 1) ? accepted(out) : null);
            });
        });
    }
    const failed = { kind: "failed" };
    // The session as the command reads it now; a status outside the
    // contract is no package VGS can use.
    const read = async at => await run(at, ["status"]) ?? blocked("package");
    // `start` on the selection, then the session as it is after it. A
    // refusal's own object is the answer.
    async function start(at, who, mode, origin) {
        const started = await run(at, ["start", "--harness", who.harness, "--account", who.directory, "--mode", mode, "--origin", origin]);
        if (started === null) return failed;
        if (started.state === "blocked" || started.state === "failed") return answer(started);
        const after = await run(at, ["status"]);
        return after === null ? failed : answer(after);
    }
    const shown = value => value.kind === "blocked" ? value : answer(value);

    if (verb === "stop") {
        const at = place(args[0]);
        if (at.kind === "blocked") return at;
        const stopped = await run(at, ["stop"].concat(args.length === 2 ? ["--origin", "app-off"] : []));
        return stopped === null ? failed : answer(stopped);
    }
    if (verb === "status") {
        const at = place(args[0]);
        return at.kind === "blocked" ? at : shown(await read(at));
    }
    if (verb === "change") {
        const [old, setting, home, mode] = args;
        const from = place(old);
        const before = from.kind === "blocked" ? from : await read(from);
        const at = place(home);
        const live = before.kind !== "blocked" && LIVE.includes(before.state);
        if (!live) return at.kind === "blocked" ? at : shown(await read(at));
        // The new selection is checked whole before the old session ends.
        const who = account(setting);
        const probe = at.kind === "blocked" ? at : who.kind === "blocked" ? who : await read(at);
        if (probe.kind === "blocked") return { ...answer(before), unapplied: probe.block };
        if (await run(from, ["stop"]) === null) return failed;
        return start(at, who, mode, "manual");
    }
    const [setting, home, mode, boot] = args;
    const at = place(home);
    if (at.kind === "blocked") return at;
    const now = await read(at);
    if (now.kind === "blocked") return now;
    // The plugin is built, so an Off the app recorded is over: its user
    // turned Jarvis on again.
    const origin = verb === "start" ? "manual" : now.state === "off" ? "app-on" : boot === "on" ? "boot" : null;
    if (origin === null) return answer(now);
    const who = account(setting);
    if (who.kind !== "blocked") return start(at, who, mode, origin);
    // A session that lives, one started by hand among them, stays shown.
    return LIVE.includes(now.state) ? { ...answer(now), unapplied: who.block } : who;
}

main().then(value => {
    if (typeof value === "number") { process.exitCode = value; return; }
    process.stdout.write(JSON.stringify(value) + "\n");
}, error => {
    process.stderr.write(error.message.split("\n")[0] + "\n");
    process.exitCode = 1;
});
