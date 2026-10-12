#!/usr/bin/env python3
"""Local speech sidecar: wake word, captions, turn end and text to speech for the daemon.

LocalSpeech.js starts it as the selected runtime's interpreter, inside a
private network namespace, as `python -I local-speech.py --state DIR --data DIR
--parent PID`. It holds setup's lock shared, so setup cannot replace the runtime
under it, and loads only after setup's readiness judge answers ready.

Wire, both directions: frames of a u32be header length, a u32be payload length,
a UTF-8 JSON object header and the payload bytes. Audio is float32 little-endian
mono. Ids are positive integers; each new request takes a larger id.
  in:  {type:"listen", id, detect}; {type:"wake", id}; {type:"check", id}; {type:"audio", id} + 16 kHz samples;
       {type:"end", id}; {type:"abort", id};
       {type:"speak", id, speaker} + one sentence's UTF-8 text
  out: {type:"ready"} once; {type:"partial", id, text, rev}; {type:"ended", id, speech};
       {type:"woke", id}; {type:"checked", id, result}; {type:"audio", id} + samples;
       {type:"spoken", id, rate}; {type:"failed", id?, cause}
A listen answers ended once, at its turn end or its end: speech says whether
voice activity found speech. The utterance's words are the core's dictation
recording's (D064), so no offline decode runs.
A speaker is the name of one of the voice artifact's `speakers`, whose index
is the model's sid; a name the loaded voice lacks answers failed speaker-unknown.
A wake request spots the keyword in its audio and answers woke once; it has no
end, only abort. A check uses that same detector until end, then answers ready,
silent (only zero or no samples), or not-heard. One input request is open at a time.
A failed frame without an id ends the sidecar. A message for an utterance the
sidecar already answered crossed that answer and is dropped. Stdin EOF exits 0;
the runtime not ready exits 77; a protocol violation exits 65; other failures 1.
Contract: docs/architecture/jarvis.md.
"""
import argparse
from array import array
import fcntl
import importlib.machinery
import importlib.util
import json
import math
import os
from pathlib import Path
import struct
import sys

HERE = Path(__file__).resolve().parent
# The plugin directory is never written, not even bytecode for setup-local.
sys.dont_write_bytecode = True
RATE = 16000
# Every header and audio payload, both directions.
HEADER_BYTES = 4096
PAYLOAD_BYTES = 64 * 1024
# Plan § 3.10 bounds maxUtteranceSeconds at 120; the VAD buffer holds as much.
UTTERANCE_SAMPLES = 120 * RATE
VAD_WINDOW = 512
# Retry semantic completion after more silence, without a wall-clock timer.
TURN_INTERVAL = RATE // 2
# The role of each engine the sidecar loads. A tier holds one engine for each
# role and no other, so setup downloads no model the sidecar leaves unloaded.
ROLES = {"piper": "tts", "kokoro": "tts", "silero": "vad", "nemotron": "captions",
         "smart-turn": "turn", "wake": "wake"}


class Protocol(Exception):
    """The daemon sent a frame outside the wire contract."""


class NotReady(Exception):
    """The runtime is not installed, not verified or being set up."""


class Failed(Exception):
    """One request failed; its keyed cause reaches the daemon."""


class Speech:
    """The loaded models of one tier the sidecar runs."""

    def __init__(self, vad, tts, rate, speakers, waveform, captions, turn, spotter, keywords):
        self.vad = vad
        self.tts = tts
        self.rate = rate
        self.speakers = speakers
        self.waveform = waveform
        self.captions = captions
        self.turn = turn
        self.spotter = spotter
        self.keywords = keywords

    def speak(self, text, speaker):
        """One sentence's samples in the voice SPEAKER names, at the voice's declared rate."""
        if speaker not in self.speakers:
            raise Failed("speaker-unknown")
        try:
            audio = self.tts.generate(text, sid=self.speakers.index(speaker), speed=1.0)
        except (RuntimeError, ValueError) as error:
            raise Failed("synthesis-failed") from error
        if audio.sample_rate != self.rate:
            raise Failed(f"synthesis-rate value={audio.sample_rate}")
        samples = array("f", audio.samples)
        if not samples or not all(math.isfinite(v) for v in samples) or not any(samples):
            raise Failed("synthesis-empty")
        return self.rate, samples


class Utterance:
    """One capture: cached CPU captions and a semantic end after VAD silence.

    Nemotron's partial result can change any word and is only a caption; the
    utterance's words are the core's dictation recording's.
    """

    def __init__(self, speech, detect_turn):
        self.speech = speech
        self.detect_turn = detect_turn
        self.samples = array("f")
        self.offset = 0
        self.last_turn = 0
        self.has_segment = False
        self.text = ""
        self.rev = 0
        self.stream = speech.captions.create_stream()
        self.stream.set_option("language", "en")
        speech.vad.reset()

    def push(self, received):
        if len(self.samples) + len(received) > UTTERANCE_SAMPLES:
            raise Failed("utterance-too-long")
        self.samples.extend(received)
        speech = self.speech
        # The pinned sherpa-onnx API keeps model state on this stream.
        # https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/sherpa-onnx/python/csrc/online-recognizer.cc
        self.stream.accept_waveform(RATE, speech.waveform(received))
        while speech.captions.is_ready(self.stream):
            speech.captions.decode_stream(self.stream)
        text = speech.captions.get_result(self.stream).strip()
        partial = None
        if text and text != self.text:
            self.text = text
            self.rev += 1
            partial = {"type": "partial", "text": text, "rev": self.rev}
        # is_speech_detected reports active speech, not a queued segment.
        # A max-duration segment must not end a turn while speech continues.
        # https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.8/sherpa-onnx/python/csrc/voice-activity-detector.cc
        while self.offset + VAD_WINDOW <= len(self.samples):
            speech.vad.accept_waveform(speech.waveform(self.samples[self.offset:self.offset + VAD_WINDOW]))
            self.offset += VAD_WINDOW
            while not speech.vad.empty():
                self.has_segment = True
                speech.vad.pop()
        ended = False
        if self.detect_turn and self.has_segment and not speech.vad.is_speech_detected() \
                and len(self.samples) - self.last_turn >= TURN_INTERVAL:
            self.last_turn = len(self.samples)
            probability = speech.turn(self.samples)
            if not math.isfinite(probability) or not 0 <= probability <= 1:
                raise Failed("turn-probability")
            ended = probability >= 0.5
        return partial, ended

    def heard(self):
        """Whether voice activity found speech: a segment it closed, or one the
        end of the capture closes, its last window padded with silence."""
        vad = self.speech.vad
        if not self.has_segment and self.offset < len(self.samples):
            window = self.samples[self.offset:]
            window.extend(array("f", bytes(4 * (VAD_WINDOW - len(window)))))
            vad.accept_waveform(self.speech.waveform(window))
            self.offset = len(self.samples)
        if not self.has_segment:
            vad.flush()
            self.has_segment = not vad.empty()
        return self.has_segment


class Wake:
    """One wake capture on one keyword stream; its state is the stream's, so
    memory stays fixed however long the capture runs."""

    def __init__(self, speech, check=False):
        self.speech = speech
        self.check = check
        self.heard = False
        self.sound = False
        # None is a keyword the model cannot encode, as measure-local's probe reads it.
        self.stream = speech.spotter.create_stream(speech.keywords)
        if self.stream is None:
            raise Failed("wake-keywords")

    def push(self, received):
        """Whether the keyword ended in these samples."""
        self.sound = self.sound or any(received)
        if self.check and self.heard:
            return False
        spotter = self.speech.spotter
        self.stream.accept_waveform(RATE, self.speech.waveform(received))
        while spotter.is_ready(self.stream):
            spotter.decode_stream(self.stream)
            if spotter.get_result(self.stream):
                self.heard = True
                return not self.check
        return False

    def result(self):
        return "ready" if self.heard else "not-heard" if self.sound else "silent"


def little(samples):
    """Wire samples are little-endian whatever the host order."""
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def read_exact(reader, size):
    data = b""
    while len(data) < size:
        part = reader.read(size - len(data))
        if not part:
            return data
        data += part
    return data


def frames(reader):
    """Yield (header, payload) until EOF at a frame boundary."""
    while True:
        prefix = read_exact(reader, 8)
        if not prefix:
            return
        if len(prefix) != 8:
            raise Protocol("frame=truncated")
        head, size = struct.unpack(">II", prefix)
        if not 0 < head <= HEADER_BYTES or size > PAYLOAD_BYTES:
            raise Protocol("frame=too-large")
        body = read_exact(reader, head + size)
        if len(body) != head + size:
            raise Protocol("frame=truncated")
        try:
            header = json.loads(body[:head].decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise Protocol("header=invalid") from None
        if not isinstance(header, dict):
            raise Protocol("header=invalid")
        yield header, body[head:]


def send(writer, header, payload=b""):
    head = json.dumps(header, separators=(",", ":")).encode("utf-8")
    writer.write(struct.pack(">II", len(head), len(payload)) + head + payload)
    writer.flush()


# The keys each inbound type carries, and whether it carries a payload.
SHAPES = {"listen": ({"type", "id", "detect"}, False), "wake": ({"type", "id"}, False),
          "check": ({"type", "id"}, False),
          "audio": ({"type", "id"}, True), "end": ({"type", "id"}, False),
          "abort": ({"type", "id"}, False), "speak": ({"type", "id", "speaker"}, True)}


def serve(reader, writer, speech):
    """Answer requests in arrival order until EOF."""
    highest = 0
    utterances = {}
    for header, payload in frames(reader):
        kind = header.get("type")
        if kind not in SHAPES or set(header) != SHAPES[kind][0] or (payload != b"") != SHAPES[kind][1]:
            raise Protocol(f"message=invalid type={kind}")
        ident = header["id"]
        if type(ident) is not int or ident <= 0:
            raise Protocol("id=invalid")
        fresh = ident > highest
        highest = max(highest, ident)
        if kind == "listen":
            if not fresh or type(header["detect"]) is not bool or utterances:
                raise Protocol("listen=invalid")
            utterances[ident] = Utterance(speech, header["detect"])
            continue
        if kind in ("wake", "check"):
            if not fresh or utterances:
                raise Protocol("wake=invalid")
            try:
                utterances[ident] = Wake(speech, kind == "check")
            except Failed as failure:
                send(writer, {"type": "failed", "id": ident, "cause": str(failure)})
            continue
        if kind == "speak":
            try:
                text = payload.decode("utf-8")
            except UnicodeDecodeError:
                raise Protocol("speak=invalid") from None
            if not fresh or not text.strip():
                raise Protocol("speak=invalid")
            speaker = header["speaker"]
            if type(speaker) is not str:
                raise Protocol("speak=speaker")
            try:
                rate, samples = speech.speak(text, speaker)
            except Failed as failure:
                send(writer, {"type": "failed", "id": ident, "cause": str(failure)})
                continue
            data = little(samples).tobytes()
            for offset in range(0, len(data), PAYLOAD_BYTES):
                send(writer, {"type": "audio", "id": ident}, data[offset:offset + PAYLOAD_BYTES])
            send(writer, {"type": "spoken", "id": ident, "rate": rate})
            continue
        if fresh:
            raise Protocol("utterance=unstarted")
        if ident not in utterances:
            continue
        if kind == "abort":
            del utterances[ident]
        elif kind == "audio":
            if len(payload) % 4:
                raise Protocol("audio=partial-sample")
            received = array("f")
            received.frombytes(payload)
            if isinstance(utterances[ident], Wake):
                try:
                    woke = utterances[ident].push(little(received))
                except (RuntimeError, ValueError):
                    utterances.pop(ident)
                    send(writer, {"type": "failed", "id": ident, "cause": "wake-failed"})
                    continue
                if woke:
                    utterances.pop(ident)
                    send(writer, {"type": "woke", "id": ident})
                continue
            try:
                partial, ended = utterances[ident].push(little(received))
                if partial is not None:
                    send(writer, {**partial, "id": ident})
                if ended:
                    utterances.pop(ident)
                    send(writer, {"type": "ended", "id": ident, "speech": True})
            except Failed as failure:
                utterances.pop(ident, None)
                send(writer, {"type": "failed", "id": ident, "cause": str(failure)})
        elif isinstance(utterances[ident], Wake):
            wake = utterances.pop(ident)
            if not wake.check:
                raise Protocol("end=wake")
            send(writer, {"type": "checked", "id": ident, "result": wake.result()})
        else:
            send(writer, {"type": "ended", "id": ident, "speech": utterances.pop(ident).heard()})


def module(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    value = importlib.util.module_from_spec(spec)
    loader.exec_module(value)
    return value


def hold(state):
    """Hold setup's lock shared; the caller keeps it for its lifetime."""
    lock = (state / "local-setup.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise NotReady("setup-busy") from None
    return lock


def roles(artifacts, tier):
    """The tier's voice activity, caption, turn, wake and voice models, one each."""
    found = {}
    for artifact in artifacts:
        role = ROLES.get(artifact["engine"])
        if role is None:
            raise RuntimeError(f"tier=unknown-role engine={artifact['engine']} tier={tier}")
        if role in found:
            raise RuntimeError(f"tier=duplicate-role role={role} tier={tier}")
        found[role] = artifact
    if set(found) != set(ROLES.values()):
        raise RuntimeError(f"tier=missing-role tier={tier}")
    return found


def load(setup, state, data):
    """Load the ready tier through setup's readiness judge and pinned loaders.

    setup is the setup-local module: its status is the one readiness judge,
    and its artifact judge owns the upstream loader for each export.
    """
    judge = setup.measurement()
    if setup.status(judge, state, data)["tone"] != "ok":
        raise NotReady("runtime-not-ready")
    ready = json.loads((state / "local-ready.json").read_text())
    tier = ready["tier"]
    value = judge.manifest(setup.HERE / "artifacts.json")
    artifacts, provider = setup.selected(value, tier)
    chosen = roles(artifacts, tier)
    with judge.loading(data / "models"):
        try:
            judge.admit(ready["memory"], provider)
        except judge.Unavailable as error:
            raise NotReady(str(error)) from None
        import numpy as np
        import sherpa_onnx as sherpa
        models = {role: judge.load(artifact, data / "models", provider, np, sherpa)
                  for role, artifact in chosen.items()}
    def turn(samples):
        return judge.infer(chosen["turn"], models["turn"], np.frombuffer(samples, dtype=np.float32), "", value, np)["probability"]
    # The keyword is the one setup's probe decoded with this model.
    return Speech(models["vad"], models["tts"],
                  chosen["tts"]["outputSampleRate"], [speaker["name"] for speaker in chosen["tts"]["speakers"]],
                  lambda samples: np.frombuffer(samples, dtype=np.float32),
                  models["captions"], turn, models["wake"], value["fixture"]["wakeTokens"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--parent", type=int, required=True)
    args = parser.parse_args()
    # setpriv armed parent death before this check; a parent that already
    # ended would leave this process unowned.
    if os.getppid() != args.parent:
        raise RuntimeError("parent=ended")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    writer = sys.stdout.buffer
    try:
        lock = hold(args.state)
        speech = load(module("jarvis_setup", HERE.parent / "setup-local"), args.state, args.data)
    except NotReady as error:
        send(writer, {"type": "failed", "cause": str(error)})
        return 77
    with lock:
        send(writer, {"type": "ready"})
        serve(sys.stdin.buffer, writer, speech)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Protocol as error:
        print(f"jarvis-local-speech: protocol={error}", file=sys.stderr)
        sys.exit(65)
    except BrokenPipeError:
        sys.exit(0)
