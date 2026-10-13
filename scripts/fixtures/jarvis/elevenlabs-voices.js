// A loopback stand-in of ElevenLabs's voice list, GET /v2/voices, for the
// sandbox's sheet scene (scripts/sandbox-shots.sh elevenlabs-voices). The
// scene's backend copy starts it inside the Jarvis daemon, so it listens in
// the daemon's private network namespace (scripts/lib/jarvis-env.sh), and
// points the elevenlabs row's base at it. The route, the xi-api-key header
// and the paging fields follow the reading of ElevenLabs's API reference on
// VGS-1202 (2026-10-12), as scripts/test-jarvis-elevenlabs.js serves them.
// The voices are synthetic.
"use strict";
const fs = require("node:fs");
const http = require("node:http");

const voice = (voice_id, name, category) => ({ voice_id, name, category });
// Two pages, so the read follows next_page_token; one of each category the
// Voice setting names apart, and premade voices after them.
const PAGES = [
    { voices: [voice("Prem1", "Calm guide", "premade"), voice("Clone1", "My voice", "cloned"),
        voice("Design1", "Narrator", "generated")], has_more: true, next_page_token: "page-2" },
    { voices: [voice("Pro1", "Studio read", "professional"), voice("Prem2", "Bright host", "premade"),
        voice("Prem3", "Warm reader", "premade")], has_more: false, next_page_token: null }];

/**
 * Listen on 127.0.0.1:PORT. MODE_FILE holds "listed", which answers the
 * pages to a request that carries a key, or "refused", which answers 401
 * as ElevenLabs answers a key that may not read voices.
 */
function serve(port, modeFile) {
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, "http://stand-in");
        const mode = fs.readFileSync(modeFile, "utf8").trim();
        if (request.method !== "GET" || url.pathname !== "/v2/voices") {
            response.writeHead(404).end();
            return;
        }
        if (mode !== "listed" || !request.headers["xi-api-key"]) {
            response.writeHead(401, { "content-type": "application/json" });
            response.end(JSON.stringify({ detail: { status: "missing_permissions" } }));
            return;
        }
        const page = url.searchParams.get("next_page_token") === "page-2" ? PAGES[1] : PAGES[0];
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(page));
    });
    server.listen(port, "127.0.0.1");
    // The daemon's own lifetime ends the server.
    server.unref();
}

module.exports = { serve };
