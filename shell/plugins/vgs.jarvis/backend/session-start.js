#!/usr/bin/env node
// session-start.js --tree ABSOLUTE_VGS_TREE VERB ACCOUNT HOME [MODE], for
// the Start Jarvis at boot setting. ACCOUNT is the plugin's `brain` setting
// and HOME its `home` setting. check prints what a start would meet. start
// MODE, "resume" or "new", starts the user's own Jarvis session: the
// account's program in the home folder, in tmux (TaskRunner.session).
// The session is the user's program, not a brain: it runs in the home with
// the user's session environment and outside the Jarvis gate (D105).
// Either verb prints one JSON line {kind} and exits 0: "ready" from check,
// "started" or "running" from start, or why no session can start:
// "no-account", "not-app", "no-home", "program-missing", "tmux-missing" or
// "tmux-failed". Arguments it cannot read exit 2 with a keyed line.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

async function main() {
    const [flag, tree, verb, account, home, ...rest] = process.argv.slice(2);
    const mode = verb === "start" ? rest.shift() : "resume";
    if (flag !== "--tree" || !path.isAbsolute(tree || "") || !["check", "start"].includes(verb) || typeof account !== "string"
            || typeof home !== "string" || !["resume", "new"].includes(mode) || rest.length > 0) {
        process.stderr.write("jarvis: session-start=arguments\n");
        return 2;
    }
    require("./Core.js").use(tree);
    const { Accounts } = require("./Accounts.js");
    const Home = require("./Home.js");
    const Profiles = require("./AgentProfiles.js");
    const Runner = require("./TaskRunner.js");
    const { onPath } = require(path.join(tree, "bin/lib/judge-files.js"));
    const answer = kind => { process.stdout.write(JSON.stringify({ kind }) + "\n"); return 0; };

    const state = path.join(process.env.XDG_STATE_HOME || path.join(process.env.HOME, ".local/state"), "vgshell/jarvis");
    const resolved = account === "" ? null : new Accounts(state, process.env).resolve(account);
    if (resolved === null) return answer("no-account");
    if (resolved.source.kind !== "cli") return answer("not-app");
    let folder = null;
    try { folder = Home.resolve(home, process.env.HOME); }
    catch (error) {
        // A setting the daemon refuses is the home row's to show.
        if (!/^jarvis: home=/.test(error.message)) throw error;
    }
    if (folder === null || !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) return answer("no-home");
    if (!Object.hasOwn(Profiles.TABLE, resolved.provider)) throw new Error("jarvis: session-start=profile provider=" + resolved.provider);
    const row = Profiles.TABLE[resolved.provider];
    if (!onPath(row.program)) return answer("program-missing");
    if (!onPath("tmux")) return answer("tmux-missing");
    if (verb === "check") return answer("ready");
    // env(1) hands the program its account folder whichever tmux server
    // takes the session: one that already runs keeps its own environment.
    const argv = ["env", row.account.variable + "=" + resolved.source.directory]
        .concat(mode === "new" ? row.session.fresh : row.session.resume);
    // A shell restarted from a tmux pane carries that pane's TMUX and
    // TMUX_PANE. Without them tmux reaches the user's default server, and a
    // server this start creates hands no session another server's pane.
    const { TMUX, TMUX_PANE, ...environment } = process.env;
    return answer(await Runner.session({ argv, cwd: folder, environment }));
}

main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(error.message.split("\n")[0] + "\n");
    process.exitCode = 1;
});
