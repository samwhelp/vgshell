#!/usr/bin/env node
// fleet-setup.js --tree ABSOLUTE_VGS_TREE VERB SETTING, for the Setup
// section's Agent fleet row and its setup terminal. SETTING is the Jarvis
// home folder setting, `home` in the plugin's settings.
// status prints the row's value (SetupGate.fleetStep) and exits 0. folder
// prints the home folder SETTING names, and tool the path of the kendex mail
// tool in it (Home.mailTool); either exits 1 with a keyed line,
// `jarvis: fleet-setup=home-unchosen` or `jarvis: fleet-setup=tool-absent`,
// where there is none. release removes the Jarvis package files VGS wrote
// in that folder (Home.release), so kendex can install over them, and exits
// 1 with `jarvis: fleet-setup=home-unchosen`, or `release-failed` and the
// home's own key, where it cannot.
"use strict";
const path = require("node:path");

function main() {
    const [flag, tree, verb, setting, ...rest] = process.argv.slice(2);
    if (flag !== "--tree" || !path.isAbsolute(tree || "") || !["status", "folder", "tool", "release"].includes(verb)
            || typeof setting !== "string" || rest.length > 0) {
        process.stderr.write("jarvis: fleet-setup=arguments\n");
        return 2;
    }
    require("./Core.js").use(tree);
    const Home = require("./Home.js");
    let folder = null;
    try { folder = Home.resolve(setting, process.env.HOME); }
    catch (error) {
        // A setting the daemon refuses is the home row's to show.
        if (!/^jarvis: home=/.test(error.message)) throw error;
    }
    if (verb === "release") {
        if (folder === null) {
            process.stderr.write("jarvis: fleet-setup=home-unchosen\n");
            return 1;
        }
        try { Home.release(folder); }
        catch (error) {
            if (!/^jarvis: home=/.test(error.message)) throw error;
            process.stderr.write("jarvis: fleet-setup=release-failed " + error.message + "\n");
            return 1;
        }
        return 0;
    }
    const tool = folder === null ? null : Home.mailTool(folder);
    if (verb === "status") {
        const { load } = require(path.join(tree, "bin/lib/qml-library.js"));
        const Gate = load(path.join(__dirname, "../SetupGate.js"));
        process.stdout.write(JSON.stringify(Gate.fleetStep(folder, tool)) + "\n");
        return 0;
    }
    const found = verb === "folder" ? folder : tool;
    if (found === null) {
        process.stderr.write("jarvis: fleet-setup=" + (folder === null ? "home-unchosen" : "tool-absent") + "\n");
        return 1;
    }
    process.stdout.write(found + "\n");
    return 0;
}

process.exitCode = main();
