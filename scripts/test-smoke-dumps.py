#!/usr/bin/env python3
"""Exercise the harness dump transport and its oversized-argv control."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

HARNESS = Path(__file__).resolve().parent / "smoke/harness.sh"
BASH = shutil.which("bash")
ENV = {"PATH": os.environ.get("PATH", ""), "LC_ALL": "C.UTF-8"}
source = HARNESS.read_text()


def function(name):
    found = re.search(r"(?ms)^" + name + r"\(\).*?^}\n", source)
    assert found, name
    return found.group()


with tempfile.TemporaryDirectory(prefix="smoke-dumps-") as scratch:
    root = Path(scratch)
    helper = root / "helpers.sh"
    helper.write_text(function("py_dumps") + function("py_reply"))
    values = [{"kind": kind, "text": 'é\n"\\' * 40000}
              for kind in ("page", "window", "surface", "card", "items")]
    dumps = [json.dumps(value, ensure_ascii=False, indent=2) for value in values]
    assert all(len(value.encode()) > 128 * 1024 for value in dumps)
    fixture = root / "dumps"
    fixture.write_bytes(b"\0".join(value.encode() for value in dumps) + b"\0")
    runner = '''set -euo pipefail
source "$1"
mapfile -d '' -t dumps < "$2"
py_dumps "${dumps[@]}" <<'PY'
import json,sys
print(json.dumps([json.loads(value) for value in sys.argv[1:]]))
PY
'''

    def run(path):
        return subprocess.run([BASH, "-c", runner, "_", str(path), str(fixture)],
                              env=ENV, capture_output=True, text=True, timeout=30)

    result = run(helper)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == values
    print("smoke-dumps: oversized=read dumps=%d bytes=%d" %
          (len(dumps), len(fixture.read_bytes())))

    # The old exec boundary must fail on the same complete inputs.
    mutant = root / "argv.sh"
    mutant.write_text('py_dumps() { python3 - "$@"; }\n')
    control = run(mutant)
    assert control.returncode == 126, (control.returncode, control.stderr)
    assert not control.stdout
    print("smoke-dumps: control=argv-rejected exit=126")

    result = subprocess.run([BASH, "-c", '''set -euo pipefail
source "$1"
py_dumps '' 'a\nb' <<'PY'
import json,sys
print(json.dumps(sys.argv[1:]))
PY
''', "_", str(helper)], env=ENV, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == ["", "a\nb"]

    invalid = root / "invalid.json"
    invalid.write_text("[" + "x" * 200000)
    result = subprocess.run([BASH, "-c", '''set -euo pipefail
source "$1"
py_reply 'import sys; sys.exit(23)' < "$2"
''', "_", str(helper), str(invalid)], env=ENV, capture_output=True,
                            text=True, timeout=30)
    assert result.returncode == 23, (result.returncode, result.stderr)
    assert result.stderr and len(result.stderr) < 2000
    print("smoke-dumps: empty-and-multiline=kept diagnostic-exit=23")
