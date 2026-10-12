#!/usr/bin/env node
// The ElevenLabs voice adapter against a loopback stand-in of its two
// endpoints, inside the J09 world. The routes, query and body fields, the
// key header and the voice list's paging follow the reading of ElevenLabs's
// API reference on VGS-1202 (2026-10-12); the PCM and the voices are
// synthetic. A disposable backend copy points the elevenlabs row at the
// stand-in; no network, account or secret store is used.
"use strict";
const { assert, fs, path, tree, world } = require("./fixtures/jarvis/policy.js");
const http = require("node:http");
const backend = path.join(tree, "shell/plugins/vgs.jarvis/backend");
const KEY = "test-key-must-stay-private";
const PRIVATE = "provider-private-detail";
const BASE_NEEDLE = 'base: "https://api.elevenlabs.io",';

// A backend copy whose elevenlabs row names ORIGIN, with each further edit
// [file, needle, replacement] planted once.
function kitFor(origin, edits = []) {
    const outer = fs.mkdtempSync(path.join(process.env.JARVIS_TEST_ROOT, "elevenlabs-"));
    const folder = path.join(outer, "backend");
    fs.mkdirSync(folder);
    for (const name of fs.readdirSync(backend).filter(name => name.endsWith(".js")))
        fs.copyFileSync(path.join(backend, name), path.join(folder, name));
    for (const beside of ["AccountProviders.js", "manifest.json"])
        fs.copyFileSync(path.join(backend, "..", beside), path.join(outer, beside));
    for (const [file, needle, replacement] of [["Providers.js", BASE_NEEDLE, 'base: "' + origin + '",'], ...edits]) {
        const target = path.join(folder, file);
        const source = fs.readFileSync(target, "utf8");
        assert.equal(source.split(needle).length - 1, 1, file + " edit match: " + needle.slice(0, 60));
        fs.writeFileSync(target, source.replace(needle, replacement));
    }
    const load = name => require(path.join(folder, name));
    return { ElevenLabs: load("ElevenLabs.js"), Policy: load("Policy.js"), Providers: load("Providers.js"), Net: load("net.js") };
}

// Bounds a missing close or a hung control, not a latency.
const within = (promise, label) => Promise.race([promise, new Promise((_, reject) =>
    setTimeout(() => reject(new assert.AssertionError({ message: label + " within 5 s" })), 5000))]);

world(async () => {
    const records = [];
    // Each sentence's answer by its text: {pcm} served in two writes split
    // inside a sample, {status} with a held private body, or {hold} with no
    // answer. Voice pages answer in order; the last repeats.
    const speech = new Map();
    let pages = [];
    let served = 0;
    const closes = new WeakMap();
    const closing = socket => {
        if (!closes.has(socket)) closes.set(socket, new Promise(resolve => socket.once("close", resolve)));
        return closes.get(socket);
    };
    const server = http.createServer(async (request, response) => {
        const record = { method: request.method, url: request.url, headers: request.headers, body: null, closed: closing(request.socket) };
        records.push(record);
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        record.body = Buffer.concat(chunks).toString("utf8");
        const url = new URL(request.url, "http://stand-in");
        if (request.method === "GET" && url.pathname === "/v2/voices") {
            const page = pages[Math.min(served++, pages.length - 1)];
            if (page.status !== undefined) {
                response.writeHead(page.status, { "content-type": "application/json" });
                response.write(JSON.stringify({ detail: PRIVATE + " " + KEY }));
                return;
            }
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify(page));
            return;
        }
        const plan = speech.get(JSON.parse(record.body).text);
        if (plan === undefined || plan.hold) return;
        if (plan.status !== undefined) {
            response.writeHead(plan.status, { "content-type": "application/json" });
            response.write(JSON.stringify({ detail: { message: PRIVATE + " " + KEY } }));
            return;
        }
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.write(plan.pcm.subarray(0, 1));
        await new Promise(resolve => setTimeout(resolve, 5));
        response.end(plan.pcm.subarray(1));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    const reference = { provider: "elevenlabs", account: "voice", origin, attributes: { service: "vgs-jarvis" } };
    let lookups = 0;
    const keys = [];
    const key = (ref = reference) => ({ reference: ref, secrets: { lookup(value) {
        assert.equal(value, ref);
        lookups++;
        const bytes = Buffer.from(KEY);
        keys.push(bytes);
        return bytes;
    } } });
    const clock = { set: (fn, ms) => setTimeout(fn, ms), clear: timer => clearTimeout(timer) };
    const pcm = (frames, seed) => Buffer.from(Array.from({ length: frames * 2 }, (_, at) => (at * 7 + seed) % 251));
    const sentences = async function* (kit, ...items) {
        for (const [text, labels = ["speech"]] of items) yield kit.Policy.item(text, labels);
    };
    async function drain(iterable) {
        const out = [];
        try {
            for await (const chunk of iterable) out.push(chunk);
            return { out, error: null };
        } catch (error) { return { out, error }; }
    }
    // A recipient set as a conversation's: a cloud brain, so a label with no
    // grant is asked about, local hearing and the stand-in's ElevenLabs.
    function open(kit, { grants = () => [], keyed = key() } = {}) {
        const recipients = kit.Policy.recipients({ conversation: "fixture", profile: "standard", cloudVision: "ask",
            brain: { kind: "network", provider: "brain", account: "fixture", origin: "https://brain.example" },
            speech: [{ kind: "local", provider: "local-speech", account: "" },
                { kind: "network", provider: "elevenlabs", account: "voice", origin }] });
        const net = kit.Net.create(recipients);
        const voice = kit.ElevenLabs.create({ provider: kit.Providers.select("elevenlabs"), net: () => net, key: keyed, grants, clock });
        return { recipients, net, voice };
    }
    const keyFree = (value, label) => {
        const text = JSON.stringify(value instanceof Error ? value.message : value);
        assert.equal(text.includes(KEY) || text.includes(PRIVATE), false, label + ": no key and no provider text");
    };
    let cases = 0, controls = 0;

    // Each sentence streams as raw PCM; the stream's last chunk alone credits
    // the sentence, a chunk stays within Audio's bound, and a split sample
    // waits for its second byte. The key travels in its header alone, looked
    // up once at first need, and is zeroed on close.
    async function speaks(kit) {
        const one = pcm(4800, 1), two = pcm(30000, 2);
        speech.set("Hello there.", { pcm: one });
        speech.set("The time is noon.", { pcm: two });
        const before = records.length, lookedUp = lookups;
        const { voice, net } = open(kit);
        assert.equal(lookups, lookedUp, "no key is read before the first sentence");
        const { out, error } = await within(drain(voice.speak(sentences(kit, ["Hello there."], ["The time is noon."]), "VoiceA")), "speech");
        assert.equal(error, null);
        assert.equal(lookups, lookedUp + 1, "one lookup serves the conversation");
        for (const chunk of out) assert.ok(chunk.pcm.length > 0 && chunk.pcm.length <= 48000 && chunk.pcm.length % 2 === 0, "a bounded chunk");
        const marked = out.map((chunk, at) => chunk.sentence === undefined ? null : at).filter(at => at !== null);
        assert.equal(marked.at(-1), out.length - 1, "the last chunk credits the last sentence");
        const split = marked[0] + 1;
        assert.deepEqual([Buffer.concat(out.slice(0, split).map(chunk => chunk.pcm)), Buffer.concat(out.slice(split).map(chunk => chunk.pcm))],
            [one, two], "each sentence's PCM arrives whole, in order");
        assert.deepEqual(marked.map(at => [out[at].sentence.text, out[at].sentence.frames]),
            [["Hello there.", out[marked[0]].pcm.length / 2], ["The time is noon.", out.at(-1).pcm.length / 2]],
            "a sentence is credited with its own text on its last chunk alone");
        assert.ok(out.length - split >= 2, "a sentence longer than one chunk yields more than one");
        const sent = records.slice(before);
        assert.deepEqual(sent.map(record => [record.method, record.url]), ["VoiceA", "VoiceA"].map(id =>
            ["POST", "/v1/text-to-speech/" + id + "/stream?output_format=pcm_24000"]));
        assert.deepEqual(sent.map(record => JSON.parse(record.body)), [
            { text: "Hello there.", model_id: "eleven_flash_v2_5" }, { text: "The time is noon.", model_id: "eleven_flash_v2_5" }]);
        for (const record of sent) {
            assert.deepEqual([record.headers["xi-api-key"], record.headers.authorization, record.headers["content-type"]],
                [KEY, undefined, "application/json"], "the key in its header alone");
            assert.equal(record.url.includes(KEY) || record.body.includes(KEY), false, "no key in the path or the body");
        }
        voice.close();
        net.close();
        assert.equal(keys.at(-1).every(byte => byte === 0), true, "close zeroes the key");
        cases++;
    }
    await speaks(kitFor(origin));
    for (const [name, file, needle, replacement] of [
        ["marker-first", "ElevenLabs.js", "                        if (held !== null) yield { pcm: held };\n",
            "                        if (held !== null) yield { pcm: held, sentence: { text: item.content, frames: held.length / 2 } };\n"],
        ["sample-split", "ElevenLabs.js", "carry = Buffer.from(pcm.subarray(pcm.length - (pcm.length % 2)));", "carry = Buffer.alloc(0);"],
        ["header-key", "ElevenLabs.js", 'header: "xi-api-key", prefix: ""', 'header: "authorization", prefix: "Bearer "'],
        ["key-zeroed", "ElevenLabs.js", "            secret?.fill(0);\n", ""],
        ["model", "Providers.js", 'model: "eleven_flash_v2_5"', 'model: "eleven_multilingual_v2"'],
        ["format", "ElevenLabs.js", 'const FORMAT = "pcm_24000";', 'const FORMAT = "mp3_44100_128";']]) {
        await assert.rejects(() => speaks(kitFor(origin, [[file, needle, replacement]])), assert.AssertionError, name + " must turn red");
        controls++;
    }

    // The key may travel only to its stored origin, judged before any lookup.
    async function keyOrigin(kit) {
        const lookedUp = lookups;
        const elsewhere = { ...reference, origin: "https://api.elevenlabs.io" };
        assert.throws(() => open(kit, { keyed: key(elsewhere) }), { message: "jarvis: net=key-origin" });
        assert.equal(lookups, lookedUp, "no lookup for a key the requests could never carry");
        cases++;
    }
    await keyOrigin(kitFor(origin));
    await assert.rejects(() => keyOrigin(kitFor(origin, [["ElevenLabs.js",
        "    Net.assertKeyTarget(provider.base, key.reference.origin);\n    let secret = null;", "    let secret = null;"]])),
    assert.AssertionError, "key-origin must turn red");
    controls++;

    // A sentence the gate asks about or withholds opens no request and is
    // not spoken; the next one is. Its labels travel with the request.
    async function withheld(kit) {
        speech.set("The page said so.", { pcm: pcm(2400, 3) });
        speech.set("That is all.", { pcm: pcm(2400, 4) });
        const before = records.length;
        const { voice, net } = open(kit);
        const { out, error } = await within(drain(voice.speak(sentences(kit, ["The page said so.", ["web"]], ["That is all."]), "VoiceA")), "speech");
        assert.equal(error, null);
        assert.deepEqual(records.slice(before).map(record => JSON.parse(record.body).text), ["That is all."], "only the released sentence leaves");
        assert.deepEqual(out.filter(chunk => chunk.sentence).map(chunk => chunk.sentence.text), ["That is all."]);
        voice.close();
        net.close();
        // With the conversation's grant for the label, it is spoken.
        const granted = [];
        const { voice: allowed, recipients, net: door } = open(kit, { grants: () => granted });
        granted.push({ recipients, labels: ["web"] });
        const spoken = await within(drain(allowed.speak(sentences(kit, ["The page said so.", ["web"]]), "VoiceA")), "granted speech");
        assert.deepEqual(spoken.out.filter(chunk => chunk.sentence).map(chunk => chunk.sentence.text), ["The page said so."]);
        allowed.close();
        door.close();
        cases++;
    }
    await withheld(kitFor(origin));
    for (const [name, needle, replacement] of [
        ["relabelled", "model_id: provider.model }), item.labels);", 'model_id: provider.model }), ["speech"]);'],
        ["withheld-fails", 'if (answer.kind !== "response") continue;', 'if (answer.kind !== "response") fail("withheld");'],
        ["grants-dropped", "signal: wait.signal }, grants());", "signal: wait.signal }, []);"]]) {
        await assert.rejects(() => withheld(kitFor(origin, [["ElevenLabs.js", needle, replacement]])), assert.AssertionError, name + " must turn red");
        controls++;
    }

    // A refused request fails with its status alone: the body, which can echo
    // the request or the key, is cancelled unread, so a held body cannot
    // hold the turn either.
    async function refused(kit) {
        speech.set("Refuse me.", { status: 401 });
        const before = records.length;
        const { voice, net } = open(kit);
        const { error } = await within(drain(voice.speak(sentences(kit, ["Refuse me."]), "VoiceA")), "a refusal");
        assert.equal(error?.message, "jarvis: speech=elevenlabs-http status=401");
        keyFree(error, "refusal");
        await within(records[before].closed, "the refused response's connection closes");
        voice.close();
        net.close();
        cases++;
    }
    await refused(kitFor(origin));
    await assert.rejects(() => refused(kitFor(origin, [["ElevenLabs.js", "                    await response.body?.cancel();\n                    fail(\"http status=\"",
        "                    fail(\"http \" + await response.text() + \" status=\""]])), assert.AssertionError, "error-body must turn red");
    controls++;

    // A barge-in returns the speech iterator, and the conversation's end
    // closes the owner: either ends the request in flight at once.
    async function cancelled(kit, how) {
        speech.set("Wait for me.", { hold: true });
        const before = records.length;
        const { voice, net } = open(kit);
        const iterator = voice.speak(sentences(kit, ["Wait for me."]), "VoiceA")[Symbol.asyncIterator]();
        const pending = iterator.next();
        // A control's stream may fail after the case gave up on it.
        pending.catch(() => {});
        await within((async () => { while (records.length === before) await new Promise(resolve => setTimeout(resolve, 5)); })(), "the request arrives");
        if (how === "barge-in") await within(iterator.return(), "return");
        else voice.close();
        await within(records[before].closed, how + " closes the request in flight");
        assert.deepEqual(await within(pending, "the pending read"), { value: undefined, done: true }, how + ": the stream ends quietly");
        voice.close();
        net.close();
        cases++;
    }
    for (const how of ["barge-in", "end"]) await cancelled(kitFor(origin), how);
    await assert.rejects(() => cancelled(kitFor(origin, [["ElevenLabs.js", "                    stop.abort();\n                    active.delete(stop);\n", "                    active.delete(stop);\n"]]), "barge-in"),
        assert.AssertionError, "return-aborts must turn red");
    await assert.rejects(() => cancelled(kitFor(origin, [["ElevenLabs.js", "            for (const stop of active) stop.abort();\n", ""]]), "end"),
        assert.AssertionError, "close-aborts must turn red");
    controls += 2;

    // A wait on ElevenLabs is bounded: its deadline fails the sentence keyed.
    async function timed(kit) {
        speech.set("Never answered.", { hold: true });
        const timers = [];
        const manual = { set: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
            clear: timer => { timer.cleared = true; } };
        const recipients = kit.Policy.recipients({ conversation: "fixture", profile: "standard", cloudVision: "ask",
            brain: { kind: "network", provider: "brain", account: "fixture", origin: "https://brain.example" },
            speech: [{ kind: "network", provider: "elevenlabs", account: "voice", origin }] });
        const net = kit.Net.create(recipients);
        const voice = kit.ElevenLabs.create({ provider: kit.Providers.select("elevenlabs"), net: () => net, key: key(), grants: () => [], clock: manual });
        const before = records.length;
        const result = drain(voice.speak(sentences(kit, ["Never answered."]), "VoiceA"));
        await within((async () => { while (records.length === before) await new Promise(resolve => setTimeout(resolve, 5)); })(), "the request arrives");
        const armed = timers.filter(timer => !timer.cleared);
        assert.deepEqual(armed.map(timer => timer.ms), [60000], "one bound on the wait");
        armed[0].fn();
        const { error } = await within(result, "the bounded wait");
        assert.equal(error?.message, "jarvis: speech=elevenlabs-timeout");
        voice.close();
        net.close();
        cases++;
    }
    await timed(kitFor(origin));
    await assert.rejects(() => timed(kitFor(origin, [["ElevenLabs.js", "if (wait.expired) fail(\"timeout\");\n                    throw error;", "throw error;"]])),
        assert.AssertionError, "timeout-cause must turn red");
    controls++;

    // A voice id travels in the path, so one that is not a plain id is refused.
    {
        const kit = kitFor(origin);
        const { voice, net } = open(kit);
        for (const id of ["", "../v1/user", "Voice A", "a?b", "x".repeat(65)])
            assert.throws(() => voice.speak(sentences(kit, ["Hello there."]), id), { message: "jarvis: speech=elevenlabs-voice" }, JSON.stringify(id));
        voice.close();
        net.close();
        cases++;
    }

    // The voice list: the voices the user made on ElevenLabs's site first,
    // then the premade ones, through keyed GETs that follow next_page_token,
    // each released and audited by the caller before it starts.
    const listed = (id, name, category) => ({ voice_id: id, name, category, preview_url: "https://example.invalid/" + id, labels: {} });
    async function list(kit, { transferred = [] } = {}) {
        const recipients = kit.Policy.recipients({ conversation: "voices", profile: "standard", cloudVision: "never",
            brain: { kind: "network", provider: "elevenlabs", account: "voice", origin },
            speech: [{ kind: "local", provider: "voice-list", account: "voice" }] });
        const net = kit.Net.create(recipients);
        const transfer = (item, start) => {
            transferred.push([item.content, item.labels]);
            return start();
        };
        try { return await within(kit.ElevenLabs.voices({ provider: kit.Providers.select("elevenlabs"), net, key: key(), transfer, clock }), "the list"); }
        finally { net.close(); }
    }
    async function paged(kit) {
        pages = [{ voices: [listed("Prem1", "Rachel", "premade"), listed("Clone1", "My voice", "cloned")], has_more: true,
            total_count: 4, next_page_token: "token 2" },
        { voices: [listed("Design1", "Narrator", "generated"), listed("Prem2", "Adam\u2028", "premade"), listed("Clone1", "My voice", "cloned")],
            has_more: false, total_count: 4, next_page_token: null }];
        served = 0;
        const before = records.length, transferred = [];
        const voices = await list(kit, { transferred });
        assert.deepEqual(voices, [{ label: "My voice (cloned)", value: "Clone1" }, { label: "Narrator (designed)", value: "Design1" },
            { label: "Rachel", value: "Prem1" }, { label: "Adam", value: "Prem2" }], "the user's own voices first, each once");
        const sent = records.slice(before);
        assert.deepEqual(sent.map(record => [record.method, record.url, record.body, record.headers["xi-api-key"]]), [
            ["GET", "/v2/voices?page_size=100", "", KEY], ["GET", "/v2/voices?page_size=100&next_page_token=token%202", "", KEY]]);
        assert.deepEqual(transferred, [["", ["desktop"]], ["", ["desktop"]]], "each page is released and audited first");
        assert.equal(keys.at(-1).every(byte => byte === 0), true, "the list zeroes its key");
        cases++;
    }
    await paged(kitFor(origin));
    for (const [name, needle, replacement] of [
        ["own-first", "return [...own, ...premade].slice(0, LIST_MAX);", "return [...premade, ...own].slice(0, LIST_MAX);"],
        ["paging", "token = read.next_page_token;", "break;"],
        ["list-key-zeroed", "    } finally { secret.fill(0); }\n", "    } finally { void secret; }\n"]]) {
        await assert.rejects(() => paged(kitFor(origin, [["ElevenLabs.js", needle, replacement]])), assert.AssertionError, name + " must turn red");
        controls++;
    }
    // A list whose pages never end stops after its bound, and a list longer
    // than the Voice setting takes is cut at its bound, the user's first.
    async function bounded(kit) {
        pages = [{ voices: [listed("Endless" + served, "Endless", "premade")], has_more: true, next_page_token: "again" }];
        served = 0;
        const before = records.length;
        const voices = await list(kit);
        assert.equal(records.length - before, 5, "five pages at most");
        assert.equal(voices.length, 1, "one voice repeated is offered once");
        const many = Array.from({ length: 80 }, (_, at) => listed("Own" + at, "Own " + at, "generated"));
        pages = [{ voices: [listed("PremX", "Premade", "premade"), ...many], has_more: true, next_page_token: "more" }];
        served = 0;
        const cut = await list(kit);
        assert.deepEqual([cut.length, cut.every(voice => voice.value.startsWith("Own"))], [64, true], "the offers stop at the setting's bound");
        assert.equal(records.length - before - 5, 1, "a page that fills the bound with the user's voices ends the read");
        cases++;
    }
    await bounded(kitFor(origin));
    await assert.rejects(() => bounded(kitFor(origin, [["ElevenLabs.js", "const PAGES = 5;", "const PAGES = 6;"]])), assert.AssertionError, "page-bound must turn red");
    controls++;
    // A failed list fails keyed, with no provider text and no key, and its
    // body unread; a malformed entry fails the whole list.
    async function listFailures(kit) {
        for (const [label, page, cause] of [
            ["refused", { status: 403 }, "jarvis: speech=elevenlabs-voices-http status=403"],
            ["an id unfit for a path", { voices: [listed("../x", "Odd", "premade")], has_more: false }, "jarvis: speech=elevenlabs-voices-shape"],
            ["no voice list", { has_more: false }, "jarvis: speech=elevenlabs-voices-shape"]]) {
            pages = [page];
            served = 0;
            const before = records.length;
            await assert.rejects(() => list(kit), error => {
                assert.equal(error.message, cause, label);
                keyFree(error, label);
                return true;
            });
            if (page.status !== undefined) await within(records[before].closed, label + ": the body is cancelled");
        }
        cases++;
    }
    await listFailures(kitFor(origin));
    await assert.rejects(() => listFailures(kitFor(origin, [["ElevenLabs.js", "                    await answer.response.body?.cancel();\n                    fail(\"voices-http status=\"",
        "                    fail(\"voices-http \" + await answer.response.text() + \" status=\""]])), assert.AssertionError, "list-error-body must turn red");
    controls++;

    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    console.log("test-jarvis-elevenlabs: ok cases=" + cases + " controls=" + controls);
// The world's bound covers the controls' 5 s waits on a loaded host.
}, undefined, 300000);
