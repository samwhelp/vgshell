#!/usr/bin/env python3
"""A stand-in for the Jarvis package's `jarvis-session`, for tests and
sandbox scenes. A test copies it to
<home>/.agents/skills/jarvis/scripts/jarvis-session. It starts nothing.

Beside itself it appends one JSON line a call to calls.log: the argv, the
working folder, XDG_SESSION_ID and which of the shell's own variables
reached it. It answers from answers.json beside itself, an object keyed by
verb: {"exit": N, "object": {...}} prints the contract's object, with the
fields the entry leaves out filled in, and {"exit": N, "raw": TEXT} prints
TEXT as it is. A verb with no entry exits 2 with a keyed line, as the
contract's argument refusal does."""
import json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]
record = {"argv": argv, "cwd": os.getcwd(), "session": os.environ.get("XDG_SESSION_ID"),
          "leaked": sorted(name for name in ("TMUX", "TMUX_PANE", "VGSHELL_RUNNER_PID") if name in os.environ)}
fd = os.open(os.path.join(here, "calls.log"), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
os.write(fd, (json.dumps(record) + "\n").encode())
os.close(fd)
try:
    with open(os.path.join(here, "answers.json")) as source:
        answers = json.load(source)
except FileNotFoundError:
    answers = {}
entry = answers.get(argv[0]) if argv else None
if entry is None:
    sys.stderr.write("jarvis-session: verb=%s\n" % (argv[0] if argv else ""))
    sys.exit(2)
if "raw" in entry:
    sys.stdout.write(entry["raw"])
else:
    home = argv[argv.index("--home") + 1] if "--home" in argv else None
    value = {"v": 1, "home": home, "harness": None, "account": None, "origin": None, "boot": None, "terminal": None, "detail": ""}
    value.update(entry["object"])
    sys.stdout.write(json.dumps(value) + "\n")
sys.exit(entry.get("exit", 0))
