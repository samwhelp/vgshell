import QtQuick
import Quickshell
import Quickshell.Io
import "PluginLogic.js" as Logic

// Owns every libsecret write the core makes for a plugin (D061): one
// `secret-tool store` or `secret-tool clear` at a time, from the argv
// PluginLogic.secretRequest builds for the `manager` capability's
// storeSecret and clearSecret. A store hands the secret to secret-tool on
// stdin, never on an argv, then closes stdin, since secret-tool reads a
// stdin that is no terminal to its end and keeps every byte. No secret
// enters a log line, a property of this owner or a status value: it lives
// only in the closure that writes it once the process has started.
// A clear that exits 0 proves no removal: libsecret's clear deletes unlocked
// items only and asks for no unlock, so a locked collection keeps its item.
// The owner then searches for the account once more, without `--unlock`,
// which raises no prompt, and a clear whose item is still stored ends as
// `locked`.
// `revisions` counts, per plugin id, the writes that ended, however they
// ended, and the `secrets` capability lends it as `revision`, so the
// plugin probes its store again. Each write's `done` belongs to the
// lifetime of the instance that asked, and is dropped with it.
Scope {
    id: root

    // Plugin id -> the writes ended for it. Replaced whole on every change,
    // so a binding on revisionOf follows it.
    property var revisions: ({})
    // The write running, { id, account, verb, done, feed, presence }, or
    // null. It stays set through a clear's presence search, so a second
    // write answers `busy` until the first one's real end.
    property var current: null

    function revisionOf(id) {
        return Logic.hasOwn(revisions, id) ? revisions[id] : 0;
    }

    function provider(ctx) {
        return {
            get revision() { return root.revisionOf(ctx.id); }
        };
    }

    // Start one write for plugin ID's ACCOUNT: REQUEST is
    // PluginLogic.secretRequest's ok answer for VERB, CTX the asking
    // instance, DONE, when given, called once with { ok, reason } as the
    // write ends: `ok` true for a store that exited 0 and for a clear whose
    // account the search after it no longer finds, else `reason`
    // `start-failed` or `exit=<code>` of the step that failed, or `locked`
    // for a clear that left its item stored. Answers `ok` once started, or
    // `refused: secret=<account> reason=busy` while another write runs.
    function write(ctx, id, account, verb, request, done) {
        if (current !== null) return Logic.secretRefusal(account, "busy");
        const record = { id: id, account: account, verb: verb, done: done === undefined ? null : done, feed: null, release: null, presence: null };
        // The search for the clear's own attributes, which follow the verb
        // on its argv. secret-tool prints an unlocked item's secret on
        // stdout, and with no `stdout` parser Quickshell 0.3.1 only calls
        // QProcess::closeReadChannel (src/io/process.cpp,
        // startProcessIfReady), after which Qt 6.11 still reads the pipe
        // into its own buffer before it drops the bytes (qprocess.cpp,
        // tryReadFromChannel). So the child sends stdout to /dev/null
        // itself, and no byte of it reaches the shell process.
        if (verb === "clear")
            record.presence = ["bash", "-c", 'exec "$@" >/dev/null', "vgs-secret-presence", request.argv[0], "search"].concat(request.argv.slice(2));
        if (request.input !== null) {
            const secret = request.input;
            record.feed = () => {
                writer.write(secret);
                writer.stdinEnabled = false;
            };
        }
        record.release = ctx.onDispose(() => { record.done = null; });
        current = record;
        writer.exitCode = null;
        writer.stdinEnabled = record.feed !== null;
        // Assigned after the record: a list handed to a property crosses a
        // QVariant conversion, and nothing here holds the secret.
        writer.command = request.argv;
        writer.running = true;
        return "ok";
    }

    // The write's own process ended. A clear that exited 0 goes on to its
    // presence search; every other end is the write's end.
    function written() {
        const record = current;
        if (record === null) return;
        if (writer.exitCode !== 0 || record.presence === null) return finish(failure(writer.exitCode), errors.text);
        searcher.exitCode = null;
        searcher.command = record.presence;
        searcher.running = true;
    }

    // The presence search ended. Its stderr holds an `attribute.` line for
    // each item it found, locked or not (libsecret tool/secret-tool.c,
    // on_retrieve_secret, since 0.20.4), so one such line is an item the
    // clear left stored. A search that did not exit 0 proves no removal; one
    // that never started left `found` holding an earlier search's text.
    function searched() {
        if (current === null) return;
        const code = searcher.exitCode;
        if (code !== 0) return finish(failure(code), code === null ? "" : found.text);
        finish(/^attribute\./m.test(found.text) ? "locked" : null, "");
    }

    // The reason a process that ended with exit CODE failed, null for 0.
    function failure(code) {
        return code === 0 ? null : code === null ? "start-failed" : "exit=" + code;
    }

    // End the running write with REASON, null for success, and STDERR, the
    // failed step's stderr, whose first line the log keeps.
    function finish(reason, stderr) {
        const record = current;
        current = null;
        const result = { ok: reason === null, reason: reason };
        const line = "secrets: " + record.verb + "=" + record.id + "/" + record.account + (result.ok ? " ok" : " failed " + result.reason) + (stderr.trim() !== "" ? " stderr=" + stderr.trim().split("\n")[0] : "");
        if (result.ok) console.info(line);
        else console.warn(line);
        const next = Object.assign({}, revisions);
        next[record.id] = revisionOf(record.id) + 1;
        revisions = next;
        const done = record.done;
        record.release();
        if (done !== null) done(result);
    }

    Process {
        id: writer
        // The exit code of the run that ended, null for one that never
        // started, since a failed start emits only runningChanged.
        property var exitCode: null
        stdout: StdioCollector {}
        stderr: StdioCollector { id: errors }
        onStarted: {
            if (root.current !== null && root.current.feed !== null) {
                const feed = root.current.feed;
                root.current.feed = null;
                feed();
            }
        }
        onExited: code => { exitCode = code; }
        onRunningChanged: if (!running) root.written()
    }

    Process {
        id: searcher
        // As the writer's.
        property var exitCode: null
        stderr: StdioCollector { id: found }
        onExited: code => { exitCode = code; }
        onRunningChanged: if (!running) root.searched()
    }
}
