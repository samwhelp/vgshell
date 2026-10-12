#!/usr/bin/env python3
"""The cloned voice: Chatterbox Turbo on the graphics card, for the local speech sidecar.

local-speech.py starts it through `setpriv --pdeathsig KILL` as the clone
environment's interpreter, `python -I clone-speech.py --models DIR --reference
WAV --parent PID`, with an explicit environment, in the sidecar's network
namespace. It has an environment of its own because onnxruntime-gpu cannot
share a process with the large tier's sherpa-onnx CUDA wheel (VGS-1384). It
loads the model through measure-local, the artifact judge, encodes the
reference once, then answers each request in arrival order.

Wire: local-speech.py's frames, both directions.
  in:  {type:"speak", id} + one sentence's UTF-8 text
  out: {type:"ready"} once, or {type:"failed", cause} and exit 77;
       {type:"audio", id} + float32 little-endian samples at 24000 Hz;
       {type:"spoken", id, rate}; {type:"failed", id, cause}
Stdin EOF exits 0; a protocol violation exits 65.
"""
import argparse
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
# The plugin directory is never written, not even bytecode.
sys.dont_write_bytecode = True
_loader = importlib.machinery.SourceFileLoader("jarvis_local_speech", str(HERE / "local-speech.py"))
wire = importlib.util.module_from_spec(importlib.util.spec_from_loader(_loader.name, _loader))
_loader.exec_module(wire)
judge = wire.module("jarvis_measure", HERE.parent / "measure-local")


def serve(reader, writer, voice, np):
    """Speak each sentence in the reference's voice until EOF."""
    for header, payload in wire.frames(reader):
        if set(header) != {"type", "id"} or header["type"] != "speak" or type(header["id"]) is not int:
            raise wire.Protocol("message=invalid")
        ident = header["id"]
        try:
            samples = voice.generate(payload.decode("utf-8"))
            if not len(samples) or not np.isfinite(samples).all() or not np.any(samples):
                raise ValueError("synthesis=empty")
        except Exception as error:
            # onnxruntime's own errors derive from Exception alone. One
            # sentence fails; the model stays loaded for the next.
            print(f"jarvis-clone-speech: failed={error}", file=sys.stderr)
            wire.send(writer, {"type": "failed", "id": ident, "cause": "synthesis-failed"})
            continue
        data = samples.astype("<f4").tobytes()
        for offset in range(0, len(data), wire.PAYLOAD_BYTES):
            wire.send(writer, {"type": "audio", "id": ident}, data[offset:offset + wire.PAYLOAD_BYTES])
        wire.send(writer, {"type": "spoken", "id": ident, "rate": voice.RATE})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--parent", type=int, required=True)
    args = parser.parse_args()
    # setpriv armed parent death before this check; a parent that already
    # ended would leave this process unowned.
    if os.getppid() != args.parent:
        raise RuntimeError("parent=ended")
    writer = sys.stdout.buffer
    try:
        import numpy as np
        value = judge.manifest(HERE.parent / "artifacts.json")
        row = next(artifact for artifact in value["artifacts"] if artifact["engine"] == "chatterbox")
        voice = judge.load(row, args.models, "cuda", np, None)
        voice.condition(judge.reference(args.reference, np))
    except Exception as error:
        print(f"jarvis-clone-speech: failed={error}", file=sys.stderr)
        wire.send(writer, {"type": "failed", "cause": "load-failed"})
        return 77
    wire.send(writer, {"type": "ready"})
    serve(sys.stdin.buffer, writer, voice, np)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except wire.Protocol as error:
        print(f"jarvis-clone-speech: protocol={error}", file=sys.stderr)
        sys.exit(65)
    except BrokenPipeError:
        sys.exit(0)
