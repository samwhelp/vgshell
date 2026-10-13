// Only add-key, remove-key, providers, stored and presence are public CLI
// verbs. A key never reaches stdout. providers WIDTH prints Add key's
// provider choices, AccountProviders.choiceLine lines with each provider's
// key page; stored WIDTH prints Remove key's, each remembered key with the
// provider and name remove-key takes.
"use strict";
const path = require("node:path");
const { Secrets, ownReference } = require("./Secrets.js");
const { PROVIDERS, storedKeyProvider, parseWidth, providerChoices, choiceLine } = require("../AccountProviders.js");

function main() {
    const directory = path.join(process.env.XDG_STATE_HOME || path.join(process.env.HOME, ".local/state"), "vgshell/jarvis");
    const store = new Secrets(directory, process.env);
    switch (process.argv[2]) {
    case "presence":
        if (process.argv.length !== 3) throw new Error("jarvis-keys: arguments=verb");
        process.stdout.write(JSON.stringify(store.rows()) + "\n");
        break;
    case "providers": {
        const width = process.argv.length === 4 ? parseWidth(process.argv[3]) : null;
        if (width === null) throw new Error("jarvis-keys: arguments=width");
        process.stdout.write(providerChoices("key", width, true).join("\n") + "\n");
        break;
    }
    case "add-key": {
        if (process.argv.length !== 5) throw new Error("jarvis-keys: arguments=metadata");
        const [provider, account] = process.argv.slice(3);
        // The key is bound to the provider's own origin, so a typed id
        // that names no stored key provider would store a key no AI model
        // or voice can use.
        const row = PROVIDERS.find(item => item.id === provider && storedKeyProvider(item));
        if (row === undefined) throw new Error("jarvis-keys: provider=unknown");
        const ref = ownReference(row.id, account, row.origin);
        store.addKey(ref);
        process.stdout.write("jarvis-keys: stored=libsecret\n");
        break;
    }
    case "stored": {
        const width = process.argv.length === 4 ? parseWidth(process.argv[3]) : null;
        if (width === null) throw new Error("jarvis-keys: arguments=width");
        process.stdout.write(store.references().map(ref =>
            choiceLine(ref.provider + " / " + ref.account, ref.provider + "\t" + ref.account, width) + "\n").join(""));
        break;
    }
    case "remove-key": {
        if (process.argv.length !== 5) throw new Error("jarvis-keys: arguments=metadata");
        const own = store.removeKey(process.argv[3], process.argv[4]);
        process.stdout.write("jarvis-keys: removed=" + (own ? "libsecret" : "reference") + "\n");
        break;
    }
    default: throw new Error("jarvis-keys: arguments=verb");
    }
}
try { main(); }
catch (error) {
    const reason = error.message.startsWith("jarvis-keys:") ? error.message : "jarvis-keys: operation=failed";
    process.stderr.write(reason + "\n");
    process.exitCode = 1;
}
