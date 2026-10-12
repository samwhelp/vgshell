#!/usr/bin/env python3
"""The cloned voice's setup world for sandbox-shots.sh's clone-voice scene:
test doubles, not installer, model or audio evidence.

prepare WORLD PLUGIN: WORLD/bin holds scripts/fixtures/jarvis-setup/installer.py
as uv, curl, unshare, nvidia-smi and pw-record, as scripts/test-jarvis-setup.py
plants them; gum is not among them, so the real gum draws each step.
WORLD/hold/curl runs the curl double only once WORLD/hold-curl is gone,
after touching WORLD/curl-held, so a shot can hold the download step.
WORLD/hold/pw-record does the same for WORLD/hold-record and
WORLD/record-held, so a shot can hold the recording step.
WORLD/artifacts.json is PLUGIN's with every download pointed at a synthetic
file under the data root's downloads/ and that file's real sha256, built as
test-jarvis-setup.py's setUp builds it. The Large tier is then installed in
WORLD/state and WORLD/data through the doubles, so setup-local's own
clone_tier verifies it. Nothing is fetched and no device is opened.

snapshot WORLD SOURCE TARGET: TARGET, a copy of the plugin snapshot SOURCE
with WORLD's artifacts.json, for the terminal stand-in to hand present.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

REPO = Path(__file__).resolve().parents[1]
DOUBLE = REPO / "scripts/fixtures/jarvis-setup/installer.py"
DOUBLES = ("uv", "curl", "unshare", "nvidia-smi", "pw-record")


def environment(world):
    return {"PATH": f"{world / 'hold'}:{world / 'bin'}:/usr/bin:/bin", "HOME": str(world / "home"),
            "XDG_STATE_HOME": str(world / "state"), "XDG_DATA_HOME": str(world / "data"), "LC_ALL": "C.UTF-8"}


def synthetic(spec, downloads):
    for artifact in spec["artifacts"]:
        files = {}
        if "baseUrl" in artifact:
            for name in artifact["files"]:
                payload = ("synthetic " + name).encode()
                (downloads / "clone" / name).parent.mkdir(parents=True, exist_ok=True)
                (downloads / "clone" / name).write_bytes(payload)
                files[name] = hashlib.sha256(payload).hexdigest()
            artifact.update(baseUrl="https://fixture.invalid/clone/", files=files)
            continue
        if artifact["directory"] == ".":
            payload = b"synthetic direct model"
            name = next(iter(artifact["files"]))
            (downloads / name).write_bytes(payload)
            files = {name: hashlib.sha256(payload).hexdigest()}
            filename = name
        else:
            filename = artifact["id"] + ".tar.bz2"
            with tarfile.open(downloads / filename, "w:bz2") as bundle:
                for name in list(artifact["files"]) + [
                        directory + "/data" for directory in artifact.get("auxiliaryDirectories", [])]:
                    payload = ("synthetic " + name).encode()
                    item = tarfile.TarInfo(artifact["directory"] + "/" + name)
                    item.size = len(payload)
                    bundle.addfile(item, io.BytesIO(payload))
                    if name in artifact["files"]:
                        files[name] = hashlib.sha256(payload).hexdigest()
        artifact.update(url="https://fixture.invalid/" + filename, files=files,
                        sha256=hashlib.sha256((downloads / filename).read_bytes()).hexdigest())
    return spec


def prepare(world, plugin):
    if world.exists():
        sys.exit(f"clone-world: refused: world={world} reason=exists")
    data = world / "data/vgshell/jarvis/local"
    for path in (world / "bin", world / "hold", world / "home", data / "downloads"):
        path.mkdir(parents=True)
    for name in DOUBLES:
        shutil.copyfile(DOUBLE, world / "bin" / name)
        (world / "bin" / name).chmod(0o700)
    (world / "hold/curl").write_text(
        "#!/bin/sh\n"
        f": >'{world}/curl-held'\n"
        "n=0\n"
        f"while [ -e '{world}/hold-curl' ] && [ \"$n\" -lt 2400 ]; do sleep 0.05; n=$((n + 1)); done\n"
        f"exec '{world}/bin/curl' \"$@\"\n")
    (world / "hold/curl").chmod(0o700)
    (world / "hold/pw-record").write_text(
        "#!/bin/sh\n"
        f": >'{world}/record-held'\n"
        "n=0\n"
        f"while [ -e '{world}/hold-record' ] && [ \"$n\" -lt 2400 ]; do sleep 0.05; n=$((n + 1)); done\n"
        f"exec '{world}/bin/pw-record' \"$@\"\n")
    (world / "hold/pw-record").chmod(0o700)
    (data / "fixture.json").write_text(json.dumps({"tier": "large"}))
    spec = synthetic(json.loads((plugin / "artifacts.json").read_text()), data / "downloads")
    (world / "artifacts.json").write_text(json.dumps(spec))
    copy = world / "plugin"
    shutil.copytree(plugin, copy)
    (copy / "artifacts.json").write_text(json.dumps(spec))
    result = subprocess.run([sys.executable, "-I", str(copy / "setup-local"), "install", "large"],
                            env=environment(world), capture_output=True, text=True, check=False, timeout=120)
    if result.returncode != 0:
        sys.exit(f"clone-world: failed: install=large code={result.returncode}\n{result.stdout}{result.stderr}")
    print(f"clone-world: world={world} tier=large")


def snapshot(world, source, target):
    shutil.copytree(source, target)
    (target / "artifacts.json").write_text((world / "artifacts.json").read_text())


def main():
    verb, *args = sys.argv[1:]
    if verb == "prepare" and len(args) == 2:
        prepare(Path(args[0]), Path(args[1]))
    elif verb == "snapshot" and len(args) == 3:
        snapshot(*map(Path, args))
    else:
        sys.exit("clone-world: refused: usage=prepare WORLD PLUGIN | snapshot WORLD SOURCE TARGET")


if __name__ == "__main__":
    main()
