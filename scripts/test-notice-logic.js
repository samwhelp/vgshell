#!/usr/bin/env node
// Table-driven checks for the requirement notice's decisions in
// shell/Core/PluginLogic.js: what each trigger asks for, whose notice the
// doctor capability may ask for, how the queue
// merges, rests and fills, which notices a scan keeps, what the shown
// notice lists and installs, and
// how a detection's answer is read, and what the consent slot draws: the
// first-start welcome, its key rows and when it is seen. The file loads under node through
// bin/lib/qml-library.js, as the shell loads it. The controls at the end
// edit a copy of the judge, one rule at a time, and the suite must fail on
// every copy. Exit 1 when a row or a control fails.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { load } = require("../bin/lib/qml-library.js");

const CORE = path.join(__dirname, "..", "shell", "Core");
const LOGIC = path.join(CORE, "PluginLogic.js");
const IMPORTS = [
    [path.join(__dirname, "..", "shell", "Ui", "icons", "Lucide.js"), path.join("shell", "Ui", "icons", "Lucide.js")],
    [path.join(CORE, "PackageManagers.js"), path.join("shell", "Core", "PackageManagers.js")],
    [path.join(CORE, "HyprlandLayer.js"), path.join("shell", "Core", "HyprlandLayer.js")],
    [path.join(CORE, "MonitorLogic.js"), path.join("shell", "Core", "MonitorLogic.js")],
    [path.join(CORE, "Pads.js"), path.join("shell", "Core", "Pads.js")],
    [path.join(__dirname, "..", "shell", "Commons", "SettingValues.js"), path.join("shell", "Commons", "SettingValues.js")],
];

let failures = 0;
function report(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log("  ok    " + name); return; }
    failures += 1;
    console.log("  FAIL  " + name + "\n        got  " + g + "\n        want " + w);
}

const PACMAN = { id: "pacman", binary: "pacman" };
const PARU = { id: "aur", binary: "paru" };
const NIX = { id: "nix", binary: "nix" };
const ARCH = { primary: PACMAN, overlays: [PARU], sources: [] };

// Every row against one loaded judge, `ctx`, each result handed to `check`.
function suite(ctx, check) {
    const needs = ctx.validateManifest({
        schemaVersion: 1, id: "acme.needs", name: "Needs", version: "1", author: "a", description: "d",
        kinds: ["service"], entryPoints: { service: "S.qml" }, capabilities: ["requirements"],
        requirements: [
            { command: "vgs-one", packages: { pacman: "one" }, purpose: "First" },
            { command: "vgs-two", packages: { aur: "two-git" }, optional: true, purpose: "Second" },
            { command: "vgs-bare", optional: true, purpose: "No package" },
            { command: "sh", packages: { pacman: "bash" }, purpose: "Present" },
            { command: "vgs-nix", packages: { nix: "nix-one" }, purpose: "Nix" },
        ],
    }, "/p").manifest;
    const allMissing = ["vgs-one", "vgs-two", "vgs-bare", "vgs-nix"];

    // noticeRequest: [name, missing, trigger, commands, want as
    // [answer, commands, required]].
    const requestRows = [
        ["installed lists every missing command and requires the needed ones", allMissing, "installed", undefined, ["ok", ["vgs-one", "vgs-two", "vgs-bare", "vgs-nix"], ["vgs-one", "vgs-nix"]]],
        ["enabled asks as installed does", allMissing, "enabled", undefined, ["ok", ["vgs-one", "vgs-two", "vgs-bare", "vgs-nix"], ["vgs-one", "vgs-nix"]]],
        ["only optional commands missing raise no notice", ["vgs-two", "vgs-bare"], "enabled", undefined, ["satisfied", ["vgs-two", "vgs-bare"], []]],
        ["nothing missing raises no notice", [], "installed", undefined, ["satisfied", [], []]],
        ["a request lists and requires every missing command, optional ones too", allMissing, "requested", undefined, ["ok", ["vgs-one", "vgs-two", "vgs-bare", "vgs-nix"], ["vgs-one", "vgs-two", "vgs-bare", "vgs-nix"]]],
        ["a request with only optional commands missing raises the notice", ["vgs-two", "vgs-bare"], "requested", undefined, ["ok", ["vgs-two", "vgs-bare"], ["vgs-two", "vgs-bare"]]],
        ["a request with nothing missing is satisfied", [], "requested", undefined, ["satisfied", [], []]],
        ["an offer lists and requires its missing commands, optional ones too", allMissing, "offered", ["vgs-two", "vgs-one"], ["ok", ["vgs-one", "vgs-two"], ["vgs-one", "vgs-two"]]],
        ["an offer of present commands is satisfied", allMissing, "offered", ["sh"], ["satisfied", [], []]],
        ["an offer of a command it did not declare", allMissing, "offered", ["vgs-one", "pacman"], ["refused: requirement=pacman reason=undeclared", [], []]],
        ["an undeclared command is named even when unprintable", allMissing, "offered", ["a b"], ["refused: requirement=\"a b\" reason=undeclared", [], []]],
        ["an offer that is not a list", allMissing, "offered", "vgs-one", ["refused: requirements=malformed", [], []]],
        ["an empty offer", allMissing, "offered", [], ["refused: requirements=malformed", [], []]],
        ["an offer holding a number", allMissing, "offered", ["vgs-one", 7], ["refused: requirements=malformed", [], []]],
        ["an offer of seventeen commands", allMissing, "offered", Array(17).fill("vgs-one"), ["refused: requirements=malformed", [], []]],
        ["an offer of sixteen commands", allMissing, "offered", Array(16).fill("vgs-one"), ["ok", ["vgs-one"], ["vgs-one"]]],
        ["a suggestion lists and requires its missing commands, optional ones too", allMissing, "suggested", ["vgs-two", "vgs-one"], ["ok", ["vgs-one", "vgs-two"], ["vgs-one", "vgs-two"]]],
        ["a suggestion that is not a list", allMissing, "suggested", "vgs-one", ["refused: requirements=malformed", [], []]],
        ["a choice lists and requires its missing commands, optional ones too", allMissing, "chosen", ["vgs-bare"], ["ok", ["vgs-bare"], ["vgs-bare"]]],
        ["a choice of a command the owner did not declare", allMissing, "chosen", ["pacman"], ["refused: requirement=pacman reason=undeclared", [], []]],
        ["a choice that is not a list", allMissing, "chosen", "vgs-one", ["refused: requirements=malformed", [], []]],
    ];
    for (const [name, missing, trigger, commands, want] of requestRows) {
        const r = ctx.noticeRequest(needs, missing, {}, trigger, commands);
        check("noticeRequest: " + name, [r.answer, r.commands, r.required], want);
    }
    check("noticeRequest throws on a trigger no rule covers", (() => { try { ctx.noticeRequest(needs, [], {}, "asked", undefined); return "answered"; } catch (e) { return e.message; } })(), "notices: trigger \"asked\" is not one of installed, enabled, offered, suggested, requested, chosen");

    // The triggers over a command below its floor: [name, missing, trigger,
    // commands, want]. vgs-old reads 1.9.0 under the floor 2.0.0.
    const floored = ctx.validateManifest({
        schemaVersion: 1, id: "acme.floor", name: "Floor", version: "1", author: "a", description: "d",
        kinds: ["service"], entryPoints: { service: "S.qml" }, capabilities: ["requirements"],
        requirements: [
            { command: "vgs-far", packages: { aur: "far-git" }, floor: "1.2.0", purpose: "Far" },
            { command: "vgs-old", packages: { pacman: "old", mise: "npm:vgs-old" }, floor: "2.0.0", purpose: "Old" },
            { command: "vgs-one", packages: { pacman: "one" }, purpose: "First" },
        ],
    }, "/p").manifest;
    const below = { "vgs-old": "vgs-old 1.9.0", "vgs-far": "1.2.0" };
    const outdatedRows = [
        ["enabling a plugin whose only lack is an outdated command raises no notice", [], "enabled", undefined, ["satisfied", [], []]],
        ["installing one raises none either", [], "installed", undefined, ["satisfied", [], []]],
        ["enabled lists a missing command beside an outdated one, and not the outdated one", ["vgs-one"], "enabled", undefined, ["ok", ["vgs-one"], ["vgs-one"]]],
        ["a request lists and requires the outdated command", [], "requested", undefined, ["ok", ["vgs-old"], ["vgs-old"]]],
        ["an offer lists and requires the outdated command", [], "offered", ["vgs-old", "vgs-far"], ["ok", ["vgs-old"], ["vgs-old"]]],
        ["a choice lists and requires the outdated command", [], "chosen", ["vgs-old"], ["ok", ["vgs-old"], ["vgs-old"]]],
    ];
    for (const [name, missing, trigger, commands, want] of outdatedRows) {
        const r = ctx.noticeRequest(floored, missing, below, trigger, commands);
        check("noticeRequest: " + name, [r.answer, r.commands, r.required], want);
    }

    // noticeUnchanged: [name, missing, versions, the step that ran, want].
    // The notice lists all three commands; on ARCH pacman provides vgs-old
    // and vgs-one, and paru provides vgs-far, which the manifest declares
    // first and the primary's group still precedes.
    const three = { commands: ["vgs-old", "vgs-one", "vgs-far"], required: ["vgs-old", "vgs-one", "vgs-far"] };
    const farBelow = { "vgs-old": "2.0.0", "vgs-far": "far 1.1.9 (linux)" };
    const unchangedRows = [
        ["an update that left the version it read is named with that version and the floor", [], below, { action: "update", args: ["old"] }, { kind: "outdated", name: "vgs-old", version: "1.9.0", floor: "2.0.0" }],
        ["the primary's update is named by its own requirement, behind an overlay's declared first", [], { "vgs-old": "1.9.0", "vgs-far": "1.1.9" }, { action: "update", args: ["old"] }, { kind: "outdated", name: "vgs-old", version: "1.9.0", floor: "2.0.0" }],
        ["an update that reached the floor left nothing", [], { "vgs-old": "2.0.0", "vgs-far": "1.2.0" }, { action: "update", args: ["old"] }, null],
        ["an update whose notice now offers the next manager's left nothing", [], farBelow, { action: "update", args: ["old"] }, null],
        ["an overlay's update that left its version is named by its own requirement", [], farBelow, { action: "update", args: ["--manager", "aur", "far-git"] }, { kind: "outdated", name: "vgs-far", version: "1.1.9", floor: "1.2.0" }],
        ["an install that left its command missing is named", ["vgs-one"], { "vgs-old": "2.0.0", "vgs-far": "1.2.0" }, { action: "install", args: ["one"] }, { kind: "missing", name: "vgs-one" }],
        ["a run of both steps that changed nothing is named by its manager's first requirement", ["vgs-one"], below, { action: "update", args: ["old", "--install", "one"] }, { kind: "outdated", name: "vgs-old", version: "1.9.0", floor: "2.0.0" }],
        ["a run of both steps that left only its update owed left something changed", [], below, { action: "update", args: ["old", "--install", "one"] }, null],
        ["an install is not judged against the press that also updates", ["vgs-one"], below, { action: "install", args: ["one"] }, null],
        ["an install that found its command left nothing, with an update still owed", [], below, { action: "install", args: ["one"] }, null],
        ["a step is not judged against the other step's arguments", ["vgs-one"], below, { action: "update", args: ["one"] }, null],
    ];
    for (const [name, missing, versions, ran, want] of unchangedRows)
        check("noticeUnchanged: " + name, ctx.noticeUnchanged(floored, missing, versions, three, ARCH, ran), want);
    check("noticeUnchanged: no answer from detection names nothing", ctx.noticeUnchanged(floored, [], below, three, null, { action: "update", args: ["old"] }), null);
    check("noticeUnchanged throws on a step no rule covers", (() => { try { ctx.noticeUnchanged(floored, [], below, three, ARCH, { action: "remove", args: ["old"] }); return "answered"; } catch (e) { return e.message.split(":")[0]; } })(), "notices");
    const HELD_MISE = { primary: PACMAN, overlays: [PARU], sources: [{ id: "mise", binary: "mise" }], holders: { "vgs-old": { path: "/home/method/.local/bin/vgs-old", owners: { pacman: null, mise: "npm:vgs-old" } } } };
    const heldView = ctx.noticeView(floored, [], below, { id: "acme.floor", commands: ["vgs-old"], required: ["vgs-old"] }, HELD_MISE);
    check("noticeView: an outdated command held by the second manager updates through that manager", [heldView.rows.map(r => r.name + " (" + r.package.manager + "/" + r.package.name + "): " + r.purpose), heldView.run.action, heldView.run.args], [["vgs-old (mise/npm:vgs-old): Old"], "update", ["--manager", "mise", "npm:vgs-old"]]);

    // noticeView's press: [name, missing, versions, want as [action, args,
    // installs, updates], the entries listed as chip and update, later].
    // One press runs one manager's packages, the missing and the outdated.
    const pressRows = [
        ["a missing and an outdated package of one manager are one press that names both", ["vgs-one"], below,
            ["update", ["old", "--install", "one"], ["one"], ["old"]], [["old", true], ["one", false]], 0],
        ["a second manager's package waits for a later press", ["vgs-one"], { "vgs-old": "1.9.0", "vgs-far": "1.1.9" },
            ["update", ["old", "--install", "one"], ["one"], ["old"]], [["old", true], ["one", false]], 1],
        ["a manager with an update is pressed before the primary's install", ["vgs-one"], farBelow,
            ["update", ["--manager", "aur", "far-git"], [], ["far-git"]], [["far-git", true]], 1],
        ["missing packages alone are an install", ["vgs-one"], { "vgs-old": "2.0.0", "vgs-far": "1.2.0" },
            ["install", ["one"], ["one"], []], [["one", false]], 0],
        ["outdated packages alone are an update with no install", [], below,
            ["update", ["old"], [], ["old"]], [["old", true]], 0],
    ];
    // One name under two managers is two packages: the AUR one, outdated,
    // gives the primary's missing one no update.
    const twins = ctx.validateManifest({
        schemaVersion: 1, id: "acme.twins", name: "Twins", version: "1", author: "a", description: "d",
        kinds: ["service"], entryPoints: { service: "S.qml" }, capabilities: ["requirements"],
        requirements: [
            { command: "vgs-here", packages: { pacman: "twin" }, purpose: "Here" },
            { command: "vgs-there", packages: { aur: "twin" }, floor: "2.0.0", purpose: "There" },
        ],
    }, "/p").manifest;
    const twinView = ctx.noticeView(twins, ["vgs-here"], { "vgs-there": "1.0.0" }, { commands: ["vgs-here", "vgs-there"], required: ["vgs-here"] }, ARCH);
    check("noticeView press: a package is updated only through its own manager", [twinView.run.action, twinView.run.args, twinView.groups.map(g => [g.manager, g.chip, g.update]), twinView.later], ["update", ["--manager", "aur", "twin"], [["aur", "twin", true]], 1]);
    for (const [name, missing, versions, run, groups, later] of pressRows) {
        const v = ctx.noticeView(floored, missing, versions, three, ARCH);
        check("noticeView press: " + name, [[v.run.action, v.run.args, v.run.installs, v.run.updates], v.groups.map(g => [g.chip, g.update]), v.later], [run, groups, later]);
    }

    // The core's owner: the core's list, drawn under the name VGS, asked
    // for as a plugin's manifest is.
    const core = ctx.coreOwner([{ name: "gum", bus: null, packages: { pacman: "gum" }, optional: true, purpose: "Dialogs" }, { name: "git", bus: null, packages: { pacman: "git" }, optional: false, purpose: "Plugins" }]);
    check("the core's owner is named core and drawn as VGS", [core.id, core.name, ctx.CORE_OWNER], ["core", "VGS", "core"]);
    const coreRequest = ctx.noticeRequest(core, ["gum"], {}, "chosen", ["gum", "git"]);
    check("noticeRequest: a choice of the core's commands lists its missing ones", [coreRequest.answer, coreRequest.commands, coreRequest.required], ["ok", ["gum"], ["gum"]]);

    // noticeOwnerError: [name, owner, want]. acme.needs is enabled,
    // acme.off known and disabled.
    const owners = { core: core, "acme.needs": needs, "acme.off": Object.assign({}, needs, { id: "acme.off" }) };
    const ownerRows = [
        ["the core is always an owner", "core", ""],
        ["an enabled plugin is an owner", "acme.needs", ""],
        ["a disabled plugin is refused", "acme.off", "refused: owner=acme.off reason=disabled"],
        ["an unknown owner is refused", "acme.gone", "refused: owner=acme.gone reason=unknown"],
        ["an unprintable owner is named quoted", "a b", "refused: owner=\"a b\" reason=unknown"],
        ["an owner that is no string is malformed", 7, "refused: owner=malformed"],
        ["an inherited name is no owner", "toString", "refused: owner=toString reason=unknown"],
    ];
    for (const [name, owner, want] of ownerRows)
        check("noticeOwnerError: " + name, ctx.noticeOwnerError(owner, owners, ["acme.needs"]), want);

    // noticeAdmit: [name, queue, rest, id, request commands and required,
    // trigger, want as [answer, queue as id: commands / required]].
    const n = (id, commands, required) => ({ id, commands, required });
    const shown = q => q.map(e => e.id + ": " + e.commands.join(",") + " / " + e.required.join(","));
    const full = Array.from({ length: 8 }, (_, i) => n("acme.p" + i, ["c"], ["c"]));
    const admitRows = [
        ["a first notice joins the queue", [], {}, "acme.needs", n("", ["a", "b"], ["a"]), "installed", ["ok", ["acme.needs: a,b / a"]]],
        ["a second plugin waits behind the first", [n("acme.x", ["x"], ["x"])], {}, "acme.needs", n("", ["a"], ["a"]), "enabled", ["ok", ["acme.x: x / x", "acme.needs: a / a"]]],
        ["a plugin holding a notice gets the new commands merged", [n("acme.x", ["x"], ["x"]), n("acme.needs", ["a"], ["a"])], {}, "acme.needs", n("", ["b", "a"], ["b"]), "offered", ["ok", ["acme.x: x / x", "acme.needs: a,b / a,b"]]],
        ["a resting plugin's suggestion is refused", [], { "acme.needs": 1500 }, "acme.needs", n("", ["a"], ["a"]), "suggested", ["refused: requirements=acme.needs reason=resting retry-ms=500", []]],
        ["a rest that ended refuses nothing", [], { "acme.needs": 1000 }, "acme.needs", n("", ["a"], ["a"]), "suggested", ["ok", ["acme.needs: a / a"]]],
        ["an offer, a user's press, is never refused for a rest", [], { "acme.needs": 1500 }, "acme.needs", n("", ["a"], ["a"]), "offered", ["ok", ["acme.needs: a / a"]]],
        ["an install is never refused for a rest", [], { "acme.needs": 1500 }, "acme.needs", n("", ["a"], ["a"]), "installed", ["ok", ["acme.needs: a / a"]]],
        ["an enable is never refused for a rest", [], { "acme.needs": 1500 }, "acme.needs", n("", ["a"], ["a"]), "enabled", ["ok", ["acme.needs: a / a"]]],
        ["a request is never refused for a rest", [], { "acme.needs": 1500 }, "acme.needs", n("", ["a"], ["a"]), "requested", ["ok", ["acme.needs: a / a"]]],
        ["a choice is never refused for a rest", [], { "acme.needs": 1500 }, "acme.needs", n("", ["a"], ["a"]), "chosen", ["ok", ["acme.needs: a / a"]]],
        ["another plugin's rest refuses nothing", [], { "acme.other": 1500 }, "acme.needs", n("", ["a"], ["a"]), "suggested", ["ok", ["acme.needs: a / a"]]],
        ["a resting plugin's suggestion merges into its held notice", [n("acme.needs", ["a"], ["a"])], { "acme.needs": 1500 }, "acme.needs", n("", ["b"], ["b"]), "suggested", ["ok", ["acme.needs: a,b / a,b"]]],
        ["a full queue refuses a ninth plugin", full, {}, "acme.needs", n("", ["a"], ["a"]), "installed", ["refused: notices=full limit=8", shown(full)]],
        ["a full queue still merges a held plugin", full, {}, "acme.p3", n("", ["d"], ["d"]), "installed", ["ok", shown(full).map(line => line.startsWith("acme.p3:") ? "acme.p3: c,d / c,d" : line)]],
    ];
    for (const [name, queue, rest, id, request, trigger, want] of admitRows) {
        const before = JSON.stringify(queue);
        const r = ctx.noticeAdmit(queue, rest, id, request, trigger, 1000);
        check("noticeAdmit: " + name, [r.answer, shown(r.queue)], want);
        check("noticeAdmit leaves the queue it was handed alone: " + name, JSON.stringify(queue), before);
    }
    check("noticeAdmit throws on a trigger no rule covers", (() => { try { ctx.noticeAdmit([], {}, "acme.needs", n("", ["a"], ["a"]), "asked", 0); return "answered"; } catch (e) { return e.message; } })(), "notices: trigger \"asked\" is not one of installed, enabled, offered, suggested, requested, chosen");
    check("the queue holds eight plugins and an offer names sixteen commands", [ctx.NOTICE_QUEUE_MAX, ctx.NOTICE_OFFER_MAX], [8, 16]);
    check("a plugin's offers rest ten minutes after Not now", ctx.NOTICE_OFFER_REST_MS, 600000);

    // noticeView: [name, missing, notice, found, want as
    // [satisfied, rows as command (manager/name) optional, the press as
    // [action, args], byHand, later]].
    const all = n("acme.needs", ["vgs-one", "vgs-two", "vgs-bare", "vgs-nix"], ["vgs-one", "vgs-nix"]);
    const rowText = r => r.name + (r.package === null ? "" : " (" + r.package.manager + "/" + r.package.name + ")") + (r.optional ? " optional" : "") + ": " + r.purpose;
    const viewRows = [
        ["the primary's group installs first", allMissing, all, ARCH,
            [false, ["vgs-one (pacman/one): First", "vgs-two (aur/two-git) optional: Second", "vgs-bare optional: No package", "vgs-nix: Nix"], ["install", ["one"]], [], 3]],
        ["the overlay's group installs once the primary's is done", ["vgs-two", "vgs-nix"], all, ARCH,
            [false, ["vgs-two (aur/two-git) optional: Second", "vgs-nix: Nix"], ["install", ["--manager", "aur", "two-git"]], [], 1]],
        ["nix's packages are named for its configuration, with no install", allMissing, all, { primary: NIX, overlays: [], sources: [] },
            [false, ["vgs-one: First", "vgs-two optional: Second", "vgs-bare optional: No package", "vgs-nix (nix/nix-one): Nix"], null, [{ manager: "nix", names: ["nix-one"] }], 0]],
        ["no answer from detection lists commands without packages", allMissing, all, null,
            [false, ["vgs-one: First", "vgs-two optional: Second", "vgs-bare optional: No package", "vgs-nix: Nix"], null, [], 0]],
        ["the notice is satisfied once no required command is missing", ["vgs-two", "vgs-bare"], all, ARCH,
            [true, ["vgs-two (aur/two-git) optional: Second", "vgs-bare optional: No package"], ["install", ["--manager", "aur", "two-git"]], [], 1]],
        ["a command the notice does not list is not drawn", ["vgs-one", "vgs-two"], n("acme.needs", ["vgs-two"], ["vgs-two"]), ARCH,
            [false, ["vgs-two (aur/two-git) optional: Second"], ["install", ["--manager", "aur", "two-git"]], [], 0]],
    ];
    for (const [name, missing, notice, found, want] of viewRows) {
        const v = ctx.noticeView(needs, missing, {}, notice, found);
        check("noticeView: " + name, [v.satisfied, v.rows.map(rowText), v.run === null ? null : [v.run.action, v.run.args], v.byHand, v.later], want);
        check("noticeView lists every entry while no press runs, and counts none for later: " + name, v.run !== null || v.groups.length === v.rows.length, true);
    }
    // noticeGroups over noticeView's rows: [name, found, want as chip,
    // packaged and purposes per group]. vgs-a and vgs-b come from one
    // package, and the
    // command `shared`, with no package, carries that package's name.
    const sharing = ctx.validateManifest({
        schemaVersion: 1, id: "acme.sharing", name: "Sharing", version: "1", author: "a", description: "d",
        kinds: ["service"], entryPoints: { service: "S.qml" }, capabilities: ["requirements"],
        requirements: [
            { command: "vgs-a", packages: { pacman: "shared" }, purpose: "A" },
            { command: "vgs-c", purpose: "C" },
            { command: "vgs-b", packages: { pacman: "shared" }, optional: true, purpose: "B" },
            { command: "shared", purpose: "D" },
            { command: "vgs-e", packages: { aur: "other-git" }, purpose: "E" },
        ],
    }, "/p").manifest;
    const sharingMissing = ["vgs-a", "vgs-c", "vgs-b", "shared", "vgs-e"];
    const groupRows = [
        ["requirements one package provides are one group, in first-appearance order", ARCH,
            [["shared", true, ["A", "B"]], ["vgs-c", false, ["C"]], ["shared", false, ["D"]], ["other-git", true, ["E"]]]],
        ["without packages each requirement is its own group", null,
            [["vgs-a", false, ["A"]], ["vgs-c", false, ["C"]], ["vgs-b", false, ["B"]], ["shared", false, ["D"]], ["vgs-e", false, ["E"]]]],
    ];
    for (const [name, found, want] of groupRows) {
        const v = ctx.noticeView(sharing, sharingMissing, {}, n("acme.sharing", sharingMissing, ["vgs-a"]), found);
        check("noticeGroups: " + name, ctx.noticeGroups(v.rows).map(g => [g.chip, g.packaged, g.purposes]), want);
    }
    const coreView = ctx.noticeView(core, ["gum"], {}, n("core", ["gum"], ["gum"]), ARCH);
    check("noticeView: the core's notice installs its package", [coreView.satisfied, coreView.rows.map(rowText), coreView.run.action, coreView.run.args], [false, ["gum (pacman/gum) optional: Dialogs"], "install", ["gum"]]);

    // noticeSettle: [name, queue, missing per plugin, installing id, the
    // ids kept]. acme.gone has no manifest.
    const manifests = { "acme.needs": needs, "acme.other": Object.assign({}, needs, { id: "acme.other" }) };
    const held = [n("acme.needs", ["vgs-one"], ["vgs-one"]), n("acme.other", ["vgs-nix"], ["vgs-nix"])];
    const settleRows = [
        ["notices still missing a required command stay", held, { "acme.needs": ["vgs-one"], "acme.other": ["vgs-nix"] }, "", ["acme.needs", "acme.other"]],
        ["a satisfied notice goes", held, { "acme.needs": [], "acme.other": ["vgs-nix"] }, "", ["acme.other"]],
        ["the installing notice stays satisfied until its run's scan", held, { "acme.needs": [], "acme.other": ["vgs-nix"] }, "acme.needs", ["acme.needs", "acme.other"]],
        ["another plugin's install keeps no satisfied notice", held, { "acme.needs": [], "acme.other": ["vgs-nix"] }, "acme.other", ["acme.other"]],
        ["a plugin with no missing list is satisfied", held, { "acme.other": ["vgs-nix"] }, "", ["acme.other"]],
        ["a notice whose plugin went goes, installing or not", [n("acme.gone", ["vgs-one"], ["vgs-one"])].concat(held), { "acme.gone": ["vgs-one"], "acme.needs": ["vgs-one"], "acme.other": ["vgs-nix"] }, "acme.gone", ["acme.needs", "acme.other"]],
    ];
    for (const [name, queue, missing, installing, want] of settleRows)
        check("noticeSettle: " + name, ctx.noticeSettle(queue, manifests, missing, {}, installing).map(e => e.id), want);
    const coreHeld = [n("core", ["gum"], ["gum"])];
    check("noticeSettle: the core's notice stays while its command is missing", ctx.noticeSettle(coreHeld, { core: core }, { core: ["gum"] }, {}, "").map(e => e.id), ["core"]);
    check("noticeSettle: the core's notice goes once the scan finds its command", ctx.noticeSettle(coreHeld, { core: core }, { core: [] }, {}, "").map(e => e.id), []);

    // noticeDetected: [name, completion, stdout, stderr, want as the
    // managers found or the log line].
    const ok = { code: 0, status: 0 };
    const arch = JSON.stringify(ARCH);
    const detectRows = [
        ["a detection that answered", ok, arch + "\n", "", ARCH],
        ["a system with no primary", ok, JSON.stringify({ primary: null, overlays: [{ id: "flatpak", binary: "flatpak" }], sources: [] }), "", { primary: null, overlays: [{ id: "flatpak", binary: "flatpak" }], sources: [] }],
        ["a detection that never started", null, "", "", "notices: detect=unstarted"],
        ["a detection that failed", { code: 1, status: 0 }, "", "vgshell: refused: os-release=unreadable\nmore", "notices: detect=failed exit=1 status=0 vgshell: refused: os-release=unreadable"],
        ["a detection that crashed", { code: 0, status: 1 }, arch, "", "notices: detect=failed exit=0 status=1 "],
        ["output that does not parse", ok, "primary=pacman", "", "notices: detect=unparseable"],
        ["a manager the table does not know", ok, JSON.stringify({ primary: { id: "brew", binary: "brew" }, overlays: [], sources: [] }), "", "notices: detect=malformed"],
        ["an entry without a binary", ok, JSON.stringify({ primary: { id: "pacman" }, overlays: [], sources: [] }), "", "notices: detect=malformed"],
        ["overlays that are not a list", ok, JSON.stringify({ primary: null, overlays: {}, sources: [] }), "", "notices: detect=malformed"],
        ["no sources", ok, JSON.stringify({ primary: null, overlays: [] }), "", "notices: detect=malformed"],
        ["holders are optional", ok, JSON.stringify(Object.assign({}, ARCH, { holders: { "vgs-old": { path: "/usr/bin/vgs-old", owners: { pacman: "old", aur: null } }, missing: { path: null, owners: {} } } })), "", Object.assign({}, ARCH, { holders: { "vgs-old": { path: "/usr/bin/vgs-old", owners: { pacman: "old", aur: null } }, missing: { path: null, owners: {} } } })],
        ["a holder command must be a command name", ok, JSON.stringify(Object.assign({}, ARCH, { holders: { "/bin/sh": { path: "/bin/sh", owners: { pacman: "bash" } } } })), "", "notices: detect=malformed"],
        ["a holder owner must be a known manager", ok, JSON.stringify(Object.assign({}, ARCH, { holders: { sh: { path: "/bin/sh", owners: { brew: "bash" } } } })), "", "notices: detect=malformed"],
        ["a missing holder has no owners", ok, JSON.stringify(Object.assign({}, ARCH, { holders: { sh: { path: null, owners: { pacman: "bash" } } } })), "", "notices: detect=malformed"],
        ["a list for an answer", ok, "[]", "", "notices: detect=malformed"],
    ];
    for (const [name, completion, stdout, stderr, want] of detectRows) {
        const r = ctx.noticeDetected(completion, stdout, stderr);
        check("noticeDetected: " + name, r.ok ? r.found : r.line, want);
    }

    // consentSlotView: the first-start welcome around the Hyprland question.
    // The key rows are the repository's shipped shell.json's, so a key row
    // it drops fails here too.
    const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "shell.json"), "utf8"));
    const binder = (id, shortcut, key) => ctx.validateManifest({
        schemaVersion: 1, id, name: "B", version: "1", author: "a", description: "d",
        kinds: ["service"], entryPoints: { service: "S.qml" }, capabilities: ["shortcut"], hyprland: { binds: [{ shortcut, key }] },
    }, "/p").manifest;
    const keyhints = ctx.hyprlandSection({}, binder("vgs.keyhints", "toggle", "SUPER+SLASH"));
    const themes = ctx.hyprlandSection({}, binder("vgs.themes", "themes", "SUPER+SHIFT+T"));
    const keyhintsUnbound = ctx.hyprlandSection({ plugins: [{ id: "vgs.keyhints", keys: { toggle: null } }] }, binder("vgs.keyhints", "toggle", "SUPER+SLASH"));
    const keyhintsMoved = ctx.hyprlandSection({ plugins: [{ id: "vgs.keyhints", keys: { toggle: "SUPER+SHIFT+K" } }] }, binder("vgs.keyhints", "toggle", "SUPER+SLASH"));
    const QUESTION = "Let VGS manage its Hyprland settings?";
    const CONNECT = [{ label: "Connect", role: "accept", answer: "connect" }, { label: "Not now", role: "cancel", answer: "decline" }];
    const CLOSE = [{ label: "Close", role: "cancel", answer: "close" }];
    const LINK = { text: "hyprland.lua", path: "hypr/hyprland.lua" };
    const phase = (name, queued, failure) => ({ phase: name, queued: queued || "", failure: failure || "" });
    const shape = view => view === null ? null : ({
        welcome: view.welcome,
        title: view.title,
        message: view.message === "" ? "" : "present",
        lineCount: view.lines.length,
        link: view.link,
        keys: view.keys,
        keysTitle: view.keysTitle,
        actions: view.actions,
        failure: view.failure,
        busy: view.busy
    });
    const welcome = (lineCount, keys, asking, failure, busy, link) => ({ welcome: true, title: "Welcome to VGS", message: "", lineCount, link: link === undefined ? LINK : link, keys, keysTitle: "Quick commands", actions: asking ? CONNECT : CLOSE, failure: failure || "", busy: busy === true });
    const question = { welcome: false, title: QUESTION, message: "present", lineCount: 0, link: null, keys: [], keysTitle: "", actions: CONNECT, failure: "", busy: false };
    const keyLine = (shortcut, text) => ({ shortcut, text });
    const keyHintsLine = keyLine("Super+/", "shows every key VGS adds.");
    const themeLine = keyLine("Super+Shift+T", "picks a theme.");
    // [name, consent, welcome state, shipped, sections, want].
    const slotRows = [
        ["an unseen welcome asks with Connect and Not now", phase("asking"), "unseen", shipped, [keyhints, themes], welcome(3, [keyHintsLine, themeLine], true)],
        ["the key-hints row is absent while its shortcut is not bound", phase("asking"), "unseen", shipped, [themes], welcome(3, [themeLine], true)],
        ["the key-hints row is absent while the user unbinds it", phase("asking"), "unseen", shipped, [keyhintsUnbound, themes], welcome(3, [themeLine], true)],
        ["a key row reads the key the user binds", phase("asking"), "unseen", shipped, [keyhintsMoved], welcome(3, [keyLine("Super+Shift+K", "shows every key VGS adds.")], true)],
        ["no enabled plugin binds a key row", phase("asking"), "unseen", shipped, [], welcome(3, [], true)],
        ["a shipped file without welcome keys draws the fixed lines", phase("asking"), "unseen", { version: 1 }, [keyhints, themes], welcome(3, [], true)],
        ["a failed Connect keeps the welcome with the failure", phase("asking", "", "wire=failed status=1"), "unseen", shipped, [themes], welcome(3, [themeLine], true, "wire=failed status=1")],
        ["a queued answer makes the welcome busy", phase("asking", "connect"), "unseen", shipped, [themes], welcome(3, [themeLine], true, "", true)],
        ["an unseen welcome over a wired file offers Close alone", phase("wired"), "unseen", shipped, [themes], welcome(2, [themeLine], false)],
        ["an unseen welcome with no hyprland.lua offers Close alone without a link", phase("settled"), "unseen", shipped, [themes], welcome(2, [themeLine], false, "", false, null)],
        ["an unseen welcome declined this session offers Close alone", phase("declined"), "unseen", shipped, [themes], welcome(2, [themeLine], false)],
        ["the welcome waits for the probe", phase("pending"), "unseen", shipped, [themes], null],
        ["the welcome waits for the decline marker's read", phase("unwired"), "unseen", shipped, [themes], null],
        ["the slot waits for the welcome marker's read", phase("asking"), "reading", shipped, [themes], null],
        ["a seen welcome leaves the plain question", phase("asking"), "seen", shipped, [keyhints, themes], question],
        ["a seen welcome over a wired file draws nothing", phase("wired"), "seen", shipped, [themes], null],
        ["a seen welcome after Not now draws nothing", phase("declined"), "seen", shipped, [themes], null],
    ];
    for (const [name, consent, state, file, sections, want] of slotRows)
        check("consentSlotView: " + name, shape(ctx.consentSlotView(consent, state, file, sections)), want);
    const throws = (fn) => { try { fn(); return "returned"; } catch (e) { return e.message.split(":")[0]; } };
    check("consentSlotView: an unknown welcome state is refused", throws(() => ctx.consentSlotView(phase("asking"), "maybe", shipped, [])), "consentSlotView");
    check("consentSlotView: an unknown consent phase is refused", throws(() => ctx.consentSlotView(phase("later"), "unseen", shipped, [])), "consentSlotView");

    // keyLabel: [key, want].
    const labelRows = [
        ["SUPER+SLASH", "Super+/"],
        ["SUPER+T", "Super+T"],
        ["SUPER+1", "Super+1"],
        ["SUPER+CTRL+SPACE", "Super+Ctrl+Space"],
        ["ALT+SHIFT+RETURN", "Alt+Shift+Return"],
        ["SUPER+BRACKETLEFT", "Super+["],
        ["SUPER+code:108", "Super+code:108"],
    ];
    for (const [key, want] of labelRows) check("keyLabel: " + key, ctx.keyLabel(key), want);

    // welcomeStep: [name, welcome state, event, want as [state, write]].
    const stepRows = [
        ["a marker that exists reads seen", "reading", { type: "read", seen: true }, ["seen", false]],
        ["an absent marker reads unseen", "reading", { type: "read", seen: false }, ["unseen", false]],
        ["Close closes the welcome and writes the marker", "unseen", { type: "answer", answer: "close" }, ["seen", true]],
        ["Not now waits for the decline", "unseen", { type: "answer", answer: "decline" }, ["unseen", false]],
        ["Connect waits for the wiring", "unseen", { type: "answer", answer: "connect" }, ["unseen", false]],
        ["Not now on the plain question writes nothing", "seen", { type: "answer", answer: "decline" }, ["seen", false]],
        ["a Connect that wires closes the welcome and writes the marker", "unseen", { type: "consent", before: phase("asking", "connect"), after: phase("wired") }, ["seen", true]],
        ["a Not now that declines closes the welcome and writes the marker", "unseen", { type: "consent", before: phase("asking", "decline"), after: phase("declined") }, ["seen", true]],
        ["a decline found at start keeps the welcome", "unseen", { type: "consent", before: phase("unwired"), after: phase("declined") }, ["unseen", false]],
        ["a Connect that fails keeps the welcome", "unseen", { type: "consent", before: phase("asking", "connect"), after: phase("asking", "", "wire=failed status=1") }, ["unseen", false]],
        ["a file wired at start keeps the welcome", "unseen", { type: "consent", before: phase("pending"), after: phase("wired") }, ["unseen", false]],
        ["a wiring after the welcome writes nothing", "seen", { type: "consent", before: phase("asking", "connect"), after: phase("wired") }, ["seen", false]],
    ];
    for (const [name, state, event, want] of stepRows) {
        const r = ctx.welcomeStep(state, event);
        check("welcomeStep: " + name, [r.welcome, r.write], want);
    }
    check("welcomeStep: a second read is refused", throws(() => ctx.welcomeStep("seen", { type: "read", seen: false })), "welcomeStep");
    check("welcomeStep: Close on a seen welcome is refused", throws(() => ctx.welcomeStep("seen", { type: "answer", answer: "close" })), "welcomeStep");
}

suite(load(LOGIC), report);

// Each control removes one rule from a copy of the judge and keeps the text
// around it; the suite must fail on every copy. The copy sits at the
// judge's own place in a temporary tree, beside the files it imports.
const CONTROLS = [
    ["installed requires only the needed commands", ": listed.filter(function (row) { return !row.optional; });", ": listed;"],
    ["a request requires its optional commands", "required = trigger === \"requested\" ? listed : ", "required = "],
    ["installed lists only missing commands", "var lacking = rows.filter(function (row) { return row.state !== \"present\"; });", "var lacking = rows;"],
    ["an install or enable trigger lists no outdated command", "listed = trigger === \"requested\" ? lacking : lacking.filter(function (row) { return row.state === \"missing\"; });", "listed = lacking;"],
    ["a run that left its step owed is named", "if (shown.run === null || shown.run.action !== ran.action || JSON.stringify(shown.run.args) !== JSON.stringify(ran.args)) return null;", "return null;"],
    ["a run whose step moved on left nothing", "if (shown.run === null || shown.run.action !== ran.action || JSON.stringify(shown.run.args) !== JSON.stringify(ran.args)) return null;", ""],
    ["an unchanged run names a requirement of the manager that ran", " && r.package.manager === manager; })[0];", "; })[0];"],
    ["an unchanged run is named by its requirement's state", "if (row.state === \"missing\") return { kind: \"missing\", name: row.name };", ""],
    ["an unchanged update names the version its command printed", "VERSION_IN_LINE.exec(versions[row.name]).slice(1, 4).join(\".\")", "versions[row.name]"],
    ["an unchanged run is an install or an update", "    if (actions.indexOf(ran.action) === -1)\n", "    if (false)\n"],
    ["one press installs a manager's missing packages beside its updates", ".concat(installs.length === 0 ? [] : [\"--install\"].concat(installs))", ""],
    ["a manager with an update is pressed first", "runs.filter(function (g) { return updatesOf(g).length > 0; }).concat(runs)[0]", "runs[0]"],
    ["a view lists only the packages its press handles", "entries.filter(function (e) { return e.manager === pressed.manager; })", "entries"],
    ["a press updates only a package of its own manager", "e.manager === group.manager && e.chip === name && e.update", "e.chip === name && e.update"],
    ["an offer is a list", "if (!Array.isArray(commands) || commands.length === 0", "if (commands.length === 0"],
    ["an offer is not empty", " || commands.length === 0 || commands.length > NOTICE_OFFER_MAX", " || commands.length > NOTICE_OFFER_MAX"],
    ["an offer names at most sixteen commands", " || commands.length > NOTICE_OFFER_MAX || ", " || "],
    ["an offer names strings", " || !commands.every(function (c) { return typeof c === \"string\"; }))", ")"],
    ["an offer names declared commands", "        if (undeclared.length > 0)\n", "        if (false)\n"],
    ["an offer lists only missing commands", "listed = lacking.filter(function (row) { return commands.indexOf(row.name) !== -1; });", "listed = rows.filter(function (row) { return commands.indexOf(row.name) !== -1; });"],
    ["nothing required is satisfied", "answer: required.length === 0 ? \"satisfied\" : \"ok\"", "answer: \"ok\""],
    ["a held plugin's notice is merged", "    if (at !== -1) {\n", "    if (false) {\n"],
    ["a merge keeps the held commands", "var union = function (held, added) { return held.concat(", "var union = function (held, added) { return [].concat(added, "],
    ["a suggestion rests", "if (trigger === \"suggested\" && hasOwn(rest, id) && rest[id] > now)", "if (false)"],
    ["only a suggestion rests", "if (trigger === \"suggested\" && hasOwn(rest, id)", "if (hasOwn(rest, id)"],
    ["a press offer never rests", "if (trigger === \"suggested\" && hasOwn(rest, id)", "if ((trigger === \"suggested\" || trigger === \"offered\") && hasOwn(rest, id)"],
    ["a suggestion lists as an offer", "    case \"offered\":\n    case \"suggested\":\n", "    case \"offered\":\n"],
    ["a rest ends", "hasOwn(rest, id) && rest[id] > now)", "hasOwn(rest, id))"],
    ["the queue has a ceiling", "if (queue.length >= NOTICE_QUEUE_MAX)", "if (false)"],
    ["the queue is not changed in place", "var merged = queue.slice();", "var merged = queue;"],
    ["a view lists only missing commands", "requirementRows(manifest, missing, versions).filter(function (row) { return row.state !== \"present\"; });\n    var rows", "requirementRows(manifest, missing, versions);\n    var rows"],
    ["a view is satisfied only without a required command", "var satisfied = !notice.required.some(", "var satisfied = notice.required.some("],
    ["a view groups the requirements one package provides", "if (held === undefined) out.push(", "if (true) out.push("],
    ["a group keeps a package apart from a requirement of its name", "g.manager === manager && g.chip === chip", "g.chip === chip"],
    ["a view installs only through an installing manager", "var runs = plan.groups.filter(function (g) { return g.installs; });", "var runs = plan.groups;"],
    ["a view ignores holders", "PackageManagers.installGroups(rows, found);", "PackageManagers.installGroups(rows, Object.assign({}, found, { holders: {} }));"],
    ["a settle keeps the installing notice", "        if (n.id === installing)\n            return true;\n", ""],
    ["a settle drops a notice whose owner went", "        if (!hasOwn(owners, n.id))\n            return false;\n", ""],
    ["a settle drops a satisfied notice", "        return !noticeView(owners[n.id]", "        return true || !noticeView(owners[n.id]"],
    ["a choice lists as an offer", "    case \"suggested\":\n    case \"chosen\":\n", "    case \"suggested\":\n"],
    ["an owner is a string", "    if (typeof owner !== \"string\")\n        return \"refused: owner=malformed\";\n", ""],
    ["an owner is known", "    if (!hasOwn(owners, owner))\n        return \"refused: owner=\"", "    if (false)\n        return \"refused: owner=\""],
    ["a plugin owner is enabled", "if (owner !== CORE_OWNER && enabled.indexOf(owner) === -1)", "if (false)"],
    ["the core owner needs no enabling", "if (owner !== CORE_OWNER && enabled.indexOf(owner) === -1)", "if (enabled.indexOf(owner) === -1)"],
    ["a detection that crashed is a failure", "if (completion.status !== 0 || completion.code !== 0)\n        return { ok: false, line: \"notices: detect=failed", "if (completion.code !== 0)\n        return { ok: false, line: \"notices: detect=failed"],
    ["a detected manager is a known one", " && PackageManagers.managerRow(e.id) !== null", ""],
    ["a detection names its sources", " || !Array.isArray(found.sources) || !found.sources.every(entry)", ""],
    ["a detection accepts a malformed holder command", "return PackageManagers.validCommand(command) && holder(holders[command]);", "return holder(holders[command]);"],
    ["a detection accepts a missing holder with owners", "&& (h.path !== null || Object.keys(h.owners).length === 0)\n            && ", "&& "],
    ["a seen welcome leaves the plain question", "    if (welcomeState === \"seen\")\n", "    if (false)\n"],
    ["the welcome waits for the marker's read", "    if (welcomeState === \"reading\") return null;\n", ""],
    ["the welcome waits for the consent answer", "    if (WELCOME_WAITS.indexOf(consent.phase) !== -1) return null;\n", ""],
    ["a key row needs its bind", "return typeof key === \"string\" ? { shortcut: keyLabel(key), text: row.text } : null;", "return { shortcut: keyLabel(typeof key === \"string\" ? key : \"SUPER+SLASH\"), text: row.text };"],
    ["the welcome carries its file link except settled", "link: consent.phase === \"settled\" ? null : WELCOME.link,", "link: null,"],
    ["a settled consent offers Close alone", "actions: question === null ? [{ label: WELCOME.close, role: \"cancel\", answer: \"close\" }] : actions,", "actions: actions,"],
    ["a key that types a character reads as it", "        if (hasOwn(KEY_GLYPHS, part)) return KEY_GLYPHS[part];\n", ""],
    ["a read records the marker", "return { welcome: event.seen ? \"seen\" : \"unseen\", write: false };", "return { welcome: \"unseen\", write: false };"],
    ["Not now waits for the decline", "        case \"connect\":\n        case \"decline\":\n            return keep;\n", "        case \"connect\":\n            return keep;\n        case \"decline\":\n            return seen;\n"],
    ["a Not now that declines closes the welcome", " || event.after.phase === \"declined\")", ")"],
    ["Close closes the welcome", "            return seen;\n        }\n", "            return keep;\n        }\n"],
    ["a Connect that wires closes the welcome", "(event.after.phase === \"wired\" || ", "("],
    ["only an answer closes the welcome on a consent change", "event.before.phase === \"asking\" && (", "("],
];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "notice-logic-control-"));
try {
    for (const [source, relative] of IMPORTS) {
        fs.mkdirSync(path.dirname(path.join(temp, relative)), { recursive: true });
        fs.symlinkSync(source, path.join(temp, relative));
    }
    const source = fs.readFileSync(LOGIC, "utf8");
    for (const [label, needle, replacement] of CONTROLS) {
        const count = source.split(needle).length - 1;
        if (count !== 1) { report("control: " + label + ": the text to replace occurs once", count, 1); continue; }
        const mutant = path.join(temp, "shell", "Core", "PluginLogic.js");
        fs.writeFileSync(mutant, source.replace(needle, () => replacement));
        // Loaded outside the try, so a copy that does not evaluate fails the
        // suite instead of passing for a control.
        const ctx = load(mutant);
        let red = 0;
        try {
            suite(ctx, (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) red += 1; });
        } catch (e) {
            red += 1;
        }
        report("control: the suite fails without the rule: " + label, red > 0, true);
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}

if (failures > 0) { console.log("test-notice-logic: " + failures + " failing"); process.exit(1); }
console.log("test-notice-logic: ok");
