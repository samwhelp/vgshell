// Bounds a test child by lack of progress, not by wall-clock time. Progress
// is processor time: the child and its descendants, read from /proc, used
// some. A healthy world under host load is slow and still computes, so load
// never reads as a hang; a hung world waits and uses none. The watcher is
// this file run as a program; it is the child's parent, so runBounded stays
// synchronous for its callers.
"use strict";
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// One bound for every suite: a child whose tree uses under 1 s of processor
// time in any IDLE_MS is hung, and one that uses BUSY_MS in all spins. This
// watcher's own readings on a 32-thread host at load average 10 to 24,
// 2026-10-12: the accounts terminal suite used the most, 46 s, and the codex
// suite 6.9 s in 54 s, the smallest share of a suite over 10 s long.
const IDLE_MS = 120000;
const BUSY_MS = 1800000;
// The watcher's exit status for a stopped child, as timeout(1) reports one.
const STOPPED = 124;
// /proc reports processor time in units of 1/100 s (USER_HZ) on Linux.
const TICK_MS = 10;

/**
 * Run COMMAND with ARGS under the watcher and return the spawnSync result.
 * OPTIONS holds env and cwd. With capture the result holds stdout and
 * stderr; without it the child writes to this process's own streams. A
 * stopped child gets SIGTERM, as a spawnSync timeout sends, and the result's
 * status is 124 with a `bounded: hung` or `bounded: spinning` line on stderr.
 */
function runBounded(command, args, options = {}, idleMs = IDLE_MS) {
    assert.ok(Number.isSafeInteger(idleMs) && idleMs > 0, "bounded: idle-ms=positive-safe-integer");
    return cp.spawnSync(process.execPath, [__filename, String(idleMs), command, ...args], {
        env: options.env, cwd: options.cwd, encoding: "utf8",
        stdio: options.capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"]
    });
}

/**
 * The must-fail control: a planted world whose command only sleeps is
 * stopped as hung. LAUNCHER is jarvis-env.sh and STANDINS its stand-in
 * directory; ENV is the world's environment. A host that cannot start a
 * world, exit 77, is left for the suite's own run to report.
 */
function hungWorldControl(launcher, standins, env) {
    const result = runBounded("/bin/bash", [launcher, standins, "--", "sleep", "600"], { env, capture: true }, 2000);
    assert.equal(result.error, undefined);
    if (result.status === 77) return;
    assert.equal(result.status, STOPPED, "a hung world is stopped: " + result.stdout + result.stderr);
    assert.match(result.stderr, /^bounded: hung idle_ms=2000 command=bash$/m);
    console.log("control=hung-world detected");
}

// Processor time, in ms, of PID and every live descendant, with the time of
// each child one of them waited for. A process that exits between the
// directory read and its own read is skipped.
function treeMs(pid) {
    const children = new Map(), ticks = new Map();
    for (const name of fs.readdirSync("/proc")) {
        if (!/^\d+$/.test(name)) continue;
        let stat;
        try { stat = fs.readFileSync("/proc/" + name + "/stat", "utf8"); } catch { continue; }
        // The command name, field 2, may hold spaces and parentheses.
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        const parent = Number(fields[1]);
        children.set(parent, [...(children.get(parent) ?? []), Number(name)]);
        ticks.set(Number(name), fields.slice(11, 15).reduce((sum, value) => sum + Number(value), 0));
    }
    let total = 0;
    for (const queue = [pid]; queue.length > 0;) {
        const next = queue.pop();
        total += ticks.get(next) ?? 0;
        queue.push(...(children.get(next) ?? []));
    }
    return total * TICK_MS;
}

function watch(idleMs, command, args) {
    const child = cp.spawn(command, args, { stdio: "inherit" });
    let stopped = false, seen = 0, used = 0;
    const samples = [];
    const stop = reason => {
        stopped = true;
        clearInterval(timer);
        process.stderr.write("bounded: " + reason + " command=" + path.basename(command) + "\n");
        child.kill("SIGTERM");
    };
    // The share of a processor a live child must use scales with the window.
    const least = idleMs / 120;
    const timer = setInterval(() => {
        // A process that leaves the tree takes its time with it, so only a
        // rise counts.
        const total = treeMs(child.pid), now = Date.now();
        used += Math.max(0, total - seen);
        seen = total;
        samples.push([now, used]);
        while (samples.length > 1 && now - samples[1][0] >= idleMs) samples.shift();
        if (used > BUSY_MS) stop("spinning busy_ms=" + BUSY_MS);
        else if (now - samples[0][0] >= idleMs && used - samples[0][1] < least) stop("hung idle_ms=" + idleMs);
    }, Math.min(5000, idleMs / 4));
    samples.push([Date.now(), 0]);
    child.on("error", error => {
        clearInterval(timer);
        process.stderr.write("bounded: spawn-failed command=" + command + " error=" + error.code + "\n");
        process.exitCode = 1;
    });
    child.on("exit", (status, signal) => {
        clearInterval(timer);
        if (stopped) process.exitCode = STOPPED;
        else if (signal === null) process.exitCode = status;
        else {
            // The child's signal ends this process too; one Node handles
            // itself, such as SIGUSR1, leaves the failing status instead.
            process.exitCode = 1;
            process.kill(process.pid, signal);
        }
    });
}

if (require.main === module) watch(Number(process.argv[2]), process.argv[3], process.argv.slice(4));

module.exports = { runBounded, hungWorldControl };
