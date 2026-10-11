#!/usr/bin/env node
// The Jarvis home folder owner, backend/Home.js, on real folders in J09's
// scratch HOME: the layout an empty folder gets with the base package VGS
// ships, kendex's render of the jarvis skill with no project-instructions
// block of this repository's own, what a folder that already holds files
// keeps, a home that holds an older package, the refusal of a link at the
// home, at every layout path and inside skills/base, the folder a setting
// names, the remembered homes list and its Settings offers, the bounded read of its text, the skill index, a memory note read by
// its path, the one program of the home, the kendex mail tool, and a kendex
// home, where the base package is kendex's render of it, which no model can
// write, and skills/base is gone. Each
// control edits a copy of Home.js, or of the Tools.js rule it asks, one rule
// at a time, and must turn a case red; one plants a project-instructions
// block in a copy of the package and must fail that row.
"use strict";
const cp = require("node:child_process");
const { load } = require("../bin/lib/qml-library.js");
const { MENU_ID_PATTERN } = load(require("node:path").join(__dirname, "../shell/Core/PluginLogic.js"));
const { assert, fs, path, tree, world, seed, mutant } = require("./fixtures/jarvis/policy.js");
const file = path.join(tree, "shell/plugins/vgs.jarvis/backend/Home.js");
const denied = path.join(path.dirname(file), "Denied.js");

// The layout VGS-1194 names, independent of the production table: each file
// with what it must say, and each folder.
const FILES = ["AGENTS.md", "CLAUDE.md", "memory/MEMORY.md", ".claude/settings.json", ".codex/config.toml"];
const FOLDERS = ["skills", "skills/base", "skills/own", "memory", "memory/inbox", "state", ".claude", ".codex"];
// The shipped base package, read here from the checkout: every entry a home
// gets in skills/base, and the help topics they list.
const SHIPPED = path.join(tree, ".agents/skills/jarvis");
const PACKAGE = ["skills/base/jarvis", ...fs.readdirSync(SHIPPED, { recursive: true }).map(name => "skills/base/jarvis/" + name)];
const REFERENCES = fs.readdirSync(path.join(SHIPPED, "references")).map(name => "base/jarvis/" + name.slice(0, -3));

// The tables and keys of a TOML file of plain `key = value` lines.
function toml(text) {
    const out = {};
    let table = null;
    for (const line of text.split("\n").map(row => row.trim()).filter(Boolean)) {
        const header = /^\[([a-z_]+)\]$/.exec(line), pair = /^([a-z_]+) = (true|false)$/.exec(line);
        assert.ok(header || (pair && table !== null), "plain TOML line: " + line);
        if (header) out[table = header[1]] = {};
        else out[table][pair[1]] = pair[2] === "true";
    }
    return out;
}
// Every entry below a folder, links and scratch files included.
function listing(folder) {
    return fs.readdirSync(folder, { recursive: true }).map(name => String(name)).sort();
}
// skills/base holds the shipped package and nothing else, byte for byte.
// The package is the kendex render of the jarvis skill, which a Jarvis home
// takes as its base: the developer policy kendex renders into this
// repository's own skills as a project-instructions block is not for it.
const PROJECT_INSTRUCTIONS = "kendex:project-instructions";
const NO_PROJECT_INSTRUCTIONS = "the home's jarvis skill carries no project instructions";
function shipped(folder) {
    assert.equal(fs.lstatSync(path.join(folder, "skills/base"), { throwIfNoEntry: false })?.isDirectory(), true, "skills/base");
    assert.deepEqual(listing(path.join(folder, "skills/base")), PACKAGE.map(name => name.slice("skills/base/".length)).sort());
    assert.equal(fs.readFileSync(path.join(folder, "skills/base/jarvis/SKILL.md"), "utf8").includes(PROJECT_INSTRUCTIONS), false, NO_PROJECT_INSTRUCTIONS);
    for (const name of PACKAGE.filter(entry => fs.lstatSync(path.join(tree, ".agents/skills", entry.slice(12))).isFile()))
        assert.deepEqual(fs.readFileSync(path.join(folder, name)), fs.readFileSync(path.join(tree, ".agents/skills", name.slice(12))), name);
}
const keyed = (run, cause, label) => assert.throws(run, { message: "jarvis: home=" + cause }, label);
// The kendex mail tool in a home, where kendex's orch skill installs it.
const TOOL = ".agents/skills/orch/scripts/lane-mail";
// Where kendex renders the jarvis skill in a home it is installed in.
const RENDER = ".agents/skills/jarvis";

world(() => {
    const { home, roots } = seed();
    let serial = 0;
    const fresh = () => path.join(home, "homes", "h" + ++serial, "Jarvis");

    const CASES = {
        // An empty folder, and one that does not exist yet, get every entry
        // and the base package, and nothing else; the help topics list the
        // package's skill and each of its references.
        empty(Home) {
            for (const made of [false, true]) {
                const folder = fresh();
                if (made) fs.mkdirSync(folder, { recursive: true });
                assert.doesNotThrow(() => Home.layout(folder));
                assert.deepEqual(listing(folder), [...FILES, ...FOLDERS, ...PACKAGE].sort(), "the layout, the package and no scratch file");
                for (const name of FOLDERS) assert.equal(fs.lstatSync(path.join(folder, name)).isDirectory(), true, name);
                for (const name of FILES) assert.equal(fs.lstatSync(path.join(folder, name)).isFile(), true, name);
                assert.equal(fs.readFileSync(path.join(folder, "CLAUDE.md"), "utf8").trim(), "@AGENTS.md", "Claude Code imports the one instruction file");
                assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, ".claude/settings.json"), "utf8")), { autoMemoryEnabled: false });
                assert.deepEqual(toml(fs.readFileSync(path.join(folder, ".codex/config.toml"), "utf8")),
                    { features: { memories: false }, memories: { generate_memories: false, use_memories: false } });
                shipped(folder);
                assert.equal(fs.readFileSync(path.join(folder, "skills/base/jarvis/persona.md")).length <= 3072, true, "the persona's bound");
                assert.deepEqual(Home.skills(folder).skills.map(skill => skill.topic), ["base/jarvis", ...REFERENCES]);
                assert.match(Home.skill(folder, REFERENCES[0]), /^# /, "a reference reads by its topic");
            }
        },
        // A folder that already holds files keeps every byte of them, a
        // layout file among them, and gains only what it lacks; a second
        // layout changes nothing.
        keeps(Home) {
            const folder = fresh();
            const kept = { "AGENTS.md": "# Mine\nMARKER\n", "README.md": "notes\n", ".git/HEAD": "ref: refs/heads/main\n",
                ".claude/settings.json": "{\"mine\": true}\n", "skills/own/mine.md": "# Mine\n" };
            for (const [name, text] of Object.entries(kept)) {
                fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
                fs.writeFileSync(path.join(folder, name), text);
            }
            const stamps = names => names.map(name => fs.statSync(path.join(folder, name), { bigint: true })).map(stat => stat.ino + ":" + stat.mtimeNs);
            const before = stamps(Object.keys(kept));
            let package_;
            for (let round = 0; round < 2; round++) {
                assert.doesNotThrow(() => Home.layout(folder));
                for (const [name, text] of Object.entries(kept)) assert.equal(fs.readFileSync(path.join(folder, name), "utf8"), text, name + " keeps every byte");
                assert.deepEqual(stamps(Object.keys(kept)), before, "no kept file is written again");
                assert.deepEqual(listing(folder), [...new Set([...FILES, ...FOLDERS, ...PACKAGE, ...Object.keys(kept), ".git"])].sort());
                if (round === 0) package_ = stamps(PACKAGE);
                else assert.deepEqual(stamps(PACKAGE), package_, "a package the home already holds is not copied again");
            }
        },
        // A home that holds an older package, what a VGS update with a
        // changed package finds: skills/base becomes the shipped package byte
        // for byte, and the user's own skill and AGENTS.md keep every byte.
        update(Home) {
            const folder = fresh();
            const base = path.join(folder, "skills/base");
            const own = { "AGENTS.md": "# Mine\nMARKER\n", "skills/own/mine.md": "# Mine\n" };
            for (const [name, text] of Object.entries(own)) {
                fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
                fs.writeFileSync(path.join(folder, name), text);
            }
            // The older package changed text under the same names.
            fs.cpSync(SHIPPED, path.join(base, "jarvis"), { recursive: true });
            fs.writeFileSync(path.join(base, "jarvis/SKILL.md"), "older\n");
            fs.appendFileSync(path.join(base, "jarvis/persona.md"), "older line\n");
            const stamps = () => Object.keys(own).map(name => fs.statSync(path.join(folder, name), { bigint: true }).mtimeNs);
            const before = stamps();
            assert.doesNotThrow(() => Home.layout(folder));
            shipped(folder);
            // Then it changed names too.
            fs.writeFileSync(path.join(base, "jarvis/SKILL.md"), "older\n");
            fs.rmSync(path.join(base, "jarvis/references", fs.readdirSync(path.join(base, "jarvis/references"))[0]));
            fs.writeFileSync(path.join(base, "jarvis/references/retired.md"), "# Retired\n");
            fs.mkdirSync(path.join(base, "jarvis/assets"));
            fs.writeFileSync(path.join(base, "stray.md"), "# Stray\n");
            assert.doesNotThrow(() => Home.layout(folder));
            shipped(folder);
            for (const [name, text] of Object.entries(own)) assert.equal(fs.readFileSync(path.join(folder, name), "utf8"), text, name + " keeps every byte");
            assert.deepEqual(stamps(), before, "the update writes no file of the user's");
            assert.deepEqual(listing(folder), [...FILES, ...FOLDERS, ...PACKAGE, "skills/own/mine.md"].sort(), "no scratch folder is left");
        },
        // A link at the home, or at any layout path, is refused and never
        // followed: what it points at stays as it was.
        links(Home) {
            for (const entry of [".", ...FILES, ...FOLDERS]) {
                for (const dangling of [false, true]) {
                    const folder = fresh();
                    const outside = path.join(path.dirname(folder), "outside");
                    const directory = entry === "." || FOLDERS.includes(entry);
                    if (!dangling && directory) fs.mkdirSync(outside, { recursive: true });
                    else fs.mkdirSync(path.dirname(outside), { recursive: true });
                    if (!dangling && !directory) fs.writeFileSync(outside, "outside\n");
                    const at = path.join(folder, entry);
                    fs.mkdirSync(path.dirname(at), { recursive: true });
                    fs.symlinkSync(outside, at);
                    keyed(() => Home.layout(folder), "link", entry + (dangling ? " dangling" : ""));
                    assert.equal(fs.lstatSync(at).isSymbolicLink(), true, entry + ": the link is left as it is");
                    if (dangling) assert.equal(fs.existsSync(outside), false, entry + ": nothing is made through the link");
                    else if (directory) assert.deepEqual(fs.readdirSync(outside), [], entry + ": nothing is made in the linked folder");
                    else assert.equal(fs.readFileSync(outside, "utf8"), "outside\n", entry + ": the linked file keeps its bytes");
                }
            }
        },
        // A link at skills/base, or anywhere inside it, is refused and never
        // followed: the link stays and what it points at keeps its bytes.
        packageLinks(Home) {
            for (const entry of ["jarvis", "jarvis/SKILL.md", "jarvis/persona.md", "jarvis/references", "jarvis/references/memory.md", "stray.md"]) {
                const folder = fresh();
                Home.layout(folder);
                const outside = path.join(path.dirname(folder), "outside");
                const directory = !entry.endsWith(".md");
                if (directory) {
                    fs.mkdirSync(outside);
                    fs.writeFileSync(path.join(outside, "SKILL.md"), "OUTSIDE\n");
                } else fs.writeFileSync(outside, "OUTSIDE\n");
                const at = path.join(folder, "skills/base", entry);
                fs.rmSync(at, { recursive: true, force: true });
                fs.symlinkSync(outside, at);
                keyed(() => Home.layout(folder), "link", entry);
                assert.equal(fs.lstatSync(at).isSymbolicLink(), true, entry + ": the link is left as it is");
                if (directory) assert.deepEqual([fs.readdirSync(outside), fs.readFileSync(path.join(outside, "SKILL.md"), "utf8")], [["SKILL.md"], "OUTSIDE\n"], entry);
                else assert.equal(fs.readFileSync(outside, "utf8"), "OUTSIDE\n", entry + ": the linked file keeps its bytes");
            }
        },
        // An entry of the other kind is refused by its own cause.
        kinds(Home) {
            for (const [entry, make] of [["AGENTS.md", at => fs.mkdirSync(at)], ["skills", at => fs.writeFileSync(at, "")],
                ["memory/inbox", at => fs.writeFileSync(at, "")], [".", at => fs.writeFileSync(at, "")]]) {
                const folder = fresh();
                const at = path.join(folder, entry);
                fs.mkdirSync(path.dirname(at), { recursive: true });
                make(at);
                keyed(() => Home.layout(folder), "kind", entry);
            }
        },
        // The folder a setting names: inside the user's home directory, or
        // none for the empty setting.
        resolves(Home) {
            assert.equal(Home.resolve("", home), null);
            for (const [setting, want] of [["~/Jarvis", "Jarvis"], ["~/Jarvis/", "Jarvis"], ["~/a/../b", "b"], [home + "/x/y", "x/y"]])
                assert.equal(Home.resolve(setting, home), path.join(home, want), setting);
            for (const setting of ["~", home, "Jarvis", "./Jarvis", "/etc/jarvis", "~/../other", home + "-other/x", "~/a\nb", "~/" + "x".repeat(4097)])
                keyed(() => Home.resolve(setting, home), "path", JSON.stringify(setting.slice(0, 40)));
            for (const [setting, base] of [[7, home], ["~/Jarvis", "relative"], ["~/Jarvis", undefined]])
                keyed(() => Home.resolve(setting, base), "path", "types");
            assert.deepEqual(Home.guard("/h/Jarvis"), { root: "/h/Jarvis", open: "state" });
        },
        rememberOffers(Home) {
            const plainOffers = list => Home.offers(list, home).map(({ label, value }) => ({ label, value }));
            const first = Home.offers([home + "/One", home + "/Two"], home);
            const reordered = Home.offers([home + "/Two", home + "/One"], home);
            for (const offer of first) {
                assert.match(offer.id, MENU_ID_PATTERN, "a launcher id");
                assert.match(offer.id, /^h[0-9a-f]{12}$/, "the path hash id");
                assert.equal(reordered.find(row => row.value === offer.value).id, offer.id, "reordering keeps the id");
            }
            assert.notEqual(first[0].id, first[1].id, "different paths have different ids");
            assert.equal(Home.offers(["/user/One"], "/user")[0].id, "hb60681ca7e5f", "SHA-256 of the absolute path");
            assert.equal(Home.offers([home + "/One/"], home)[0].id, first[0].id, "normalizing a path keeps the id");
            const names = Array.from({ length: 12 }, (_, index) => path.join(home, "homes", "h" + index));
            const longLabel = path.join(home, "homes", "l".repeat(53));
            const longValue = "~/" + path.relative(home, longLabel).split(path.sep).join("/");
            const tooLong = path.join(home, "x".repeat(199));
            assert.deepEqual(Home.remember([], names[0]), [names[0]], "a new absolute path is first");
            assert.deepEqual(Home.remember([names[0], names[1]], names[1]), [names[1], names[0]], "an existing path moves to the front once");
            assert.deepEqual(Home.remember(names.slice(0, 12), names[11]), [names[11]].concat(names.slice(0, 9)),
                "the newest path is first, with at most ten paths");
            assert.deepEqual(Home.remember([names[0], "relative", names[1]], names[2]), [names[2], names[0], names[1]],
                "only absolute remembered paths stay");
            assert.deepEqual(Home.remember([names[0]], tooLong), [names[0]], "a home whose offer value does not fit is not kept");
            assert.equal(longValue.length > 60 && longValue.length <= 200, true, "the long label fixture fits the value wire");
            assert.deepEqual(plainOffers([path.join(home, "Jarvis"), path.join(home, "work/One")]),
                [{ label: "~/Jarvis", value: "~/Jarvis" }, { label: "~/work/One", value: "~/work/One" }]);
            assert.deepEqual(plainOffers([longLabel]),
                [{ label: "…" + longValue.slice(-59), value: longValue }], "a long value keeps its full value and shortens its label");
            assert.deepEqual(plainOffers([names[0], names[0]]),
                [{ label: "~/homes/h0", value: "~/homes/h0" }], "an offer is listed once");
            assert.deepEqual(Home.offers([path.dirname(home)], home), [], "an offer must stay inside the user's home");
        },
        // A file's text whole within its bound, or too-large; never a cut
        // text, a link's target or bytes that are no UTF-8.
        reads(Home) {
            const folder = fresh();
            Home.layout(folder);
            const agents = path.join(folder, "AGENTS.md");
            fs.writeFileSync(agents, "é".repeat(8));
            assert.deepEqual(Home.read(folder, "AGENTS.md", 16), { kind: "text", text: "é".repeat(8) }, "exactly the bound");
            assert.deepEqual(Home.read(folder, "AGENTS.md", 15), { kind: "too-large" }, "one byte over");
            fs.writeFileSync(agents, Buffer.from([0x66, 0xff]));
            keyed(() => Home.read(folder, "AGENTS.md", 16), "text");
            keyed(() => Home.read(folder, "memory/absent.md", 16), "absent");
            keyed(() => Home.read(folder, "skills", 16), "kind");
            const secret = path.join(path.dirname(folder), "secret");
            fs.writeFileSync(secret, "OUTSIDE-SECRET\n");
            fs.rmSync(agents);
            fs.symlinkSync(secret, agents);
            keyed(() => Home.read(folder, "AGENTS.md", 64), "link", "a link placed after the layout");
            fs.rmSync(path.join(folder, "memory"), { recursive: true });
            fs.symlinkSync(path.dirname(secret), path.join(folder, "memory"));
            keyed(() => Home.read(folder, "memory/secret", 64), "link", "a linked folder on the way");
        },
        // The skill index: a flat file or a folder's SKILL.md under a plain
        // name, in topic order, each with its line; a link, a hidden entry
        // and any other file is no skill.
        skills(Home) {
            const folder = fresh();
            Home.layout(folder);
            fs.rmSync(path.join(folder, "skills/base/jarvis"), { recursive: true });
            const write = (name, text) => {
                fs.mkdirSync(path.dirname(path.join(folder, "skills", name)), { recursive: true });
                fs.writeFileSync(path.join(folder, "skills", name), text);
            };
            write("own/alpha.md", "\n# Alpha skill\nbody\n");
            write("own/beta/SKILL.md", "---\nname: beta\ndescription: \"Load for beta work.\"\n---\n# Beta\n");
            write("base/gamma.md", "---\nname: gamma\ndescription: >\n  folded\n---\n\nGamma first line\n");
            write("own/delta.md", "");
            write("own/epsilon.md", "---\ndescription: >-\n  folded and stripped\n---\nEpsilon first line\n");
            write("own/eta.md", "---\ndescription: |+2\n    kept\n---\nEta first line\n");
            write("own/notes.txt", "no skill\n");
            write("own/plain", "no skill\n");
            write("own/.hidden.md", "no skill\n");
            write("own/bad name.md", "no skill\n");
            write("own/empty-folder/readme.md", "no skill\n");
            write("own/bad dir/SKILL.md", "no skill\n");
            write("own/beta/references/one.md", "# One reference\nONE-BODY\n");
            // A reference is read on demand: no size bound holds it back.
            const long = "# Long reference\n" + "long line\n".repeat(4096);
            assert.ok(Buffer.byteLength(long) > 40 * 1024);
            write("own/beta/references/long.md", long);
            write("own/beta/references/bad name.md", "no skill\n");
            write("own/beta/references/notes.txt", "no skill\n");
            write("own/empty-folder/references/orphan.md", "no skill\n");
            write("own/zeta/SKILL.md", "# Zeta\n");
            write("own/zeta/references", "a file, not a folder\n");
            // A workflow passes every rule a reference does, and one of a
            // reference's file name is its own topic, never a silent pick.
            write("own/beta/workflows/one.md", "# One workflow\nONE-WORKFLOW\n");
            write("own/beta/workflows/long.md", long.replace("reference", "workflow"));
            write("own/beta/workflows/bad name.md", "no skill\n");
            write("own/beta/workflows/notes.txt", "no skill\n");
            write("own/empty-folder/workflows/orphan.md", "no skill\n");
            write("own/zeta/workflows", "a file, not a folder\n");
            write("base/kappa/SKILL.md", "# Kappa\n");
            write("base/kappa/workflows/run.md", "---\ndescription: Load to run kappa.\n---\nRUN-BODY\n");
            const outside = path.join(path.dirname(folder), "outside-skill.md");
            fs.writeFileSync(outside, "OUTSIDE-SECRET\n");
            fs.symlinkSync(outside, path.join(folder, "skills/own/linked.md"));
            fs.mkdirSync(path.join(folder, "skills/own/linked-folder"));
            fs.symlinkSync(outside, path.join(folder, "skills/own/linked-folder/SKILL.md"));
            fs.symlinkSync(outside, path.join(folder, "skills/own/beta/workflows/linked.md"));
            fs.mkdirSync(path.join(folder, "skills/own/linked-workflows"));
            fs.writeFileSync(path.join(folder, "skills/own/linked-workflows/SKILL.md"), "# Linked workflows\n");
            fs.symlinkSync(path.join(folder, "skills/own/beta/workflows"), path.join(folder, "skills/own/linked-workflows/workflows"));
            assert.equal(cp.spawnSync("python3", ["-c", "import os, sys; os.mkfifo(sys.argv[1])",
                path.join(folder, "skills/own/beta/workflows/fifo.md")]).status, 0, "the test makes a FIFO");
            let listed;
            assert.doesNotThrow(() => { listed = Home.skills(folder); });
            assert.deepEqual(listed, { complete: true, skills: [
                { topic: "base/gamma", file: "skills/base/gamma.md", line: "Gamma first line" },
                { topic: "base/kappa", file: "skills/base/kappa/SKILL.md", line: "Kappa" },
                { topic: "base/kappa/workflows/run", file: "skills/base/kappa/workflows/run.md", line: "Load to run kappa." },
                { topic: "own/alpha", file: "skills/own/alpha.md", line: "Alpha skill" },
                { topic: "own/beta", file: "skills/own/beta/SKILL.md", line: "Load for beta work." },
                { topic: "own/beta/long", file: "skills/own/beta/references/long.md", line: "Long reference" },
                { topic: "own/beta/one", file: "skills/own/beta/references/one.md", line: "One reference" },
                { topic: "own/beta/workflows/long", file: "skills/own/beta/workflows/long.md", line: "Long workflow" },
                { topic: "own/beta/workflows/one", file: "skills/own/beta/workflows/one.md", line: "One workflow" },
                { topic: "own/delta", file: "skills/own/delta.md", line: "" },
                { topic: "own/epsilon", file: "skills/own/epsilon.md", line: "Epsilon first line" },
                { topic: "own/eta", file: "skills/own/eta.md", line: "Eta first line" },
                { topic: "own/linked-workflows", file: "skills/own/linked-workflows/SKILL.md", line: "Linked workflows" },
                { topic: "own/zeta", file: "skills/own/zeta/SKILL.md", line: "Zeta" }] });
            for (const entry of listed.skills) assert.doesNotThrow(() => Home.skill(folder, entry.topic), "every listed topic reads back: " + entry.topic);
            assert.equal(Home.skill(folder, "own/alpha"), "\n# Alpha skill\nbody\n");
            assert.equal(Home.skill(folder, "own/beta").includes("# Beta"), true, "a folder's SKILL.md is its body");
            assert.equal(Home.skill(folder, "own/beta/one"), "# One reference\nONE-BODY\n");
            assert.equal(Home.skill(folder, "own/beta/long"), long, "a 40 KB reference reads whole");
            assert.equal(Home.skill(folder, "own/beta/workflows/one"), "# One workflow\nONE-WORKFLOW\n", "a workflow keeps its own topic");
            assert.equal(Home.skill(folder, "own/beta/workflows/long"), long.replace("reference", "workflow"), "a 40 KB workflow reads whole");
            assert.equal(Home.skill(folder, "base/kappa/workflows/run"), "---\ndescription: Load to run kappa.\n---\nRUN-BODY\n");
            for (const [topic, cause] of [["own/missing", "absent"], ["own/../../secret", "absent"], ["other/alpha", "absent"],
                ["own/linked", "link"], ["own/linked-folder", "link"], ["own/beta/two", "absent"], ["own/beta/workflows/two", "absent"],
                ["own/beta/workflows/linked", "link"], ["own/linked-workflows/workflows/one", "link"], ["own/beta/workflows/fifo", "kind"],
                ["own/beta/workflows/bad name", "absent"], ["own/beta/references/one", "absent"], ["own/zeta/workflows/one", "kind"]])
                keyed(() => Home.skill(folder, topic), cause, topic);
            // A folder past its entry bound answers incomplete, never a part as the whole.
            for (let index = 0; index < 257; index++) write("own/beta/workflows/w" + index + ".md", "x\n");
            assert.equal(Home.skills(folder).complete, false, "a workflows folder past its bound");
            fs.rmSync(path.join(folder, "skills/own/beta/workflows"), { recursive: true });
            assert.equal(Home.skills(folder).complete, true);
            for (let index = 0; index < 257; index++) write("base/s" + index + ".md", "x\n");
            assert.equal(Home.skills(folder).complete, false);
        },
        // A memory note by its path below memory/, as MEMORY.md routes to
        // it. Each refused path names a file that is there, so the path rule
        // refuses it, not its absence: nothing under memory/inbox/, outside
        // memory/ or behind a link is read.
        notes(Home) {
            const folder = fresh();
            Home.layout(folder);
            const write = (name, text) => {
                fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
                fs.writeFileSync(path.join(folder, name), text);
            };
            write("memory/facts/My team.md", "TEAM-NOTE\n");
            write("facts/My team.md", "HOME-ROOT\n");
            write("memory/inbox/pending.md", "PENDING-NOTE\n");
            write("memory/.hidden.md", "HIDDEN-NOTE\n");
            write("memory/facts/team.txt", "NO-MARKDOWN\n");
            write("AGENTS.md", "OUTSIDE-MEMORY\n");
            assert.equal(Home.note(folder, "facts/My team.md"), "TEAM-NOTE\n");
            write("memory/facts/long.md", "l".repeat(40 * 1024));
            assert.equal(Home.note(folder, "facts/long.md"), "l".repeat(40 * 1024), "a 40 KB note reads whole");
            keyed(() => Home.note(folder, "facts/absent.md"), "absent");
            for (const entry of ["inbox/pending.md", "../AGENTS.md", "facts/../../AGENTS.md", "facts/../inbox/pending.md", ".hidden.md",
                "facts/team.txt", path.join(folder, "memory/facts/My team.md"), 7])
                keyed(() => Home.note(folder, entry), "absent", String(entry));
            const secret = path.join(path.dirname(folder), "secret.md");
            fs.writeFileSync(secret, "OUTSIDE-SECRET\n");
            fs.symlinkSync(secret, path.join(folder, "memory/linked.md"));
            fs.symlinkSync(path.dirname(secret), path.join(folder, "memory/linked-folder"));
            fs.symlinkSync("inbox", path.join(folder, "memory/waiting"));
            for (const entry of ["linked.md", "linked-folder/secret.md", "waiting/pending.md"])
                keyed(() => Home.note(folder, entry), "link", entry);
        },
        // The memory search walker lists only confirmed Markdown notes and
        // returns the stat facts the index reconciles by. It skips inbox,
        // dot entries, links and non-Markdown files, and refuses a tree past
        // its declared count bound rather than cutting it.
        notesList(Home) {
            const folder = fresh();
            Home.layout(folder);
            const write = (name, text = "note\n") => {
                fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
                fs.writeFileSync(path.join(folder, name), text);
            };
            write("memory/facts/a.md");
            write("memory/facts/b.md");
            write("memory/inbox/pending.md");
            write("memory/.hidden.md");
            write("memory/facts/team.txt");
            const secret = path.join(path.dirname(folder), "secret.md");
            fs.writeFileSync(secret, "secret\n");
            fs.symlinkSync(secret, path.join(folder, "memory/linked.md"));
            fs.symlinkSync(path.dirname(secret), path.join(folder, "memory/linked-folder"));
            const listed = Home.notes(folder);
            assert.deepEqual(listed.map(row => row.id), ["MEMORY.md", "facts/a.md", "facts/b.md"]);
            for (const row of listed) assert.equal(["size", "mtimeNs", "ctimeNs", "ino"].every(key => typeof row[key] === "bigint"), true, row.id);
            const crowded = fresh();
            Home.layout(crowded);
            for (let n = 0; n < 10001; n++) fs.writeFileSync(path.join(crowded, "memory", "n" + n + ".md"), "note\n");
            keyed(() => Home.notes(crowded), "notes-too-many");
        },
        // The mail tool is the one program Jarvis starts from the home: an
        // executable file at TOOL is its path, and the same file anywhere
        // else in the home is none, as is TOOL that is no executable regular
        // file or is reached through a link.
        mailTool(Home) {
            const folder = fresh();
            Home.layout(folder);
            fs.mkdirSync(path.join(folder, ".git"));
            const plant = (entry, mode = 0o755) => {
                fs.mkdirSync(path.dirname(path.join(folder, entry)), { recursive: true });
                fs.writeFileSync(path.join(folder, entry), "#!/bin/sh\n", { mode });
            };
            assert.equal(Home.mailTool(folder), null, "a home without kendex");
            for (const entry of ["skills/own/lane-mail", ".agents/skills/orch/scripts/workflow-state", ".agents/skills/other/scripts/lane-mail",
                ".agents/skills/orch/lane-mail", "lane-mail", "state/lane-mail"]) {
                plant(entry);
                assert.equal(Home.mailTool(folder), null, entry + " is no program of the home");
            }
            // The control the refusals rest on: the same file at TOOL is admitted.
            plant(TOOL);
            assert.equal(Home.mailTool(folder), path.join(folder, TOOL));
            fs.chmodSync(path.join(folder, TOOL), 0o644);
            assert.equal(Home.mailTool(folder), null, "a tool without its execute bit");
            fs.rmSync(path.join(folder, TOOL));
            fs.mkdirSync(path.join(folder, TOOL), { mode: 0o755 });
            assert.equal(Home.mailTool(folder), null, "a folder in the tool's place");
            fs.rmSync(path.join(folder, TOOL), { recursive: true });
            const outside = path.join(path.dirname(folder), "outside");
            fs.mkdirSync(path.join(outside, "scripts"), { recursive: true });
            fs.writeFileSync(path.join(outside, "scripts/lane-mail"), "#!/bin/sh\n", { mode: 0o755 });
            fs.symlinkSync(path.join(outside, "scripts/lane-mail"), path.join(folder, TOOL));
            assert.equal(Home.mailTool(folder), null, "a link in the tool's place");
            fs.rmSync(path.join(folder, TOOL));
            fs.rmSync(path.join(folder, ".agents/skills/orch/scripts"), { recursive: true });
            fs.symlinkSync(path.join(outside, "scripts"), path.join(folder, ".agents/skills/orch/scripts"));
            assert.equal(Home.mailTool(folder), null, "a linked folder on the way");
            assert.equal(Home.mailTool(path.join(folder, "absent")), null, "a home that is not there");
        },
        // lane-mail takes the repository its working folder belongs to, so
        // the tool counts only in a home that is its own repository: one
        // with a .git folder, or a worktree's .git file, of its own. A home
        // inside another repository with none, as this scratch HOME lies
        // inside this checkout, or with a linked .git, has no tool.
        ownRepository(Home) {
            const folder = fresh();
            Home.layout(folder);
            fs.mkdirSync(path.dirname(path.join(folder, TOOL)), { recursive: true });
            fs.writeFileSync(path.join(folder, TOOL), "#!/bin/sh\n", { mode: 0o755 });
            const git = path.join(folder, ".git");
            assert.equal(Home.mailTool(folder), null, "a home with no repository of its own");
            const outside = path.join(path.dirname(folder), "outside.git");
            fs.mkdirSync(outside);
            fs.symlinkSync(outside, git);
            assert.equal(Home.mailTool(folder), null, "a linked .git");
            fs.rmSync(git);
            assert.equal(cp.spawnSync("python3", ["-c", "import os, sys; os.mkfifo(sys.argv[1])", git]).status, 0, "the test makes a FIFO");
            assert.equal(Home.mailTool(folder), null, "a .git that is neither a folder nor a file");
            fs.rmSync(git);
            // The control the refusals rest on: a .git of its own admits the tool.
            fs.mkdirSync(git);
            assert.equal(Home.mailTool(folder), path.join(folder, TOOL), "a .git folder of its own");
            fs.rmSync(git, { recursive: true });
            fs.writeFileSync(git, "gitdir: /elsewhere/.git/worktrees/home\n");
            assert.equal(Home.mailTool(folder), path.join(folder, TOOL), "a worktree's .git file");
        },
        // The Jarvis session's mailbox folder, which Jarvis never makes: a
        // folder at its place, reached through no link.
        mailbox(Home) {
            const folder = fresh();
            Home.layout(folder);
            assert.equal(Home.mailbox(folder), false, "no mailbox");
            fs.mkdirSync(path.join(folder, "tmp/lane-mail"), { recursive: true });
            fs.writeFileSync(path.join(folder, "tmp/lane-mail/overseer"), "");
            assert.equal(Home.mailbox(folder), false, "a file in the mailbox's place");
            fs.rmSync(path.join(folder, "tmp/lane-mail/overseer"));
            const outside = path.join(path.dirname(folder), "outside-box");
            fs.mkdirSync(outside);
            fs.symlinkSync(outside, path.join(folder, "tmp/lane-mail/overseer"));
            assert.equal(Home.mailbox(folder), false, "a linked mailbox");
            fs.rmSync(path.join(folder, "tmp/lane-mail/overseer"));
            fs.mkdirSync(path.join(folder, "tmp/lane-mail/overseer"));
            assert.equal(Home.mailbox(folder), true, "the Jarvis session's mailbox folder");
            assert.deepEqual(fs.readdirSync(path.join(folder, "tmp/lane-mail/overseer")), [], "nothing is made in it");
        },
        // A home kendex is installed in, which VGS opened before as a home
        // without it: the open removes skills/base, whatever stands there,
        // and every read of the base package is kendex's render, a version
        // other than the shipped one, byte for byte. kendex's other skills
        // and a flat jarvis.md beside the render are no Jarvis skill, and a
        // VGS update writes no skills/base again.
        render(Home) {
            for (const standing of ["copy", "link"]) {
                const folder = kendex(Home);
                const outside = path.join(path.dirname(folder), "outside");
                fs.mkdirSync(outside);
                fs.writeFileSync(path.join(outside, "SKILL.md"), "OUTSIDE\n");
                if (standing === "link") {
                    fs.rmSync(path.join(folder, "skills/base"), { recursive: true });
                    fs.symlinkSync(outside, path.join(folder, "skills/base"));
                }
                const before = stamps(folder);
                for (let update = 0; update < 2; update++) {
                    assert.doesNotThrow(() => Home.layout(folder), standing);
                    assert.equal(fs.lstatSync(path.join(folder, "skills/base"), { throwIfNoEntry: false }), undefined, standing + ": no skills/base");
                    assert.deepEqual(stamps(folder), before, standing + ": the render keeps every byte");
                    assert.deepEqual([fs.readdirSync(outside), fs.readFileSync(path.join(outside, "SKILL.md"), "utf8")], [["SKILL.md"], "OUTSIDE\n"], standing);
                    assert.equal(Home.baseSet(folder), ".agents/skills");
                    assert.equal(Home.skill(folder, "base/jarvis"), fs.readFileSync(path.join(folder, RENDER, "SKILL.md"), "utf8"), "the brain's skill text is the render's");
                    assert.match(Home.skill(folder, "base/jarvis"), /RENDER-MARKER/);
                    assert.deepEqual(Home.skills(folder).skills.map(skill => [skill.topic, skill.file]),
                        [["base/jarvis", RENDER + "/SKILL.md"], ...REFERENCES.map(topic => [topic, RENDER + "/references/" + topic.slice(12) + ".md"]),
                            ["base/jarvis/workflows/run", RENDER + "/workflows/run.md"]].sort(([left], [right]) => left < right ? -1 : 1));
                    assert.equal(Home.read(folder, Home.baseSet(folder) + "/" + Home.PACKAGE + "/persona.md", null).text, "# Render persona\n");
                    keyed(() => Home.skill(folder, "base/orch"), "absent", "kendex's other skill");
                }
            }
        },
        // A render that is partial, a link, or no tree of folders and regular
        // files refuses the home with its cause, at the open and at each
        // read, and the open changes nothing: VGS's copy stays as it was.
        renderRefused(Home) {
            const outside = path.join(home, "homes", "render-outside");
            fs.cpSync(SHIPPED, outside, { recursive: true });
            const agents = path.join(home, "homes", "agents-outside");
            fs.cpSync(SHIPPED, path.join(agents, "skills/jarvis"), { recursive: true });
            for (const [label, cause, spoil] of [
                ["no SKILL.md", "package", folder => fs.rmSync(path.join(folder, RENDER, "SKILL.md"))],
                ["no persona.md", "package", folder => fs.rmSync(path.join(folder, RENDER, "persona.md"))],
                ["linked .agents", "link", folder => relink(folder, ".agents", agents)],
                ["linked render", "link", folder => relink(folder, RENDER, outside)],
                ["linked SKILL.md", "link", folder => relink(folder, RENDER + "/SKILL.md", path.join(outside, "SKILL.md"))],
                ["linked reference", "link", folder => relink(folder, RENDER + "/references/memory.md", path.join(outside, "references/memory.md"))],
                ["file render", "kind", folder => { fs.rmSync(path.join(folder, RENDER), { recursive: true }); fs.writeFileSync(path.join(folder, RENDER), ""); }],
                ["fifo inside", "kind", folder => assert.equal(cp.spawnSync("python3", ["-c", "import os, sys; os.mkfifo(sys.argv[1])",
                    path.join(folder, RENDER, "references/fifo.md")]).status, 0, "the test makes a FIFO")]
            ]) {
                const folder = kendex(Home);
                spoil(folder);
                const kept = listing(path.join(folder, "skills/base"));
                keyed(() => Home.layout(folder), cause, label);
                assert.deepEqual(listing(path.join(folder, "skills/base")), kept, label + ": the refused open keeps VGS's copy");
                keyed(() => Home.skills(folder), cause, label + ": the index");
                keyed(() => Home.skill(folder, "base/jarvis"), cause, label + ": the skill");
            }
        },
        // A kendex home without the jarvis skill is a home without kendex's
        // render: skills/base is VGS's copy, as before.
        noRender(Home) {
            const folder = fresh();
            fs.mkdirSync(path.join(folder, ".agents/skills/orch"), { recursive: true });
            fs.writeFileSync(path.join(folder, ".agents/skills/orch/SKILL.md"), "# Orch\n");
            assert.doesNotThrow(() => Home.layout(folder));
            shipped(folder);
            assert.equal(Home.baseSet(folder), "skills/base");
            assert.equal(Home.skill(folder, "base/jarvis"), fs.readFileSync(path.join(SHIPPED, "SKILL.md"), "utf8"));
            assert.deepEqual(Home.skills(folder).skills.map(skill => skill.topic), ["base/jarvis", ...REFERENCES]);
        }
    };
    // A home VGS opened without kendex, then given kendex's render of the
    // jarvis skill in another version than the shipped one, beside another
    // kendex skill and a flat jarvis.md that is no part of the render.
    function kendex(Home) {
        const folder = fresh();
        Home.layout(folder);
        shipped(folder);
        const render = path.join(folder, RENDER);
        fs.cpSync(SHIPPED, render, { recursive: true });
        fs.writeFileSync(path.join(render, "SKILL.md"), "---\nname: jarvis\ndescription: Render.\n---\nRENDER-MARKER\n");
        fs.writeFileSync(path.join(render, "persona.md"), "# Render persona\n");
        fs.mkdirSync(path.join(render, "workflows"));
        fs.writeFileSync(path.join(render, "workflows/run.md"), "# Run\n");
        fs.mkdirSync(path.join(folder, ".agents/skills/orch"));
        fs.writeFileSync(path.join(folder, ".agents/skills/orch/SKILL.md"), "# Orch\n");
        fs.writeFileSync(path.join(folder, ".agents/skills/jarvis.md"), "FLAT\n");
        return folder;
    }
    // Every entry of the render with its inode and change time.
    function stamps(folder) {
        return listing(path.join(folder, ".agents")).map(name => {
            const stat = fs.lstatSync(path.join(folder, ".agents", name), { bigint: true });
            return name + ":" + stat.ino + ":" + stat.mtimeNs;
        });
    }
    function relink(folder, entry, target) {
        fs.rmSync(path.join(folder, entry), { recursive: true });
        fs.symlinkSync(target, path.join(folder, entry));
    }
    // The gate keeps every model out of the render as out of skills/base: no
    // file tool, shell command or harness approval reaches it, and a
    // sandboxed command finds .agents masked. state/ is the control: open.
    function renderGate(Denied, Home = require(file)) {
        const folder = kendex(Home);
        Home.layout(folder);
        const judge = Denied.create({ ...roots, jarvisHome: Home.guard(folder) });
        for (const entry of [".agents", ".agents/skills", RENDER, RENDER + "/SKILL.md", RENDER + "/persona.md", RENDER + "/references/new.md", RENDER + "/workflows/run.md"])
            for (const role of ["read", "tree-read", "write", "move", "remove", "workspace"])
                assert.equal(judge.inspect(path.join(folder, entry), role).reason, "protected-path", entry + " " + role);
        assert.equal(judge.masks.includes(path.join(folder, ".agents")), true, ".agents is masked from a sandboxed command");
        assert.equal(judge.inspect(path.join(folder, "state/note.md"), "write").kind, "path", "state/ stays open");
    }

    const Home = require(file);
    // The real daemon's accepted, repeated, cleared and refused snapshots.
    // These hellos start no conversation and use J09's scratch HOME.
    function currentHome(daemon) {
        const state = fs.mkdtempSync(path.join(process.env.JARVIS_TEST_ROOT, "home-wire-"));
        const settings = { ...JSON.parse(fs.readFileSync(path.join(tree, "shell/plugins/vgs.jarvis/manifest.json"))).settings,
            sounds: false, voiceProvider: "local" };
        delete settings.localTier;
        const hello = { v: 1, type: "hello", gen: 0, revision: "a".repeat(64), locked: false,
            directories: { state, data: state + "/data", runtime: state + "/run" },
            keys: { talk: null, mute: null, stop: null, confirm: null, console: null } };
        const result = cp.spawnSync(process.execPath, [daemon, "--tree", tree], {
            input: ["~/wire-home", home + "/wire-home", "", "/etc/refused-home"].map(value =>
                JSON.stringify({ ...hello, settings: { ...settings, home: value } }) + "\n").join(""),
            env: { PATH: process.env.PATH, HOME: home, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
                XDG_DATA_HOME: process.env.XDG_DATA_HOME }, encoding: "utf8", timeout: 10000
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        const messages = result.stdout.split("\n").filter(Boolean).map(JSON.parse).filter(row => row.type === "homes");
        assert.deepEqual(messages.map(row => row.current), ["", "~/wire-home", "~/wire-home", "", ""],
            "current names only the accepted home, normalized to the offer value");
        assert.equal(messages[1].homes[0].value, messages[1].current);
    }
    const daemon = path.join(path.dirname(file), "jarvisd.js");
    currentHome(daemon);
    console.log("case=currentHome passed");
    const daemonCopy = fs.mkdtempSync(path.join(process.env.JARVIS_TEST_ROOT, "home-daemon-control-"));
    try {
        fs.cpSync(path.dirname(path.dirname(file)), daemonCopy, { recursive: true });
        const target = path.join(daemonCopy, "backend/jarvisd.js");
        const source = fs.readFileSync(target, "utf8");
        const needle = 'current: homeFolder.state.kind === "ready" ?';
        assert.equal(source.split(needle).length - 1, 1);
        const changed = source.replace(needle, 'current: false ?');
        assert.notEqual(changed, source);
        fs.writeFileSync(target, changed);
        assert.throws(() => currentHome(target), assert.AssertionError, "current home publication must turn red");
    } finally { fs.rmSync(daemonCopy, { recursive: true, force: true }); }
    console.log("control=currentHome detected");
    for (const [name, check] of Object.entries(CASES)) {
        check(Home);
        console.log("case=" + name + " passed");
    }
    renderGate(require(denied));
    console.log("case=renderGate passed");
    let controls = 0;
    for (const [name, needle, replacement, row, source = file] of [
        ["layout-entry", '    ["state", null],\n', "", "empty"],
        ["extra-file", '    ["state", null],\n', '    ["state", null], ["extra.md", ""],\n', "empty"],
        ["base-copy", '        else base(held.get("skills/base"));\n', "", "empty"],
        ["base-again", "found.every(([name, content], index) =>", "false && found.every(([name, content], index) =>", "keeps"],
        ["base-compare", "content.equals(shipped[index][1])", "true", "update"],
        ["base-stray", "        if (name !== PACKAGE) fs.rmSync(child(fd, name), { recursive: true, force: true });\n", "        ;\n", "update"],
        ["base-own", 'base(held.get("skills/base"));', 'base(held.get("skills/own"));', "update"],
        ["base-home", 'base(held.get("skills/base"));', 'base(held.get("."));', "update"],
        ["base-link", 'fail(kind === "link" ? "link" : "kind")', 'fail("kind")', "packageLinks"],
        ["claude-import", '["CLAUDE.md", "@AGENTS.md\\n"]', '["CLAUDE.md", ""]', "empty"],
        ["claude-memory", '"{\\"autoMemoryEnabled\\": false}\\n"', '"{}\\n"', "empty"],
        ["codex-memory", "generate_memories = false\\n", "", "empty"],
        ["scratch-left", "    } finally { fs.unlinkSync(scratch); }", "    } finally {}", "empty"],
        ["keeps-existing", "} else if (kind === \"absent\") createFile(parent, name, content);", "} else if (true) createFile(parent, name, content);", "keeps"],
        ["link-refused", '            if (kind === "link") fail("link");\n', "", "links"],
        ["home-link", 'case "link": return fail("link");', 'case "link": return fail("kind");', "links"],
        ["kind-refused", 'else if (kind !== "directory") fail("kind");', "", "kinds"],
        ["file-kind", '            else if (kind !== "file") fail("kind");', "", "kinds"],
        ["inside-home", '!file.startsWith(base === "/" ? "/" : base + "/")', "false", "resolves"],
        ["path-bound", " || Buffer.byteLength(file) > PATH_BYTES", "", "resolves"],
        ["control-characters", ' || /[\\x00-\\x1f\\x7f]/.test(named)', "", "resolves"],
        ["open-entry", 'const OPEN = "state";', 'const OPEN = "skills";', "resolves"],
        ["remember-first", "return [folder].concat(found.filter(item => homeOffer(item, userHome).value !== choice.value)).slice(0, HOMES);",
            "return found.concat([folder]).slice(0, HOMES);", "rememberOffers"],
        ["remember-once", "homeOffer(item, userHome).value !== choice.value", "true", "rememberOffers"],
        ["remember-bound", "const HOMES = 10;", "const HOMES = 11;", "rememberOffers"],
        ["remember-offer-bound", "if (value.length > OFFER_VALUE_MAX) return null;", "", "rememberOffers"],
        ["remember-offer-label", 'label: value.length <= OFFER_LABEL_MAX ? value : "…" + value.slice(1 - OFFER_LABEL_MAX)',
            "label: value", "rememberOffers"],
        ["offer-id-path", '.update(path.resolve(folder))', '.update("same")', "rememberOffers"],
        ["offer-id-bound", '.slice(0, 12)', '.slice(0, 13)', "rememberOffers"],
        ["remember-offer-duplicate", "if (choice === null || seen.has(choice.value)) continue;", "if (choice === null) continue;", "rememberOffers"],
        ["offers-relative", 'return "~/" + relative.split(path.sep).join("/");',
            'return file;', "rememberOffers"],
        ["read-bound", 'if (limit !== null && content.length > limit) return { kind: "too-large" };', "", "reads"],
        ["read-utf8", '{ kind: "text", text: new TextDecoder("utf-8", { fatal: true })', '{ kind: "text", text: new TextDecoder("utf-8", { fatal: false })', "reads"],
        ["read-kind", 'if (!fs.fstatSync(fd).isFile()) fail("kind");', "", "reads"],
        ["read-link", [['if (kind === "absent" || kind === "link") fail(kind);', 'if (kind === "absent") fail(kind);'],
            ["(last ? flags : O_RDONLY | O_DIRECTORY) | O_NOFOLLOW", "(last ? flags : O_RDONLY | O_DIRECTORY)"]], null, "reads"],
        ["skill-name", " && Tools.homeTopic(topic) !== null)", ")", "skills"],
        ["folder-name", "if (Tools.homeTopic(topic) === null) continue;\n            // An entry", "// An entry", "skills"],
        ["reference-topics", '[["references", topic + "/"], ["workflows", topic + "/workflows/"]]', '[["workflows", topic + "/workflows/"]]', "empty"],
        ["workflow-topics", ', ["workflows", topic + "/workflows/"]]', "]", "skills"],
        ["workflow-own-topic", '["workflows", topic + "/workflows/"]', '["workflows", topic + "/"]', "skills"],
        ["reference-read", 'if (named.file !== null) return whole(base + "/" + named.folder + "/" + named.file + ".md");', "", "skills"],
        ["workflow-read", 'whole(base + "/" + named.folder + "/"', 'whole(base + "/references/"', "skills"],
        ["skill-whole", "const whole = file => read(home, file, null).text;", "const whole = file => read(home, file, 16384).text;", "skills"],
        ["skill-description", 'if (value !== "" && !BLOCK_SCALAR.test(value)) return value.slice(0, LINE_CHARS);', "", "skills"],
        ["skill-folded", " && !BLOCK_SCALAR.test(value)", "", "skills"],
        ["skill-folded-marks", "const BLOCK_SCALAR = /^[>|][-+1-9]{0,2}$/;", "const BLOCK_SCALAR = /^[>|]$/;", "skills"],
        ["skill-heading", '.replace(/^#+\\s*/, "")', "", "skills"],
        ["folder-kind", ' && (!last || flags & O_DIRECTORY)) fail("kind");', ' && !last) fail("kind");', "skills"],
        ["set-bound", "if (entries.length === SET_ENTRIES) return { entries, complete: false };", "", "skills"],
        ["note-rule", '    if (!Tools.memoryNote(entry)) fail("absent");\n', "", "notes"],
        ["note-folder", 'return read(home, "memory/" + entry, null).text;', "return read(home, entry, null).text;", "notes"],
        ["note-whole", 'return read(home, "memory/" + entry, null).text;', 'return read(home, "memory/" + entry, 16384).text;', "notes"],
        ["note-inbox", "(?!inbox/)", "", "notes", path.join(path.dirname(file), "Tools.js")],
        ["notes-list-kind", 'if (!stat.isFile() || !entry.name.endsWith(".md") || !Tools.memoryNote(id)) continue;', 'if (!stat.isFile()) continue;', "notesList"],
        ["notes-list-bound", 'if (found.length > NOTE_ENTRIES) fail("notes-too-many");', "", "notesList"],
        ["tool-entry", 'const MAIL_TOOL = ".agents/skills/orch/scripts/lane-mail";', 'const MAIL_TOOL = "skills/own/lane-mail";', "mailTool"],
        ["tool-execute", " && (stat.mode & 0o100) !== 0", "", "mailTool"],
        ["tool-file", "stat.isFile() && (stat.mode", "(stat.mode", "mailTool"],
        ["own-repository", "    if (own !== true) return null;\n", "", "ownRepository"],
        ["own-repository-kind", "return stat.isDirectory() || stat.isFile();", "return true;", "ownRepository"],
        ["own-repository-link", [['if (kind === "absent" || kind === "link") fail(kind);', 'if (kind === "absent") fail(kind);'],
            ["(last ? flags : O_RDONLY | O_DIRECTORY) | O_NOFOLLOW", "(last ? flags : O_RDONLY | O_DIRECTORY)"]], null, "ownRepository"],
        ["own-repository-name", 'const OWN_REPOSITORY = ".git";', 'const OWN_REPOSITORY = ".agents";', "ownRepository"],
        ["mailbox-folder", 'const MAILBOX = "tmp/lane-mail/overseer";', 'const MAILBOX = "tmp/lane-mail";', "mailbox"],
        ["mailbox-kind", "return held(home, MAILBOX, O_RDONLY | O_DIRECTORY, () => true) === true;", "return held(home, MAILBOX, O_RDONLY | O_NONBLOCK, () => true) === true;", "mailbox"],
        ["tool-link", [['if (kind === "absent" || kind === "link") fail(kind);', 'if (kind === "absent") fail(kind);'],
            ["(last ? flags : O_RDONLY | O_DIRECTORY) | O_NOFOLLOW", "(last ? flags : O_RDONLY | O_DIRECTORY)"]], null, "mailTool"],
        ["render-place", 'const RENDER = ".agents/skills";', 'const RENDER = ".agents/skill";', "render"],
        ["render-open", 'const set = source(held.get("."));', "const set = COPY;", "render"],
        ["render-cutover", '        if (set === RENDER) fs.rmSync(', '        if (false) fs.rmSync(', "render"],
        ["render-no-copy", "            if (entry === COPY && set === RENDER) continue;\n", "", "render"],
        ["render-package-alone", "if (folder === RENDER) listed =", "if (false) listed =", "render"],
        ["render-name", '    if (set === RENDER && named.name !== PACKAGE) fail("absent");\n', "", "render"],
        ["render-flat", "    if (set !== RENDER) {", "    if (true) {", "render"],
        ["render-partial", '        if (!RENDER_FILES.every(name => found.includes(name))) fail("package");\n', "", "renderRefused"],
        ["render-link", '            if (kind === "link") return fail("link");\n', "", "renderRefused"],
        ["render-tree", "const found = entries(at, 0).map(([name]) => name);", 'const found = fs.readdirSync("/proc/self/fd/" + at);', "renderRefused"],
    ]) {
        const result = mutant(source, name, needle, replacement, logic => CASES[row](logic), "Home.js");
        assert.equal(result, undefined);
        controls++;
        console.log("control=" + name + " detected");
    }
    // The gate's own rules, each held by the render's row.
    for (const [name, needle, replacement] of [
        ["render-gate", " || inJarvisHome(target.path, ancestor))", ")"],
        ["render-masks", "protectedRoots.concat(accounts, jarvisHomeMasks())", "protectedRoots.concat(accounts)"]
    ]) {
        assert.equal(mutant(denied, name, needle, replacement, logic => renderGate(logic), "Denied.js"), undefined);
        controls++;
        console.log("control=" + name + " detected");
    }
    // The project-instructions row: a home whose package copy carries a
    // well-formed block after the frontmatter fails that row, not the byte
    // comparison after it.
    const planted = fs.mkdtempSync(path.join(process.env.JARVIS_TEST_ROOT, "planted-"));
    try {
        fs.cpSync(SHIPPED, path.join(planted, "skills/base/jarvis"), { recursive: true });
        const skill = path.join(planted, "skills/base/jarvis/SKILL.md");
        const text = fs.readFileSync(skill, "utf8");
        const close = text.indexOf("\n---\n", 4) + "\n---\n".length;
        assert.equal(text.startsWith("---\n") && close > "\n---\n".length, true, "project-instructions frontmatter");
        fs.writeFileSync(skill, text.slice(0, close) + "\n<!-- " + PROJECT_INSTRUCTIONS + ":start -->\n## Project Instructions\n\nPlanted policy.\n<!-- "
            + PROJECT_INSTRUCTIONS + ":end -->\n" + text.slice(close));
        assert.notEqual(fs.readFileSync(skill, "utf8"), text);
        // An assertion's message carries its diff after the first line.
        assert.throws(() => shipped(planted),
            error => error instanceof assert.AssertionError && error.message.split("\n")[0] === NO_PROJECT_INSTRUCTIONS,
            "project-instructions must turn red");
    } finally { fs.rmSync(planted, { recursive: true, force: true }); }
    controls++;
    console.log("control=project-instructions detected");
    console.log("test-jarvis-home: ok cases=" + Object.keys(CASES).length + " controls=" + controls);
});
