#!/usr/bin/env python3
"""LocalRuntime's, LocalTier's and CloneRuntime's external-process double,
not installer or inference evidence.

Source: status capability state shape, synthetic J40 values, 2026-09-30.
J09 owns this process's environment. The nested row changes only mode bytes,
and for `--choices FILE` or `--clone FILE` the setup-local choices or clone
status answer FILE holds.
"""
import json
from pathlib import Path
import sys

if sys.argv[1] in ("--choices", "--clone"):
    # A row writes the file whole; an answer that is not JSON is refused here.
    print(json.dumps(json.loads(Path(sys.argv[2]).read_text())))
    sys.exit(0)
mode = Path(sys.argv[1]).read_text().strip()
if mode == "failed":
    sys.exit(77)
if mode == "hang":
    import time
    time.sleep(60)
if mode == "invalid":
    print("not JSON")
else:
    print(json.dumps({
        "absent": {"tone": "warning", "text": "Not set up", "action": True},
        "ready": {"tone": "ok", "text": "Ready: small", "action": False},
    }[mode]))
