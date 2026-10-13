#!/usr/bin/env node
// Jarvis's words name the session that runs the fleet "the Jarvis session",
// never "master". The uses left name something else: a GitHub blob/master
// link and a pty's master end. A new use, tracked or not, fails here; this
// file, which names the word, is the one file the scan leaves out.
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const tree = path.resolve(__dirname, "..");
const self = "scripts/check-jarvis-words.js";
const masterAllowed = {
    "scripts/fixtures/jarvis/accounts-tui.py": 4,
    "scripts/fixtures/jarvis/key-tui.py": 5,
    "scripts/test-jarvis-claude-task.js": 1,
    "shell/plugins/vgs.jarvis/artifacts.json": 1,
    "shell/plugins/vgs.jarvis/backend/Audio.js": 2,
};
const scan = paths => {
    const result = require("node:child_process").spawnSync("git", ["-C", tree, "grep", "--untracked", "-c", "-I", "-i", "-w", "master", "--", ...paths], { encoding: "utf8" });
    assert.equal(result.status, 0, "git grep for master: " + result.stderr);
    return Object.fromEntries(result.stdout.split("\n").filter(Boolean).map(line => {
        const at = line.lastIndexOf(":");
        return [line.slice(0, at), Number(line.slice(at + 1))];
    }));
};
// The scanned paths are this check's inputs in scripts/validate.
assert.deepEqual(scan(["shell/plugins/vgs.jarvis", "docs/architecture/jarvis.md", "docs/architecture/jarvis-outbound.md",
    "docs/decisions/D105-jarvis-home-folder.md", "scripts/*jarvis*", ":(exclude)" + self]), masterAllowed, "a new use of the word master");
assert.ok(scan([self])[self] > 0, "control: the scan finds this file's uses");
console.log("check-jarvis-words: ok files=" + Object.keys(masterAllowed).length);
