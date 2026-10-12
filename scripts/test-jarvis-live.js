#!/usr/bin/env node
// The duplex engines, Realtime and Gemini Live, against hand-made sessions:
// scripts written from each provider's documented message shapes and pinned
// to a schema excerpt, which a loopback WebSocket server replays inside the
// J09 world, through the real Session reducer and runner. One rule set holds
// both adapters. In-memory capture and playback ports follow Audio's sink and
// source contract. A manual clock drives silence, reply ends and idle close.
// Excerpts and scripts: scripts/fixtures/jarvis-live/. The key is the
// keys-world stand-in's fixture value; no network or account.
"use strict";
const { assert, fs, path, tree, world, mutant, qmlCopy } = require("./fixtures/jarvis/policy.js");
const { standins } = require("./fixtures/jarvis/keys-world.js");
const Ws = require("./fixtures/jarvis/websocket.js");
const Check = require("./fixtures/schema-check.js");
const excerpt = require("./fixtures/jarvis-live/realtime.schema.json");
const fixtures = require("./fixtures/jarvis-live/realtime-scripts.json");
const geminiExcerpt = require("./fixtures/jarvis-live/gemini-live.schema.json");
const geminiFixtures = require("./fixtures/jarvis-live/gemini-live-scripts.json");
const { load } = require("../bin/lib/qml-library.js");
const http = require("node:http");
const cp = require("node:child_process");
const { once } = require("node:events");
const BrainFixture = require("./fixtures/jarvis/engine.js");
const { standins: audioStandins } = require("./fixtures/jarvis/audio.js");
const backend = path.join(tree, "shell/plugins/vgs.jarvis/backend");
const file = path.join(backend, "Realtime.js");
const sessionFile = path.join(tree, "shell/plugins/vgs.jarvis/Session.js");
const Protocol = load(path.join(tree, "shell/plugins/vgs.jarvis/JarvisProtocol.js"));
const KEY = "test-key-must-stay-private";
const PRIVATE = "fixture-private-provider-text";
// The provider rows pin the models; this suite reads them there and names them nowhere.
const MODEL = new URL(require(path.join(backend, "Providers.js")).select("openai-realtime").base).searchParams.get("model");
const GEMINI_ROW = require(path.join(backend, "Providers.js")).select("gemini-live");
const GEMINI_PATH = new URL(GEMINI_ROW.base).pathname;
// The engine's bounds, in the units it reads.
const BACKLOG = 256 * 1024;
const FRAME = 1024 * 1024;
const OPENING = 24000 * 2 * 20;
const TURN = 65536;
const IDLE = 60000;
const APPEND = "input_audio_buffer.append";
const SPEAK = "response.create";
// The sentence the rig, standing in for the engine, hands a preview session.
const PREVIEW_LINE = "A fixture preview sentence.";
const CLIENT = { "session.update": "SessionUpdateEvent", [APPEND]: "InputAudioBufferAppendEvent", [SPEAK]: "ResponseCreateEvent" };
const SERVER = { "session.created": "SessionCreatedEvent", "session.updated": "SessionUpdatedEvent",
    "input_audio_buffer.speech_started": "InputAudioBufferSpeechStartedEvent",
    "input_audio_buffer.speech_stopped": "InputAudioBufferSpeechStoppedEvent",
    "input_audio_buffer.committed": "InputAudioBufferCommittedEvent",
    "conversation.item.input_audio_transcription.delta": "ConversationItemInputAudioTranscriptionDeltaEvent",
    "conversation.item.input_audio_transcription.completed": "ConversationItemInputAudioTranscriptionCompletedEvent",
    "conversation.item.input_audio_transcription.failed": "ConversationItemInputAudioTranscriptionFailedEvent",
    "response.created": "ResponseCreatedEvent", "response.done": "ResponseDoneEvent",
    "response.output_audio.delta": "ResponseAudioDeltaEvent",
    "response.output_audio_transcript.delta": "ResponseAudioTranscriptDeltaEvent",
    "response.function_call_arguments.done": "ResponseFunctionCallArgumentsDoneEvent", error: "RealtimeErrorEvent",
    // Documented events the session causes and the engine does not read: the unread script.
    "conversation.created": "ConversationCreatedEvent", "conversation.item.created": "ConversationItemCreatedEvent",
    "conversation.item.added": "ConversationItemAdded", "conversation.item.done": "ConversationItemDone",
    "response.output_item.added": "ResponseOutputItemAddedEvent", "response.output_item.done": "ResponseOutputItemDoneEvent",
    "response.content_part.added": "ResponseContentPartAddedEvent", "response.content_part.done": "ResponseContentPartDoneEvent",
    "response.output_audio.done": "ResponseAudioDoneEvent",
    "response.output_audio_transcript.done": "ResponseAudioTranscriptDoneEvent", "rate_limits.updated": "RateLimitsUpdatedEvent" };
function pinned(name, value, label, schema = excerpt) {
    assert.equal(typeof name, "string", label + " names a pinned event: " + JSON.stringify(value).slice(0, 80));
    assert.deepEqual(Check.errors(schema, name, value), [], label + " matches the pinned " + name);
}
for (const [name, events] of Object.entries(fixtures.scripts)) for (const event of events) pinned(SERVER[event.type], event, name);
const script = (name, index = 0) => structuredClone(fixtures.scripts[name].at(index));
// Off-schema frames a fault row needs, built from a pinned event.
const off = (name, change, index = 0) => JSON.stringify(change(script(name, index)));
// A Gemini Live message holds one kind beside an optional usageMetadata.
const geminiKind = value => Object.keys(value).find(key => key !== "usageMetadata") ?? "usageMetadata";
const GEMINI_CLIENT = { setup: "SetupMessage", realtimeInput: "RealtimeInputMessage", clientContent: "ClientContentMessage" };
const GEMINI_SERVER = { setupComplete: "SetupCompleteMessage", serverContent: "ServerContentMessage", usageMetadata: "UsageMetadataMessage",
    goAway: "GoAwayMessage", sessionResumptionUpdate: "SessionResumptionUpdateMessage", toolCall: "ToolCallMessage",
    toolCallCancellation: "ToolCallCancellationMessage" };
for (const [name, events] of Object.entries(geminiFixtures.scripts))
    for (const event of events) pinned(GEMINI_SERVER[geminiKind(event)], event, name, geminiExcerpt);
const gscript = (name, index = 0) => structuredClone(geminiFixtures.scripts[name].at(index));
const goff = (name, change, index = 0) => JSON.stringify(change(gscript(name, index)));
// A spoken frame's words, after the voice's own guidance.
const quoted = text => JSON.parse(text.split("\n\n").at(-1));
// The two adapters, as the shared rig and the daemon rows drive them: the
// Voice provider setting, the provider row, the key's account provider,
// the adapter file, how a message names its kind, the frame that speaks
// words, the setup handshake, and the server's answer to each spoken frame
// for the daemon rows (conn.auto), with the PCM byte count a row queued in
// conn.voice, or none.
const REALTIME = { setting: "realtime", row: "openai-realtime", keyProvider: "openai", file: "Realtime.js", previewVoice: "cedar",
    scripts: fixtures.scripts, kind: value => value.type, SPEAK,
    client: value => pinned(CLIENT[value.type], value, "client"), server: value => pinned(SERVER[value.type], value, "raw"),
    words: event => quoted(event.response.instructions),
    async open(conn) {
        conn.play("created");
        const update = await conn.event("session.update");
        conn.play("updated");
        return update;
    },
    voice: update => update.session.audio.output.voice,
    noTools: update => Array.isArray(update.session.tools) && update.session.tools.length === 0,
    turn: (conn, text) => {
        const event = script("turn", -1);
        Object.assign(event, { item_id: "item_" + text.length + "_" + conn.events.length, transcript: text });
        conn.send(event);
    },
    reply(conn) {
        const id = "resp_auto_" + conn.auto++;
        const created = script("reply-old"), audio = script("reply-old", 1), done = script("done-old");
        created.response.id = done.response.id = id;
        conn.send(created);
        for (let left = conn.voice.shift() ?? 0; left > 0; left -= 65536)
            conn.send({ ...audio, response_id: id, delta: Buffer.alloc(Math.min(left, 65536), 0x11).toString("base64") });
        conn.send(done);
    } };
const GEMINI = { setting: "gemini", row: "gemini-live", keyProvider: "gemini", file: "GeminiLive.js", previewVoice: "Puck",
    scripts: geminiFixtures.scripts, kind: geminiKind, SPEAK: "clientContent",
    client: value => pinned(GEMINI_CLIENT[geminiKind(value)], value, "client", geminiExcerpt),
    server: value => pinned(GEMINI_SERVER[geminiKind(value)], value, "raw", geminiExcerpt),
    words: event => quoted(event.clientContent.turns[0].parts[0].text),
    async open(conn) {
        const setup = await conn.event("setup");
        conn.play("setup-complete");
        return setup;
    },
    voice: setup => setup.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    noTools: setup => !Object.hasOwn(setup.setup, "tools"),
    turn: (conn, text) => {
        conn.send({ serverContent: { inputTranscription: { text } } });
        conn.send({ serverContent: { inputTranscription: { finished: true } } });
    },
    reply(conn) {
        conn.auto++;
        const audio = gscript("reply-old");
        for (let left = conn.voice.shift() ?? 0; left > 0; left -= 65536) {
            audio.serverContent.modelTurn.parts[0].inlineData.data = Buffer.alloc(Math.min(left, 65536), 0x11).toString("base64");
            conn.send(audio);
        }
        for (const event of geminiFixtures.scripts["done-old"]) conn.send(structuredClone(event));
    } };
const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(check, label, ms = 2000) {
    // Loopback delivery and stream events, not a latency measurement. Each
    // control's red result waits for this bound, so it stays short. A row
    // that waits on the daemon's real playback passes its own.
    const deadline = Date.now() + ms;
    while (!check()) {
        assert.ok(Date.now() < deadline, label);
        await new Promise(resolve => setTimeout(resolve, 2));
    }
}
function manual() {
    let now = 0, next = 1;
    const timers = new Map();
    return { now: () => now, set(fn, ms) { timers.set(next, { at: now + Math.max(0, ms), fn }); return next++; },
        clear(id) { timers.delete(id); },
        // Whether a timer is set for this time: the engine's idle wait, read as a barrier.
        due(at) { return [...timers.values()].some(timer => timer.at === at); },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                let due = null;
                for (const [id, timer] of timers) if (timer.at <= end && (due === null || timer.at < due[1].at)) due = [id, timer];
                if (due === null) break;
                timers.delete(due[0]);
                now = Math.max(now, due[1].at);
                due[1].fn();
            }
            now = end;
        },
        // A stalled event loop: time passes and no timer runs until the next advance.
        stall(ms) { now += ms; } };
}
// Paced silence leaves once a tick. Yielding between simulated seconds lets
// the socket drain as real time would; one burst would read as a backlog.
async function elapse(w, ms) {
    for (let left = ms; left > 0; left -= 1000) {
        w.clock.advance(Math.min(1000, left));
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}
const bytes = (w, value) => w.played.reduce((sum, { chunk }) => sum + chunk.filter(byte => byte === value).length, 0);
// Byte comparison with a short message: a diff of large buffers stalls assert.
function same(event, expected, label) {
    const actual = Buffer.from(event.audio, "base64");
    assert.ok(actual.equals(expected), label + ": " + actual.length + " bytes");
}
const appended = conn => Buffer.concat(conn.events.filter(event => event.type === APPEND).map(event => Buffer.from(event.audio, "base64")));
// The words one spoken response carries, after the voice's own guidance.
const words = event => JSON.parse(event.response.instructions.split("\n\n").at(-1));

world(async () => {
    const childEnv = {};
    for (const name of ["PATH", "HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_DATA_HOME", "XDG_RUNTIME_DIR"])
        childEnv[name] = process.env[name];
    const lookups = () => {
        const calls = path.join(process.env.XDG_STATE_HOME, "secret-calls");
        return fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n")
            .filter(line => JSON.parse(line).argv[0] === "lookup").length : 0;
    };
    function listen(redirectTo) {
        const conns = [], redirected = [];
        const instance = http.createServer((request, response) => { response.writeHead(404); response.end(); });
        instance.on("upgrade", (request, socket) => {
            const query = new URL(request.url, "http://rig").searchParams;
            if (query.get("redirect") !== null) {
                redirected.push(query.get("rig"));
                socket.end("HTTP/1.1 307 Temporary Redirect\r\nLocation: " + redirectTo() + request.url + "\r\n\r\n");
                return;
            }
            // The adapter by its endpoint's path.
            const P = request.url.startsWith(GEMINI_PATH) ? GEMINI : REALTIME;
            const conn = { url: request.url, rig: query.get("rig"), protocol: P, taken: false, auto: 0, voice: [],
                headers: request.headers, events: [], cursor: 0, socket, ended: false,
                play(name) { for (const event of P.scripts[name]) this.raw(JSON.stringify(event)); },
                send(event) { P.server(event); this.raw(JSON.stringify(event)); },
                raw(data, opcode = 1) { socket.write(Ws.frame(opcode, data)); },
                count: type => conn.events.filter(event => P.kind(event) === type).length,
                async event(type) {
                    await until(() => conn.events.slice(conn.cursor).some(event => P.kind(event) === type), "client sends " + type);
                    const index = conn.events.findIndex((event, at) => at >= conn.cursor && P.kind(event) === type);
                    conn.cursor = index + 1;
                    return conn.events[index];
                } };
            conns.push(conn);
            Ws.accept(request, socket);
            socket.on("data", Ws.decoder(({ opcode, payload }) => {
                if (opcode === 8) { socket.end(Ws.frame(8, payload)); return; }
                assert.equal(opcode, 1, "client events are text frames");
                const value = JSON.parse(payload.toString());
                P.client(value);
                conn.events.push(value);
                // The daemon rows answer each spoken frame at once.
                if (conn.auto > 0 && P.kind(value) === P.SPEAK) P.reply(conn);
            }));
            socket.on("close", () => { conn.ended = true; });
            // A fixture socket reset after the engine closes is not evidence.
            socket.on("error", () => {});
        });
        return new Promise((resolve, reject) => {
            instance.once("error", reject);
            instance.listen(0, "127.0.0.1", () => resolve({ instance, conns, redirected,
                origin: "http://127.0.0.1:" + instance.address().port,
                // A rig's own connection: a red control's late one never stands in.
                async accept(w) {
                    const next = () => conns.find(conn => conn.rig === String(w.id) && !conn.taken);
                    await until(() => next() !== undefined, "the engine connects");
                    const conn = next();
                    conn.taken = true;
                    return conn;
                } }));
        });
    }
    const other = await listen();
    const main = await listen(() => other.origin.replace("http:", "ws:"));
    const nets = [];
    let conversations = 0;

    // A disposable backend whose duplex provider rows point at the loopback server.
    function kitFrom(folder, edits = []) {
        const table = fs.mkdtempSync(path.join(process.env.JARVIS_TEST_ROOT, "live-kit-"));
        for (const sibling of fs.readdirSync(folder).filter(name => name.endsWith(".js")))
            fs.copyFileSync(path.join(folder, sibling), path.join(table, sibling));
        fs.cpSync(path.join(backend, "skills"), path.join(table, "skills"), { recursive: true });
        for (const [name, needle, replacement] of [["Providers.js", "wss://api.openai.com/v1/realtime",
            main.origin.replace("http:", "ws:") + "/v1/realtime"], ["Providers.js", "wss://generativelanguage.googleapis.com/ws/",
            main.origin.replace("http:", "ws:") + "/ws/"], ...edits]) {
            const source = fs.readFileSync(path.join(table, name), "utf8");
            assert.equal(source.split(needle).length - 1, 1, name + " kit substitution");
            fs.writeFileSync(path.join(table, name), source.replace(needle, replacement));
        }
        const load = name => require(path.join(table, name));
        return { folder: table, Live: load("Realtime.js"), Gemini: load("GeminiLive.js"), Policy: load("Policy.js"), Net: load("net.js"), Providers: load("Providers.js"),
            Secrets: load("Secrets.js"), Runner: load("session-runner.js"), Guidance: load("Guidance.js"), Session: Protocol.Session };
    }

    // thinking keeps each brain turn open: its port never reports done.
    // protocol is the adapter: REALTIME or GEMINI.
    function rig(kit, { key = "own", mode = "hold", synchronousClose = false, redirect = false, thinking = false, voice, protocol = REALTIME } = {}) {
        const clock = manual();
        const w = { id: ++conversations, kit, clock, played: [], flushes: 0, transcripts: [], logs: [], collected: [], sink: null,
            source: null, handed: [], backlog: null, delegations: [], tools: 0, starts: 0, judged: [], approvals: [],
            stall: false, read: null, dues: [], urls: [] };
        const Adapter = protocol === GEMINI ? kit.Gemini : kit.Live;
        voice ??= Adapter.VOICES[0].value;
        const store = new kit.Secrets.Secrets(path.join(childEnv.XDG_STATE_HOME, "vgshell/jarvis"), childEnv);
        const reference = kit.Secrets.ownReference(protocol.keyProvider, "fixture", key === "elsewhere" ? other.origin : main.origin);
        const secrets = { lookup: value => { const secret = store.lookup(value); w.handed.push(secret); return secret; } };
        const recipients = kit.Policy.recipients({ conversation: "live-" + w.id, profile: "standard", cloudVision: "ask",
            brain: { kind: "local", provider: "fixture-brain", account: "" },
            speech: [{ kind: "network", provider: protocol.keyProvider, account: "fixture", origin: main.origin }] });
        w.net = kit.Net.create(recipients);
        nets.push(w.net);
        // The rig's query names its connection on the server. The send-backlog
        // bound reads the channel's unsent bytes; a staged w.backlog stands in
        // for the kernel's buffering, which differs by host.
        const net = { websocket(value, options) {
            w.urls.push(options.url);
            const rigged = options.url + (options.url.includes("?") ? "&" : "?") + "rig=" + w.id + (redirect ? "&redirect=1" : "");
            const channel = w.net.websocket(value, { ...options, url: rigged });
            if (channel.kind !== "channel") return channel;
            let closing = false;
            return { kind: channel.kind, events: channel.events, send: channel.send, close() {
                if (synchronousClose && !closing) {
                    closing = true;
                    channel.events.dispatchEvent(Object.assign(new Event("close"), { code: 1006, wasClean: false }));
                }
                channel.close();
            },
                get readyState() { return channel.readyState; },
                get bufferedAmount() { return w.backlog === null ? channel.bufferedAmount : w.backlog; } };
        } };
        const engine = Adapter.create({ provider: kit.Providers.select(protocol.row), clock,
            captionLimit: Protocol.TRANSCRIPT_CHARS, log: line => w.logs.push(line),
            conversation: e => ({ net, key: key === null ? null : { secrets, reference }, language: "", voice,
                preview: e.preview === true ? PREVIEW_LINE : null,
                transfer: (item, start) => { w.judged.push(item); return start(); }, grants: () => [] }) });
        w.engine = engine;
        const ports = kit.Runner.unavailable();
        ports.capture = {
            // Audio refuses capture without a sink, as here.
            open: (e, done, failed) => {
                w.sink = engine.captureSink(e);
                if (w.sink === null) failed("audio-start: speech-unavailable"); else done();
            },
            close: (e, done) => { if (w.sink !== null) w.sink.destroy(); w.sink = null; done(); },
            collect: e => w.collected.push(e)
        };
        ports.playback = {
            start: (e, done, failed) => {
                const source = engine.playbackSource(e.source);
                if (source === null) { failed("playback-source-unavailable"); return; }
                w.source = source;
                w.starts++;
                // Audio reads at its own pace: a stalled rig leaves the reply unread until w.read().
                w.read = () => source.on("data", chunk => w.played.push({ chunk, flush: w.flushes }));
                if (!w.stall) w.read();
                // The chained engine's playback port tells the adapter a reply played out.
                source.on("end", () => { if (w.source === source) { w.source = null; engine.played(e.source); done(); } });
            },
            flush: (e, done) => { w.flushes++; if (w.source !== null) w.source.destroy(); w.source = null; done(); }
        };
        // The daemon's wire mapping, judged by the shared protocol.
        ports.transcript = e => {
            Protocol.accept(JSON.stringify({ v: 1, type: "transcript", gen: e.gen, revision: "a".repeat(64),
                role: e.role, text: e.text, stage: e.stage, rev: e.rev }), "daemon");
            w.transcripts.push({ role: e.role, text: e.text, stage: e.stage, rev: e.rev });
        };
        ports.mute = { store: () => {} };
        // Each due report the engine raises, read where the runner hears it.
        ports.speech = { ...engine.port, open: (e, events) => engine.port.open(e,
            { ...events, due: value => { w.dues.push(value); events.due(value); } }) };
        ports.brain = { ...ports.brain, send: (e, done) => {
            w.delegations.push(e);
            if (!thinking) done("brain-done");
        } };
        ports.approval = { ...ports.approval, show: () => {}, end: e => w.approvals.push(e.reason) };
        // The voice has no route to an action: any start here is a defect.
        ports.tools = { ...ports.tools, start: () => { w.tools++; } };
        w.runner = new kit.Runner.SessionRunner(kit.Session, ports, clock, (state, phase) => { w.state = state; w.phase = phase; });
        w.dispatch = (type, values = {}) => w.runner.dispatch({ type, ...values });
        w.dispatch("snapshot", { locked: false, engine: "duplex", configured: true, settings: { mode } });
        w.dispatch("indicator", { shown: true });
        return w;
    }
    // One finished user turn, built from the scripted one.
    function heard(conn, item, text) {
        const event = script("turn", -1);
        Object.assign(event, { item_id: item, transcript: text });
        conn.send(event);
    }
    // Partial text of one user turn.
    function part(conn, item, text) {
        const event = script("turn", 1);
        Object.assign(event, { item_id: item, delta: text });
        conn.send(event);
    }
    // The engine read the frame, or took the call, that restarts its idle wait.
    const restarted = (w, label) => until(() => w.clock.due(w.clock.now() + IDLE), label);
    // The newest delegation's words, as the engine's brain turn releases them.
    const say = (w, text) => w.engine.commentary(w.delegations.at(-1).delegation, w.kit.Policy.item(text, ["speech"]));
    // A caption that reaches the wire proves every frame before it was read.
    async function mark(w, conn, text) {
        part(conn, "item_" + text, text);
        await until(() => w.state.fault.kind === "error" || w.transcripts.some(item => item.text === text), text + " is read");
    }
    // Talk opens the socket; the provider has not spoken yet.
    async function connecting(kit, options) {
        const w = rig(kit, options);
        w.dispatch("talk-down");
        return { w, conn: await main.accept(w) };
    }
    // The session is configured and waits for session.updated.
    async function starting(kit, options) {
        const { w, conn } = await connecting(kit, options);
        conn.play("created");
        await conn.event("session.update");
        return { w, conn };
    }
    // Release leaves the started session running on paced silence.
    async function running(kit, options) {
        const { w, conn } = await starting(kit, options);
        conn.play("updated");
        w.sink.write(Buffer.alloc(960, 5));
        await conn.event(APPEND);
        w.dispatch("talk-up");
        await turn();
        w.clock.advance(100);
        await conn.event(APPEND);
        return { w, conn };
    }
    // The first user turn has reached the brain.
    async function conversing(kit, options) {
        const { w, conn } = await running(kit, options);
        conn.play("turn");
        await until(() => w.delegations.length === 1 || w.state.fault.kind === "error", "the turn reaches the brain");
        assert.equal(w.delegations.length, 1);
        return { w, conn };
    }
    // The provider has started the response that speaks the brain's words.
    async function speaking(kit, options) {
        const { w, conn } = await conversing(kit, options);
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.send(script("reply-old"));
        return { w, conn };
    }
    // Session state comes from the QML library realm; compare its JSON.
    const fault = (w, reason) => assert.deepEqual(JSON.parse(JSON.stringify(w.state.fault)), { kind: "error", reason, retry: 0 });
    function quiet(w, conn) {
        const all = JSON.stringify([w.state, w.logs, w.transcripts, w.delegations, conn === undefined ? [] : conn.events]);
        assert.equal(all.includes(KEY), false, "no key in state, log, transcript or frame");
        assert.equal(all.includes(PRIVATE), false, "no provider message text");
    }

    async function roundTrip(kit) {
        const w = rig(kit);
        const looked = lookups();
        w.dispatch("talk-down");
        assert.equal(lookups(), looked + 1, "the key is looked up when the session first needs it");
        assert.ok(w.handed.length === 1 && w.handed[0].every(byte => byte === 0), "the looked-up key is zeroed after the handshake");
        const conn = await main.accept(w);
        assert.ok(typeof MODEL === "string" && MODEL !== "", "the provider row pins a model");
        assert.equal(conn.url, "/v1/realtime?model=" + MODEL + "&rig=" + w.id);
        assert.equal(conn.headers.authorization, "Bearer " + KEY);
        await turn();
        assert.deepEqual(conn.events, [], "nothing leaves before session.created");
        conn.play("created");
        const update = await conn.event("session.update");
        assert.deepEqual(update.session, { type: "realtime", output_modalities: ["audio"], tools: [], tracing: null,
            audio: { input: { format: { type: "audio/pcm", rate: 24000 }, transcription: { model: "gpt-live-transcribe" },
                turn_detection: { type: "semantic_vad", create_response: false, interrupt_response: false } },
                output: { format: { type: "audio/pcm", rate: 24000 }, voice: "marin" } } });
        w.sink.write(Buffer.alloc(4800, 5));
        await turn();
        assert.equal(conn.count(APPEND), 0, "no audio before session.updated");
        conn.play("updated");
        same(await conn.event(APPEND), Buffer.alloc(4800, 5),
            "opening words wait for session.updated, then leave once");
        w.sink.write(Buffer.alloc(960, 6));
        same(await conn.event(APPEND), Buffer.alloc(960, 6), "a microphone frame leaves");
        w.clock.advance(1000);
        await turn();
        assert.equal(conn.count(APPEND), 2, "no silence while capture feeds the session");
        w.dispatch("talk-up");
        await turn();
        w.clock.advance(100);
        same(await conn.event(APPEND), Buffer.alloc(4800),
            "released talk leaves the session on paced silence");
        w.clock.stall(2500);
        w.clock.advance(0);
        same(await conn.event(APPEND), Buffer.alloc(48000),
            "after a stalled loop at most 1 s of silence leaves, with no catch-up");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the user's turn reaches the brain");
        assert.deepEqual([w.delegations[0].text, w.delegations[0].delegation], ["What is the time?", "item_user_1"]);
        assert.equal(say(w, "It is noon."), true);
        const spoken = await conn.event(SPEAK);
        assert.deepEqual([spoken.response.conversation, spoken.response.output_modalities], ["none", ["audio"]]);
        assert.equal(spoken.response.instructions,
            kit.Guidance.compose("duplex", "duplex", "").instructions + "\n\n" + JSON.stringify("It is noon."),
            "the frame carries the voice's guidance, then the sentence as a JSON string");
        conn.play("reply-old");
        await until(() => bytes(w, 0x11) === 1440, "the reply reaches playback");
        assert.equal(w.phase, "speaking");
        w.clock.advance(1000);
        conn.play("late-old");
        await until(() => bytes(w, 0x11) === 1920, "a later delta joins the playing reply");
        assert.deepEqual([w.state.playback.kind, w.starts], ["playing", 1], "a response in flight keeps its reply open");
        conn.play("done-old");
        await mark(w, conn, "done");
        w.clock.advance(499);
        await turn();
        assert.equal(w.state.playback.kind, "playing", "the reply stays open for more words");
        w.clock.advance(1);
        await until(() => w.state.playback.kind === "idle", "the reply ends once no words wait");
        assert.equal(w.phase, "idle");
        assert.deepEqual(w.collected, [], "the duplex engine collects no utterance");
        assert.equal(w.tools, 0, "the voice starts no action");
        assert.equal(w.state.fault.kind, "none");
        quiet(w, conn);
        return { w, conn };
    }

    // A preview opens the voice's session with no capture and in the chosen
    // voice, asks for its one sentence with no user turn, and reports idle
    // once Audio played it, so Session ends the conversation.
    async function preview(kit) {
        const w = rig(kit, { voice: "cedar" });
        w.dispatch("preview");
        const conn = await main.accept(w);
        conn.play("created");
        assert.equal((await conn.event("session.update")).session.audio.output.voice, "cedar", "the chosen voice speaks");
        assert.equal(w.sink, null, "no microphone opens");
        conn.play("updated");
        const spoken = await conn.event(SPEAK);
        assert.equal(spoken.response.instructions,
            kit.Guidance.compose("duplex", "duplex", "").instructions + "\n\n" + JSON.stringify(PREVIEW_LINE), "the preview's sentence, exactly");
        conn.play("reply-old");
        await until(() => bytes(w, 0x11) === 1440, "the sentence reaches playback");
        conn.play("done-old");
        await mark(w, conn, "done");
        w.clock.advance(500);
        await until(() => w.state.playback.kind === "idle", "the sentence plays out");
        assert.equal(w.state.conversation.kind, "active", "Session hears the sentence played before the voice reports idle");
        w.clock.advance(0);
        await until(() => w.state.conversation.kind === "ended", "the played preview ends the conversation");
        assert.deepEqual([w.delegations.length, w.tools, w.state.fault.kind], [0, 0, "none"], "a preview asks no brain and starts nothing");
        quiet(w, conn);
        // A voice the provider does not offer is refused before any connection.
        const other = rig(kit, { voice: "unlisted" });
        const opened = main.conns.length;
        other.dispatch("preview");
        await until(() => other.state.fault.kind === "error", "an unlisted voice fails the session");
        fault(other, "live=voice");
        assert.equal(main.conns.length, opened, "it opens no connection");
    }

    // Idle is 60 s with no user speech or transcript, no words for the voice,
    // no reply and no new capture.
    async function idle(kit) {
        const { w, conn } = await roundTrip(kit);
        await elapse(w, 59000);
        assert.equal(w.state.fault.kind, "none", "an ended response leaves no wait behind it");
        conn.send(script("turn-next"));
        await restarted(w, "the start of user speech restarts the idle wait");
        await elapse(w, 59000);
        assert.equal(conn.ended, false, "user speech restarts the idle wait");
        for (const event of fixtures.scripts["turn-next"].slice(1)) conn.send(structuredClone(event));
        await until(() => w.delegations.length === 2, "a second turn arrives");
        await elapse(w, 59000);
        assert.equal(say(w, "Nothing changed."), true);
        await conn.event(SPEAK);
        await elapse(w, 2000);
        assert.equal(conn.ended, false, "words in flight hold the session");
        conn.play("reply-new");
        conn.play("done-new");
        await until(() => bytes(w, 0x22) === 1440, "a late reply plays");
        w.clock.advance(500);
        await until(() => w.state.playback.kind === "idle", "the late reply ends");
        await elapse(w, 1000);
        w.dispatch("talk-down");
        heard(conn, "item_user_3", "Again?");
        await until(() => w.delegations.length === 3, "a third turn arrives");
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.play("reply-old");
        conn.play("done-old");
        await until(() => w.state.speech.reply.kind === "waiting", "a reply waits behind the held key");
        await mark(w, conn, "waiting");
        await elapse(w, 61000);
        assert.equal(conn.ended, false, "a queued reply holds the session");
        const old = bytes(w, 0x11);
        w.dispatch("talk-up");
        await until(() => bytes(w, 0x11) === old + 1440, "the queued reply plays");
        w.clock.advance(500);
        await until(() => w.state.playback.kind === "idle", "the queued reply ends");
        await elapse(w, 59999);
        assert.equal(conn.ended, false, "no close before 60 s idle");
        assert.equal(w.state.speech.kind, "open");
        w.clock.advance(1);
        await until(() => conn.ended, "idle closes the socket");
        assert.equal(w.state.speech.kind, "closed");
        assert.equal(w.state.conversation.kind, "ended", "idle close ends the conversation");
        assert.equal(w.state.fault.kind, "none");
        assert.deepEqual(w.logs, []);
    }

    // Each restart of the idle wait alone, [name, stage, act]: the stage ends
    // 59 s after the restart before it, and the act is the restart under test.
    const stalled = async kit => {
        const { w, conn } = await conversing(kit);
        w.stall = true;
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.play("reply-old");
        await until(() => w.state.playback.kind === "playing", "the reply reaches playback");
        // The clock moves past the turn's own restart, so the barrier proves
        // the response's end was read.
        w.clock.advance(100);
        conn.play("done-old");
        await restarted(w, "the response ends");
        return { w, conn };
    };
    const restarts = [
        // The indicator's return opens a capture with no interruption and no speech event.
        ["capture", async kit => {
            const { w, conn } = await starting(kit);
            conn.play("updated");
            w.sink.write(Buffer.alloc(960, 5));
            await conn.event(APPEND);
            return { w, conn };
        }, w => { w.dispatch("indicator", { shown: false }); w.dispatch("indicator", { shown: true }); }],
        ["response-end", conversing, async (w, conn) => {
            assert.equal(say(w, "It is noon."), true);
            await conn.event(SPEAK);
            conn.send(script("reply-old"));
            conn.play("done-old");
        }],
        ["interrupt", stalled, w => w.dispatch("interrupt")]
    ];
    async function idleRestarts(kit, only = null) {
        const selected = restarts.filter(([name]) => only === null || name === only);
        assert.ok(selected.length > 0, "idle restart " + only);
        for (const [name, stage, act] of selected) {
            const { w, conn } = await stage(kit);
            await elapse(w, 59000);
            assert.equal(conn.ended, false, name + " starts inside the wait before it");
            await act(w, conn);
            await restarted(w, name + " restarts the idle wait");
            await elapse(w, 59000);
            assert.equal(conn.ended, false, name + ": the socket is open 59 s later");
            await elapse(w, 999);
            assert.equal(conn.ended, false, name + ": no close before 60 s");
            w.clock.advance(1);
            await until(() => conn.ended, name + ": the socket closes at 60 s");
            assert.deepEqual([w.state.conversation.kind, w.state.fault.kind], ["ended", "none"]);
        }
    }

    // The idle wait counts from the user's last word, not the first: partial
    // text and the finished transcript each restart it.
    async function idleTurn(kit) {
        const { w, conn } = await running(kit);
        await elapse(w, 29900);
        conn.send(script("turn"));
        part(conn, "item_slow", "Open");
        await until(() => w.transcripts.some(item => item.text === "Open"), "the request starts");
        await elapse(w, 30000);
        part(conn, "item_slow", " the door");
        await until(() => w.transcripts.some(item => item.text === "Open the door"), "the request goes on");
        await elapse(w, 59000);
        assert.equal(conn.ended, false, "partial text restarts the idle wait");
        heard(conn, "item_slow", "Open the door");
        await until(() => w.delegations.length === 1, "the slow request reaches the brain");
        await elapse(w, 59000);
        assert.equal(conn.ended, false, "a finished turn restarts the idle wait");
        await elapse(w, 999);
        assert.equal(conn.ended, false);
        w.clock.advance(1);
        await until(() => conn.ended, "a turn that ends without words closes the socket 60 s later");
        assert.equal(w.state.fault.kind, "none");
    }

    // A request 30 s long leaves the brain its whole wait: the turn ends by
    // Session's thinking limit, with its fault, never by the idle wait.
    async function idleThinking(kit) {
        const { w, conn } = await running(kit, { thinking: true });
        conn.send(script("turn"));
        part(conn, "item_user_1", "What is");
        await until(() => w.transcripts.some(item => item.text === "What is"), "the request starts");
        await elapse(w, 30000);
        heard(conn, "item_user_1", "What is the time?");
        await until(() => w.delegations.length === 1, "the request reaches the brain");
        await elapse(w, 59000);
        assert.deepEqual([conn.ended, w.state.turn.kind, w.state.fault.kind], [false, "thinking", "none"],
            "59 s after the transcript the socket is open and the turn thinks");
        await elapse(w, 1000);
        fault(w, "thinking-timeout");
        await until(() => conn.ended, "the turn ended without words 60 s after the transcript: the socket closes");
    }

    // A held approval outlives the idle wait and ends by its own deadline.
    // The wait runs again, so the socket still closes after the turn's end.
    async function idleApproval(kit) {
        const { w, conn } = await conversing(kit, { thinking: true });
        await elapse(w, 5000);
        w.dispatch("approval", { gen: w.state.turn.gen, op: w.state.turn.op, id: "approval-fixture", digest: "a".repeat(64),
            text: "Delete the file?", physical: true, tool: "files_delete", timeoutMs: 1000, cancellable: false });
        assert.equal(w.state.approval.kind, "held");
        await elapse(w, 55000);
        assert.deepEqual([conn.ended, w.state.approval.kind, w.state.conversation.kind, w.approvals], [false, "held", "active", []],
            "the idle wait leaves a held approval to its own deadline");
        await elapse(w, 5000);
        assert.deepEqual(w.approvals, ["timeout"], "the approval ends at its own deadline, with its own reason");
        await elapse(w, 59999);
        assert.deepEqual([conn.ended, w.state.turn.kind, w.state.fault.kind], [false, "thinking", "none"],
            "the turn keeps its whole wait after the approval");
        w.clock.advance(1);
        fault(w, "thinking-timeout");
        await elapse(w, 54999);
        assert.equal(conn.ended, false, "the idle wait that ran again has not ended");
        w.clock.advance(1);
        await until(() => conn.ended, "the idle wait runs again and closes the socket");
        fault(w, "thinking-timeout");
    }

    // A new request empties the words a playing reply waited for. The reply
    // then has nothing left to wait for and ends after its gap.
    async function replacedReply(kit) {
        const { w, conn } = await conversing(kit);
        w.stall = true;
        assert.equal(say(w, "It is noon."), true);
        assert.equal(say(w, "It was noon before."), true);
        await conn.event(SPEAK);
        conn.send(script("reply-old"));
        const chunk = script("reply-old", 1);
        chunk.delta = Buffer.alloc(65536).toString("base64");
        for (let index = 0; index < 2; index++) conn.send(chunk);
        w.clock.advance(100);
        conn.play("done-old");
        await restarted(w, "the first response ends");
        w.clock.advance(500);
        assert.deepEqual([conn.count(SPEAK), w.state.playback.kind], [1, "playing"], "the next words wait behind the unread reply");
        heard(conn, "item_user_2", "Never mind.");
        await until(() => w.delegations.length === 2, "a new request replaces the waiting words");
        w.clock.advance(500);
        w.read();
        await until(() => w.state.playback.kind === "idle", "the reply ends once it has no words to wait for");
        assert.equal(conn.count(SPEAK), 1, "the replaced words never leave");
    }

    // Each spoken frame is judged under its sentence's source labels.
    // The brain's words wait at the voice for their first audio: the reply
    // shows as speaking from the words on, and an open reply carries more.
    async function replyDue(kit) {
        const { w, conn } = await conversing(kit);
        assert.deepEqual([w.state.turn.kind, w.phase], ["none", "idle"], "the brain's turn has ended with no words");
        assert.equal(say(w, "It is noon."), true);
        assert.deepEqual([w.state.speech.reply.kind, w.state.playback.kind, w.phase], ["due", "idle", "speaking"],
            "words with no reply to carry them are due");
        await conn.event(SPEAK);
        conn.play("reply-old");
        await until(() => w.state.playback.kind === "playing", "the first audio starts the reply");
        assert.deepEqual([w.state.speech.reply.kind, w.phase], ["none", "speaking"]);
        const open = w.dues.length;
        assert.equal(say(w, "Anything else?"), true);
        assert.deepEqual([w.dues.slice(open), w.state.speech.reply.kind], [[], "none"], "the open reply carries later words");
    }

    // A reply Audio still plays after it ended at the engine carries no new
    // words, and a reply the provider has started before Audio takes it does.
    async function replyDueCarried(kit) {
        const { w, conn } = await conversing(kit);
        w.stall = true;
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.play("reply-old");
        conn.play("done-old");
        await mark(w, conn, "done");
        assert.equal(w.state.playback.kind, "playing");
        w.clock.advance(500);
        const ended = w.dues.length;
        assert.equal(say(w, "Anything else?"), true);
        assert.deepEqual([w.dues.slice(ended), w.state.speech.reply.kind], [[true], "due"], "an ended reply carries no new words");
        await conn.event(SPEAK);
        conn.play("reply-new");
        await until(() => w.state.speech.reply.kind === "waiting", "the next reply waits for the playing one");
        const waiting = w.dues.length;
        assert.equal(say(w, "More words."), true);
        assert.deepEqual(w.dues.slice(waiting), [], "the reply the provider started carries later words");
    }

    // A failover releases the session and opens it again under the same
    // identity: the words it dropped leave no reply due.
    async function releaseDue(kit) {
        const { w } = await conversing(kit);
        assert.equal(say(w, "It is noon."), true);
        assert.equal(w.state.speech.reply.kind, "due");
        w.engine.port.release();
        assert.deepEqual([w.dues, w.state.speech.kind, w.state.speech.reply.kind, w.phase], [[true, false], "open", "none", "idle"]);
    }

    async function labels(kit) {
        const { w, conn } = await conversing(kit);
        const before = w.judged.length;
        assert.equal(w.engine.commentary(w.delegations[0].delegation, kit.Policy.item("The file says noon.", ["speech", "file"])), true);
        const frame = await conn.event(SPEAK);
        const judged = w.judged.slice(before).filter(item => JSON.parse(item.content).type === SPEAK);
        assert.deepEqual(judged.map(item => [JSON.parse(item.content), [...item.labels].sort()]), [[frame, ["file", "speech"]]],
            "words read from a file leave under the file label");
    }

    async function lineQueue(kit) {
        const { w, conn } = await conversing(kit);
        const request = w.delegations[0].delegation;
        const line = text => w.engine.commentary(request, kit.Policy.item(text, ["speech"]), { line: true });
        assert.equal(line("First line."), true);
        assert.equal(words(await conn.event(SPEAK)), "First line.", "an asked line is spoken");
        assert.equal(line("Second line."), true);
        assert.equal(line("Third line."), true);
        conn.send(script("reply-old"));
        conn.play("done-old");
        assert.equal(words(await conn.event(SPEAK)), "Third line.", "a newer waiting line replaces an older one");
        assert.equal(line("Fourth line."), true);
        assert.equal(w.engine.commentary(request, kit.Policy.item("Answer words.", ["speech"])), true);
        conn.send(script("reply-new"));
        conn.play("done-new");
        assert.equal(words(await conn.event(SPEAK)), "Answer words.", "reply words drop a waiting line");
        assert.deepEqual(conn.events.filter(event => event.type === SPEAK).map(words), ["First line.", "Third line.", "Answer words."]);
        w.dispatch("interrupt");
        heard(conn, "item_next", "Next?");
        await until(() => w.delegations.length === 2, "a new turn follows line-only speech");
        assert.equal(w.delegations[1].text, "Next?", "line speech creates no heard-prefix user text");
    }

    // The account of an interrupted reply: the responses the user heard to
    // their end. Audio's flush report credits frames of the reply at the speaker.
    async function heardAccount(kit) {
        const { w, conn } = await conversing(kit);
        const request = w.delegations[0].delegation;
        const report = frames => ({ source: w.state.speech.op, heardFrames: frames });
        // One spoken response of 1440 PCM bytes, ended or left in flight.
        const respond = async (id, ended) => {
            await conn.event(SPEAK);
            const created = script("reply-old"), audio = script("reply-old", 1), done = script("done-old");
            created.response.id = done.response.id = id;
            conn.send(created);
            conn.send({ ...audio, response_id: id, delta: Buffer.alloc(1440, 0x11).toString("base64") });
            if (ended) conn.send(done);
            await mark(w, conn, id);
        };
        for (const sentence of ["It is noon.", "It was noon before.", "Nothing changed."]) assert.equal(say(w, sentence), true);
        await respond("resp_first", true);
        await respond("resp_second", true);
        await respond("resp_third", false);
        const playing = w.engine.heard(request);
        assert.equal(playing.pending, true, "a reply at the speaker is unplayed");
        assert.deepEqual([null, report(719), report(720), report(1439), report(1440), report(48000)].map(playing.text),
            ["", "", "It is noon.", "It is noon.", "It is noon. It was noon before.", "It is noon. It was noon before."],
            "a response counts once the heard frames reach its end; one still in flight never does");
        assert.equal(playing.text({ source: w.state.speech.op + 1, heardFrames: 48000 }), "", "another playback's report credits nothing");
        assert.equal(w.engine.heard("item_other"), null, "another request has no account");
        const done = script("done-old");
        done.response.id = "resp_third";
        conn.send(done);
        await mark(w, conn, "third-done");
        w.clock.advance(500);
        await until(() => w.state.playback.kind === "idle", "the reply plays out");
        const whole = w.engine.heard(request);
        assert.deepEqual([whole.pending, whole.text(null)], [false, "It is noon. It was noon before. Nothing changed."],
            "a reply Audio played out was heard whole, with no report");
        assert.equal(say(w, "Late words."), true);
        await respond("resp_fourth", true);
        const later = w.engine.heard(request);
        assert.deepEqual([later.pending, later.text(null), later.text(report(720))],
            [true, "It is noon. It was noon before. Nothing changed.", "It is noon. It was noon before. Nothing changed. Late words."],
            "a later reply of the same request adds to what played out");
        heard(conn, "item_user_2", "And now?");
        await until(() => w.delegations.length === 2, "a new request arrives while the old reply plays");
        assert.equal(w.engine.heard(request), null, "the replaced request has no account");
        assert.equal(w.engine.heard("item_user_2").text(report(48000)), "", "the old request's responses are not the new one's");
        w.dispatch("interrupt");
        assert.equal(w.engine.heard("item_user_2"), null, "an interruption drops the account it read");
        heard(conn, "item_user_3", "Next.");
        await until(() => w.delegations.length === 3, "a request follows the interruption");
        assert.equal(w.engine.heard("item_user_3").pending, false, "a flushed reply is no longer at the speaker");
        assert.equal(w.state.fault.kind, "none");
    }

    // The session has no close event: stop and lease loss close the socket,
    // and the next Talk opens a new session at once.
    async function closing(kit) {
        const { w, conn } = await running(kit);
        w.dispatch("stop");
        await until(() => conn.ended, "stop closes the socket");
        assert.deepEqual([w.state.speech.kind, w.state.fault.kind], ["closed", "none"]);
        const lease = await running(kit);
        lease.w.runner.close();
        await until(() => lease.conn.ended, "lease loss closes the socket");
        // The engine releases the port itself when it ends a conversation.
        const ended = await running(kit);
        ended.w.engine.port.release();
        await until(() => ended.conn.ended, "the conversation's end closes the socket");
        const again = rig(kit, { mode: "toggle" });
        for (let index = 0; index < 2; index++) {
            again.clock.advance(300);
            again.dispatch("talk-down");
            const opened = await main.accept(again);
            opened.play("created");
            await opened.event("session.update");
            opened.play("updated");
            again.sink.write(Buffer.alloc(960));
            await opened.event(APPEND);
            again.clock.advance(300);
            again.dispatch("talk-down");
            await until(() => opened.ended, "toggle closes the session");
        }
        assert.equal(again.state.fault.kind, "none", "a closed session leaves the next one free to open");
    }

    async function captions(kit) {
        const { w, conn } = await conversing(kit);
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.play("reply-old");
        conn.play("done-old");
        assert.equal(say(w, "Nothing changed."), true);
        await conn.event(SPEAK);
        conn.play("reply-new");
        const long = script("reply-new", -1);
        long.delta = "x\u0007".repeat(2500);
        conn.send(long);
        conn.play("done-new");
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "captions reach the wire");
        const reply = "It is noon. Nothing changed." + "x ".repeat(2500);
        assert.deepEqual(w.transcripts, [
            { role: "user", text: "What is", stage: "partial", rev: 1 },
            { role: "user", text: "What is the time?", stage: "partial", rev: 2 },
            { role: "user", text: "What is the time?", stage: "final", rev: 3 },
            { role: "assistant", text: "It is noon.", stage: "partial", rev: 4 },
            { role: "assistant", text: "It is noon. Nothing changed.", stage: "partial", rev: 5 },
            { role: "assistant", text: reply.slice(0, 4096), stage: "partial", rev: 6 },
            { role: "assistant", text: reply.slice(0, 4096), stage: "final", rev: 7 },
            { role: "assistant", text: reply.slice(4096), stage: "partial", rev: 8 },
            { role: "assistant", text: reply.slice(4096), stage: "final", rev: 9 },
            { role: "user", text: "Stop.", stage: "partial", rev: 10 },
            { role: "user", text: "Stop. What changed?", stage: "partial", rev: 11 },
            { role: "user", text: "Stop. What changed?", stage: "final", rev: 12 }
        ]);
        heard(conn, "item_user_3", "No partial came.");
        await until(() => w.delegations.length === 3, "a turn with no partial arrives");
        assert.deepEqual(w.transcripts.slice(12), [{ role: "user", text: "No partial came.", stage: "final", rev: 13 }],
            "a turn with no open caption gets its caption whole");
        // Two turns overlap: the second one's partial text arrives before the
        // first one's transcript. Each turn's caption closes once, whole.
        part(conn, "item_a", "One");
        part(conn, "item_b", "Two");
        heard(conn, "item_a", "One.");
        part(conn, "item_b", " more");
        heard(conn, "item_b", "Two more");
        await until(() => w.delegations.length === 5, "both overlapping turns arrive");
        assert.deepEqual(w.transcripts.slice(13), [
            { role: "user", text: "One", stage: "partial", rev: 14 },
            { role: "user", text: "Two", stage: "partial", rev: 15 },
            { role: "user", text: "One.", stage: "final", rev: 16 },
            { role: "user", text: "Two more", stage: "partial", rev: 17 },
            { role: "user", text: "Two more", stage: "final", rev: 18 }
        ]);
        assert.equal(w.state.fault.kind, "none");
        quiet(w, conn);
    }

    // An interrupted reply already playing: the words not yet asked for are
    // dropped, and the rest of the interrupted response never plays.
    async function interruptPlaying(kit) {
        const { w, conn } = await conversing(kit);
        const stale = w.delegations[0].delegation;
        assert.equal(say(w, "It is noon."), true);
        assert.equal(say(w, "It was noon before."), true);
        await conn.event(SPEAK);
        conn.play("reply-old");
        await until(() => bytes(w, 0x11) === 1440, "the old reply plays");
        w.dispatch("talk-down");
        assert.equal(w.flushes, 1);
        assert.equal(w.state.playback.kind, "idle");
        assert.equal(w.engine.commentary(stale, kit.Policy.item("Late words.", ["speech"])), false, "an interrupted request takes no more words");
        conn.play("late-old");
        conn.play("done-old");
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "the new turn arrives");
        assert.equal(conn.count(SPEAK), 1, "the words waiting behind the interrupted response never leave");
        assert.equal(w.played.filter(item => item.flush === 1).length, 0, "no audio of the interrupted response after the flush");
        assert.equal(w.state.speech.reply.kind, "none");
        assert.equal(say(w, "Nothing changed."), true);
        assert.equal(words(await conn.event(SPEAK)), "Nothing changed.");
        conn.play("reply-new");
        w.dispatch("talk-up");
        await until(() => bytes(w, 0x22) === 1440, "the reply to the new turn plays");
        assert.equal(bytes(w, 0x11), 1440);
        assert.equal(w.state.fault.kind, "none", "no cancel met a finished response");
    }

    // A reply still queued behind a held talk key is dropped whole.
    async function interruptQueued(kit) {
        const { w, conn } = await running(kit);
        w.dispatch("talk-down");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the held turn arrives");
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.play("reply-old");
        conn.play("done-old");
        await until(() => w.state.speech.reply.kind === "waiting", "the reply waits behind the held key");
        assert.equal(w.state.capture.kind, "open", "half duplex: a reply never cuts off held talk");
        w.dispatch("interrupt");
        assert.equal(w.state.speech.reply.kind, "none");
        w.dispatch("talk-up");
        await turn();
        assert.equal(w.state.playback.kind, "idle", "the interruption cleared the queue");
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "the next turn arrives");
        assert.equal(say(w, "Nothing changed."), true);
        await conn.event(SPEAK);
        conn.play("reply-new");
        await until(() => bytes(w, 0x22) === 1440, "the next reply plays");
        assert.equal(bytes(w, 0x11), 0, "no queued audio of the interrupted reply plays");
    }

    // Each fault row: [name, stage, act, reason]. A caption after the act
    // reaches the wire only when the act did not fault, so a red row is quick.
    const completed = change => conn => conn.raw(off("turn", change, -1));
    const audio = change => conn => conn.raw(off("reply-old", change, 1));
    const rows = [
        ["error", running, conn => conn.play("error"), "live=server-error type=invalid_request_error code=unknown_parameter"],
        ["response-failed", speaking, conn => conn.play("failed"), "live=response status=failed type=server_error code=inference_error"],
        ["response-incomplete", speaking, conn => {
            const event = script("failed");
            Object.assign(event.response, { status: "incomplete", status_details: { type: "incomplete", reason: "content_filter" } });
            conn.send(event);
        }, "live=response status=incomplete reason=content_filter"],
        // The schema lets the code be null; a code that is not a short identifier could carry provider text.
        ["error-null-code", running, conn => conn.send({ ...script("error"), error: { ...script("error").error, code: null } }),
            "live=server-error type=invalid_request_error code=unrecognized"],
        ["error-text-code", running, conn => conn.send({ ...script("error"), error: { ...script("error").error, code: PRIVATE + " here" } }),
            "live=server-error type=invalid_request_error code=unrecognized"],
        ["transcription-failed", running, conn => conn.play("transcription-failed"), "live=transcription code=audio_unintelligible"],
        ["function-call", running, conn => conn.play("function-call"), "live=event type=response.function_call_arguments.done"],
        ["unrequested", running, conn => conn.raw(JSON.stringify({ type: "conversation.item.truncated", event_id: "e",
            item_id: "item_x", content_index: 0, audio_end_ms: 100 })), "live=event type=conversation.item.truncated"],
        ["unasked-response", running, conn => conn.send(script("reply-old")), "live=event-order"],
        ["second-response", speaking, conn => conn.send(script("reply-new")), "live=event-order"],
        ["other-response", speaking, conn => conn.send(script("reply-new", 1)), "live=event-order"],
        ["item-id", running, completed(event => ({ ...event, item_id: "" })), "live=frame-shape"],
        ["item-id-type", running, completed(event => ({ ...event, item_id: 0 })), "live=frame-shape"],
        ["item-id-size", running, completed(event => ({ ...event, item_id: "x".repeat(513) })), "live=frame-shape"],
        ["transcript-shape", running, completed(event => ({ ...event, transcript: 7 })), "live=frame-shape"],
        ["turn-size", running, completed(event => ({ ...event, transcript: "x".repeat(TURN + 1) })), "live=turn-size"],
        ["partial-shape", running, conn => conn.raw(off("turn", event => ({ ...event, delta: 7 }), 1)), "live=frame-shape"],
        ["words-shape", speaking, conn => conn.raw(off("reply-old", event => ({ ...event, delta: 7 }), -1)), "live=frame-shape"],
        ["json", running, conn => conn.raw("{"), "live=frame-json"],
        ["binary", running, conn => conn.raw(Buffer.from([1, 2]), 2), "live=frame-binary"],
        ["frame-size", running, conn => conn.raw("x".repeat(FRAME + 1)), "live=frame-size"],
        ["shape", running, conn => conn.raw("[1]"), "live=frame-shape"],
        ["odd-audio", speaking, audio(event => ({ ...event, delta: "AAAA" })), "live=output-audio"],
        // Lenient base64 decodes this to four bytes; only the strict pattern refuses it.
        ["not-base64", speaking, audio(event => ({ ...event, delta: "AAAAAA=A" })), "live=output-audio"],
        ["created-twice", running, conn => { conn.play("created"); conn.play("updated"); }, "live=event-order"],
        ["updated-twice", running, conn => conn.play("updated"), "live=event-order"],
        ["input-frame", running, (conn, w) => { w.dispatch("talk-down"); w.sink.write(Buffer.alloc(3)); }, "live=input-frame"],
        ["reset", running, conn => conn.socket.destroy(), "live=disconnected code=1006"],
        ["format", starting, conn => conn.raw(off("updated", event => {
            event.session.audio.output.format.rate = 16000;
            return event;
        })), "live=format"],
        ["updated-shape", starting, conn => conn.raw(off("updated", event => ({ ...event, session: { type: "realtime" } }))),
            "live=frame-shape"],
        ["early-audio", starting, conn => conn.send(script("reply-old", 1)), "live=event-order"],
        ["early-turn", starting, conn => conn.play("turn"), "live=event-order"],
        ["early-update", connecting, conn => conn.play("updated"), "live=event-order"]
    ];
    async function failures(kit, only = null) {
        const selected = rows.filter(([name]) => only === null || name === only);
        assert.ok(selected.length > 0, "fault row " + only);
        for (const [name, stage, act, reason] of selected) {
            const { w, conn } = await stage(kit);
            const delegations = w.delegations.length;
            act(conn, w);
            if (stage === connecting) conn.play("created");
            if (stage !== running && stage !== speaking) conn.play("updated");
            await mark(w, conn, "probe");
            fault(w, reason);
            assert.equal(w.state.speech.kind, "closed", name + " releases the session");
            assert.equal(w.state.conversation.kind, "ended", name + " ends the conversation: no silent provider switch");
            assert.deepEqual([w.delegations.length, w.tools], [delegations, 0], name + " reaches no brain and no action");
            await until(() => conn.ended, name + " closes the socket");
            quiet(w, conn);
        }
    }

    // Every documented event the session causes and the engine does not read.
    async function unread(kit) {
        const { w, conn } = await speaking(kit);
        conn.play("unread");
        const frame = JSON.stringify({ type: "rate_limits.updated", event_id: "e", rate_limits: [], pad: "" });
        conn.raw(frame.replace('"pad":""', '"pad":"' + "m".repeat(FRAME - frame.length) + '"'));
        heard(conn, "item_bound", "x".repeat(TURN));
        await until(() => w.delegations.length === 2 || w.state.fault.kind === "error", "the unread events are judged");
        assert.equal(w.state.fault.kind, "none", "unread events, a 1 MiB frame and a turn at its bound are kept");
    }

    // The door refuses the redirect, so the key reaches no second origin.
    async function redirect(kit) {
        const w = rig(kit, { redirect: true });
        w.dispatch("talk-down");
        await until(() => w.state.fault.kind === "error", "a redirect ends the conversation");
        fault(w, "live=disconnected code=1006");
        assert.deepEqual(main.redirected.filter(id => id === String(w.id)), [String(w.id)], "the provider answered with a redirect");
        await turn();
        assert.equal([...main.conns, ...other.conns].filter(conn => conn.rig === String(w.id)).length, 0, "no connection follows the redirect");
        assert.equal(w.state.conversation.kind, "ended");
        quiet(w);
    }

    async function startTimeout(kit) {
        const { w, conn } = await connecting(kit);
        await elapse(w, 19999);
        assert.equal(w.state.fault.kind, "none");
        w.clock.advance(1);
        fault(w, "live=start-timeout");
        await until(() => conn.ended, "start timeout closes the socket");
    }

    // A response that never ends would hold every later word.
    async function responseTimeout(kit) {
        const { w, conn } = await speaking(kit);
        await elapse(w, 29999);
        assert.equal(w.state.fault.kind, "none");
        w.clock.advance(1);
        fault(w, "live=response-timeout");
        await until(() => conn.ended, "a response that never ends closes the socket");
    }

    async function keys(kit) {
        const looked = lookups();
        const elsewhere = rig(kit, { key: "elsewhere" });
        elsewhere.dispatch("talk-down");
        fault(elsewhere, "net=key-origin");
        assert.equal(lookups(), looked, "a key bound to another origin is refused before any lookup");
        assert.equal(elsewhere.state.conversation.kind, "ended");
        const missing = rig(kit, { key: null });
        missing.dispatch("talk-down");
        fault(missing, "live=no-key");
        await turn();
        const own = [elsewhere.id, missing.id].map(String);
        assert.equal([...main.conns, ...other.conns].filter(conn => own.includes(conn.rig)).length, 0, "no connection without a usable key");
        quiet(elsewhere);
    }

    async function release(kit) {
        const { w, conn } = await starting(kit);
        conn.play("updated");
        w.sink.write(Buffer.alloc(960, 5));
        await until(() => w.state.fault.kind === "error", "a withheld frame faults");
        fault(w, "live=release-withhold");
        await until(() => conn.ended, "the withheld session closes");
        assert.equal(conn.count(APPEND), 0, "a withheld frame writes nothing");
    }

    async function releaseConnect(kit) {
        const w = rig(kit);
        w.dispatch("talk-down");
        fault(w, "live=release-withhold");
        await turn();
        assert.equal(main.conns.filter(conn => conn.rig === String(w.id)).length, 0, "a withheld connection opens no socket");
    }

    // The full opening fits; it leaves after session.updated in order, ahead
    // of later words, without meeting the send backlog.
    async function opening(kit) {
        const { w: early } = await starting(kit);
        for (let sent = 0; sent < OPENING; sent += 48000) early.sink.write(Buffer.alloc(48000));
        assert.equal(early.state.fault.kind, "none", "20 s of opening words fit");
        early.sink.write(Buffer.alloc(2));
        fault(early, "live=input-overflow");
        const { w, conn } = await starting(kit);
        const opened = Buffer.concat(Array.from({ length: 20 }, (_, index) => Buffer.alloc(48000, index + 1)));
        for (let offset = 0; offset < opened.length; offset += 48000) w.sink.write(opened.subarray(offset, offset + 48000));
        conn.play("updated");
        await conn.event(APPEND);
        assert.equal(w.state.fault.kind, "none", "the opening leaves behind the socket's backpressure");
        w.sink.write(Buffer.alloc(960, 0x7f));
        const all = Buffer.concat([opened, Buffer.alloc(960, 0x7f)]);
        const deadline = Date.now() + 2000;
        while (appended(conn).length < all.length && w.state.fault.kind === "none") {
            assert.ok(Date.now() < deadline, "the opening drains");
            w.clock.advance(100);
            await new Promise(resolve => setTimeout(resolve, 2));
        }
        assert.equal(w.state.fault.kind, "none", "the full opening never meets the send backlog");
        assert.ok(appended(conn).equals(all), "every opening byte leaves once, in order, before later words");
    }

    async function releaseLifetime(kit) {
        const { w, conn } = await starting(kit, { synchronousClose: true });
        w.sink.write(Buffer.alloc(OPENING + 2));
        fault(w, "live=input-overflow");
        assert.equal(w.state.speech.kind, "closed", "released speech closes once");
        await until(() => conn.ended, "overflow closes its transport");
        w.clock.advance(20000);
        fault(w, "live=input-overflow");
        assert.equal(w.state.conversation.kind, "ended", "released callbacks cannot restore the session");
    }

    // One response at a time, each bounded, and the next only once playback
    // has drained the reply: a response's audio cannot be paused.
    async function pacing(kit) {
        const { w, conn } = await running(kit);
        w.dispatch("talk-down");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the held turn arrives");
        const long = "word ".repeat(119) + "end.";
        assert.equal(say(w, long), true);
        assert.equal(say(w, "It is noon."), true);
        const first = await conn.event(SPEAK);
        await turn();
        assert.equal(conn.count(SPEAK), 1, "the next words wait for the response in flight");
        assert.ok([...words(first)].length <= 240 && long.startsWith(words(first)), "one response carries a bounded part of a long sentence");
        conn.send(script("reply-old"));
        const chunk = script("reply-old", 1);
        chunk.delta = Buffer.alloc(65536).toString("base64");
        for (let index = 0; index < 2; index++) conn.send(chunk);
        conn.play("done-old");
        await mark(w, conn, "full");
        await elapse(w, 1000);
        assert.equal(conn.count(SPEAK), 1, "the next words wait while the reply still holds its audio");
        w.dispatch("talk-up");
        await until(() => w.played.length > 0, "the waiting reply plays");
        w.clock.advance(100);
        const second = await conn.event(SPEAK);
        assert.equal(words(first) + words(second), long.slice(0, (words(first) + words(second)).length), "the sentence continues in order");
        const queue = kit.Policy.item("x".repeat(65536), ["speech"]);
        assert.throws(() => w.engine.commentary(w.delegations[0].delegation, queue), { message: "jarvis: live=speech-queue" },
            "words past the queue's bound are refused");
    }

    async function replyQueue(kit) {
        const { w, conn } = await running(kit);
        w.dispatch("talk-down");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the held turn arrives");
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.send(script("reply-old"));
        const chunk = script("reply-old", 1);
        chunk.delta = Buffer.alloc(65536).toString("base64");
        for (let index = 0; index < 19; index++) conn.send(chunk);
        await mark(w, conn, "kept");
        assert.equal(w.state.fault.kind, "none", "a queue under the playback allowance is kept");
        for (let index = 0; index < 2; index++) conn.send(chunk);
        await until(() => w.state.fault.kind === "error", "past the allowance the reply faults");
        fault(w, "live=output-overflow");
    }

    async function backlog(kit) {
        const { w, conn } = await running(kit);
        const count = conn.count(APPEND);
        w.backlog = BACKLOG;
        w.clock.advance(100);
        await until(() => conn.count(APPEND) === count + 1, "a frame leaves with the socket at the bound");
        assert.equal(w.state.fault.kind, "none", "a backlog at the bound is kept");
        w.backlog = BACKLOG + 1;
        w.clock.advance(100);
        fault(w, "live=send-backlog");
    }

    async function delegation(kit) {
        const { w, conn } = await conversing(kit);
        const task = w.delegations[0];
        heard(conn, "item_blank", " ");
        const before = w.transcripts.length;
        await mark(w, conn, "blank");
        assert.deepEqual([w.delegations.length, w.transcripts.length], [1, before + 1], "a blank turn reaches no brain and no caption");
        assert.equal(w.engine.commentary("stale", kit.Policy.item("Stale words.", ["speech"])), false);
        assert.equal(say(w, "It is noon."), true);
        assert.equal(say(w, "It was noon before."), true);
        await conn.event(SPEAK);
        conn.send(script("reply-old"));
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "a new turn uses new identity");
        assert.equal(w.delegations[1].delegation, "item_user_2");
        conn.play("done-old");
        await mark(w, conn, "replaced");
        // The engine sends any further response while it reads done-old, before
        // the mark. The fixture server reads that frame on a later poll, which a
        // busy event loop runs after the mark's timer: count what the engine sent.
        const spoken = w.judged.filter(item => item.content.startsWith(JSON.stringify({ type: SPEAK }).slice(0, -1)));
        assert.equal(spoken.length, 1, "words waiting for a replaced request never leave");
        assert.equal(w.engine.commentary(task.delegation, kit.Policy.item("Old words.", ["speech"])), false, "a replaced request takes no more words");
        w.dispatch("stop");
        assert.equal(say(w, "Late words."), false, "an ended conversation speaks no words");
        assert.equal(w.tools, 0);
    }

    async function violations(kit) {
        const { w, conn } = await conversing(kit);
        const counts = () => w.logs.filter(line => line.startsWith("jarvis: live=violations counts="))
            .map(line => JSON.parse(line.split("counts=")[1]));
        const reply = text => { const event = script("reply-old", -1); event.delta = text; conn.send(event); };
        assert.equal(say(w, "It is noon."), true);
        await conn.event(SPEAK);
        conn.send(script("reply-old"));
        reply("Visit https://example.com.");
        conn.play("done-old");
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "the next turn closes the reply's caption");
        assert.equal(counts().length, 1, "the closed caption is counted once");
        assert.equal(counts()[0].url, 1);
        assert.equal(say(w, "Nothing changed."), true);
        await conn.event(SPEAK);
        conn.send(script("reply-old"));
        reply("Use **bold**.");
        await until(() => w.transcripts.some(item => item.text.includes("bold")), "the second reply's words arrive");
        w.dispatch("stop");
        assert.equal(counts().length, 2, "teardown counts the open caption");
        assert.equal(counts()[1].markdown, 4);
        assert.equal(w.logs.some(line => line.includes("example.com") || line.includes("bold")), false);
    }

    // The real daemon selects Accounts, the configured brain, Session,
    // ToolRouter, Policy, Files, Audit and the duplex speech owner. Only the
    // provider address, local fixture model and clock are instrumented in its disposable tree.
    async function daemonDelegation(kit, only = "action", P = REALTIME) {
        const root = fs.mkdtempSync(path.join(process.env.JARVIS_TEST_ROOT, "delegation-daemon-"));
        const plugin = path.join(root, "plugin");
        fs.cpSync(path.join(tree, "shell/plugins/vgs.jarvis"), plugin, { recursive: true });
        for (const file of fs.readdirSync(kit.folder).filter(name => name.endsWith(".js")))
            fs.copyFileSync(path.join(kit.folder, file), path.join(plugin, "backend", file));
        const accountsFile = path.join(plugin, "AccountProviders.js");
        const accountSource = fs.readFileSync(accountsFile, "utf8");
        const modelNeedle = 'probe: { driver: "ollama", path: "/api/generate", model: "" }';
        assert.equal(accountSource.split(modelNeedle).length - 1, 1, "the local fixture names its scripted model");
        fs.writeFileSync(accountsFile, accountSource.replace(modelNeedle,
            'probe: { driver: "ollama", path: "/api/generate", model: "fixture-model" }'));
        const runnerFile = path.join(plugin, "backend/jarvisd.js");
        const offset = path.join(root, "clock");
        fs.writeFileSync(offset, "0");
        let source = fs.readFileSync(runnerFile, "utf8");
        assert.equal(source.split("performance.now()").length - 1, 3, "the daemon clocks share the injected offset");
        source = source.replaceAll("performance.now()", 'performance.now() + Number(fs.readFileSync(' + JSON.stringify(offset) + ', "utf8"))');
        fs.writeFileSync(runnerFile, source);
        if (only === "release") {
            const engineFile = path.join(plugin, "backend/ChainedEngine.js");
            const engineSource = fs.readFileSync(engineFile, "utf8");
            const needle = "speech: activePlan.speech.recipients";
            assert.equal(engineSource.split(needle).length - 1, 1);
            fs.writeFileSync(engineFile, engineSource.replace(needle,
                needle + '.concat(plan.speech.recipients.map(recipient => ({...recipient,origin:"https://example.invalid"})))'));
        }
        const directories = Object.fromEntries(["state", "data", "runtime"].map(name => [name, path.join(root, name)]));
        for (const folder of Object.values(directories)) fs.mkdirSync(folder, { mode: 0o700 });
        // Observe the audit inside the actual frame-send callback. Earlier
        // connection or audio records cannot stand in for this frame's record.
        const frameAudits = path.join(root, "frame-audits");
        const liveFile = path.join(plugin, "backend", P.file);
        const liveSource = fs.readFileSync(liveFile, "utf8");
        const sendNeedle = "const answer = session.transfer(frame, () => session.channel.send(frame, session.grants()));";
        assert.equal(liveSource.split(sendNeedle).length - 1, 1);
        fs.writeFileSync(liveFile, liveSource.replace(sendNeedle, `
        const fs = require("node:fs"), path = require("node:path");
        const auditRows = () => fs.readdirSync(${JSON.stringify(path.join(directories.state, "audit"))})
            .flatMap(file => fs.readFileSync(path.join(${JSON.stringify(path.join(directories.state, "audit"))}, file), "utf8")
                .trim().split("\\n").filter(Boolean).map(JSON.parse));
        const before = auditRows().length;
        const answer = session.transfer(frame, () => {
            fs.appendFileSync(${JSON.stringify(frameAudits)}, JSON.stringify({ frame: value, records: auditRows().slice(before) }) + "\\n");
            return session.channel.send(frame, session.grants());
        });`));
        fs.writeFileSync(path.join(directories.state, "keys.json"), JSON.stringify([kit.Secrets.ownReference(P.keyProvider, "fixture", main.origin)]));
        require(path.join(plugin, "backend/Core.js")).use(tree);
        const { Accounts } = require(path.join(plugin, "backend/Accounts.js"));
        const { PROVIDERS } = require(path.join(plugin, "AccountProviders.js"));
        const accounts = new Accounts(directories.state, childEnv);
        const live = accounts.account(PROVIDERS.find(row => row.id === P.keyProvider), "fixture", { kind: "found" },
            { kind: "keyring", reference: kit.Secrets.ownReference(P.keyProvider, "fixture", main.origin) }).id;
        const local = PROVIDERS.find(row => row.id === "ollama");
        const brain = accounts.account(local, "local", { kind: "found" }, { kind: "local", origin: local.origin }).id;
        const victim = path.join(process.env.HOME, "delegated-file-" + path.basename(root));
        fs.writeFileSync(victim, "fixture", { mode: 0o600 });
        const server = BrainFixture.brain(11434);
        await server.ready;
        const child = cp.spawn("node", [runnerFile, "--tree", tree], { env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
        const closed = once(child, "close");
        const deadline = setTimeout(() => child.kill("SIGKILL"), 15000);
        const messages = [];
        let tail = "", stderr = "";
        child.stdout.on("data", data => {
            const lines = (tail + data).split("\n"); tail = lines.pop();
            for (const line of lines) messages.push(Protocol.accept(line, "daemon"));
        });
        child.stderr.on("data", data => { stderr += data; });
        child.stdin.on("error", error => { if (error.code !== "EPIPE") throw error; });
        const last = () => messages.filter(value => value.type === "state").at(-1)?.state;
        const revision = "a".repeat(64);
        const send = value => child.stdin.write(JSON.stringify({ v: 1, gen: last()?.gen ?? 0, revision, ...value }) + "\n");
        const wait = async (check, label) => {
            try { await until(() => check() || child.exitCode !== null, label); }
            catch { assert.fail(label + ": " + JSON.stringify(messages.filter(value => value.type === "status")) + " state=" + JSON.stringify(last()) + " stderr=" + stderr); }
            assert.ok(check(), label + ": " + stderr);
        };
        const rows = () => fs.readdirSync(path.join(directories.state, "audit"))
            .flatMap(file => fs.readFileSync(path.join(directories.state, "audit", file), "utf8").trim().split("\n").map(JSON.parse));
        let releaseReply;
        const heldReply = new Promise(resolve => { releaseReply = resolve; });
        try {
            send({ type: "hello", settings: { home: "", sounds: false, mode: "hold", microphone: "", speaker: "", brain, model: "", effort: "", fallbacks: [], taskTerminal: "auto",
                cloudVision: "ask", privateWindows: "", voiceProvider: P.setting, voiceAccount: live, voice: only === "preview" ? P.previewVoice : "", clonedVoice: false, dictation: "" }, directories, locked: false,
                keys: { talk: "SUPER+code:108", mute: "SUPER+SHIFT+code:108", stop: "SUPER+ALT+PERIOD", confirm: "SUPER+ALT+Y", console: "SUPER+ALT+C" } });
            await wait(() => last()?.gate.kind === "up", "the configured cloud voice raises the daemon gate");
            assert.equal(last().engine.kind, "duplex");
            // The Voice setting's offers: the selected cloud voice's voices.
            const Adapter = require(path.join(kit.folder, P.file));
            await wait(() => messages.some(value => value.type === "voices"), "the daemon offers its voices");
            // The wire's values come from the QML library realm; compare their JSON.
            assert.equal(JSON.stringify(messages.filter(value => value.type === "voices").at(-1).voices), JSON.stringify(Adapter.VOICES),
                "the Voice setting offers the selected cloud voice's voices");
            // The shipped engine's preview: the chosen voice, its one
            // sentence and no capture.
            if (only === "preview") {
                send({ type: "intent", intent: "preview" });
                await wait(() => main.conns.some(conn => conn.rig === null && !conn.taken), "the preview opens the daemon's voice");
                const conn = main.conns.find(conn => conn.rig === null && !conn.taken); conn.taken = true;
                assert.equal(P.voice(await P.open(conn)), P.previewVoice, "the chosen voice speaks");
                const spoken = await conn.event(P.SPEAK);
                assert.equal(P.words(spoken), "This is how I sound when I answer you.", "the engine's preview sentence, exactly");
                assert.deepEqual([last().capture.kind, server.requests.length], ["closed", 0], "no microphone and no brain request");
                child.stdin.end();
                assert.equal((await closed)[0], 0, stderr);
                return;
            }
            send({ type: "indicator", shown: true });
            send({ type: "intent", intent: "talk-down" });
            await wait(() => main.conns.some(conn => conn.rig === null && !conn.taken), "the actual daemon connects its voice");
            const conn = main.conns.find(conn => conn.rig === null && !conn.taken); conn.taken = true;
            conn.auto = 1;
            assert.equal(P.noTools(await P.open(conn)), true, "the daemon's voice has no tools");
            await wait(() => last()?.capture.kind === "open", "synthetic capture opens behind the indicator");
            send({ type: "intent", intent: "talk-up" });
            // What a brain may write around its words: a tool call as an element, a bare JSON value and markup.
            const answer = '<tool_call>{"name": "files_delete"}</tool_call> {"deleted": true} **Completed.** Visit https://example.com.';
            if (only === "action") server.replies.push(BrainFixture.calls({ id: "delete_call", name: "files_delete", arguments: { path: victim } }),
                BrainFixture.text(answer));
            else if (only === "release") server.replies.push(BrainFixture.calls({ id: "read_call", name: "files_read", arguments: { path: victim } }),
                BrainFixture.text("The private result was withheld."));
            else if (only === "heard") {
                server.replies.push(BrainFixture.text("One. Two."));
                conn.voice = [4800, 4800];
            } else if (only === "stale") server.replies.push([{ wait: heldReply },
                ...BrainFixture.calls({ id: "stale_delete", name: "files_delete", arguments: { path: victim } })]);
            else {
                server.replies.push(BrainFixture.text({ wait: heldReply }, "Late reply."));
                if (only === "replacement") server.replies.push(BrainFixture.text("Current reply."));
            }
            conn.play("turn");
            await wait(() => server.requests[0]?.body !== null && server.requests.length > 0, "the configured brain receives the delegation");
            const first = server.requests[0].body;
            assert.ok(first.messages.some(value => value.role === "user" && value.content.includes("What is the time?")));
            assert.equal(first.model, "fixture-model");
            assert.ok(Array.isArray(first.tools) && first.tools.some(value => value.function.name === "files_delete"), "the configured router offers its tools");
            if (only === "action") {
                await wait(() => last()?.approval.kind === "held", "the router holds the destructive call");
                assert.equal(fs.existsSync(victim), true, "Policy blocks deletion before approval");
                const approval = last().approval;
                assert.equal(approval.physical, true);
                send({ type: "shown", id: approval.id });
                await wait(() => last().approval.shownAt !== null, "the action is drawn");
                fs.writeFileSync(offset, "1000");
                send({ type: "intent", intent: "confirm", id: approval.id, digest: approval.digest, source: "key" });
                await wait(() => fs.existsSync(victim) === false && server.requests.length === 2 && conn.count(P.SPEAK) > 0
                    || last()?.fault.kind === "error",
                    "the approved result returns as spoken words");
                assert.ok(conn.count(P.SPEAK) > 0, JSON.stringify(last()?.fault));
                assert.equal(fs.existsSync(victim), false);
                assert.equal(server.requests.length, 2);
                assert.ok(server.requests[1].body.messages.some(value => value.role === "tool" && value.tool_call_id === "delete_call"));
                // The words leave one response at a time, so the sentence
                // count is the barrier; the assertions below read the frames.
                const speakable = require(path.join(kit.folder, "Speakable.js")).create("", { tools: [] });
                const sentences = [...speakable.push(answer), ...speakable.finish()].length;
                await wait(() => conn.count(P.SPEAK) >= sentences + 1 && last()?.turn.kind === "none", "every sentence of the result is spoken");
                const observed = fs.readFileSync(frameAudits, "utf8").trim().split("\n").map(JSON.parse)
                    .filter(value => P.kind(value.frame) === P.SPEAK);
                const commentary = conn.events.filter(value => P.kind(value) === P.SPEAK);
                assert.deepEqual(commentary.map(P.words).slice(-2), ["Completed.", "Visit example."], "the voice reads the brain's sentences and nothing else of its result text");
                assert.ok(rows().some(row => row.kind === "action" && row.effect === "destructive" && row.confirmed === "physical"));
                assert.deepEqual(observed.map(value => value.frame), commentary);
                assert.deepEqual({ check: "commentary-audit-before-send", audited: observed.every(value =>
                    value.records.some(row => row.kind === "release" && row.decision === "send" && row.op === last().speech.op
                        && row.outcome === "pending" && row.args.labels === "[redacted]")) },
                    { check: "commentary-audit-before-send", audited: true },
                    "each outbound spoken frame has its own prior audit");
            } else if (only === "release") {
                await wait(() => last()?.approval.kind === "held", "the whole recipient set asks for file release");
                assert.equal(last().approval.purpose, "release");
                assert.ok(last().approval.text.includes(PROVIDERS.find(row => row.id === P.keyProvider).label),
                    "release names the selected account provider");
                assert.equal(last().approval.text.includes(P.row), false, "release shows no adapter id");
                assert.equal(server.requests.length, 1, "no tool result reaches the brain while release is held");
                send({ type: "intent", intent: "cancel", id: last().approval.id });
                await wait(() => server.requests.length === 2 && conn.count(P.SPEAK) > 0, "the refused release completes with a withheld result");
                assert.equal(server.requests.length, 2);
                const tool = server.requests[1].body.messages.find(value => value.role === "tool");
                assert.equal(tool.tool_call_id, "read_call");
                assert.equal(tool.content.includes("fixture"), false, "the private file does not leave for the brain");
                assert.ok(rows().some(row => row.kind === "release" && row.decision === "ask"));
                assert.ok(rows().some(row => row.kind === "release" && row.decision === "withhold"));
            } else if (only === "heard") {
                // The newest user message of the brain's request, by its index.
                const asked = async index => {
                    await wait(() => server.requests.length > index && server.requests[index].body !== null, "brain request " + index);
                    return server.requests[index].body.messages.filter(value => value.role === "user").at(-1).content;
                };
                const playing = () => messages.some(value => value.type === "state" && value.state.playback.kind === "playing");
                // An uninterrupted reply: both responses play out, the user
                // presses Talk and speaks, and the brain is told nothing more.
                await wait(playing, "the first reply reaches the speaker");
                await until(() => last().playback.kind === "idle" && last().turn.kind === "none" || child.exitCode !== null,
                    "the first reply plays out", 10000);
                send({ type: "intent", intent: "talk-down" });
                await wait(() => last().capture.kind === "open", "capture opens for the second turn");
                server.replies.push(BrainFixture.text("First part. Second part. Third part."));
                // 0.1 s of speech, then 20 s that the interruption cuts.
                conn.voice = [4800, 4800, 960000];
                const second = messages.length;
                P.turn(conn, "And now?");
                send({ type: "intent", intent: "talk-up" });
                assert.equal(await asked(1), "And now?", "an uninterrupted reply hands the brain no heard account");
                // Audio reports each paced write of at most 480 frames as one
                // level message. Twelve of them are more frames than the first
                // response's 2400 and the 1920 Audio holds back as unheard.
                await until(() => messages.slice(second).filter(value => value.type === "level" && value.level.playback > 0).length >= 12
                    || child.exitCode !== null, "the first response of the second reply is heard", 10000);
                send({ type: "intent", intent: "talk-down" });
                // Capture opens once Audio's flush report has come.
                await wait(() => last().capture.kind === "open" && last().playback.kind === "idle", "capture opens after the flush");
                server.replies.push(BrainFixture.text({ wait: heldReply }, "Late reply."));
                P.turn(conn, "Go on.");
                send({ type: "intent", intent: "talk-up" });
                assert.equal(await asked(2), "[interrupted] The user heard only this part of your last reply: \"First part.\"\n\nGo on.",
                    "the brain is told the responses that played in full");
                // The third turn is cut while the brain still thinks: no word of it was spoken.
                send({ type: "intent", intent: "talk-down" });
                await wait(() => last().capture.kind === "open", "capture opens for the fourth turn");
                server.replies.push(BrainFixture.text("Stopped."));
                P.turn(conn, "Stop.");
                send({ type: "intent", intent: "talk-up" });
                assert.equal(await asked(3), "[interrupted] The user heard none of your last reply.\n\nStop.",
                    "a reply cut before any response played reports an empty prefix");
                await wait(() => last()?.turn.kind === "none", "the last turn completes");
            } else {
                let requestClosed = false;
                server.requests[0].closed.then(() => { requestClosed = true; });
                if (only === "replacement") P.turn(conn, "And now?");
                else send({ type: "intent", intent: only === "interrupt" ? "talk-down" : "stop" });
                await wait(() => requestClosed, "cancel closes the old brain request");
                releaseReply();
                if (only === "replacement") {
                    await wait(() => server.requests.length === 2 && conn.count(P.SPEAK) > 0, "the new delegation returns after cancellation");
                    assert.equal(server.requests.length, 2);
                    const commentary = conn.events.filter(value => P.kind(value) === P.SPEAK);
                    assert.ok(commentary.every(value => !P.words(value).includes("Late")));
                } else {
                    if (only === "stale") {
                        await wait(() => last()?.conversation.kind === "ended", "stop ends delegated work");
                        await wait(() => conn.ended, "stop closes the old speech transport");
                    } else await wait(() => last()?.turn.kind === "none", "interrupt ends delegated work");
                    assert.ok(conn.events.filter(value => P.kind(value) === P.SPEAK).every(value => !P.words(value).includes("Late")),
                        "stale brain work never reaches the voice");
                }
                assert.equal(fs.existsSync(victim), true, "stale work starts no file action");
            }
            child.stdin.end();
            const [code, signal] = await closed;
            assert.equal(signal, null);
            assert.equal(code, 0, stderr);
            assert.equal(stderr.includes(KEY), false);
        } finally {
            clearTimeout(deadline); releaseReply();
            if (child.exitCode === null) { child.kill("SIGKILL"); await closed; }
            server.closeAll(); await server.close();
            fs.rmSync(victim, { force: true });
        }
    }

    // Gemini Live: the same rig, the Live API's message shapes. The adapter
    // names each user turn itself, so the rows read delegations by order.
    const INPUT = "realtimeInput";
    const GSPEAK = GEMINI.SPEAK;
    const gaudio = event => Buffer.from(event.realtimeInput.audio.data, "base64");
    const gsent = conn => Buffer.concat(conn.events.filter(event => geminiKind(event) === INPUT).map(gaudio));
    function gsame(event, expected, label) {
        assert.equal(event.realtimeInput.audio.mimeType, "audio/pcm;rate=16000", label + ": the Live API's input rate");
        const actual = gaudio(event);
        assert.ok(actual.equals(expected), label + ": " + actual.length + " bytes");
    }
    // Partial words of the user's turn, and its end as the server marks it.
    const gpart = (conn, text) => conn.send({ serverContent: { inputTranscription: { text } } });
    const gfinished = conn => conn.send({ serverContent: { inputTranscription: { finished: true } } });
    // A caption that reaches the wire proves every message before it was read.
    async function gmark(w, conn, text) {
        gpart(conn, " " + text);
        await until(() => w.state.fault.kind === "error" || w.transcripts.some(item => item.text.endsWith(text)), text + " is read");
    }
    // PCM samples as 16-bit little-endian bytes.
    const samples = values => Buffer.from(Int16Array.from(values).buffer);
    async function gconnecting(kit, options = {}) {
        const w = rig(kit, { ...options, protocol: GEMINI });
        w.dispatch("talk-down");
        return { w, conn: await main.accept(w) };
    }
    // The socket is open and setup has left; the server has not answered.
    async function gstarting(kit, options) {
        const { w, conn } = await gconnecting(kit, options);
        await conn.event("setup");
        return { w, conn };
    }
    async function grunning(kit, options) {
        const { w, conn } = await gstarting(kit, options);
        conn.play("setup-complete");
        w.sink.write(Buffer.alloc(960, 5));
        await conn.event(INPUT);
        w.dispatch("talk-up");
        await turn();
        w.clock.advance(100);
        await conn.event(INPUT);
        return { w, conn };
    }
    async function gconversing(kit, options) {
        const { w, conn } = await grunning(kit, options);
        conn.play("turn");
        await until(() => w.delegations.length === 1 || w.state.fault.kind === "error", "the turn reaches the brain");
        assert.equal(w.delegations.length, 1);
        return { w, conn };
    }
    async function gspeaking(kit, options) {
        const { w, conn } = await gconversing(kit, options);
        assert.equal(say(w, "It is noon."), true);
        await conn.event(GSPEAK);
        conn.send(gscript("reply-old"));
        return { w, conn };
    }

    async function groundTrip(kit) {
        const w = rig(kit, { protocol: GEMINI });
        const looked = lookups();
        w.dispatch("talk-down");
        assert.equal(lookups(), looked + 1, "the key is looked up when the session first needs it");
        assert.ok(w.handed.length === 1 && w.handed[0].every(byte => byte === 0), "the looked-up key is zeroed after the handshake");
        assert.deepEqual(w.urls.map(url => new URL(url).search), [""], "the engine's address carries no query: the key never enters a URL");
        const conn = await main.accept(w);
        assert.equal(conn.url, GEMINI_PATH + "?rig=" + w.id);
        assert.deepEqual([conn.headers["x-goog-api-key"], conn.headers.authorization], [KEY, undefined], "the key travels in Google's header alone");
        const setup = await conn.event("setup");
        assert.equal(conn.events.indexOf(setup), 0, "setup is the socket's first message");
        const guidance = kit.Guidance.compose("duplex", "duplex", "").instructions;
        const system = setup.setup.systemInstruction.parts[0].text;
        assert.ok(system.startsWith(guidance + "\n\n") && system.length > guidance.length + 2,
            "the voice's guidance, then the rule that it never answers on its own");
        assert.deepEqual({ ...setup.setup, systemInstruction: null }, { model: "models/" + GEMINI_ROW.model,
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } } },
            systemInstruction: null, inputAudioTranscription: {}, outputAudioTranscription: {},
            realtimeInputConfig: { activityHandling: "NO_INTERRUPTION" } });
        w.sink.write(Buffer.alloc(4800, 5));
        await turn();
        assert.equal(conn.count(INPUT), 0, "no audio before setupComplete");
        // Google may send a JSON message as a binary frame.
        conn.raw(Buffer.from(JSON.stringify(gscript("setup-complete"))), 2);
        gsame(await conn.event(INPUT), Buffer.alloc(3200, 5), "opening words wait for setupComplete, then leave once at 16 kHz");
        // Of each three samples at 24 kHz, the first and the mean of the
        // other two; the samples short of three wait for the next frame.
        w.sink.write(samples([0, 300, 600, 900, -1200, -1500, 7, 8]));
        gsame(await conn.event(INPUT), samples([0, 450, 900, -1350]), "the microphone is resampled to 16 kHz");
        w.sink.write(samples([10, 20, 31, 40]));
        gsame(await conn.event(INPUT), samples([7, 9, 20, 35]), "held samples lead the next frame");
        w.clock.advance(1000);
        await turn();
        assert.equal(conn.count(INPUT), 3, "no silence while capture feeds the session");
        w.dispatch("talk-up");
        await turn();
        w.clock.advance(100);
        gsame(await conn.event(INPUT), Buffer.alloc(3200), "released talk leaves the session on paced silence");
        w.clock.stall(2500);
        w.clock.advance(0);
        gsame(await conn.event(INPUT), Buffer.alloc(32000), "after a stalled loop at most 1 s of silence leaves, with no catch-up");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the user's turn reaches the brain");
        assert.equal(w.delegations[0].text, "What is the time?");
        assert.equal(say(w, "It is noon."), true);
        const spoken = await conn.event(GSPEAK);
        assert.deepEqual(spoken.clientContent, { turns: [{ role: "user", parts: [{ text: guidance + "\n\n" + JSON.stringify("It is noon.") }] }],
            turnComplete: true }, "one user turn: the voice's guidance, then the sentence as a JSON string");
        // A binary audio message and the text message after it keep their order.
        conn.raw(Buffer.from(JSON.stringify(gscript("reply-old"))), 2);
        conn.send(gscript("reply-old", 1));
        await until(() => bytes(w, 0x11) === 1440, "the reply reaches playback");
        assert.equal(bytes(w, 0x33), 0, "the voice's own answer to the turn never plays");
        assert.equal(w.transcripts.some(item => item.text.includes("twelve")), false, "nor is it captioned");
        assert.equal(w.phase, "speaking");
        w.clock.advance(1000);
        conn.play("late-old");
        await until(() => bytes(w, 0x11) === 1920, "later audio joins the playing reply");
        assert.deepEqual([w.state.playback.kind, w.starts], ["playing", 1], "a model turn in flight keeps its reply open");
        conn.play("done-old");
        await gmark(w, conn, "done");
        w.clock.advance(499);
        await turn();
        assert.equal(w.state.playback.kind, "playing", "the reply stays open for more words");
        w.clock.advance(1);
        await until(() => w.state.playback.kind === "idle", "the reply ends once no words wait");
        assert.deepEqual(w.collected, [], "the duplex engine collects no utterance");
        assert.equal(w.tools, 0, "the voice starts no action");
        assert.equal(w.state.fault.kind, "none");
        quiet(w, conn);
    }

    async function gpreview(kit) {
        const w = rig(kit, { protocol: GEMINI, voice: "Puck" });
        w.dispatch("preview");
        const conn = await main.accept(w);
        assert.equal(GEMINI.voice(await GEMINI.open(conn)), "Puck", "the chosen voice speaks");
        assert.equal(w.sink, null, "no microphone opens");
        assert.equal(GEMINI.words(await conn.event(GSPEAK)), PREVIEW_LINE, "the preview's sentence, exactly");
        conn.play("reply-old");
        conn.play("done-old");
        await until(() => bytes(w, 0x11) === 1440, "the sentence reaches playback");
        w.clock.advance(500);
        await until(() => w.state.playback.kind === "idle", "the sentence plays out");
        w.clock.advance(0);
        await until(() => w.state.conversation.kind === "ended", "the played preview ends the conversation");
        assert.deepEqual([w.delegations.length, w.tools, w.state.fault.kind], [0, 0, "none"], "a preview asks no brain and starts nothing");
        quiet(w, conn);
        const other = rig(kit, { protocol: GEMINI, voice: "marin" });
        const opened = main.conns.length;
        other.dispatch("preview");
        await until(() => other.state.fault.kind === "error", "a voice Gemini does not offer fails the session");
        fault(other, "live=voice");
        assert.equal(main.conns.length, opened, "it opens no connection");
    }

    // The voice answers each user turn on its own. Words wait while that
    // turn runs, since the next model turn's audio would be taken for
    // theirs; its audio never plays, and its end ends the user's turn.
    async function gunbidden(kit) {
        const { w, conn } = await grunning(kit);
        gpart(conn, "What is the time?");
        for (const index of [0, 1, 2]) conn.send(gscript("unbidden", index));
        await until(() => w.delegations.length === 1, "the generation's end ends the user's turn");
        const asked = () => w.judged.filter(item => item.content.startsWith('{"clientContent"')).length;
        assert.equal(say(w, "It is noon."), true);
        assert.equal(asked(), 0, "no words leave while the voice's own turn runs");
        conn.send(gscript("unbidden", 3));
        assert.equal(GEMINI.words(await conn.event(GSPEAK)), "It is noon.", "the words leave once that turn completes");
        conn.play("reply-old");
        conn.play("done-old");
        await until(() => bytes(w, 0x11) === 1440, "the asked words play");
        gpart(conn, " Then?");
        conn.send(gscript("unbidden"));
        conn.send({ serverContent: { turnComplete: true } });
        await until(() => w.delegations.length === 2, "an unasked turnComplete alone ends the user's turn");
        assert.equal(w.delegations[1].text.trim(), "Then?");
        assert.deepEqual([bytes(w, 0x33), w.state.fault.kind], [0, "none"], "the voice's own answers never play");
    }

    // A JSON message in a binary frame and the text message after it keep their order.
    async function gbinary(kit) {
        const { w, conn } = await gconversing(kit);
        assert.equal(say(w, "It is noon."), true);
        await conn.event(GSPEAK);
        conn.raw(Buffer.from(JSON.stringify(gscript("reply-old"))), 2);
        conn.play("done-old");
        await until(() => bytes(w, 0x11) === 1440 || w.state.fault.kind === "error", "the binary audio plays before the turn's end");
        assert.equal(bytes(w, 0x11), 1440);
    }

    // An unasked turn that never ends holds every later word: it faults.
    async function gunbiddenTimeout(kit) {
        const { w, conn } = await grunning(kit);
        conn.send(gscript("unbidden"));
        await gmark(w, conn, "unasked");
        await elapse(w, 29000);
        assert.equal(w.state.fault.kind, "none");
        await elapse(w, 1000);
        fault(w, "live=response-timeout");
        await until(() => conn.ended, "an unasked turn that never ends closes the socket");
    }

    // A cut model turn while words are asked for is not those words' audio.
    async function ginterrupted(kit) {
        const { w, conn } = await gspeaking(kit);
        await until(() => bytes(w, 0x11) === 1440, "the first audio plays");
        conn.play("interrupted");
        conn.send(gscript("reply-new"));
        conn.play("done-new");
        assert.equal(say(w, "Nothing changed."), true);
        assert.equal(GEMINI.words(await conn.event(GSPEAK)), "Nothing changed.", "the cut turn's end lets the next words leave");
        await gmark(w, conn, "cut");
        assert.equal(bytes(w, 0x22), 0, "audio after the cut never plays");
        assert.equal(w.state.fault.kind, "none");
    }

    async function gcaptions(kit) {
        const { w, conn } = await gconversing(kit);
        assert.equal(say(w, "It is noon."), true);
        await conn.event(GSPEAK);
        conn.play("reply-old");
        conn.play("done-old");
        assert.equal(say(w, "Nothing changed."), true);
        await conn.event(GSPEAK);
        conn.play("reply-new");
        conn.play("done-new");
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "captions reach the wire");
        assert.deepEqual(w.transcripts, [
            { role: "user", text: "What is", stage: "partial", rev: 1 },
            { role: "user", text: "What is the time?", stage: "partial", rev: 2 },
            { role: "user", text: "What is the time?", stage: "final", rev: 3 },
            { role: "assistant", text: "It is noon.", stage: "partial", rev: 4 },
            { role: "assistant", text: "It is noon. Nothing changed.", stage: "partial", rev: 5 },
            { role: "assistant", text: "It is noon. Nothing changed.", stage: "final", rev: 6 },
            { role: "user", text: "Stop.", stage: "partial", rev: 7 },
            { role: "user", text: "Stop. What changed?", stage: "partial", rev: 8 },
            { role: "user", text: "Stop. What changed?", stage: "final", rev: 9 }
        ], "the voice's own answer is never captioned");
        assert.equal(w.delegations[1].text, "Stop. What changed?", "a finished transcription ends the user's turn");
        quiet(w, conn);
    }

    // A flush drops the words not yet asked for and the rest of the cut turn.
    async function ginterruptPlaying(kit) {
        const { w, conn } = await gconversing(kit);
        const stale = w.delegations[0].delegation;
        assert.equal(say(w, "It is noon."), true);
        assert.equal(say(w, "It was noon before."), true);
        await conn.event(GSPEAK);
        conn.play("reply-old");
        await until(() => bytes(w, 0x11) === 1440, "the old reply plays");
        w.dispatch("talk-down");
        assert.equal(w.flushes, 1);
        assert.equal(w.engine.commentary(stale, kit.Policy.item("Late words.", ["speech"])), false, "an interrupted request takes no more words");
        conn.play("late-old");
        conn.play("done-old");
        conn.play("turn-next");
        await until(() => w.delegations.length === 2, "the new turn arrives");
        assert.equal(conn.count(GSPEAK), 1, "the words waiting behind the cut turn never leave");
        assert.equal(w.played.filter(item => item.flush === 1).length, 0, "no audio of the cut turn after the flush");
        assert.equal(say(w, "Nothing changed."), true);
        assert.equal(GEMINI.words(await conn.event(GSPEAK)), "Nothing changed.");
        conn.play("reply-new");
        w.dispatch("talk-up");
        await until(() => bytes(w, 0x22) === 1440, "the reply to the new turn plays");
        assert.equal(bytes(w, 0x11), 1440, "no audio of the cut turn plays later");
        assert.equal(w.state.fault.kind, "none");
    }

    // The sentences of a played reply are what the user heard.
    async function gheardAccount(kit) {
        const { w, conn } = await gconversing(kit);
        const request = w.delegations[0].delegation;
        for (const sentence of ["It is noon.", "It was noon before."]) {
            assert.equal(say(w, sentence), true);
            await conn.event(GSPEAK);
            conn.play("reply-old");
            conn.play("done-old");
        }
        await until(() => bytes(w, 0x11) === 2880, "both sentences reach playback");
        const playing = w.engine.heard(request);
        assert.deepEqual([playing.pending, playing.text({ source: w.state.speech.op, heardFrames: 720 })], [true, "It is noon."],
            "a sentence counts once the heard frames reach its end");
        w.clock.advance(500);
        await until(() => w.state.playback.kind === "idle", "the reply plays out");
        assert.equal(w.engine.heard(request).text(null), "It is noon. It was noon before.", "a reply played out was heard whole");
    }

    async function glabels(kit) {
        const { w, conn } = await gconversing(kit);
        const before = w.judged.length;
        assert.equal(w.engine.commentary(w.delegations[0].delegation, kit.Policy.item("The file says noon.", ["speech", "file"])), true);
        const frame = await conn.event(GSPEAK);
        const judged = w.judged.slice(before).filter(item => geminiKind(JSON.parse(item.content)) === GSPEAK);
        assert.deepEqual(judged.map(item => [JSON.parse(item.content), [...item.labels].sort()]), [[frame, ["file", "speech"]]],
            "words read from a file leave under the file label");
    }

    // One model turn at a time, each bounded, the next once playback has
    // drained the reply.
    async function gpacing(kit) {
        const { w, conn } = await grunning(kit);
        w.dispatch("talk-down");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the held turn arrives");
        const long = "word ".repeat(119) + "end.";
        assert.equal(say(w, long), true);
        assert.equal(say(w, "It is noon."), true);
        const first = await conn.event(GSPEAK);
        await turn();
        assert.equal(conn.count(GSPEAK), 1, "the next words wait for the turn in flight");
        assert.ok([...GEMINI.words(first)].length <= 240 && long.startsWith(GEMINI.words(first)), "one turn carries a bounded part of a long sentence");
        const chunk = gscript("reply-old");
        chunk.serverContent.modelTurn.parts[0].inlineData.data = Buffer.alloc(65536).toString("base64");
        for (let index = 0; index < 2; index++) conn.send(chunk);
        conn.play("done-old");
        await gmark(w, conn, "full");
        await elapse(w, 1000);
        assert.equal(conn.count(GSPEAK), 1, "the next words wait while the reply still holds its audio");
        w.dispatch("talk-up");
        await until(() => w.played.length > 0, "the waiting reply plays");
        w.clock.advance(100);
        const second = await conn.event(GSPEAK);
        assert.equal(GEMINI.words(first) + GEMINI.words(second), long.slice(0, (GEMINI.words(first) + GEMINI.words(second)).length),
            "the sentence continues in order");
    }

    async function greplyQueue(kit) {
        const { w, conn } = await grunning(kit);
        w.dispatch("talk-down");
        conn.play("turn");
        await until(() => w.delegations.length === 1, "the held turn arrives");
        assert.equal(say(w, "It is noon."), true);
        await conn.event(GSPEAK);
        const chunk = gscript("reply-old");
        chunk.serverContent.modelTurn.parts[0].inlineData.data = Buffer.alloc(65536).toString("base64");
        for (let index = 0; index < 19; index++) conn.send(chunk);
        await gmark(w, conn, "kept");
        assert.equal(w.state.fault.kind, "none", "a queue under the playback allowance is kept");
        for (let index = 0; index < 2; index++) conn.send(chunk);
        await until(() => w.state.fault.kind === "error", "past the allowance the reply faults");
        fault(w, "live=output-overflow");
    }

    // Each finished turn reaches the brain once; words after it start the next.
    async function gdelegation(kit) {
        const { w, conn } = await gconversing(kit);
        const task = w.delegations[0];
        gpart(conn, " ");
        gfinished(conn);
        const before = w.transcripts.length;
        await gmark(w, conn, "blank");
        assert.deepEqual([w.delegations.length, w.transcripts.length], [1, before + 1], "a blank turn reaches no brain and no caption");
        gfinished(conn);
        await until(() => w.delegations.length === 2, "the probe's turn ends");
        gpart(conn, "later");
        gfinished(conn);
        await until(() => w.delegations.length === 3, "trailing words start the next turn");
        assert.deepEqual(w.delegations.map(item => item.text.trim()), ["What is the time?", "blank", "later"], "no words reach the brain twice");
        assert.equal(new Set(w.delegations.map(item => item.delegation)).size, 3, "each turn has its own identity");
        assert.equal(w.engine.commentary(task.delegation, kit.Policy.item("Stale words.", ["speech"])), false, "a replaced request takes no more words");
        assert.equal(say(w, "It is noon."), true);
        assert.equal(say(w, "It was noon before."), true);
        await conn.event(GSPEAK);
        conn.send(gscript("reply-old"));
        conn.play("turn-next");
        await until(() => w.delegations.length === 4, "a new turn replaces the request");
        conn.play("done-old");
        await gmark(w, conn, "replaced");
        assert.equal(w.judged.filter(item => item.content.startsWith('{"clientContent"')).length, 1, "words waiting for a replaced request never leave");
        w.dispatch("stop");
        assert.equal(say(w, "Late words."), false, "an ended conversation speaks no words");
        assert.equal(w.tools, 0);
    }

    // Every message the session causes and does not read, a 1 MiB frame and a turn at its bound.
    async function gunread(kit) {
        const { w, conn } = await gspeaking(kit);
        conn.play("unread");
        const frame = JSON.stringify({ usageMetadata: { pad: "" } });
        conn.raw(frame.replace('"pad":""', '"pad":"' + "m".repeat(FRAME - frame.length) + '"'));
        conn.play("done-old");
        gpart(conn, "x".repeat(TURN));
        gfinished(conn);
        await until(() => w.delegations.length === 2 || w.state.fault.kind === "error", "the unread messages are judged");
        assert.equal(w.state.fault.kind, "none", "unread messages, a 1 MiB frame and a turn at its bound are kept");
    }

    const gcompleted = change => conn => conn.raw(goff("turn", change));
    const gaudioRow = change => conn => conn.raw(goff("reply-old", event => {
        Object.assign(event.serverContent.modelTurn.parts[0].inlineData, change);
        return event;
    }));
    const growsList = [
        ["go-away", grunning, conn => conn.play("go-away"), "live=go-away"],
        ["tool-call", grunning, conn => conn.play("tool-call"), "live=message type=toolCall"],
        ["tool-cancel", grunning, conn => conn.play("tool-cancel"), "live=message type=toolCallCancellation"],
        ["unknown", grunning, conn => conn.raw(JSON.stringify({ realtimeOutput: {} })), "live=message type=realtimeOutput"],
        ["two-kinds", grunning, conn => conn.raw(JSON.stringify({ ...gscript("setup-complete"), ...gscript("turn") })), "live=frame-shape"],
        ["grounding", grunning, conn => conn.raw(JSON.stringify({ serverContent: { groundingMetadata: {} } })), "live=content field=groundingMetadata"],
        ["function-part", gspeaking, conn => conn.raw(JSON.stringify({ serverContent: { modelTurn: { parts: [{ functionCall: { name: "files_delete" } }] } } })),
            "live=part"],
        ["rate", gspeaking, gaudioRow({ mimeType: "audio/pcm;rate=16000" }), "live=format"],
        ["wav", gspeaking, gaudioRow({ mimeType: "audio/wav" }), "live=format"],
        ["odd-audio", gspeaking, gaudioRow({ data: "AAAA" }), "live=output-audio"],
        ["not-base64", gspeaking, gaudioRow({ data: "AAAAAA=A" }), "live=output-audio"],
        ["flag", grunning, conn => conn.raw(JSON.stringify({ serverContent: { turnComplete: "yes" } })), "live=frame-shape"],
        ["transcript-shape", grunning, gcompleted(event => ({ serverContent: { inputTranscription: { text: 7 } } })), "live=frame-shape"],
        ["turn-size", grunning, conn => gpart(conn, "x".repeat(TURN + 1)), "live=turn-size"],
        ["json", grunning, conn => conn.raw("{"), "live=frame-json"],
        ["binary", grunning, conn => conn.raw(Buffer.from([0xff, 0xfe]), 2), "live=frame-binary"],
        ["frame-size", grunning, conn => conn.raw("x".repeat(FRAME + 1)), "live=frame-size"],
        ["shape", grunning, conn => conn.raw("[1]"), "live=frame-shape"],
        ["setup-twice", grunning, conn => conn.play("setup-complete"), "live=event-order"],
        ["early-turn", gstarting, conn => conn.play("turn"), "live=event-order"],
        ["input-frame", grunning, (conn, w) => { w.dispatch("talk-down"); w.sink.write(Buffer.alloc(3)); }, "live=input-frame"],
        ["reset", grunning, conn => conn.socket.destroy(), "live=disconnected code=1006"]
    ];
    async function gfailures(kit, only = null) {
        const selected = growsList.filter(([name]) => only === null || name === only);
        assert.ok(selected.length > 0, "fault row " + only);
        for (const [name, stage, act, reason] of selected) {
            const { w, conn } = await stage(kit);
            const delegations = w.delegations.length;
            act(conn, w);
            if (stage === gstarting) conn.play("setup-complete");
            await gmark(w, conn, "probe");
            fault(w, reason);
            assert.equal(w.state.speech.kind, "closed", name + " releases the session");
            assert.equal(w.state.conversation.kind, "ended", name + " ends the conversation: no silent provider switch");
            assert.deepEqual([w.delegations.length, w.tools], [delegations, 0], name + " reaches no brain and no action");
            await until(() => conn.ended, name + " closes the socket");
            quiet(w, conn);
        }
    }

    async function gredirect(kit) {
        const w = rig(kit, { protocol: GEMINI, redirect: true });
        w.dispatch("talk-down");
        await until(() => w.state.fault.kind === "error", "a redirect ends the conversation");
        fault(w, "live=disconnected code=1006");
        await turn();
        assert.equal([...main.conns, ...other.conns].filter(conn => conn.rig === String(w.id)).length, 0, "no connection follows the redirect");
        quiet(w);
    }

    async function gstartTimeout(kit) {
        const { w, conn } = await gstarting(kit);
        await elapse(w, 19999);
        assert.equal(w.state.fault.kind, "none");
        w.clock.advance(1);
        fault(w, "live=start-timeout");
        await until(() => conn.ended, "start timeout closes the socket");
    }

    async function gresponseTimeout(kit) {
        const { w, conn } = await gspeaking(kit);
        await elapse(w, 29999);
        assert.equal(w.state.fault.kind, "none");
        w.clock.advance(1);
        fault(w, "live=response-timeout");
        await until(() => conn.ended, "a model turn that never ends closes the socket");
    }

    async function gkeys(kit) {
        const looked = lookups();
        const elsewhere = rig(kit, { protocol: GEMINI, key: "elsewhere" });
        elsewhere.dispatch("talk-down");
        fault(elsewhere, "net=key-origin");
        assert.equal(lookups(), looked, "a key bound to another origin is refused before any lookup");
        const missing = rig(kit, { protocol: GEMINI, key: null });
        missing.dispatch("talk-down");
        fault(missing, "live=no-key");
        await turn();
        const own = [elsewhere.id, missing.id].map(String);
        assert.equal([...main.conns, ...other.conns].filter(conn => own.includes(conn.rig)).length, 0, "no connection without a usable key");
        quiet(elsewhere);
    }

    async function grelease(kit) {
        const { w, conn } = await gstarting(kit);
        conn.play("setup-complete");
        w.sink.write(Buffer.alloc(960, 5));
        await until(() => w.state.fault.kind === "error", "a withheld frame faults");
        fault(w, "live=release-withhold");
        await until(() => conn.ended, "the withheld session closes");
        assert.equal(conn.count(INPUT), 0, "a withheld frame writes nothing");
    }

    async function greleaseConnect(kit) {
        const w = rig(kit, { protocol: GEMINI });
        w.dispatch("talk-down");
        fault(w, "live=release-withhold");
        await turn();
        assert.equal(main.conns.filter(conn => conn.rig === String(w.id)).length, 0, "a withheld connection opens no socket");
    }

    // The full opening fits and leaves after setupComplete, in order.
    async function gopening(kit) {
        const { w: early } = await gstarting(kit);
        for (let sent = 0; sent < OPENING; sent += 48000) early.sink.write(Buffer.alloc(48000));
        assert.equal(early.state.fault.kind, "none", "20 s of opening words fit");
        early.sink.write(Buffer.alloc(2));
        fault(early, "live=input-overflow");
        const { w, conn } = await gstarting(kit);
        for (let index = 0; index < 20; index++) w.sink.write(Buffer.alloc(48000, index + 1));
        conn.play("setup-complete");
        const all = Buffer.concat(Array.from({ length: 20 }, (_, index) => Buffer.alloc(32000, index + 1)));
        const deadline = Date.now() + 2000;
        while (gsent(conn).length < all.length && w.state.fault.kind === "none") {
            assert.ok(Date.now() < deadline, "the opening drains");
            w.clock.advance(100);
            await new Promise(resolve => setTimeout(resolve, 2));
        }
        assert.equal(w.state.fault.kind, "none", "the full opening never meets the send backlog");
        assert.ok(gsent(conn).subarray(0, all.length).equals(all), "every opening byte leaves once, in order");
    }

    async function gbacklog(kit) {
        const { w, conn } = await grunning(kit);
        const count = conn.count(INPUT);
        w.backlog = BACKLOG;
        w.clock.advance(100);
        await until(() => conn.count(INPUT) === count + 1, "a frame leaves with the socket at the bound");
        assert.equal(w.state.fault.kind, "none", "a backlog at the bound is kept");
        w.backlog = BACKLOG + 1;
        w.clock.advance(100);
        fault(w, "live=send-backlog");
    }

    async function gclosing(kit) {
        const { w, conn } = await grunning(kit);
        w.dispatch("stop");
        await until(() => conn.ended, "stop closes the socket");
        assert.deepEqual([w.state.speech.kind, w.state.fault.kind], ["closed", "none"]);
        const lease = await grunning(kit);
        lease.w.runner.close();
        await until(() => lease.conn.ended, "lease loss closes the socket");
    }

    // Idle is 60 s with no user words, no words for the voice and no reply.
    async function gidle(kit) {
        const { w, conn } = await grunning(kit);
        await elapse(w, 59000);
        gpart(conn, "Hello");
        await restarted(w, "the user's words restart the idle wait");
        await elapse(w, 59000);
        assert.equal(conn.ended, false, "words restart the idle wait");
        await elapse(w, 999);
        assert.equal(conn.ended, false, "no close before 60 s");
        w.clock.advance(1);
        await until(() => conn.ended, "idle closes the socket");
        assert.deepEqual([w.state.conversation.kind, w.state.fault.kind], ["ended", "none"]);
    }

    const cases = { roundTrip, preview, idle, idleRestarts, idleTurn, idleThinking, idleApproval, closing, captions, interruptPlaying,
        interruptQueued, replacedReply, heardAccount, replyDue, replyDueCarried, releaseDue, labels, failures, unread, redirect,
        startTimeout, responseTimeout, keys, opening, releaseLifetime, pacing, replyQueue, backlog, delegation, lineQueue, violations,
        daemonDelegation, daemonStale: kit => daemonDelegation(kit, "stale"), daemonRelease: kit => daemonDelegation(kit, "release"),
        daemonReplacement: kit => daemonDelegation(kit, "replacement"), daemonInterrupt: kit => daemonDelegation(kit, "interrupt"),
        daemonHeard: kit => daemonDelegation(kit, "heard"), daemonPreview: kit => daemonDelegation(kit, "preview"),
        groundTrip, gpreview, gunbidden, gunbiddenTimeout, gbinary, ginterrupted, gcaptions, ginterruptPlaying, gheardAccount, glabels,
        gpacing, greplyQueue, gdelegation, gunread, gfailures, gredirect, gstartTimeout, gresponseTimeout, gkeys, gopening, gbacklog,
        gclosing, gidle,
        ...Object.fromEntries(["action", "stale", "release", "replacement", "interrupt", "heard", "preview"]
            .map(only => ["geminiDaemon-" + only, kit => daemonDelegation(kit, only, GEMINI)])) };
    const withheld = ["Policy.js", "const current = item(value.content, value.labels);",
        'const current = item(value.content, value.labels);\n    if (String(current.content).includes("input_audio_buffer.append")) return { kind: "withhold", content: "[withheld]", labels: current.labels };'];
    const withheldConnect = ["Policy.js", "const current = item(value.content, value.labels);",
        'const current = item(value.content, value.labels);\n    if (String(current.content).includes("/v1/realtime")) return { kind: "withhold", content: "[withheld]", labels: current.labels };'];
    const geminiWithheld = ["Policy.js", "const current = item(value.content, value.labels);",
        'const current = item(value.content, value.labels);\n    if (String(current.content).startsWith(\'{"realtimeInput"\')) return { kind: "withhold", content: "[withheld]", labels: current.labels };'];
    const geminiWithheldConnect = ["Policy.js", "const current = item(value.content, value.labels);",
        'const current = item(value.content, value.labels);\n    if (String(current.content).includes("/ws/")) return { kind: "withhold", content: "[withheld]", labels: current.labels };'];
    let controls = 0;
    async function control(name, needle, replacement, check, adapter = REALTIME) {
        await mutant(path.join(backend, adapter.file), name, needle, replacement, async (_module, folder) => check(folder), adapter.file);
        controls++;
        console.log("control=" + name + " detected");
    }
    try {
        for (const check of Object.values(cases)) await check(kitFrom(backend));
        await release(kitFrom(backend, [withheld]));
        // The shipped engine hands the chosen voice and the preview to the session.
        for (const P of [REALTIME, GEMINI])
            for (const [name, needle, replacement] of [["engine-voice", "voice: plan.speech.voice,", 'voice: "marin",'],
                ["engine-preview", "preview: e.preview === true ? PREVIEW_LINE : null,", "preview: null,"]]) {
                await assert.rejects(() => daemonDelegation(kitFrom(backend, [["ChainedEngine.js", needle, replacement]]), "preview", P),
                    assert.AssertionError, name + " must turn the daemon preview red");
                controls++;
                console.log("control=" + P.setting + "-" + name + " detected");
            }
        await releaseConnect(kitFrom(backend, [withheldConnect]));
        await grelease(kitFrom(backend, [geminiWithheld]));
        await greleaseConnect(kitFrom(backend, [geminiWithheldConnect]));
        const as = name => folder => cases[name](kitFrom(folder));
        const row = name => folder => failures(kitFrom(folder), name);
        const restart = name => folder => idleRestarts(kitFrom(folder), name);
        const disconnected = 'answer.events.addEventListener("close", event => failed(session, "live=disconnected code=" + event.code));';
        const mutations = [
            ["no-tools", "output_modalities: [\"audio\"], tools: [],", 'output_modalities: ["audio"], tools: [{ type: "function", name: "files_delete" }],', as("roundTrip")],
            ["no-own-answer", "create_response: false", "create_response: true", as("roundTrip")],
            ["no-voice", "output: { format: FORMAT, voice } }", "output: { format: FORMAT } }", as("preview")],
            ["voice-unjudged", 'if (!VOICES.some(row => row.value === voice)) fail("voice");', "", as("preview")],
            ["no-preview", "commentary(PREVIEW, Policy.item(session.preview, [\"desktop\"]));", "", as("preview")],
            ["preview-unended", "session.timers.preview = clock.set(() => { session.timers.preview = null; session.events.idle(); }, 0);", "void session;", as("preview")],
            ["no-trace", "...provider.noStore } };", "} };", as("roundTrip")],
            ["out-of-band", 'response: { conversation: "none", ', "response: { ", as("roundTrip")],
            ["exact-words", '+ "\\n\\n" + JSON.stringify(words.text)', '+ "\\n\\n" + JSON.stringify("")', as("roundTrip")],
            ["voice-guidance", 'instructions: session.reader + "\\n\\n" + JSON.stringify(words.text)', "instructions: JSON.stringify(words.text)", as("roundTrip")],
            ["frame-labels", "}, [words.item]);", "});", as("labels")],
            ["reply-due", "session.events.due(true);", "", as("replyDue")],
            ["reply-due-carried", 'if (session.next === null && !(session.playing !== null && session.playing.kind === "open")) session.events.due(true);',
                "session.events.due(true);", as("replyDue")],
            ["reply-due-waiting", "if (session.next === null && !(session.playing", "if (!(session.playing", as("replyDueCarried")],
            ["reply-due-ended", 'session.playing !== null && session.playing.kind === "open")) session.events.due(true);',
                "session.playing !== null)) session.events.due(true);", as("replyDueCarried")],
            ["release-due", "release(session);\n            session.events.due(false);", "release(session);", as("releaseDue")],
            ["delegation-dispatch", "session.events.delegation({ id: event.item, text: clean(event.text) });", "void event;", as("delegation")],
            ["blank-turn", 'if (event.text.trim() === "") break;', "", as("delegation")],
            ["stale-delegation", " || session.delegation !== id) return false;", ") return false;", as("delegation")],
            ["replaced-words", "// Words still waiting answer the request this one replaces.\n                session.speech.queue = [];\n                session.speech.chars = 0;", "", as("delegation")],
            ["line-replace", "const waiting = session.speech.queue.findIndex(words => words.line === true);",
                "const waiting = -1;", as("lineQueue")],
            ["line-drop-for-reply", "session.speech.queue = session.speech.queue.filter(words => !words.line);",
                "session.speech.queue = session.speech.queue;", as("lineQueue")],
            ["flush-delegation", 'session.delegation = null;\n            conclude(session, "assistant");', 'conclude(session, "assistant");', as("interruptPlaying")],
            ["flush-words", 'session.speech.queue = [];\n            session.speech.chars = 0;\n            if (session.speech.active', "if (session.speech.active", as("interruptPlaying")],
            ["discard", "if (!active.discarded) output(session, active, event.pcm);", "output(session, active, event.pcm);", as("interruptPlaying")],
            ["flush-queue", "if (session.next !== null) session.next.stream.destroy();\n            session.next = null;\n            // Audio's",
                "// Audio's", as("interruptQueued")],
            ["one-response", 'if (session.state.kind !== "running" || speech.active !== null || ', 'if (session.state.kind !== "running" || ', as("pacing")],
            ["drained-reply", " || waiting > REPLY_LOW_BYTES)", ")", as("pacing")],
            ["speech-bound", "slice(0, SPEECH_CHARS)", "slice(0)", as("pacing")],
            ["speech-queue", 'if (session.speech.chars + prefix.length > QUEUE_CHARS) fail("speech-queue");', "", as("pacing")],
            ["violation-count", "const counts = Speakable.violations(text, session.language);", 'const counts = Speakable.violations("", session.language);', as("violations")],
            ["idle-rule", "}, IDLE_MS);", "}, IDLE_MS + 1);", as("idle")],
            ["speech-activity", 'case "activity": activity(session); break;', 'case "activity": break;', as("idle")],
            ["hearing-activity", 'case "hearing":\n                activity(session);', 'case "hearing":', as("idleTurn")],
            ["heard-activity", 'case "heard":\n                activity(session);', 'case "heard":', as("idleTurn")],
            ["heard-activity-thinking", 'case "heard":\n                activity(session);', 'case "heard":', as("idleThinking")],
            ["capture-activity", "        activity(session);\n        return sink;", "        return sink;", restart("capture")],
            ["spoken-activity", 'clear(session, "words");\n                activity(session);', 'clear(session, "words");', restart("response-end")],
            ["flush-activity", "session.taken = null;\n            activity(session);\n        }\n    };", "session.taken = null;\n        }\n    };",
                restart("interrupt")],
            ["heard-flush", "session.playing = null;\n            session.taken = null;", "session.playing = null;", as("heardAccount")],
            ["idle-again", "session.events.idle();\n            // Session leaves a turn in flight to its own deadline and keeps\n            // this session open; the wait then runs again.\n            activity(session);",
                "session.events.idle();", as("idleApproval")],
            ["replaced-reply-end", "// A playing reply with no words left to wait for ends after its gap.\n                settle(session);", "", as("replacedReply")],
            ["heard-frames", "taken.marks.filter(mark => mark.end <= bytes)", "taken.marks", as("heardAccount")],
            ["heard-source", "report !== null && report.source === op ?", "report !== null ?", as("heardAccount")],
            ["heard-played", "session.said.push(...session.taken.marks);", "", as("heardAccount")],
            ["heard-request", "\n                    .filter(mark => mark.request === id)", "", as("heardAccount")],
            ["heard-other-request", "if (session === null || session.delegation !== id) return null;", "if (session === null) return null;", as("heardAccount")],
            ["heard-pending", "pending: replyPending(session),", "pending: false,", as("heardAccount")],
            ["reply-end-activity", 'clear(session, "gap");\n            activity(session);\n        });', 'clear(session, "gap");\n        });', as("idle")],
            ["idle-reply", "if (session.playing !== null || session.next !== null || !quiet(session)) return;", "if (!quiet(session)) return;", as("idle")],
            ["idle-words", "if (session.playing !== null || session.next !== null || !quiet(session)) return;",
                "if (session.playing !== null || session.next !== null) return;", as("idle")],
            ["close", "if (live !== null && live.op === e.target) release(live);", "", as("closing")],
            ["lease-release", "if (session === null) return;\n            release(session);", "if (session === null) return;", as("closing")],
            ["server-error", 'return fail("server-error type="', 'return { kind: "ignored" }; return fail("server-error type="', row("error")],
            ["response-status", 'if (response.status !== "completed") {', "if (false) {", row("response-failed")],
            ["response-cause", '(plain(details.error) ? " type=" + token(details.error.type) + " code=" + token(details.error.code) : "")', '""',
                row("response-failed")],
            ["response-reason", '(details.reason === undefined ? "" : " reason=" + token(details.reason))', '""', row("response-incomplete")],
            ["token-null", 'typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value)', "/^[A-Za-z0-9_.-]{1,64}$/.test(value)", row("error-null-code")],
            ["token-text", 'typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value', 'typeof value === "string" ? value', row("error-text-code")],
            ["transcription-failed", 'return fail("transcription code="', 'return { kind: "ignored" }; return fail("transcription code="', row("transcription-failed")],
            ["function-call", 'return fail("event type=" + token(value.type));', 'return { kind: "ignored" };', row("function-call")],
            ["unrequested", 'return fail("event type=" + token(value.type));', 'return { kind: "ignored" };', row("unrequested")],
            ["unasked-response", "if (active === null || (created", "if (active !== null && (created", row("unasked-response")],
            ["second-response", "(created ? active.id !== null : active.id !== id)", "(!created && active.id !== id)", row("second-response")],
            ["other-response", "(created ? active.id !== null : active.id !== id)", "(created && active.id !== null)", row("other-response")],
            ["item-id", ' || value === "" || value.length > 512) fail("frame-shape");', ' || value.length > 512) fail("frame-shape");', row("item-id")],
            ["item-id-type", 'if (typeof value !== "string" || value === ""', 'if (value === ""', row("item-id-type")],
            ["item-id-size", ' || value.length > 512) fail("frame-shape");', ') fail("frame-shape");', row("item-id-size")],
            ["transcript-shape", 'if (typeof value.transcript !== "string") fail("frame-shape");', "", row("transcript-shape")],
            ["turn-size", 'if (value.transcript.length > TURN_CHARS) fail("turn-size");', "", row("turn-size")],
            ["partial-shape", 'if (value.delta !== undefined && typeof value.delta !== "string") fail("frame-shape");', "", row("partial-shape")],
            ["words-shape", 'if (typeof value.delta !== "string") fail("frame-shape");\n        return { kind: "said"', 'return { kind: "said"', row("words-shape")],
            ["frame-json", 'catch { fail("frame-json"); }', 'catch { return { kind: "ignored" }; }', row("json")],
            ["frame-binary", 'if (typeof data !== "string") fail("frame-binary");', "", row("binary")],
            ["frame-size", 'if (data.length > FRAME_CHARS) fail("frame-size");', "", row("frame-size")],
            ["frame-shape", 'if (!plain(value) || typeof value.type !== "string") fail("frame-shape");', "", row("shape")],
            ["output-odd", 'if (pcm.length % 2 !== 0) fail("output-audio");', "", row("odd-audio")],
            ["output-base64", " || !BASE64.test(value.delta)", "", row("not-base64")],
            ["created-order", 'if (kind !== "connecting") fail("event-order");', "", row("created-twice")],
            ["updated-order", 'if (kind !== "starting") fail("event-order");', "", row("updated-twice")],
            ["input-frame", 'if (pcm.length % 2 !== 0) { failed(session, "live=input-frame"); return; }', "", row("input-frame")],
            ["disconnected", disconnected, "", row("reset")],
            ["redirect", disconnected, "", as("redirect")],
            ["format", '\n                fail("format");', "\n                void 0;", row("format")],
            ["updated-shape", 'if (!plain(audio)) fail("frame-shape");', "if (!plain(audio)) return { kind: \"started\" };", row("updated-shape")],
            ["early-turn", 'if (kind !== "running" && !["created", "started", "ignored"].includes(event.kind)) fail("event-order");', "", row("early-turn")],
            ["unread", 'case "response.output_audio.done": ', "", as("unread")],
            ["start-timeout", 'clock.set(() => failed(session, "live=start-timeout"), START_WAIT_MS)', "null", as("startTimeout")],
            ["response-timeout", 'clock.set(() => failed(session, "live=response-timeout"), RESPONSE_WAIT_MS)', "null", as("responseTimeout")],
            ["response-wait-end", 'clear(session, "words");', "", as("idle")],
            ["key-first", "Net.assertKeyTarget(provider.base, key.reference.origin);", "", as("keys")],
            ["key-zero", "} finally { secret.fill(0); }", "} finally { void secret; }", as("roundTrip")],
            ["pending", "session.pending.push(Buffer.from(pcm));", "", as("roundTrip")],
            ["silence", "if (samples > 0 && !input(session, Buffer.alloc(samples * 2))) return;", "", as("roundTrip")],
            ["silence-gate", "if (session.capture === null) {", "if (true) {", as("roundTrip")],
            ["silence-cap", "Math.min(now - session.inputAt, SILENCE_MAX_MS)", "(now - session.inputAt)", as("roundTrip")],
            ["reply-end", "reply.stream.push(null);", "", as("roundTrip")],
            ["reply-open", 'if (session.playing !== reply || reply.kind !== "open" || !quiet(session)) return;', 'if (session.playing !== reply || reply.kind !== "open") return;', as("roundTrip")],
            ["caption-turn", "if (segment !== null && segment.source !== source) segment = session.segments[role] = null;", "", as("captions")],
            ["caption-overlap", 'session.segments.user.source === event.item) conclude(session, "user");', 'true) conclude(session, "user");', as("captions")],
            ["caption-whole", 'emit(session, "user", text.slice(0, captionLimit), "final");', "void text;", as("captions")],
            ["caption-whole-limit", 'emit(session, "user", text.slice(0, captionLimit), "final");', 'emit(session, "user", text, "final");', as("unread")],
            ["caption-limit", "captionLimit) {\n                conclude(session, role);\n                segment = null;", "captionLimit) {\n                segment = null;", as("captions")],
            ["caption-reply-end", 'conclude(session, "assistant");\n                caption(session, "user", event.item, event.text);',
                'caption(session, "user", event.item, event.text);', as("captions")],
            ["release-before-close", 'session.state = { kind: "ended" };\n        if (session.channel !== null) session.channel.close();',
                'if (session.channel !== null) session.channel.close();\n        session.state = { kind: "ended" };', as("releaseLifetime")],
            ["input-overflow", 'if (session.pendingBytes > PENDING_BYTES) { failed(session, "live=input-overflow"); return false; }', "",
                as("opening")],
            ["input-order", 'if (session.state.kind === "running" && session.pending.length === 0) return append(session, pcm);',
                'if (session.state.kind === "running") return append(session, pcm);', as("opening")],
            ["drain", " && session.channel.bufferedAmount === 0) {", ") {", as("opening")],
            ["output-overflow", 'if (!reply.stream.push(pcm)) failed(session, "live=output-overflow");', "reply.stream.push(pcm);",
                as("replyQueue")],
            ["backlog", 'if (session.channel.bufferedAmount > SEND_BACKLOG_BYTES) fail("send-backlog");', "", as("backlog")],
            ["release", 'if (answer.kind !== "send") fail("release-" + answer.kind);\n        if (session.channel', "if (session.channel",
                folder => release(kitFrom(folder, [withheld]))],
            ["release-connect", 'if (answer.kind !== "channel") fail("release-" + answer.kind);', 'if (answer.kind !== "channel") return;',
                folder => releaseConnect(kitFrom(folder, [withheldConnect]))]
        ];
        for (const [name, needle, replacement, check] of mutations) await control(name, needle, replacement, check);
        const gas = name => folder => cases[name](kitFrom(folder));
        const grow = name => folder => gfailures(kitFrom(folder), name);
        const unasked = "                session.unbidden = true;\n            } else if";
        const geminiMutations = [
            ["key-header", 'header: "x-goog-api-key", prefix: ""', 'header: "authorization", prefix: "Bearer "', gas("groundTrip")],
            ["key-first", "Net.assertKeyTarget(provider.base, key.reference.origin);", "", gas("gkeys")],
            ["key-zero", "} finally { secret.fill(0); }", "} finally { void secret; }", gas("groundTrip")],
            ["no-tools", "inputAudioTranscription: {}, outputAudioTranscription: {},",
                'inputAudioTranscription: {}, outputAudioTranscription: {}, tools: [{ functionDeclarations: [{ name: "files_delete" }] }],', gas("groundTrip")],
            ["no-interruption", '{ activityHandling: "NO_INTERRUPTION" }', "{}", gas("groundTrip")],
            ["transcripts", "inputAudioTranscription: {}, ", "", gas("groundTrip")],
            ["model", '"models/" + provider.model', '"models/gemini-live"', gas("groundTrip")],
            ["unasked-rule", 'session.reader + "\\n\\n" + UNASKED', "session.reader", gas("groundTrip")],
            ["voice", "prebuiltVoiceConfig: { voiceName: voice }", 'prebuiltVoiceConfig: { voiceName: "Zephyr" }', gas("gpreview")],
            ["voice-unjudged", 'if (!VOICES.some(row => row.value === voice)) fail("voice");', "", gas("gpreview")],
            ["no-preview", 'commentary(PREVIEW, Policy.item(session.preview, ["desktop"]));', "", gas("gpreview")],
            ["preview-unended", "session.timers.preview = clock.set(() => { session.timers.preview = null; session.events.idle(); }, 0);", "void session;", gas("gpreview")],
            ["setup-first", 'answer.events.addEventListener("open", () => opened(session));', "", gas("groundTrip")],
            ["input-24k", 'data: out.toString("base64")', 'data: pcm.toString("base64")', gas("groundTrip")],
            ["input-rate", 'const INPUT_MIME = "audio/pcm;rate=16000";', 'const INPUT_MIME = "audio/pcm;rate=24000";', gas("groundTrip")],
            ["resample-mean", "(all.readInt16LE(group * 6 + 2) + all.readInt16LE(group * 6 + 4)) >> 1", "all.readInt16LE(group * 6 + 2)", gas("groundTrip")],
            ["resample-carry", "session.carry = Buffer.from(all.subarray(groups * 6));", "session.carry = Buffer.alloc(0);", gas("groundTrip")],
            ["pending", "session.pending.push(Buffer.from(pcm));", "", gas("groundTrip")],
            ["silence", "if (samples > 0 && !input(session, Buffer.alloc(samples * 2))) return;", "", gas("groundTrip")],
            ["silence-cap", "Math.min(now - session.inputAt, SILENCE_MAX_MS)", "(now - session.inputAt)", gas("groundTrip")],
            ["exact-words", '+ "\\n\\n" + JSON.stringify(words.text) }] }]', '+ "\\n\\n" + JSON.stringify("") }] }]', gas("groundTrip")],
            ["turn-complete", "turnComplete: true } }, [words.item]);", "turnComplete: false } }, [words.item]);", gas("groundTrip")],
            ["frame-labels", "}, [words.item]);", "});", gas("glabels")],
            ["unasked-plays", unasked, "                session.unbidden = true;\n                for (const pcm of event.audio) output(session, { reply: null }, pcm);\n            } else if",
                gas("groundTrip")],
            ["unasked-captioned", unasked, '                session.unbidden = true;\n                if (event.said !== "") caption(session, "assistant", null, event.said);\n            } else if',
                gas("gcaptions")],
            ["unasked-wait", "speech.active !== null || session.unbidden || ", "speech.active !== null || ", gas("gunbidden")],
            ["unasked-end", "session.unbidden = false;\n            clear(session, \"words\");", "clear(session, \"words\");", gas("gunbidden")],
            ["unasked-ends-turn", "clear(session, \"words\");\n            heard(session);", "clear(session, \"words\");", gas("gunbidden")],
            ["generation-ends-turn", "if (event.generated && active === null) heard(session);", "", gas("gunbidden")],
            ["unasked-timeout", 'if (!session.unbidden) session.timers.words = clock.set(() => failed(session, "live=response-timeout"), RESPONSE_WAIT_MS);', "",
                gas("gunbiddenTimeout")],
            ["finished-ends-turn", "if (event.finished) heard(session);", "", gas("gcaptions")],
            ["turn-once", "session.turn = null;\n        conclude(session, \"user\");", "conclude(session, \"user\");", gas("gdelegation")],
            ["blank-turn", 'if (turn.text.trim() === "") return;', "", gas("gdelegation")],
            ["delegation-dispatch", "session.events.delegation({ id: turn.id, text: clean(turn.text) });", "void turn;", gas("gdelegation")],
            ["replaced-words", "// Words still waiting answer the request this one replaces.\n        session.speech.queue = [];\n        session.speech.chars = 0;", "",
                gas("gdelegation")],
            ["stale-delegation", " || session.delegation !== id) return false;", ") return false;", gas("gdelegation")],
            ["one-turn", "speech.active !== null || session.unbidden", "session.unbidden", gas("gpacing")],
            ["drained-reply", " || waiting > REPLY_LOW_BYTES)", ")", gas("gpacing")],
            ["speech-bound", "slice(0, SPEECH_CHARS)", "slice(0)", gas("gpacing")],
            ["cut-discards", "if (event.interrupted && active !== null) active.discarded = true;", "", gas("ginterrupted")],
            ["flush-discards", "if (session.speech.active !== null) session.speech.active.discarded = true;", "", gas("ginterruptPlaying")],
            ["flush-words", "session.speech.queue = [];\n            session.speech.chars = 0;\n            if (session.speech.active", "if (session.speech.active",
                gas("ginterruptPlaying")],
            ["heard-marks", "active.reply.marks.push({ request: active.request, end: active.reply.bytes, text: active.text, line: active.line });", "void active;",
                gas("gheardAccount")],
            ["go-away", 'return fail("go-away");', 'return { kind: "ignored" };', grow("go-away")],
            ["tool-call", 'return fail("message type=" + token(kinds[0]));', 'return { kind: "ignored" };', grow("tool-call")],
            ["tool-cancel", 'return fail("message type=" + token(kinds[0]));', 'return { kind: "ignored" };', grow("tool-cancel")],
            ["unknown", 'return fail("message type=" + token(kinds[0]));', 'return { kind: "ignored" };', grow("unknown")],
            ["two-kinds", 'if (kinds.length > 1) fail("frame-shape");', "", grow("two-kinds")],
            ["content-field", 'if (!CONTENT_FIELDS.has(field)) fail("content field=" + token(field));', "void field;", grow("grounding")],
            ["part", 'else if (typeof part.text !== "string") fail("part");', "", grow("function-part")],
            ["format-rate", 'rate !== undefined && rate !== "rate=" + OUTPUT_RATE', "false", grow("rate")],
            ["format-type", 'type !== "audio/pcm" || ', "", grow("wav")],
            ["output-odd", 'if (pcm.length % 2 !== 0) fail("output-audio");', "", grow("odd-audio")],
            ["output-base64", 'if (!BASE64.test(data.data)) fail("output-audio");', "", grow("not-base64")],
            ["flag", 'if (value !== undefined && typeof value !== "boolean") fail("frame-shape");', "", grow("flag")],
            ["transcript-shape", 'if (!plain(value) || value.text !== undefined && typeof value.text !== "string") fail("frame-shape");', "", grow("transcript-shape")],
            ["turn-size", 'if (turn.text.length + text.length > TURN_CHARS) fail("turn-size");', "", grow("turn-size")],
            ["frame-json", 'catch { fail("frame-json"); }', 'catch { return { kind: "ignored" }; }', grow("json")],
            ["frame-binary", 'try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }', 'try { text = new TextDecoder("utf-8").decode(bytes); }',
                grow("binary")],
            ["binary-read", 'if (!(data instanceof Blob)) { failed(session, "live=frame-binary"); return; }', 'failed(session, "live=frame-binary"); return;',
                gas("groundTrip")],
            ["binary-order", "session.reading = true;", "", gas("gbinary")],
            ["frame-size", 'if (data.length > FRAME_CHARS) fail("frame-size");', "", grow("frame-size")],
            ["frame-shape", 'if (!plain(value)) fail("frame-shape");', 'if (!plain(value)) return { kind: "ignored" };', grow("shape")],
            ["setup-order", 'if (kind !== "starting") fail("event-order");', "", grow("setup-twice")],
            ["early-turn", 'if (kind !== "running" && !["started", "ignored"].includes(event.kind)) fail("event-order");', "", grow("early-turn")],
            ["input-frame", 'if (pcm.length % 2 !== 0) { failed(session, "live=input-frame"); return; }', "", grow("input-frame")],
            ["disconnected", 'answer.events.addEventListener("close", event => failed(session, "live=disconnected code=" + event.code));', "", grow("reset")],
            ["redirect", 'answer.events.addEventListener("close", event => failed(session, "live=disconnected code=" + event.code));', "", gas("gredirect")],
            ["start-timeout", 'clock.set(() => failed(session, "live=start-timeout"), START_WAIT_MS)', "null", gas("gstartTimeout")],
            ["response-timeout", 'session.timers.words = clock.set(() => failed(session, "live=response-timeout"), RESPONSE_WAIT_MS);\n        try {', "try {",
                gas("gresponseTimeout")],
            ["input-overflow", 'if (session.pendingBytes > PENDING_BYTES) { failed(session, "live=input-overflow"); return false; }', "", gas("gopening")],
            ["drain", " && session.channel.bufferedAmount === 0) {", ") {", gas("gopening")],
            ["output-overflow", 'if (!reply.stream.push(pcm)) failed(session, "live=output-overflow");', "reply.stream.push(pcm);", gas("greplyQueue")],
            ["backlog", 'if (session.channel.bufferedAmount > SEND_BACKLOG_BYTES) fail("send-backlog");', "", gas("gbacklog")],
            ["close", "if (live !== null && live.op === e.target) release(live);", "", gas("gclosing")],
            ["idle-rule", "}, IDLE_MS);", "}, IDLE_MS + 1);", gas("gidle")],
            ["release", 'if (answer.kind !== "send") fail("release-" + answer.kind);\n        if (session.channel', "if (session.channel",
                folder => grelease(kitFrom(folder, [geminiWithheld]))],
            ["release-connect", 'if (answer.kind !== "channel") fail("release-" + answer.kind);', 'if (answer.kind !== "channel") return;',
                folder => greleaseConnect(kitFrom(folder, [geminiWithheldConnect]))]
        ];
        for (const [name, needle, replacement, check] of geminiMutations) await control("gemini-" + name, needle, replacement, check, GEMINI);
        // Session's own rule, in a disposable copy of the reducer.
        await assert.rejects(() => qmlCopy(sessionFile, [['if (s.turn.kind === "thinking" || s.approval.kind === "held"\n', "if (false\n"]],
            logic => idleApproval({ ...kitFrom(backend), Session: logic })), assert.AssertionError, "session-idle-in-flight must turn red");
        controls++;
        console.log("control=session-idle-in-flight detected");
        for (const [name, needle, replacement, scenario, P = REALTIME] of [
            ["daemon-live-selection", "if (Object.hasOwn(DUPLEX, settings.voiceProvider)) {", "if (false) {", "action"],
            ["daemon-gemini-selection", "if (Object.hasOwn(DUPLEX, settings.voiceProvider)) {", "if (false) {", "action", GEMINI],
            ["daemon-gemini-row", '    gemini: Object.freeze({ id: "gemini-live", account: "gemini", adapter: GeminiLive })\n', "", "action", GEMINI],
            ["daemon-gemini-key", "account.provider !== duplex.account", 'account.provider !== "openai"', "action", GEMINI],
            ["daemon-gemini-voices", "            voices, voice: voices[voiceIndex(voices, settings.voice)].value,",
                "            voices: Realtime.VOICES, voice: voices[voiceIndex(voices, settings.voice)].value,", "preview", GEMINI],
            ["daemon-gemini-commentary", "c.live.commentary(turn.delegation, item);", "void item;", "action", GEMINI],
            ["daemon-gemini-router-approval", "router.route(call, { gen: turn.gen, op: turn.op });", "void call;", "action", GEMINI],
            ["daemon-gemini-heard-report", "if (account !== null && conversation === c && c.last === turn) heard(c, turn, account.text(report));",
                "void report;", "heard", GEMINI],
            ["daemon-gemini-audit-before-send", 'const result = audit.before(releaseEvent(c, identity, item.labels, "send", "pending"), start);',
                `if (item.content.startsWith('{"clientContent"')) return start();\n        const result = audit.before(releaseEvent(c, identity, item.labels, "send", "pending"), start);`, "action", GEMINI],
            ["daemon-commentary", "c.live.commentary(turn.delegation, item);", "void item;", "action"],
            ["daemon-router-tools", "tools: router.offer()", "tools: []", "action"],
            ["daemon-router-approval", "router.route(call, { gen: turn.gen, op: turn.op });", "void call;", "action"],
            ["daemon-speakable", "const sentences = text.push(event.text);", "const sentences = [event.text];", "action"],
            ["daemon-recipient-provider", 'provider: account.provider, account: account.id, origin: Net.endpoint(provider.base).origin',
                'provider: provider.id, account: account.id, origin: Net.endpoint(provider.base).origin', "release"],
            ["daemon-release-request", "if (needed.length === 0) return;", "return;", "release"],
            ["daemon-heard-report", "if (account !== null && conversation === c && c.last === turn) heard(c, turn, account.text(report));",
                "void report;", "heard"],
            ["daemon-heard-whole", 'return account === null || turn.phase === "done" && !account.pending ? null : account;', "return account;", "heard"],
            ["daemon-heard-played", "if (conversation === c) c?.live?.played(e.source);", "", "heard"],
            ["daemon-heard-unplayed", "if (account !== null) heard(c, c.last, account.text(null));", "", "heard"],
            ["daemon-audit-before-send", 'const result = audit.before(releaseEvent(c, identity, item.labels, "send", "pending"), start);',
                `if (item.content.startsWith('{"type":"response.create"')) return start();\n        const result = audit.before(releaseEvent(c, identity, item.labels, "send", "pending"), start);`, "action"]
        ]) {
            const kit = kitFrom(backend, [["ChainedEngine.js", needle, replacement]]);
            // The audit plant must parse, send the real spoken frame, and
            // fail at its missing frame record rather than at setup.
            new (require("node:vm").Script)(fs.readFileSync(path.join(kit.folder, "ChainedEngine.js"), "utf8"));
            const failed = name.endsWith("audit-before-send")
                ? error => error instanceof assert.AssertionError
                    && error.actual?.check === "commentary-audit-before-send" && error.actual.audited === false
                    && error.expected?.audited === true
                : assert.AssertionError;
            await assert.rejects(() => daemonDelegation(kit, scenario, P), failed, name + " must turn red");
            controls++;
            console.log("control=" + name + " detected");
        }
        console.log("test-jarvis-live: ok cases=" + (Object.keys(cases).length + 4) + " controls=" + controls
            + " connections=" + main.conns.length);
    } finally {
        for (const net of nets) net.close();
        for (const server of [main, other]) {
            for (const conn of server.conns) conn.socket.destroy();
            server.instance.closeAllConnections();
            await new Promise(resolve => server.instance.close(resolve));
        }
    }
}, folder => { standins(folder); audioStandins(folder); }, 480000)?.catch(error => { console.error(error); process.exitCode = 1; });
