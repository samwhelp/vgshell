#!/usr/bin/env bash
# Run one real Jarvis turn in the nested sandbox and write one record of it.
#
# Usage: scripts/jarvis-selftest.sh --cold N [--out FILE]
#        scripts/jarvis-selftest.sh --suite NAME|all --brain ID
#                                   [--voice local|realtime]
#                                   [--voices DIR]
#                                   [--home PATH] [--out DIR]
#        scripts/jarvis-selftest.sh (--wav FILE | --tts TEXT | --type TEXT)
#                                   --brain ID [--home PATH]
#                                   [--voice local|realtime]
#                                   [--mode toggle|always]
#                                   [--confirm key|none] [--out FILE]
#
# The sandbox is the smoke's own (scripts/smoke/harness.sh), with the
# checkout's Jarvis plugin put back over the harness's instrumented copy, so
# the daemon, its engine, its speech sidecar and its audio children are the
# shipped ones and run as in a session: nothing is scripted or stood in.
# The rules this run keeps are docs/architecture/validation.md § Jarvis
# self-test.
#
# The input is one of:
#   --wav FILE   a recorded 16-bit PCM WAV, played into the sandbox PipeWire's voice
#                feed (scripts/smoke/devices.sh), whose source side is the
#                microphone Jarvis records with its own pw-record. The feed
#                starts only once the bar widget reads the microphone open
#                and a capture stream reads that source.
#   --tts TEXT   the same, over a WAV the pinned voice that made the plugin's
#                probe.wav speaks from TEXT (fixtures/PROVENANCE).
#   --type TEXT  the line sent through the plugin's `say` IPC handler.
# A voice input opens the conversation through the service's Talk intent in
# Toggle mode, or through the local wake word in Always mode, so the
# engine's own end-of-speech judge commits the turn.
#
# --brain ID is an account id the Jarvis AI model list offers. A sign-in
# account's own directory variable is the one value of the caller's
# environment that enters the sandbox.
# --voice realtime listens and speaks through OpenAI's Realtime session with
# the caller's one saved OpenAI key, the key the plugin's Accounts page
# chooses by itself; local, the default, is the prepared local voice below.
# A saved key, the brain's or the realtime voice's, is read under the
# owner's exception in docs/architecture/validation.md § Jarvis self-test.
# Its reference, which holds no secret, is saved in the sandbox by the
# plugin's own writer. Jarvis's own `secret-tool lookup` of it goes to the
# caller's session bus through a filter, an xdg-dbus-proxy that passes the
# calls a lookup of an unlocked key makes to org.freedesktop.secrets and
# nothing else: no other bus name and no unlock, so a locked keyring fails
# the lookup and shows no prompt. Before Jarvis starts, the run reads
# through that filter whether each key is there and unlocked.
# --home PATH copies that folder into the sandbox's HOME and names the copy
# as the Jarvis home folder; the folder itself is read twice, for its
# checksums before and after, and never written. Where the copy holds the
# kendex mail tool, the run records a Jarvis session in the copy's fleet
# state with the copy's own kendex workflow-state, so the send Jarvis makes
# with that tool lands. The run reads the copy's Jarvis session mailbox as
# the Jarvis session does, with the checkout's lane-mail: once before Jarvis
# starts, which makes the mailbox where the folder has none and marks the
# rows it holds as read, and once after the turn, for the rows the turn added.
# --mode toggle opens a voice turn through the Talk intent. --mode always
# waits for the wake-word capture to read armed and feeds a wake phrase.
# Always mode needs the local voice, because the local sidecar spots the
# word. It is refused with --type, --voice realtime and --cold.
# --confirm key confirms each request Jarvis shows as its Confirm key does,
# with one press a request, made once Session's draw guard has passed;
# none, the default, answers none, so a request ends on Jarvis's own bound.
# --suite NAME runs one case from scripts/jarvis-selftest-cases/. --suite all
# runs every case, sorted by name. --voices DIR lets a suite use DIR/<case>.wav
# for a case input, without changing tracked cases. A suite writes records
# under OUT when --out names a directory, otherwise under
# tmp/selftest-records/suite-<UTC>.
# --out FILE is the record for a single turn; the default is a new file under
# tmp/selftest-records/.
#
# The local voice and the --tts speaker run from prepared inputs: JARVIS_LOCAL_MODELS and
# JARVIS_LOCAL_PYTHON name the models and the interpreter of one setup the
# plugin's own setup-local made under a scratch HOME,
# <HOME>/.local/share/vgshell/jarvis/local/models and
# .../local/venv/bin/python, and the run reads that setup's ready marker,
# <HOME>/.local/state/vgshell/jarvis/local-ready.json.
#
# With --cold N, the record is one JSON object: `kind: "cold-starts"`,
# `starts` and `cpuPressure`. Each start disables and enables Jarvis and
# records each status change as {ms, lifetime, daemon, setup, cause}, then
# ends at ready, setting or problem.
#
# Otherwise the record is one JSON object: `input` {kind, value}, `brain`, `home`,
# `voice`, `mode`, `confirm`, `heard` (the text Session committed as the user turn),
# `sentences` (each sentence released to speech as {ms, text}; with --voice
# realtime, whose transcript of its own speech arrives in fragments, each
# assistant caption segment whole as {ms of its first words, text}), `raw`
# (each brain turn's text as the brain wrote it, before Jarvis chose what to
# speak, from the trace the daemon writes for a test run alone), `tools`
# (each audit record of a tool call as {tool, decision, confirmed, outcome},
# names only), `mailbox` (with --home, each row the Jarvis session's read of
# its mailbox hands over after the turn, as lane-mail prints it; null
# without), `widget` (each bar widget state as {ms, state}), `phases` (each
# Session phase as {ms, phase}), `audio`
# {speechEndMs, firstMs, longestGapMs, sounds}, `end` {kind, phase, fault}
# and `passed`. A suite comparison adds `case.source`: `case` for the tracked
# input or `local` for --voices. Every ms counts from the input's start on the shell's own
# clock except firstMs and longestGapMs, which are relative to speech end.
# `end.kind` is completed, fault, gate-down, no-wake or timeout; `passed`
# is true only for a completed turn with a heard text, in
# a run whose --home folder, when named, reads as before, that reached no
# authentication stand-in and failed no sandbox check.
#
# The last line is `selftest=<key>`: `selftest=<end.kind> record=<file>`
# after a turn, else the reason no turn ran. Exit 0 for a passed record, 1
# for any other record or a failed step, 2 for a refused argument, and 77
# when the run could not run, which is never a pass. In suite mode the last
# line is `selftest=suite ...`, exit 0 means every run case matched, exit 1
# means a case differed or failed, and exit 77 means at least one case could
# not run and none differed:
#   selftest=keyring-no-key            no key is stored: `key=unsaved` where
#                                      no OpenAI key is saved for the realtime
#                                      voice, `key=absent` where the keyring
#                                      holds no item for a saved one
#   selftest=keyring-locked            the keyring holds the key locked
#   selftest=keyring-unavailable       no session bus, no keyring on it, or a
#                                      program the read needs, `missing=`
#   selftest=local-inputs-unavailable  no prepared local voice
#   selftest=account-judge-unavailable no node to run the plugin's judge
#   selftest=devices-unavailable       the device fakes' prerequisites
# or the harness's own `qml-smoke: status=not-measured` line.
# The turn's bound, 300 s, bounds a missing observation; it is no latency
# budget.
set -euo pipefail

self="$(readlink -f -- "${BASH_SOURCE[0]}")"
repo="$(cd -- "$(dirname -- "$self")/.." && pwd)"

# selftest_accounts TREE BRAIN VOICE: two lines from TREE's own account
# judge over the caller's folders and saved references, with no vendor
# command and no keyring call. The first is the account BRAIN names:
# `cli<TAB>VARIABLE<TAB>DIRECTORY` for a sign-in, VARIABLE its harness's
# directory variable; `keyring<TAB>REFERENCE` for a saved key, REFERENCE its
# reference as JSON, which holds no secret; `local` for a model server on
# this computer; `unknown`. The second is the key of the voice VOICE: `local`
# for the local voice, else `keyring<TAB>ID<TAB>REFERENCE` for the one saved
# OpenAI key, `none` with no such key and `several` with more than one.
selftest_accounts() { # TREE BRAIN VOICE
  local name words=()
  for name in HOME XDG_CONFIG_HOME XDG_DATA_HOME XDG_STATE_HOME CLAUDE_CONFIG_DIR CODEX_HOME COPILOT_HOME PI_CODING_AGENT_DIR; do
    [[ -z ${!name:-} ]] || words+=("$name=${!name}")
  done
  env -i PATH="$PATH" "${words[@]}" "$selftest_node" - "$@" <<'JS'
    const path = require("node:path");
    const [tree, id, voice] = process.argv.slice(2);
    const Core = require(path.join(tree, "shell/plugins/vgs.jarvis/backend/Core.js"));
    Core.use(tree);
    const { Accounts } = require(path.join(tree, "shell/plugins/vgs.jarvis/backend/Accounts.js"));
    const state = path.join(process.env.XDG_STATE_HOME || path.join(process.env.HOME, ".local/state"), "vgshell/jarvis");
    const judge = new Accounts(state, process.env);
    const line = (...words) => console.log(words.join("\t"));
    const found = judge.resolve(id);
    if (found === null) line("unknown");
    else if (found.source.kind === "cli") line("cli", Core.accounts().harness(found.provider).variable, found.source.directory);
    else if (found.source.kind === "keyring") line("keyring", JSON.stringify(found.source.reference));
    else line(found.source.kind);
    const keys = voice === "local" ? [] : judge.keyringRows().filter(key => key.row.id === "openai");
    if (voice === "local") line("local");
    else if (keys.length !== 1) line(keys.length === 0 ? "none" : "several");
    else line("keyring", judge.account(keys[0].row, keys[0].label, { kind: "found" }, keys[0].source).id, JSON.stringify(keys[0].source.reference));
JS
}

# The filtered secrets bus's rules: the four calls `secret-tool lookup` of
# libsecret 0.21.8 makes for an unlocked key, SearchItems the plugin's
# presence read too, as `xdg-dbus-proxy --log` 0.1.9 listed them on a scratch
# bus on 2026-10-09. A name given calls alone has no talk right, so the
# service's Unlock and its prompts answer AccessDenied there, and every
# other name reads as having no owner.
selftest_secrets_rules=(
  --call=org.freedesktop.secrets=org.freedesktop.Secret.Service.SearchItems@/org/freedesktop/secrets
  --call=org.freedesktop.secrets=org.freedesktop.Secret.Service.OpenSession@/org/freedesktop/secrets
  --call=org.freedesktop.secrets=org.freedesktop.Secret.Service.GetSecrets@/org/freedesktop/secrets
  --call=org.freedesktop.secrets=org.freedesktop.DBus.Properties.GetAll@/org/freedesktop/secrets
)

# selftest_key_presence TREE BUS REFERENCE: whether the keyring on the bus
# BUS holds the key REFERENCE names, as TREE's own key judge reads it with
# no unlock: present, locked, absent or unavailable.
selftest_key_presence() { # TREE BUS REFERENCE
  env -i PATH="$PATH" DBUS_SESSION_BUS_ADDRESS="$2" "$selftest_node" - "$1" "$3" <<'JS'
    const path = require("node:path");
    const [tree, reference] = process.argv.slice(2);
    const { Secrets } = require(path.join(tree, "shell/plugins/vgs.jarvis/backend/Secrets.js"));
    console.log(new Secrets(tree, process.env).presence(JSON.parse(reference)).value);
JS
}

# selftest_keys_save TREE STATE REFERENCE...: each REFERENCE saved under the
# Jarvis state folder STATE by TREE's own writer, and printed as the words
# Jarvis's `secret-tool lookup` of it carries, joined by the unit separator,
# a character no word of a reference holds.
selftest_keys_save() { # TREE STATE REFERENCE...
  env -i PATH="$PATH" "$selftest_node" - "$@" <<'JS'
    const path = require("node:path");
    const [tree, state, ...references] = process.argv.slice(2);
    const { Secrets } = require(path.join(tree, "shell/plugins/vgs.jarvis/backend/Secrets.js"));
    const secrets = new Secrets(state, process.env);
    for (const reference of references) console.log(secrets.attributes(secrets.remember(JSON.parse(reference))).join("\x1f"));
JS
}

# selftest_local_inputs: the prepared local voice the header names, as its
# data root and its ready marker, one a line. Returns 1 when a variable is
# unset or a part is absent.
selftest_local_inputs() {
  local models="${JARVIS_LOCAL_MODELS:-}" python="${JARVIS_LOCAL_PYTHON:-}" root marker
  [[ -n $models && -n $python && -d $models && -x $python ]] || return 1
  root="$(cd -- "$models/.." && pwd -P)" || return 1
  [[ $models -ef $root/models && $python -ef $root/venv/bin/python ]] || return 1
  marker="$root/../../../../state/vgshell/jarvis/local-ready.json"
  [[ -f $marker ]] || return 1
  printf '%s\n%s\n' "$root" "$(readlink -f -- "$marker")"
}

# selftest_speak PLUGIN ROOT TEXT OUT: TEXT spoken into the WAV OUT by the
# pinned voice that made PLUGIN's probe.wav, loaded by PLUGIN's own artifact
# judge from the prepared setup ROOT, in a network namespace as the plugin's
# sidecar runs, with OUT's directory as its HOME. Exit 77 when ROOT holds
# no such voice.
selftest_speak() { # PLUGIN ROOT TEXT OUT
  env -i PATH="$PATH" HOME="$(dirname -- "$4")" LC_ALL=C.UTF-8 unshare --map-current-user --net -- \
    "$2/venv/bin/python" -I - "$1" "$2/models" "$3" "$4" <<'PY'
import importlib.machinery, importlib.util, sys, wave
from pathlib import Path
plugin, models, text, out = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
loader = importlib.machinery.SourceFileLoader("jarvis_measure", str(plugin / "measure-local"))
judge = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
loader.exec_module(judge)
voice = next(a for a in judge.manifest(plugin / "artifacts.json")["artifacts"] if a["id"] == "piper")
if not (models / voice["directory"]).is_dir():
    sys.exit(77)
import numpy as np
import sherpa_onnx as sherpa
audio = judge.load(voice, models, "cpu", np, sherpa).generate(text, sid=0, speed=1)
samples = np.clip(np.asarray(audio.samples), -1, 1)
with wave.open(out, "wb") as file:
    file.setnchannels(1)
    file.setsampwidth(2)
    file.setframerate(audio.sample_rate)
    file.writeframes((samples * 32767).astype("<i2").tobytes())
PY
}

# selftest_tree_sum DIR: one checksum over every entry under DIR, its type,
# its link target and each regular file's bytes, so a file added, removed or
# changed under DIR changes it.
selftest_tree_sum() { # DIR
  (cd -- "$1" && find . -printf '%y %p %l\n' -type f -exec sha256sum -- {} + | LC_ALL=C sort | sha256sum | cut -d' ' -f1)
}

# selftest_home_copy SOURCE DEST: DEST made as a copy of the folder SOURCE
# that shares no file with it, links kept as links.
selftest_home_copy() { # SOURCE DEST
  cp -a -- "$1" "$2"
}

# selftest_overseer HOME: where the Jarvis home folder HOME holds kendex's
# orch skill, an `overseer` member in HOME's fleet state, written by HOME's
# own workflow-state, which lane-mail's send reads before it appends and
# otherwise refuses as overseer-absent: one that names no session, which the
# send needs no more of. A record already there is kept, and a state file outside HOME is refused,
# so no write reaches the folder the copy was made from.
selftest_overseer() { # HOME
  local tool="$1/.agents/skills/orch/scripts/workflow-state" file real
  [[ -x $tool ]] || return 0
  real="$(cd -- "$1" && pwd -P)" || return 1
  file="$(cd -- "$1" && env -i PATH="$PATH" "$BASH" "$tool" path oversee)" || return 1
  [[ $file == "$1"/* || $file == "$real"/* ]] || { printf 'selftest: the fleet state lies outside the home copy: %s\n' "$file" >&2; return 1; }
  [[ -e $file ]] || (cd -- "$1" && env -i PATH="$PATH" "$BASH" "$tool" init oversee >/dev/null) || return 1
  (cd -- "$1" && env -i PATH="$PATH" "$BASH" "$tool" update oversee '.overseer //= {}' >/dev/null)
}

# selftest_mailbox TREE HOME: the Jarvis session's read of its mailbox in the
# Jarvis home folder HOME, by TREE's own lane-mail, the reader the Jarvis
# session runs: each row no read handed over before, one JSON object a line.
# The read moves the mailbox's cursor, and a first read makes the mailbox.
selftest_mailbox() { # TREE HOME
  env -i PATH="$PATH" "$BASH" "$1/.agents/skills/orch/scripts/lane-mail" inbox --item overseer --root "$2"
}

# selftest_daemon WANT_JSON: `applied` once the Jarvis service on stdin, the
# probe's jarvisProcess reply, is ready and its Session holds every setting
# of WANT_JSON; else the first thing still missing: the probe's own word,
# `daemon=<lifetime>`, `detail=none` or `setting=<key>`.
selftest_daemon() { # WANT_JSON
  py_reply '
import json, sys
service, want = json.load(sys.stdin), json.loads(sys.argv[1])
detail = service["status"].get("detail")
held = detail["state"]["settings"] if detail else {}
missing = [key for key in want if held.get(key) != want[key]]
print("daemon=" + service["lifetime"]["kind"] if service["lifetime"]["kind"] != "ready" else "detail=none" if not detail else "setting=" + missing[0] if missing else "applied")
' "$1"
}

# selftest_last KIND: the last value of KIND, widget or phase, in the
# probe's trace on stdin, `none` before the first.
selftest_last() { # KIND
  py_reply '
import json, sys
values = [e["value"] for e in json.load(sys.stdin) if e["kind"] == sys.argv[1]]
print(values[-1] if values else "none")
' "$1"
}

# selftest_service_phase: the current Session phase, from Service.qml
# status.detail.phase. The trace can start after an Always capture is armed.
selftest_service_phase() {
  ipc smoke jarvisProcess | py_reply '
import json, sys
detail = json.load(sys.stdin)["status"].get("detail")
print(detail.get("phase", "none") if detail else "none")
'
}

# selftest_voice_state: `loading` while Service.qml's status.setupVoice is
# Checking or Loading (tone info), else `loaded`; a missing value reads loaded.
selftest_voice_state() {
  ipc smoke jarvisProcess | py_reply '
import json, sys
voice = (json.load(sys.stdin)["status"] or {}).get("setupVoice")
print("loading" if isinstance(voice, dict) and voice.get("tone") == "info" else "loaded")
'
}

# selftest_gate_context: two lines from a jarvisProcess reply on stdin. The
# first is `gate=<kind>` for stop keys. The second is a diagnostic line with
# setup, daemon and gate as compact JSON. Missing detail reads gate=none.
selftest_gate_context() {
  py_reply '
import json, sys
def compact(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
try:
    service = json.load(sys.stdin)
    values = service.get("status") or {}
    detail = values.get("detail") or {}
    state = detail.get("state") or {}
    gate = state.get("gate") or {"kind": "none"}
    gate_word = gate.get("kind", "none") if isinstance(gate, dict) else "none"
    print("gate=" + str(gate_word))
    print("selftest: setup=" + compact(values.get("setup")) + " daemon=" + compact(values.get("daemon")) + " gate=" + compact(gate))
except Exception:
    print("gate=none")
    print("selftest: setup=null daemon=null gate={\"kind\":\"none\"}")
'
}

# selftest_turn: the turn's progress, from the Session phases after the
# `input` mark in the probe's trace on stdin: `ended=<phase>` once Jarvis has
# worked and rests again (idle, listening or armed), or a fault or the gate
# stopped it (error, down); `confirming` while a request waits for the
# user; else `waiting`.
selftest_turn() {
  py_reply '
import json, sys
events = json.load(sys.stdin)
marks = [i for i, e in enumerate(events) if e["kind"] == "mark" and e["value"] == "input"]
phases = [e["value"] for e in events[marks[0]:] if e["kind"] == "phase"] if marks else []
last = phases[-1] if phases else ""
worked = any(phase in ("thinking", "speaking", "acting", "confirming") for phase in phases)
ended = last in ("error", "down") or worked and last in ("idle", "listening", "armed")
print("ended=" + last if ended else "confirming" if last == "confirming" else "waiting")
'
}

# selftest_wait SECONDS WANT CMD...: CMD's answer polled every 0.2 s until
# it is WANT, for SECONDS at most; the last answer is left in `reading`.
selftest_wait() { # SECONDS WANT CMD...
  local until=$((SECONDS + $1)) want="$2"
  shift 2
  while :; do
    reading="$("$@")" || reading=unread
    [[ $reading != "$want" ]] || return 0
    ((SECONDS < until)) || return 1
    sleep 0.2
  done
}

# selftest_draw_ms TREE: Session's draw guard in milliseconds, from TREE's
# own Session.js: how long after a request is shown Session refuses a
# confirm of it as early.
selftest_draw_ms() { # TREE
  env -i "$selftest_node" - "$1" <<'JS'
    const path = require("node:path");
    const [tree] = process.argv.slice(2);
    const { load } = require(path.join(tree, "bin/lib/qml-library.js"));
    const bound = load(path.join(tree, "shell/plugins/vgs.jarvis/Session.js")).APPROVAL_DRAW_MS;
    if (!Number.isSafeInteger(bound) || bound < 0) process.exit(1);
    console.log(bound);
JS
}

# selftest_shown: the request Jarvis holds and has shown, from the probe's
# jarvisProcess reply on stdin, as `<gen>:<id>`; `none` with no request held
# or one Session has no shown time for yet.
selftest_shown() {
  py_reply '
import json, sys
detail = json.load(sys.stdin)["status"].get("detail")
held = detail["state"]["approval"] if detail else {"kind": "none"}
print("%s:%s" % (held["gen"], held["id"]) if held["kind"] == "held" and held["shownAt"] is not None else "none")
'
}

# selftest_confirm DRAW_MS NOW_MS REQUEST: the Confirm key pressed once for
# REQUEST, selftest_shown's word, and no sooner than DRAW_MS after this run
# first read it as shown, which is later than the time Session counts from.
# Session refuses an earlier press and the audit records that as a refused
# tool call, which the record would list as Jarvis's own refusal. A press
# the probe did not send is made again at a later call. `confirm_seen`,
# `confirm_seen_ms` and `confirm_pressed` carry the request between calls.
selftest_confirm() { # DRAW_MS NOW_MS REQUEST
  local reply
  [[ $3 == *:* && $3 != "${confirm_pressed:-}" ]] || return 0
  if [[ $3 != "${confirm_seen:-}" ]]; then confirm_seen="$3" confirm_seen_ms="$2"; fi
  (($2 - confirm_seen_ms >= $1)) || return 0
  reply="$(ipc smoke jarvisConfirm)" || return 0
  [[ $reply != sent ]] || confirm_pressed="$3"
}


# selftest_woke: the wake-word trace after the input mark on stdin, `armed`
# when every phase after the mark stayed armed, else `woke`.
selftest_woke() {
  py_reply '
import json, sys
events = json.load(sys.stdin)
marks = [i for i, e in enumerate(events) if e["kind"] == "mark" and e["value"] == "input"]
phases = [e["value"] for e in events[marks[0]:] if e["kind"] == "phase"] if marks else []
print("armed" if marks and all(phase == "armed" for phase in phases) else "woke")
'
}

# selftest_end TURN: the record's end.kind for selftest_turn's last word: a
# turn a fault stopped is fault, one the gate stopped is gate-down, a wake
# capture that never woke is no-wake, any other ended turn is completed, and
# a turn that never ended is timeout.
selftest_end() { # TURN
  case "$1" in
    ended=error) echo fault ;;
    ended=down) echo gate-down ;;
    no-wake) echo no-wake ;;
    ended=*) echo completed ;;
    *) echo timeout ;;
  esac
}

# selftest_audio SOUNDS_JSON SPEECH_END_MS WINDOW_END_MS: first audible
# reply latency and longest silent gap. ChainedEngine.js earcon() emits 80 ms
# start and 120 ms working tones, so first audio ignores sounds shorter than
# 200 ms while gaps count every sound the user hears.
selftest_audio() { # SOUNDS_JSON SPEECH_END_MS WINDOW_END_MS
  python3 - "$@" <<'PY'
import json, sys
sounds = json.loads(sys.argv[1])
speech_end, window_end = int(sys.argv[2]), int(sys.argv[3])
reply = sorted((max(int(s), speech_end), min(int(e), window_end)) for s, e in sounds if int(s) >= speech_end and int(s) < window_end and int(e) > speech_end)
first = next((s - speech_end for s, e in reply if e - s >= 200), None)
if not reply:
    print(json.dumps({"firstMs": None, "longestGapMs": max(0, window_end - speech_end)}, separators=(",", ":")))
    sys.exit(0)
last_end = max(e for _, e in reply)
covered = []
for start, end in reply:
    if end <= speech_end or start >= last_end:
        continue
    covered.append([max(start, speech_end), min(end, last_end)])
covered.sort()
gaps, cursor = [], speech_end
for start, end in covered:
    if start > cursor:
        gaps.append(start - cursor)
    if end > cursor:
        cursor = end
if cursor < last_end:
    gaps.append(last_end - cursor)
print(json.dumps({"firstMs": first, "longestGapMs": max(gaps or [0])}, separators=(",", ":")))
PY
}

# selftest_audio_record SOUNDS_JSON SPEECH_END_MS WINDOW_END_MS: the
# record's audio object with absolute shell-clock spans. selftest_record moves
# them onto the trace input mark's clock.
selftest_audio_record() { # SOUNDS_JSON SPEECH_END_MS WINDOW_END_MS
  local measure
  measure="$(selftest_audio "$1" "$2" "$3")" || return 1
  python3 - "$1" "$2" "$measure" <<'PY'
import json, sys
sounds, speech_end, measure = json.loads(sys.argv[1]), int(sys.argv[2]), json.loads(sys.argv[3])
print(json.dumps({"speechEndMs": speech_end, "firstMs": measure["firstMs"], "longestGapMs": measure["longestGapMs"], "sounds": [[int(s), int(e)] for s, e in sounds]}, separators=(",", ":")))
PY
}

# selftest_wav_tail WAV: milliseconds after WAV's last sample louder than
# two percent of its peak. The self-test accepts 16-bit PCM WAV only.
selftest_wav_tail() { # WAV
  python3 - "$1" <<'PY'
import array, sys, wave
try:
    with wave.open(sys.argv[1], "rb") as file:
        channels, rate, width, frames = file.getnchannels(), file.getframerate(), file.getsampwidth(), file.getnframes()
        data = file.readframes(frames)
except Exception:
    sys.exit(1)
if width != 2 or channels < 1 or rate <= 0:
    sys.exit(1)
samples = array.array("h")
samples.frombytes(data[:len(data) // 2 * 2])
if sys.byteorder != "little":
    samples.byteswap()
if not samples:
    print(0)
    sys.exit(0)
peak = max(abs(v) for v in samples)
if peak == 0:
    print(round(frames * 1000 / rate))
    sys.exit(0)
threshold = peak * 0.02
last_frame = 0
for index in range(0, len(samples), channels):
    if max(abs(v) for v in samples[index:index + channels]) > threshold:
        last_frame = index // channels + 1
print(round((frames - last_frame) * 1000 / rate))
PY
}

# selftest_speech_tail WAV: compatibility wrapper for host controls.
selftest_speech_tail() { # WAV
  selftest_wav_tail "$1" || stopped wav-unreadable "$1"
}

# selftest_open KIND MODE VALUE WAV TAIL_MS: open one turn, set
# input_started_ms and speech_end_ms, and feed the input. Always mode sends no
# Talk intent.
selftest_open() { # KIND MODE VALUE WAV TAIL_MS
  local kind="$1" mode="$2" value="$3" sound="${4:-}" tail="${5:-0}" reply feed_done
  if [[ $kind == type ]]; then
    [[ $(ipc smoke markJarvisTrace input) == ok ]] || stopped trace-not-marked
    input_started_ms="$(now_ms)"
    speech_end_ms="$input_started_ms"
    reply="$(ipc vgs.jarvis invoke say "$value")" || reply=unread
    [[ $reply == ok ]] || stopped say-refused "$reply"
    return 0
  fi
  if [[ $mode == always ]]; then
    selftest_wait 30 armed selftest_service_phase || stopped_gate microphone-not-open "phase=$reading"
    # Always arms while the local voice still loads, and the sidecar drops
    # every frame until its models are ready.
    selftest_wait 60 loaded selftest_voice_state || stopped_gate voice-loading "voice=$reading"
    selftest_wait 10 ready devices_voice_feed_state || stopped no-voice-feed "$reading"
    [[ $(ipc smoke markJarvisTrace input) == ok ]] || stopped trace-not-marked
    input_started_ms="$(now_ms)"
    devices_voice_feed "$sound" || stopped no-voice-feed player-failed
    feed_done="$(now_ms)"
  else
    ipc smoke invokeInstance service vgs.jarvis intent talk-down >/dev/null || stopped talk-not-sent
    selftest_wait 30 listening traced widget || stopped microphone-not-open "widget=$reading"
    selftest_wait 30 listening traced phase || stopped microphone-not-open "phase=$reading"
    selftest_wait 10 ready devices_voice_feed_state || stopped no-voice-feed "$reading"
    [[ $(ipc smoke markJarvisTrace input) == ok ]] || stopped trace-not-marked
    input_started_ms="$(now_ms)"
    devices_voice_feed "$sound" || stopped no-voice-feed player-failed
    feed_done="$(now_ms)"
  fi
  speech_end_ms=$((feed_done - tail))
}

# selftest_record TRACE AUDIT OUT PHASE FAULT KIND VALUE BRAIN HOME VOICE
# MODE CONFIRM MAILBOX END KEPT BRAIN_TEXT AUDIO_JSON: the record the header describes,
# written to OUT by rename, from the probe's trace in the file TRACE, the
# audit records under AUDIT, which may be absent, and the daemon's own trace
# of brain text in the file BRAIN_TEXT. HOME is "" for none, MAILBOX is
# selftest_mailbox's lines, END is selftest_end's word and KEPT says whether
# the run kept every rule selftest_finish reads. Prints `passed` or `failed`.
selftest_record() {
  python3 - "$@" <<'PY'
import json, os, sys
trace, audit, out, phase, fault, kind, value, brain, home, voice, mode, confirm, mailbox, end, kept, brain_text, *rest = sys.argv[1:]
audio = json.loads(rest[0]) if rest else {"speechEndMs": None, "firstMs": None, "longestGapMs": None, "sounds": []}
events = json.load(open(trace))
# ChainedEngine.js writes one line for each text event of a brain turn.
raw, turn = [], None
for row in map(json.loads, open(brain_text)):
    if (row["gen"], row["op"]) != turn:
        turn = (row["gen"], row["op"])
        raw.append("")
    raw[-1] += row["text"]
first = next(i for i, e in enumerate(events) if e["kind"] == "mark" and e["value"] == "input")
start = events[first]["at"]
audio = {**audio, "speechEndMs": None if audio.get("speechEndMs") is None else int(audio["speechEndMs"]) - start,
         "sounds": [[int(s) - start, int(e) - start] for s, e in audio.get("sounds", [])]}
heard, sentences, shown, segment = None, [], "", None
for event in events[first:]:
    if event["kind"] != "caption":
        continue
    caption = event["value"]
    if caption["role"] != "assistant":
        if heard is None and caption["stage"] == "final":
            heard = caption["text"]
        shown, segment = "", None
        continue
    text = caption["text"]
    if voice == "realtime":
        # Realtime.js writes a segment once for each fragment of the voice's
        # transcript, so a write is no sentence: the segment is one entry,
        # timed at its first write and holding its last.
        if segment is None and text.strip():
            segment = {"ms": event["at"] - start, "text": ""}
            sentences.append(segment)
        if segment is not None:
            segment["text"] = text.strip()
        if caption["stage"] == "final":
            segment = None
        continue
    # ChainedEngine.js grows a segment by one released sentence a write.
    new = (text[len(shown):] if text.startswith(shown) else text).strip()
    if new:
        sentences.append({"ms": event["at"] - start, "text": new})
    shown = "" if caption["stage"] == "final" else text
tools = []
for name in sorted(os.listdir(audit)) if os.path.isdir(audit) else []:
    for line in open(os.path.join(audit, name)):
        row = json.loads(line)
        if row["kind"] == "action":
            tools.append({key: row[key] for key in ("tool", "decision", "confirmed", "outcome")})
passed = end == "completed" and heard is not None and kept == "true"
record = {"input": {"kind": kind, "value": value}, "brain": brain, "home": home or None, "voice": voice,
          "mode": mode, "confirm": confirm, "heard": heard, "sentences": sentences, "raw": raw, "tools": tools,
          "mailbox": [json.loads(line) for line in mailbox.splitlines()] if home else None,
          "widget": [{"ms": e["at"] - start, "state": e["value"]} for e in events if e["kind"] == "widget" and e["value"]],
          "phases": [{"ms": e["at"] - start, "phase": e["value"]} for e in events if e["kind"] == "phase" and e["value"]],
          "audio": audio, "end": {"kind": end, "phase": phase, "fault": fault or None}, "passed": passed}
with open(out + ".next", "w") as file:
    json.dump(record, file, indent=2, ensure_ascii=False)
    file.write("\n")
os.replace(out + ".next", out)
print("passed" if passed else "failed")
PY
}

# selftest_status SUMMARY_MS: the cold-start status word from the probe's
# jarvisProcess reply on stdin, as one JSON object. The end place is ready
# when Setup is ready, setting when Setup names a user step, and problem
# when the daemon's lifetime or row names one.
selftest_status() {
  py_reply '
import json, sys
ms = int(sys.argv[1])
text = sys.stdin.read()
if text.strip() in ("absent", "missing", ""):
    print(json.dumps({"ms": ms, "place": "starting", "lifetime": text.strip() or "absent", "daemon": None, "setup": None, "cause": None}, separators=(",", ":")))
    sys.exit(0)
service = json.loads(text)
values = service.get("status", {})
daemon = values.get("daemon")
setup = values.get("setup")
lifetime = service.get("lifetime", {}).get("kind", "unknown")
cause = service.get("cause") or None
if cause is None and isinstance(setup, dict):
    lines = setup.get("lines")
    if isinstance(lines, list) and lines:
        cause = lines[0]
place = "starting"
if lifetime == "problem" or (isinstance(daemon, dict) and daemon.get("tone") == "danger"):
    place = "problem"
elif lifetime == "ready" and isinstance(setup, dict) and setup.get("tone") == "ok":
    place = "ready"
elif lifetime == "ready" and isinstance(setup, dict) and setup.get("tone") in ("warning", "danger"):
    place = "setting" if setup.get("tone") == "warning" else "problem"
print(json.dumps({"ms": ms, "place": place, "lifetime": lifetime, "daemon": daemon, "setup": setup, "cause": cause}, separators=(",", ":")))
' "$1"
}

# selftest_cold_record OUT CPU START_JSON...: write the cold-start record by
# rename. START_JSON values are complete start records.
selftest_cold_record() {
  python3 - "$@" <<'PY'
import json, os, sys
out, cpu, starts = sys.argv[1], sys.argv[2], [json.loads(word) for word in sys.argv[3:]]
record = {"kind": "cold-starts", "cpuPressure": cpu, "starts": starts}
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out + ".next", "w") as file:
    json.dump(record, file, indent=2, ensure_ascii=False)
    file.write("\n")
os.replace(out + ".next", out)
PY
}

# selftest_cold_start INDEX BOUND_MS: one disable/enable start, as JSON.
selftest_cold_start() {
  local index="$1" bound_ms="$2" started now status comparable last="" changes=() reply end=""
  reply="$(ipc shell setPluginEnabled vgs.jarvis false)" || reply=unread
  [[ $reply == ok ]] || stopped jarvis-not-disabled "$reply"
  selftest_wait 10 absent ipc smoke jarvisProcess || stopped jarvis-not-disabled "$reading"
  started="$(now_ms)"
  reply="$(ipc shell setPluginEnabled vgs.jarvis true)" || reply=unread
  [[ $reply == ok ]] || stopped jarvis-not-enabled "$reply"
  while :; do
    now="$(now_ms)"
    status="$(ipc smoke jarvisProcess | selftest_status "$((now - started))")" || { printf 'selftest=cold-read-unread start=%s\n' "$index" >&2; return 1; }
    comparable="$(python3 -c 'import json,sys; row=json.loads(sys.argv[1]); row.pop("ms", None); print(json.dumps(row, sort_keys=True, separators=(",", ":")))' "$status")" || return 1
    if [[ $comparable != "$last" ]]; then changes+=("$status"); last="$comparable"; fi
    end="$status"
    case "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["place"])' "$status")" in
      ready|setting|problem) break ;;
    esac
    if ((now - started >= bound_ms)); then
      printf 'selftest=cold-timeout start=%s bound_ms=%s\n' "$index" "$bound_ms" >&2
      return 1
    fi
    sleep 0.2
  done
  python3 - "$index" "$end" "${changes[@]}" <<'PY'
import json, sys
index, end, changes = int(sys.argv[1]), json.loads(sys.argv[2]), [json.loads(word) for word in sys.argv[3:]]
print(json.dumps({"index": index, "ms": end["ms"], "endPlace": end["place"], "keyedCause": end.get("cause"), "changes": changes}, separators=(",", ":")))
PY
}


selftest_cases_dir="$repo/scripts/jarvis-selftest-cases"

# selftest_case_check CASE_FILE: refuse malformed suite case files.
selftest_case_check() { # CASE_FILE
  local root="${selftest_cases_dir:-$(dirname -- "$1")}"
  python3 - "$root" "$1" <<'PY'
import json, os, sys
root, path = sys.argv[1:]
try:
    data = json.load(open(path))
except Exception as error:
    print(f"case=malformed path={path} reason=json", file=sys.stderr)
    sys.exit(1)
keys = {"input", "mode", "confirm", "heard", "tool", "said"}
if set(data) != keys:
    print(f"case=malformed path={path} reason=keys", file=sys.stderr)
    sys.exit(1)
if not isinstance(data["input"], dict) or len(data["input"]) != 1 or next(iter(data["input"])) not in ("tts", "wav"):
    print(f"case=malformed path={path} reason=input", file=sys.stderr)
    sys.exit(1)
kind, value = next(iter(data["input"].items()))
if not isinstance(value, str) or value == "":
    print(f"case=malformed path={path} reason=input-value", file=sys.stderr)
    sys.exit(1)
if kind == "wav" and not os.path.isfile(os.path.join(root, value)):
    print(f"case=malformed path={path} reason=wav-unreadable", file=sys.stderr)
    sys.exit(1)
if data["mode"] not in ("toggle", "always") or data["confirm"] not in ("none", "key"):
    print(f"case=malformed path={path} reason=enum", file=sys.stderr)
    sys.exit(1)
word_pattern = __import__("re").compile(r"^[a-z0-9]+(?:\|[a-z0-9]+)*$")
if not all(isinstance(data[key], list) and data[key] and all(isinstance(word, str) and word_pattern.fullmatch(word) for word in data[key]) for key in ("heard", "said")):
    print(f"case=malformed path={path} reason=words", file=sys.stderr)
    sys.exit(1)
if not isinstance(data["tool"], str) or data["tool"] == "":
    print(f"case=malformed path={path} reason=tool", file=sys.stderr)
    sys.exit(1)
PY
}

# selftest_compare CASE_FILE RECORD SOURCE: add the case verdict to RECORD and
# print `match` or `differs fields=a,b`. SOURCE is case for tracked input
# and local for --voices.
selftest_compare() { # CASE_FILE RECORD SOURCE
  python3 - "$1" "$2" "${3:-case}" <<'PY'
import json, os, re, sys
case_file, record_file, source = sys.argv[1:]
case = json.load(open(case_file))
record = json.load(open(record_file))
def tokens(text):
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))
def has_words(text, expected):
    held = tokens(text)
    return all(any(alt in held for alt in item.lower().split("|")) for item in expected)
fields = []
if not record.get("passed"):
    fields.append("turn")
if not has_words(record.get("heard"), case["heard"]):
    fields.append("heard")
tools = [row for row in record.get("tools") or [] if row.get("outcome") == "completed"]
if case["tool"] == "none":
    if tools:
        fields.append("tool")
elif not any(row.get("tool") == case["tool"] for row in tools):
    fields.append("tool")
spoken = " ".join(row.get("text", "") for row in record.get("sentences") or [])
if not has_words(spoken, case["said"]):
    fields.append("said")
if (record.get("audio") or {}).get("firstMs") is None:
    fields.append("audio")
record["case"] = {"name": os.path.splitext(os.path.basename(case_file))[0], "source": source, "expect": {key: case[key] for key in ("heard", "tool", "said")}, "differs": fields}
with open(record_file + ".next", "w") as out:
    json.dump(record, out, indent=2, ensure_ascii=False)
    out.write("\n")
os.replace(record_file + ".next", record_file)
print("match" if not fields else "differs fields=" + ",".join(fields))
PY
}


# selftest_case_child_args CASE_FILE VOICES_DIR: source=<case|local> then
# the child selftest input, mode and confirmation arguments, one per line.
selftest_case_child_args() { # CASE_FILE VOICES_DIR
  local root="${selftest_cases_dir:-$(dirname -- "$1")}"
  python3 - "$root" "$1" "$2" <<'PY'
import json, os, sys
root, path, voices = sys.argv[1:]
name = os.path.splitext(os.path.basename(path))[0]
case = json.load(open(path))
local = os.path.join(voices, name + ".wav") if voices else ""
if local and os.path.isfile(local):
    source, kind, value = "local", "wav", local
else:
    source = "case"
    kind, value = next(iter(case["input"].items()))
    if kind == "wav":
        value = os.path.join(root, value)
print("source=" + source)
for word in ("--" + kind, value, "--mode", case["mode"], "--confirm", case["confirm"]):
    print(word)
PY
}

# selftest_suite_summary MATCHED DIFFER NOT_RUN FAILED DIR: print the suite
# summary and return its exit status.
selftest_suite_summary() { # CASES MATCHED DIFFER NOT_RUN FAILED DIR
  local cases="$1" matched="$2" differ="$3" not_run="$4" failed="$5" dir="$6"
  printf 'selftest=suite cases=%s matched=%s differ=%s not-run=%s dir=%s\n' "$cases" "$matched" "$differ" "$not_run" "$dir"
  if ((differ > 0 || failed > 0)); then return 1; fi
  if ((not_run > 0)); then return 77; fi
  return 0
}
# selftest_suite_stopped CASES MATCHED DIFFER NOT_RUN FAILED DIR: print a
# partial suite summary after a signal and fail the suite.
selftest_suite_stopped() { # CASES MATCHED DIFFER NOT_RUN FAILED DIR
  local cases="$1" matched="$2" differ="$3" not_run="$4" failed="$5" dir="$6"
  printf 'selftest=suite cases=%s matched=%s differ=%s not-run=%s dir=%s stopped=signal\n' "$cases" "$matched" "$differ" "$not_run" "$dir"
  return 1 # signal stops the suite
}

# selftest_suite CASE: run one or every case as child self-tests.
selftest_suite() { # NAME
  local suite_name="$1" dir="$out" case_file name source status verdict record fields matched=0 differ=0 not_run=0 failed=0 total=0 seen=0
  local -a case_files=() case_args=() child_args=()
  if [[ $suite_name == all ]]; then
    while IFS= read -r case_file; do case_files+=("$case_file"); done < <(find "$selftest_cases_dir" -maxdepth 1 -type f -name '*.json' | LC_ALL=C sort)
  else
    case_file="$selftest_cases_dir/$suite_name.json"
    [[ -f $case_file ]] || refuse "argument=--suite value=$suite_name reason=unknown-case"
    case_files=("$case_file")
  fi
  for case_file in "${case_files[@]}"; do selftest_case_check "$case_file" || refuse "argument=--suite value=$(basename "$case_file" .json) reason=malformed-case"; done
  selftest_gpu_fence
  total="${#case_files[@]}"
  mkdir -p -- "$dir"
  suite_stop=false
  trap 'suite_stop=true' INT TERM HUP
  for case_file in "${case_files[@]}"; do
    name="$(basename "$case_file" .json)"
    mode="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["mode"])' "$case_file")" || return 1
    record="$dir/$name.json"
    python3 - "$record" <<'PY'
import os, sys
for path in (sys.argv[1], sys.argv[1] + ".next"):
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
PY
    status=0
    source=case
    case_args=()
    while IFS= read -r word; do
      if [[ $word == source=* ]]; then source="${word#source=}"; else case_args+=("$word"); fi
    done < <(selftest_case_child_args "$case_file" "$voices_dir")
    if [[ $mode == always && $voice == realtime ]]; then
      printf 'case=%s source=%s skipped=always-local-voice\n' "$name" "$source"
      not_run=$((not_run + 1))
      continue
    fi
    child_args=("${case_args[@]}" --brain "$brain" --voice "$voice")
    [[ -z $home_source ]] || child_args+=(--home "$home_source")
    child_args+=(--out "$record")
    "$self" "${child_args[@]}" || status=$?
    if [[ $status -eq 77 ]]; then
      printf 'case=%s source=%s verdict=not-run status=77\n' "$name" "$source"
      not_run=$((not_run + 1))
    elif [[ -f $record ]]; then
      verdict="$(selftest_compare "$case_file" "$record" "$source")" || return 1
      case "$verdict" in
        match) printf 'case=%s source=%s verdict=match record=%s\n' "$name" "$source" "$record"; matched=$((matched + 1)) ;;
        differs*) fields="${verdict#differs fields=}"; printf 'case=%s source=%s verdict=differs fields=%s record=%s\n' "$name" "$source" "$fields" "$record"; differ=$((differ + 1)) ;;
      esac
    else
      printf 'case=%s source=%s verdict=failed status=%s\n' "$name" "$source" "$status"
      failed=$((failed + 1))
    fi
    seen=$((seen + 1))
    if [[ $suite_stop == true ]]; then
      selftest_suite_stopped "$seen" "$matched" "$differ" "$not_run" "$failed" "$dir"
      return 1
    fi
  done
  trap - INT TERM HUP
  selftest_suite_summary "$total" "$matched" "$differ" "$not_run" "$failed" "$dir"
}

selftest_gpu_fence() {
  "$repo/scripts/smoke/gpu-fence.sh" --check || exec "$repo/scripts/smoke/gpu-fence.sh" "$self" "${argv[@]}"
}

argv=("$@")
input_kind=""
input_value=""
suite_name=""
cold_count=0
brain=""
home_source=""
voice=local
voices_dir=""
input_tail=0
mode=toggle
mode_seen=false
confirm=none
confirm_seen=false
out=""
refuse() { printf 'jarvis-selftest: refused: %s\n' "$*" >&2; exit 2; }
# unavailable KEY...: the run could not run, which is never a pass.
unavailable() { printf 'selftest=%s\n' "$*"; exit 77; }
# stopped KEY...: a step of the run failed before it had a record. The
# shell's log, which holds the service's keyed causes, is shown when there
# is one.
stopped() {
  [[ -z ${instance_log:-} ]] || { echo "--- instance log tail"; tail -n 25 -- "$instance_log" || true; }
  printf 'selftest=%s\n' "$*"
  exit 1
}
# stopped_gate KEY...: stop with the current Jarvis gate kind added to KEY,
# and print setup, daemon and gate details before the final selftest line.
stopped_gate() {
  local context gate detail
  context="$(ipc smoke jarvisProcess | selftest_gate_context)" || context='gate=none
selftest: setup=null daemon=null gate={"kind":"none"}'
  [[ $context == gate=* ]] || context='gate=none
selftest: setup=null daemon=null gate={"kind":"none"}'
  gate="${context%%$'\n'*}"
  detail="${context#*$'\n'}"
  [[ $detail != "$context" ]] || detail='selftest: setup=null daemon=null gate={"kind":"none"}'
  printf '%s\n' "$detail"
  stopped "$@" "$gate"
}
# selftest_finish TURN HOME_SUM AUTH_LOG FAILURES TRACE AUDIT OUT PHASE FAULT
# KIND VALUE BRAIN HOME VOICE MODE CONFIRM TREE HOME_COPY BRAIN_TEXT AUDIO_JSON: the run's
# one verdict.
# It reads the rows the turn added to the mailbox of HOME_COPY, Jarvis's copy
# of HOME, with TREE's lane-mail, and what the run broke outside its turn:
# the folder HOME, when named, no longer sums to HOME_SUM; an authentication
# stand-in was reached, a keyring store or unlock among them (harness.sh's
# sentinels), which AUTH_LOG lists; the harness counted FAILURES failed
# sandbox checks. selftest_record gets that
# with the end of the turn TURN, selftest_turn's last word, so the record's
# `passed` and the exit status are one answer. Prints a line for each rule
# broken, then the run's last line, and exits 0 for a passed record and 1
# for any other.
selftest_finish() {
  local turn="$1" home_sum="$2" auth_log="$3" failures="$4" out="$7" home_source="${13}" tree="${17}" home_copy="${18}" brain_text="${19}" audio_json="${20:-}" end sum kept=true verdict mailbox=""
  [[ -n $audio_json ]] || audio_json='{"speechEndMs":null,"firstMs":null,"longestGapMs":null,"sounds":[]}'
  end="$(selftest_end "$turn")"
  if [[ -n $home_source ]]; then
    mailbox="$(selftest_mailbox "$tree" "$home_copy")" || stopped mailbox-unread
    sum="$(selftest_tree_sum "$home_source")" || stopped home-unread
    [[ $sum == "$home_sum" ]] || { kept=false; printf 'selftest: the home folder changed during the run: %s\n' "$home_source"; }
  fi
  if [[ -s $auth_log ]]; then kept=false; printf 'selftest: an authentication stand-in was reached: %s\n' "$auth_log"; sed 's/^/        /' -- "$auth_log"; fi
  [[ $failures -eq 0 ]] || { kept=false; printf 'selftest: %s sandbox check(s) failed above\n' "$failures"; }
  mkdir -p -- "$(dirname -- "$out")"
  verdict="$(selftest_record "${@:5:12}" "$mailbox" "$end" "$kept" "$brain_text" "$audio_json")" || stopped record-not-written
  printf 'selftest=%s record=%s\n' "$end" "$out"
  [[ $verdict == passed ]] || exit 1
  exit 0
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cold)
      [[ $# -ge 2 && $2 =~ ^[1-9][0-9]*$ ]] || refuse "argument=--cold value=${2-}"
      cold_count="$2"; shift 2 ;;
    --suite)
      [[ $# -ge 2 && -n $2 ]] || refuse "argument=--suite value=${2-}"
      suite_name="$2"; shift 2 ;;
    --wav|--tts|--type)
      [[ $# -ge 2 && -n $2 ]] || refuse "argument=$1 value=${2-}"
      [[ -z $input_kind ]] || refuse "argument=$1 reason=one-input"
      input_kind="${1#--}"; input_value="$2"; shift 2 ;;
    --brain|--home|--out|--voices)
      [[ $# -ge 2 && -n $2 ]] || refuse "argument=$1 value=${2-}"
      case "$1" in --brain) brain="$2" ;; --home) home_source="$2" ;; --out) out="$2" ;; --voices) voices_dir="$2" ;; esac
      shift 2 ;;
    --voice)
      [[ $# -ge 2 && $2 =~ ^(local|realtime)$ ]] || refuse "argument=--voice value=${2-}"
      voice="$2"; shift 2 ;;
    --mode)
      [[ $# -ge 2 && $2 =~ ^(toggle|always)$ ]] || refuse "argument=--mode value=${2-}"
      mode="$2"; mode_seen=true; shift 2 ;;
    --confirm)
      [[ $# -ge 2 && $2 =~ ^(key|none)$ ]] || refuse "argument=--confirm value=${2-}"
      confirm="$2"; confirm_seen=true; shift 2 ;;
    -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) refuse "argument=$1" ;;
  esac
done
if [[ -n $suite_name ]]; then
  [[ -z $input_kind ]] || refuse "argument=--suite reason=exclusive-with-input"
  ((cold_count == 0)) || refuse "argument=--suite reason=exclusive-with-cold"
  [[ $mode_seen == false ]] || refuse "argument=--suite reason=exclusive-with-mode"
  [[ $confirm_seen == false ]] || refuse "argument=--suite reason=exclusive-with-confirm"
  [[ -n $brain ]] || refuse "argument=--brain reason=missing"
  [[ -z $voices_dir || -d $voices_dir ]] || refuse "argument=--voices value=$voices_dir reason=not-a-directory"
  [[ $suite_name == all || -f $selftest_cases_dir/$suite_name.json ]] || refuse "argument=--suite value=$suite_name reason=unknown-case"
elif ((cold_count > 0)); then
  [[ -z $voices_dir ]] || refuse "argument=--voices reason=requires-suite"
  [[ -z $input_kind ]] || refuse "argument=--cold reason=exclusive-with-input"
  [[ -z $brain ]] || refuse "argument=--cold reason=exclusive-with-brain"
  [[ -z $home_source ]] || refuse "argument=--cold reason=exclusive-with-home"
  [[ $voice == local ]] || refuse "argument=--cold reason=exclusive-with-voice"
  [[ $mode_seen == false ]] || refuse "argument=--mode reason=exclusive-with-cold"
  [[ $confirm == none ]] || refuse "argument=--cold reason=exclusive-with-confirm"
else
  [[ -z $voices_dir ]] || refuse "argument=--voices reason=requires-suite"
  [[ -n $input_kind ]] || refuse "argument=input reason=missing want=--wav|--tts|--type"
  [[ -n $brain ]] || refuse "argument=--brain reason=missing"
  [[ $mode != always || $input_kind != type ]] || refuse "argument=--mode value=always reason=always-needs-voice"
  [[ $mode != always || $voice != realtime ]] || refuse "argument=--mode value=always reason=always-needs-local-voice"
fi
if [[ $input_kind == wav ]]; then
  [[ -f $input_value && -r $input_value ]] || refuse "argument=--wav value=$input_value reason=unreadable"
  input_value="$(readlink -f -- "$input_value")"
  mkdir -p -- "$repo/tmp/selftest-records"
  input_tail_file="$repo/tmp/selftest-records/wav-tail-$$"
  if ! selftest_wav_tail "$input_value" >"$input_tail_file"; then
    python3 - "$input_tail_file" <<'PY'
import os, sys
try:
    os.unlink(sys.argv[1])
except FileNotFoundError:
    pass
PY
    refuse "argument=--wav value=$input_value reason=wav-not-pcm16"
  fi
  input_tail="$(cat -- "$input_tail_file")"
  python3 - "$input_tail_file" <<'PY'
import os, sys
try:
    os.unlink(sys.argv[1])
except FileNotFoundError:
    pass
PY
fi
if [[ -n $home_source ]]; then
  [[ -d $home_source ]] || refuse "argument=--home value=$home_source reason=not-a-directory"
  home_source="$(cd -- "$home_source" && pwd -P)"
fi
if [[ -z $out ]]; then
  if [[ -n $suite_name ]]; then
    out="$repo/tmp/selftest-records/suite-$(date -u +%Y%m%dT%H%M%SZ)"
  elif ((cold_count > 0)); then
    out="$repo/tmp/selftest-records/cold-$(date -u +%Y%m%dT%H%M%SZ).json"
  else
    out="$repo/tmp/selftest-records/selftest-$(date -u +%Y%m%dT%H%M%SZ).json"
  fi
fi

if [[ -n $suite_name ]]; then
  selftest_suite "$suite_name"
  exit $?
fi

if ((cold_count > 0)); then
  selftest_gpu_fence
  keep=false timeout_s=60
  source "$repo/scripts/smoke/harness.sh"
  plugin="$source_repo/shell/plugins/vgs.jarvis"
  stop_shell || stopped shell-not-stopped
  rm -rf -- "${repo:?}/shell/plugins/vgs.jarvis"
  cp -R -- "$plugin" "$repo/shell/plugins/vgs.jarvis"
  start_shell "$repo" "$sandbox/cold-shell.log" bar || stopped shell-not-started
  cpu_pressure="$(tr '\n' ';' </proc/pressure/cpu)"
  cold_starts=()
  for ((cold_index = 1; cold_index <= cold_count; cold_index++)); do
    if cold_start_record="$(selftest_cold_start "$cold_index" 120000)"; then
      cold_starts+=("$cold_start_record")
    else
      status=$?
      [[ -z $cold_start_record ]] || printf '%s\n' "$cold_start_record" >&2
      exit "$status"
    fi
  done
  selftest_cold_record "$out" "$cpu_pressure" "${cold_starts[@]}" || stopped record-not-written
  printf 'selftest=cold record=%s\n' "$out"
  exit 0
fi

# node on PATH may be a version manager's shim, which fails under an
# environment that is not the caller's; a child runs the binary itself.
selftest_node="$(node -e 'process.stdout.write(process.execPath)')" || unavailable account-judge-unavailable missing=node
accounts="$(selftest_accounts "$repo" "$brain" "$voice")" || stopped account-unread
{ IFS=$'\t' read -r brain_kind brain_first brain_second; IFS=$'\t' read -r voice_kind voice_account voice_reference; } <<<"$accounts"
account_word=()
key_references=()
case "$brain_kind" in
  unknown) refuse "argument=--brain value=$brain reason=unknown-account" ;;
  cli) account_word=("$brain_first=$brain_second") ;;
  keyring) key_references+=("$brain_first") ;;
esac
case "$voice_kind" in
  none) unavailable keyring-no-key key=unsaved ;;
  several) refuse "argument=--voice value=realtime reason=several-openai-keys" ;;
  # A brain that is this same key has named it already.
  keyring) [[ ${key_references[*]:-} == "$voice_reference" ]] || key_references+=("$voice_reference") ;;
esac
# What a key read needs, asked before anything starts.
if [[ ${#key_references[@]} -gt 0 ]]; then
  [[ -n ${DBUS_SESSION_BUS_ADDRESS:-} ]] || unavailable keyring-unavailable missing=session-bus
  for tool in xdg-dbus-proxy secret-tool busctl; do
    command -v -- "$tool" >/dev/null || unavailable keyring-unavailable "missing=$tool"
  done
  secret_tool="$(command -v -- secret-tool)"
fi
# The prepared local voice is the local voice's and the --tts speaker's.
local_root=""
if [[ $voice == local || $input_kind == tts ]]; then
  local_inputs="$(selftest_local_inputs)" || unavailable local-inputs-unavailable
  { read -r local_root; read -r local_marker; } <<<"$local_inputs"
fi

# No process this run starts may open an amdgpu node, so the run goes on
# only where none is visible: scripts/smoke/gpu-fence.sh.
selftest_gpu_fence

# shellcheck disable=SC2034 # the harness sourced below reads both
keep=false timeout_s=60
source "$repo/scripts/smoke/harness.sh"
# From here $repo is the sandbox's copy and $source_repo the checkout.
plugin="$source_repo/shell/plugins/vgs.jarvis"
draw_ms=0
if [[ $confirm == key ]]; then draw_ms="$(selftest_draw_ms "$source_repo")" || stopped draw-guard-unread; fi

if [[ $input_kind == tts ]]; then
  wav="$sandbox/selftest-input.wav"
  status=0
  selftest_speak "$plugin" "$local_root" "$input_value" "$wav" || status=$?
  [[ $status -ne 77 ]] || unavailable local-inputs-unavailable
  [[ $status -eq 0 ]] || stopped tts-failed "exit=$status"
  if ! selftest_wav_tail "$wav" >"$sandbox/selftest-input.tail"; then stopped tts-unreadable; fi
  input_tail="$(cat -- "$sandbox/selftest-input.tail")"
elif [[ $input_kind == wav ]]; then
  wav="$input_value"
fi

# The harness's shell started over its instrumented Jarvis copy and without
# the account. The checkout's plugin goes back whole, then the run's own
# shell starts with two extra words: the account's variable, and the path
# of the trace the daemon writes for a test run.
stop_shell || stopped shell-not-stopped
rm -rf -- "${repo:?}/shell/plugins/vgs.jarvis"
cp -R -- "$plugin" "$repo/shell/plugins/vgs.jarvis"
install -d -m 700 -- "$home/.local/share/vgshell/jarvis" "$home/.local/state/vgshell/jarvis"
if [[ $voice == local ]]; then
  # The prepared setup's marker names its own data root, so the sandbox's
  # data root is a link to it and the sidecar's readiness judge reads the
  # setup where setup-local made it.
  ln -s -- "$local_root" "$home/.local/share/vgshell/jarvis/local"
  cp -- "$local_marker" "$home/.local/state/vgshell/jarvis/local-ready.json"
fi
if [[ ${#key_references[@]} -gt 0 ]]; then
  # The filter runs with no environment and ends with the harness's other
  # children. Its socket is there once it listens.
  secrets_bus="$rt_dir/secrets-bus"
  spawn "$sandbox/secrets-bus.log" env -i "$(command -v -- xdg-dbus-proxy)" "$DBUS_SESSION_BUS_ADDRESS" "$secrets_bus" --filter "${selftest_secrets_rules[@]}"
  secrets_bus_state() { if [[ -S $secrets_bus ]]; then echo listening; else echo absent; fi; }
  selftest_wait 10 listening secrets_bus_state || stopped secrets-bus-not-started "$sandbox/secrets-bus.log"
  for reference in "${key_references[@]}"; do
    presence="$(selftest_key_presence "$source_repo" "unix:path=$secrets_bus" "$reference")" || stopped key-unread
    case "$presence" in
      present) ;;
      locked) unavailable keyring-locked ;;
      absent) unavailable keyring-no-key key=absent ;;
      unavailable) unavailable keyring-unavailable ;;
      *) stopped key-unread "$presence" ;;
    esac
  done
  selftest_keys_save "$source_repo" "$home/.local/state/vgshell/jarvis" "${key_references[@]}" >"$sandbox/selftest-lookups" || stopped keys-not-saved
  # Jarvis's lookups of the run's own keys go to the filtered bus. Every
  # other call stays the harness's sentinel's, which answers a read with
  # nothing stored and logs a store, a clear or an unlock.
  sentinel_stand_over "$shim/secret-tool" <<SH || stopped secret-tool-not-stood-over
#!/usr/bin/env bash
asked="\$(IFS=\$'\x1f'; printf '%s' "\$*")"
while IFS= read -r own; do
  [[ \$asked != lookup\$'\x1f'"\$own" ]] || DBUS_SESSION_BUS_ADDRESS=$(printf %q "unix:path=$secrets_bus") exec $(printf %q "$secret_tool") "\$@"
done <$(printf %q "$sandbox/selftest-lookups")
exec $(printf %q "$(sentinel_saved "$shim/secret-tool")") "\$@"
SH
fi
home_copy=""
home_sum=""
if [[ -n $home_source ]]; then
  # Jarvis holds a home folder only inside the user's home directory
  # (Home.js resolve), so the copy lies in the sandbox's HOME.
  home_copy="$home/jarvis-home"
  home_sum="$(selftest_tree_sum "$home_source")" || stopped home-unread
  selftest_home_copy "$home_source" "$home_copy" || stopped home-not-copied
  selftest_overseer "$home_copy" || stopped overseer-unrecorded
  # The Jarvis session's read before the turn: the read after it hands over
  # only the rows the turn added.
  selftest_mailbox "$source_repo" "$home_copy" >/dev/null || stopped mailbox-unread
fi
# The settings Jarvis starts with, written while it is still disabled.
# Speech plays to a null sink and never into the feed, and the microphone is
# the feed's source by name, whatever WirePlumber's defaults are.
settings="$(python3 - "$home/.config/vgshell/shell.json" "$brain" "$devices_voice_feed_source" "$home_copy" "$voice" "$mode" "${voice_account:-}" <<'PY'
import json, sys
path, brain, microphone, home, voice, mode, voice_account = sys.argv[1:]
config = json.load(open(path))
row = {"mode": mode, "brain": brain, "voiceProvider": voice, "microphone": microphone, "speaker": "vgs-smoke-speakers"}
if voice_account:
    row["voiceAccount"] = voice_account
if home:
    row["home"] = home
config["plugins"] = [r for r in config["plugins"] if r["id"] != "vgs.jarvis"] + [dict(row, id="vgs.jarvis")]
json.dump(config, open(path, "w"))
print(json.dumps(row))
PY
)" || stopped settings-not-written

status=0
devices_up || status=$?
[[ $status -ne 77 ]] || unavailable devices-unavailable "$devices_state"
[[ $status -eq 0 ]] || stopped devices-failed "$devices_state"
# The feed's two sides are there before Jarvis starts, with no reader yet.
selftest_wait 10 absent=recorder devices_voice_feed_state || stopped no-voice-feed "$reading"
start_shell "$repo" "$sandbox/selftest-shell.log" bar "${account_word[@]}" "VGS_JARVIS_TRACE=$sandbox/selftest-brain.jsonl" || stopped shell-not-started
# The owner's microphone, speakers and buses stay out of reach: the guard
# reads the shell every Jarvis process descends from.
guard="$(devices_guard "$shell_qs_pid")" || stopped device-guard unreadable
[[ $guard == inside ]] || stopped device-guard "$guard"

# Enabled as a user enables it, so the core places its widget in the bar.
reply="$(ipc shell setPluginEnabled vgs.jarvis true)" || reply=unread
[[ $reply == ok ]] || stopped jarvis-not-enabled "$reply"
bar="$(bar_key)" || stopped bar-unread
daemon_applied() { ipc smoke jarvisProcess | selftest_daemon "$settings"; }
widget_state() { ipc smoke readInstance "$bar" vgs.jarvis view | py_reply 'import json,sys; print(json.load(sys.stdin)["state"])'; }
traced() { ipc smoke jarvisTrace | selftest_last "$1"; }
# The sidecar loads its models before the gate comes up: LocalSpeech.js
# gives it 60 s, and this wait bounds that and the account check.
selftest_wait 120 applied daemon_applied || stopped_gate not-ready "$reading"
widget_want=ready
[[ $mode == always ]] && widget_want=listening
selftest_wait 120 "$widget_want" widget_state || stopped_gate not-ready "widget=$reading"
speaker_capture="$sandbox/selftest-speaker.jsonl"
devices_speaker_record "$speaker_capture"
speaker_state() { [[ -s $speaker_capture ]] && echo ready || echo waiting; }
selftest_wait 10 ready speaker_state || stopped speaker-capture-not-started
[[ $(ipc smoke beginJarvisTrace "$bar") == ok ]] || stopped trace-not-started

input_started_ms=""
speech_end_ms=""
selftest_open "$input_kind" "$mode" "$input_value" "${wav:-}" "$input_tail"

turn=waiting
turn_until=$((SECONDS + 300))
feed_end_seconds=$SECONDS
while ((SECONDS < turn_until)); do
  turn="$(ipc smoke jarvisTrace | selftest_turn)" || turn=unread
  [[ $turn != ended=* ]] || break
  if [[ $mode == always && $((SECONDS - feed_end_seconds)) -ge 30 ]]; then
    woke="$(ipc smoke jarvisTrace | selftest_woke)" || woke=woke
    if [[ $woke == armed ]]; then turn=no-wake; break; fi
  fi
  if [[ $turn == confirming && $confirm == key ]]; then
    request="$(ipc smoke jarvisProcess | selftest_shown)" || request=none
    selftest_confirm "$draw_ms" "$(now_ms)" "$request"
  fi
  sleep 0.2
done
phase="$(traced phase)" || phase=unread
fault="$(ipc smoke jarvisProcess | py_reply 'import json,sys; d=json.load(sys.stdin)["status"].get("detail"); print(d["state"]["fault"].get("reason", "") if d else "")')" || fault=unread
# Stop ends the conversation, so the trace ends with the widget at rest.
ipc vgs.jarvis invoke stop "" >/dev/null || true
window_end_ms="$(now_ms)"
selftest_wait 10 idle traced phase || true
devices_speaker_stop || stopped speaker-capture-not-stopped
speaker_sounds="$(devices_speaker_sounds "$speaker_capture")" || speaker_sounds='[]'
audio_json="$(selftest_audio_record "$speaker_sounds" "$speech_end_ms" "$window_end_ms")" || stopped audio-unread
ipc smoke jarvisTrace >"$sandbox/selftest-trace.json" || stopped trace-unread

selftest_finish "$turn" "$home_sum" "$auth_log" "$failures" "$sandbox/selftest-trace.json" "$home/.local/state/vgshell/jarvis/audit" "$out" \
  "$phase" "$fault" "$input_kind" "$input_value" "$brain" "$home_source" "$voice" "$mode" "$confirm" "$source_repo" "$home_copy" "$sandbox/selftest-brain.jsonl" "$audio_json"
