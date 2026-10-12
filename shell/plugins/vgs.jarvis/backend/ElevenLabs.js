// The ElevenLabs voice: each released sentence of a reply streams from
// ElevenLabs's text to speech, and the Voice setting offers the account's
// voices. The local row still hears the user; ElevenLabs only speaks. Every
// request leaves through a net owner it is handed, with the key in its
// xi-api-key header bound to the stored origin. API facts are the reading on
// VGS-1202 (2026-10-12) of ElevenLabs's API reference. Contract:
// docs/architecture/jarvis.md § Adapters.
"use strict";
const Net = require("./net.js");
const Policy = require("./Policy.js");
const Providers = require("./Providers.js");
const { PCM_RATE } = require("./Audio.js");

// pcm_24000 is raw mono s16 at 24 kHz, the rate Audio plays, so a sentence
// plays with no resample.
const FORMAT = "pcm_24000";
if (PCM_RATE !== 24000) throw new Error("jarvis: speech=elevenlabs-format");
// Below Audio's 64 KiB object-mode chunk bound, as the local row's chunks.
const CHUNK_BYTES = 24000 * 2;
// One sentence's audio, as the local row bounds it (LocalSpeech.js SENTENCE_BYTES).
const SENTENCE_BYTES = 8 * 1024 * 1024;
// Each wait on ElevenLabs, for the response or its next bytes, gets the
// bound the local row gives one sentence's synthesis (LocalSpeech.js
// SYNTHESIS_MS). A wait on Audio is not bounded here: it is Audio's pacing.
const WAIT_MS = 60000;
// A voice id travels in the request path, so it is letters and digits only,
// as every id the voice list documents is.
const VOICE = /^[A-Za-z0-9]{1,64}$/;
// The Voice setting's offers: JarvisProtocol.js VOICES_MAX and the core's
// status choices bound (PluginLogic.js STATUS_LIST_MAX).
const LIST_MAX = 64;
// page_size's documented maximum. The account's own voices go first, and a
// list whose pages never end stops after PAGES requests.
const PAGE_SIZE = 100;
const PAGES = 5;
const PAGE_BYTES = 1024 * 1024;
// How the Voice setting names a voice the user made on ElevenLabs's site,
// by its documented category; a premade voice reads as its name.
const MADE = Object.freeze({ cloned: "cloned", generated: "designed", professional: "cloned" });

function fail(code) { throw new Error("jarvis: speech=elevenlabs-" + code); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function keyFor(key, secret) {
    return { origin: key.reference.origin, header: "xi-api-key", prefix: "", value: secret.toString("utf8") };
}

// A wait bounded by WAIT_MS. stop aborts the request; its own deadline
// aborts it too and is told apart by `expired`.
function deadline(clock, stop) {
    const controller = new AbortController();
    const state = { expired: false, timer: null };
    const abort = () => controller.abort();
    if (stop.aborted) abort();
    else stop.addEventListener("abort", abort, { once: true });
    return {
        signal: controller.signal,
        get expired() { return state.expired; },
        arm() {
            state.timer = clock.set(() => { state.expired = true; abort(); }, WAIT_MS);
        },
        disarm() {
            if (state.timer !== null) clock.clear(state.timer);
            state.timer = null;
        },
        release() {
            this.disarm();
            stop.removeEventListener("abort", abort);
        }
    };
}

/**
 * One conversation's speaking owner. provider is the elevenlabs row, net()
 * the conversation's current net owner, key {secrets, reference} the
 * selected key, grants() the conversation's current grants and clock
 * {set, clear}.
 * speak(sentences, voice) follows the chained engine's adapter contract:
 * it yields {pcm} chunks, and each sentence's last chunk carries {sentence}.
 * Each sentence takes the net owner current when it starts, and keeps it
 * to its last chunk. Its return() aborts the request in flight at once.
 * idle(door) resolves once no request of net owner DOOR is in flight.
 * close() ends every request and zeroes the key.
 */
function create({ provider, net, key, grants, clock }) {
    Providers.assertRow(provider);
    if (typeof net !== "function" || typeof grants !== "function" || clock === undefined) fail("owner");
    if (provider.driver !== "elevenlabs") fail("row");
    if (key === null || key === undefined) fail("no-key");
    Net.assertKeyTarget(provider.base, key.reference.origin);
    let secret = null;
    let closed = false;
    const active = new Set();
    // The requests in flight by net owner, and who waits for each to end.
    const inflight = new Map();
    function settle(door) {
        const entry = inflight.get(door);
        if (--entry.count !== 0) return;
        inflight.delete(door);
        for (const resolve of entry.waiters) resolve();
    }

    async function* sentencesOf(sentences, voice, stop) {
        const url = provider.base + "/v1/text-to-speech/" + voice + "/stream?output_format=" + FORMAT;
        for await (const item of sentences) {
            if (closed) fail("closed");
            if (item.content.trim() === "") fail("sentence-empty");
            const body = Policy.item(JSON.stringify({ text: item.content, model_id: provider.model }), item.labels);
            if (secret === null) secret = key.secrets.lookup(key.reference);
            const wait = deadline(clock, stop);
            const door = net();
            const entry = inflight.get(door) ?? { count: 0, waiters: [] };
            entry.count++;
            inflight.set(door, entry);
            let answer = null;
            try {
                wait.arm();
                try {
                    answer = await door.request(body, { url, headers: { "content-type": "application/json" },
                        key: keyFor(key, secret), signal: wait.signal }, grants());
                } catch (error) {
                    if (wait.expired) fail("timeout");
                    throw error;
                }
                wait.disarm();
                // A withheld or asked sentence opened no connection and is
                // not spoken, as for any speech row.
                if (answer.kind !== "response") continue;
                const response = answer.response;
                if (response.status !== 200) {
                    // An error body can echo the request or the key.
                    await response.body?.cancel();
                    fail("http status=" + response.status);
                }
                const reader = response.body.getReader();
                let carry = Buffer.alloc(0), held = null, bytes = 0;
                for (;;) {
                    let read;
                    wait.arm();
                    try { read = await reader.read(); }
                    catch { fail(wait.expired ? "timeout" : "stream-failed"); }
                    wait.disarm();
                    if (read.done) break;
                    let pcm = Buffer.concat([carry, Buffer.from(read.value)]);
                    // A read can split a sample; its first byte waits for the next.
                    carry = Buffer.from(pcm.subarray(pcm.length - (pcm.length % 2)));
                    pcm = pcm.subarray(0, pcm.length - carry.length);
                    bytes += pcm.length;
                    if (bytes > SENTENCE_BYTES) fail("sentence-audio");
                    for (let at = 0; at < pcm.length; at += CHUNK_BYTES) {
                        if (held !== null) yield { pcm: held };
                        held = Buffer.from(pcm.subarray(at, at + CHUNK_BYTES));
                    }
                }
                if (carry.length !== 0) fail("partial-sample");
                if (held === null) fail("audio-empty");
                // No word alignment comes with this stream: the whole
                // sentence counts as heard only once its last chunk played.
                yield { pcm: held, sentence: { text: item.content, frames: held.length / 2 } };
            } finally {
                wait.release();
                answer?.close?.();
                settle(door);
            }
        }
    }

    return Object.freeze({
        speak(sentences, voice) {
            if (typeof voice !== "string" || !VOICE.test(voice)) fail("voice");
            if (closed) fail("closed");
            const stop = new AbortController();
            active.add(stop);
            const inner = sentencesOf(sentences, voice, stop.signal);
            const done = { value: undefined, done: true };
            return {
                [Symbol.asyncIterator]() { return this; },
                async next() {
                    if (stop.signal.aborted) return done;
                    try {
                        const step = await inner.next();
                        if (step.done) active.delete(stop);
                        return step;
                    } catch (error) {
                        active.delete(stop);
                        if (stop.signal.aborted) return done;
                        throw error;
                    }
                },
                // A barge-in or the conversation's end: the request in
                // flight ends now, not when its next bytes arrive.
                async return() {
                    stop.abort();
                    active.delete(stop);
                    void inner.return().catch(() => {});
                    return done;
                }
            };
        },
        idle(door) {
            const entry = inflight.get(door);
            return entry === undefined ? Promise.resolve() : new Promise(resolve => entry.waiters.push(resolve));
        },
        close() {
            closed = true;
            for (const stop of active) stop.abort();
            active.clear();
            secret?.fill(0);
            secret = null;
        }
    });
}

// One page's JSON, read whole within PAGE_BYTES.
async function pageOf(response, wait) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        let read;
        try { read = await reader.read(); }
        catch { fail(wait.expired ? "voices-timeout" : "voices-stream"); }
        if (read.done) break;
        size += read.value.byteLength;
        if (size > PAGE_BYTES) {
            await reader.cancel();
            fail("voices-size");
        }
        chunks.push(Buffer.from(read.value));
    }
    let page;
    try { page = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail("voices-json"); }
    if (!plain(page) || !Array.isArray(page.voices) || typeof page.has_more !== "boolean"
            || !(page.next_page_token === undefined || page.next_page_token === null || typeof page.next_page_token === "string"))
        fail("voices-shape");
    return page;
}

/**
 * The account's voices as the Voice setting's {label, value} offers: the
 * voices the user made on ElevenLabs's site first, then the premade ones,
 * at most LIST_MAX. Each page is a keyed GET through net, released as an
 * empty desktop item through transfer(item, start), the caller's release
 * and audit owner. Pages follow has_more and next_page_token, at most PAGES.
 */
async function voices({ provider, net, key, transfer, clock, stop = new AbortController().signal }) {
    Providers.assertRow(provider);
    if (provider.driver !== "elevenlabs") fail("row");
    Net.assertKeyTarget(provider.base, key.reference.origin);
    const own = [], premade = [], seen = new Set();
    let token = null;
    const secret = key.secrets.lookup(key.reference);
    try {
        for (let page = 0; page < PAGES && own.length < LIST_MAX; page++) {
            const url = provider.base + "/v2/voices?page_size=" + PAGE_SIZE
                + (token === null ? "" : "&next_page_token=" + encodeURIComponent(token));
            const item = Policy.item("", ["desktop"]);
            const wait = deadline(clock, stop);
            let answer = null;
            try {
                wait.arm();
                try {
                    answer = await transfer(item, () => net.request(item, { url, method: "GET", key: keyFor(key, secret), signal: wait.signal }));
                } catch (error) {
                    if (wait.expired) fail("voices-timeout");
                    throw error;
                }
                if (answer.kind !== "response") fail("voices-release");
                if (answer.response.status !== 200) {
                    await answer.response.body?.cancel();
                    fail("voices-http status=" + answer.response.status);
                }
                const read = await pageOf(answer.response, wait);
                for (const voice of read.voices) {
                    if (!plain(voice) || typeof voice.voice_id !== "string" || !VOICE.test(voice.voice_id)
                            || typeof voice.name !== "string" || typeof voice.category !== "string") fail("voices-shape");
                    // A name is another account's text the Settings Select
                    // draws: no control, line break, markup bracket or
                    // bidirectional override survives.
                    const name = voice.name.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>\u202a-\u202e\u2066-\u2069]/g, " ").trim();
                    if (name === "" || seen.has(voice.voice_id)) continue;
                    seen.add(voice.voice_id);
                    const made = Object.hasOwn(MADE, voice.category) ? MADE[voice.category] : null;
                    const suffix = made === null ? "" : " (" + made + ")";
                    (made === null ? premade : own).push({ label: name.slice(0, 60 - suffix.length) + suffix, value: voice.voice_id });
                }
                if (!read.has_more || typeof read.next_page_token !== "string" || read.next_page_token === "") break;
                token = read.next_page_token;
            } finally {
                wait.release();
                answer?.close?.();
            }
        }
    } finally { secret.fill(0); }
    return [...own, ...premade].slice(0, LIST_MAX);
}

module.exports = { create, voices };
