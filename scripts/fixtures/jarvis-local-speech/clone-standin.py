#!/usr/bin/env python3
"""Stand-in cloned voice: the clone environment's interpreter for test-jarvis-local-speech.py.

The suite installs this file as DATA/clone/venv/bin/python. It speaks the
clone wire of shell/plugins/vgs.jarvis/backend/clone-speech.py's header
(2026-10-12), written apart from local-speech.py. Each sentence it speaks is
the reference recording's own samples, or 0.125 repeated while no
recording exists, so a case reads which voice spoke and from what.
DATA/clone/scenario.json scripts it: start "ready" | "failed"; speak
"answer" | "end" (exit unanswered) | "foreign" (answer another id).
DATA/clone/log.jsonl records its argv and parent. No model, device or
network is touched.
"""
import json
import os
from pathlib import Path
import struct
import sys
import wave

args = sys.argv[1:]
models = Path(args[args.index("--models") + 1])
reference = Path(args[args.index("--reference") + 1])
root = models.parent
scenario = json.loads((root / "scenario.json").read_text())
with (root / "log.jsonl").open("a") as log:
    log.write(json.dumps({"argv": args, "pid": os.getpid(), "ppid": os.getppid()}) + "\n")


def send(header, payload=b""):
    head = json.dumps(header).encode()
    sys.stdout.buffer.write(struct.pack(">II", len(head), len(payload)) + head + payload)
    sys.stdout.buffer.flush()


def read(size):
    data = b""
    while len(data) < size:
        part = sys.stdin.buffer.read(size - len(data))
        if not part:
            return None
        data += part
    return data


if scenario.get("start", "ready") == "failed":
    send({"type": "failed", "cause": "load-failed"})
    sys.exit(77)
send({"type": "ready"})
while True:
    prefix = read(8)
    if prefix is None:
        sys.exit(0)
    head, size = struct.unpack(">II", prefix)
    body = read(head + size)
    header = json.loads(body[:head])
    if scenario.get("speak", "answer") == "end":
        sys.exit(0)
    if reference.is_file():
        with wave.open(str(reference)) as source:
            pcm = source.readframes(source.getnframes())
        samples = [value / 32768 for (value,) in struct.iter_unpack("<h", pcm)]
    else:
        samples = [0.125] * 100
    ident = header["id"] + (1 if scenario.get("speak") == "foreign" else 0)
    send({"type": "audio", "id": ident}, struct.pack("<%df" % len(samples), *samples))
    send({"type": "spoken", "id": ident, "rate": 24000})
