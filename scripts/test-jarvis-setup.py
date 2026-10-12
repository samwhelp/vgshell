#!/usr/bin/env python3
"""Exercise the shipped installer in J09, with local download/uv/Python doubles.

Controls keep each rule's matched source text while removing its behavior.
They modify only disposable plugin copies. No real package, model, audio,
account, authentication or desktop service is used.
"""
import fcntl
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
import wave

REPO = Path(__file__).resolve().parents[1]
PLUGIN = REPO / "shell/plugins/vgs.jarvis"
DOUBLE = REPO / "scripts/fixtures/jarvis-setup/installer.py"


def namespace_entry():
    """Every behavior case runs under the shared private-world owner."""
    if os.environ.get("JARVIS_TEST_ROOT"):
        return
    (REPO / "tmp").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=REPO / "tmp", prefix="setup-standins-") as name:
        child = subprocess.run([str(REPO / "scripts/lib/jarvis-env.sh"), name, "--",
            sys.executable, str(Path(__file__).resolve())],
            env={"PATH": "/usr/bin:/bin", "LC_ALL": "C"}, check=False)
    raise SystemExit(child.returncode)


class Setup(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name).resolve()
        self.plugin = self.root / "plugin"
        shutil.copytree(PLUGIN, self.plugin)
        self.home = self.root / "home"
        self.home.mkdir()
        self.state = self.root / "state/vgshell/jarvis"
        self.data = self.root / "data/vgshell/jarvis/local"
        self.data.mkdir(parents=True)
        self.commands = self.root / "commands"
        self.commands.mkdir()
        # Bootstrap names are private doubles created after entering J09. No
        # host nvidia-smi runs: the double answers from gpu_memory and gpu_exit.
        for name in ("uv", "curl", "unshare", "gum", "nvidia-smi", "pw-record"):
            shutil.copyfile(DOUBLE, self.commands / name)
            (self.commands / name).chmod(0o700)
        self.env = {"PATH": str(self.commands) + ":" + os.environ["PATH"],
                    "HOME": str(self.home), "XDG_STATE_HOME": str(self.root / "state"),
                    "XDG_DATA_HOME": str(self.root / "data"), "LC_ALL": "C",
                    "TMPDIR": str(self.root), "VGS_TEST_RUN": "1"}
        self.config = {"tier": "small"}
        self.spec = json.loads((self.plugin / "artifacts.json").read_text())
        self.downloads = self.data / "downloads"
        self.downloads.mkdir()
        # Membership is read from the producer. Each neutral file has a real
        # hash. Keep all engines, archive/direct and auxiliary shapes.
        for artifact in self.spec["artifacts"]:
            files = {}
            if "baseUrl" in artifact:
                for name in artifact["files"]:
                    payload = ("synthetic " + name).encode()
                    (self.downloads / "clone" / name).parent.mkdir(parents=True, exist_ok=True)
                    (self.downloads / "clone" / name).write_bytes(payload)
                    files[name] = hashlib.sha256(payload).hexdigest()
                artifact.update(baseUrl="https://fixture.invalid/clone/", files=files)
                continue
            if artifact["directory"] == ".":
                payload = b"synthetic direct model"
                name = next(iter(artifact["files"]))
                (self.downloads / name).write_bytes(payload)
                files = {name: hashlib.sha256(payload).hexdigest()}
                filename = name
            else:
                filename = artifact["id"] + ".tar.bz2"
                with tarfile.open(self.downloads / filename, "w:bz2") as bundle:
                    for name in list(artifact["files"]) + [
                            directory + "/data" for directory in artifact.get("auxiliaryDirectories", [])]:
                        payload = ("synthetic " + name).encode()
                        item = tarfile.TarInfo(artifact["directory"] + "/" + name)
                        item.size = len(payload)
                        bundle.addfile(item, io.BytesIO(payload))
                        if name in artifact["files"]:
                            files[name] = hashlib.sha256(payload).hexdigest()
            artifact.update(url="https://fixture.invalid/" + filename, files=files,
                            sha256=hashlib.sha256((self.downloads / filename).read_bytes()).hexdigest())
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        self.write_config()

    def write_config(self):
        (self.data / "fixture.json").write_text(json.dumps(self.config))

    def run_command(self, *args):
        return subprocess.run([sys.executable, "-I", str(self.plugin / "setup-local"), *args],
                              env=self.env, capture_output=True, text=True, check=False, timeout=30)

    def calls(self):
        path = self.data / "calls.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def reset_calls(self):
        (self.data / "calls.jsonl").write_text("")

    def offered(self):
        result = self.run_command("choices")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def install(self, code=0, tier=True):
        result = self.run_command("install", *([self.config["tier"]] if tier else []))
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)
        return result

    def plant_machine(self, gpu, ram_kib, threads):
        """The machine the copy reads: GPU memory in MiB (None for no GPU),
        MemTotal in kB and CPU threads. The double answers nvidia-smi; the
        copy reads a planted /proc/meminfo and thread count in place of the
        host's, through its own meminfo parser."""
        meminfo, count = self.root / "meminfo", self.root / "threads"
        meminfo.write_text(f"MemTotal:       {ram_kib} kB\nMemAvailable:   {ram_kib} kB\n")
        count.write_text(str(threads))
        self.config.update(gpu_memory=[] if gpu is None else [gpu], gpu_exit=9 if gpu is None else 0)
        self.write_config()
        for name, needle, replacement in (
                ("measure-local", 'Path("/proc/meminfo")', f"Path({str(meminfo)!r})"),
                ("setup-local", '"threads": os.cpu_count()', f'"threads": int(Path({str(count)!r}).read_text())')):
            path = self.plugin / name
            text = path.read_text()
            if needle in text:
                self.assertEqual(text.count(needle), 1, needle)
                path.write_text(text.replace(needle, replacement))

    def report(self):
        result = self.run_command("status")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def ready(self):
        self.assertEqual(self.report(), {"tone": "ok", "text": "Ready: " + self.config["tier"], "action": False})
        self.assertEqual((self.data / "probed").read_text(), self.config["tier"])

    def not_ready(self):
        self.assertNotEqual(self.report()["tone"], "ok")

    def mutant(self, needle, replacement):
        path = self.plugin / "setup-local"
        text = path.read_text()
        self.assertEqual(text.count(needle), 1, needle)
        changed = text.replace(needle, replacement)
        self.assertNotEqual(changed, text)
        path.write_text(changed)

    def test_setup_and_status(self):
        self.assertEqual(self.report(), {"tone": "warning", "text": "Not set up", "action": True})
        self.install()
        self.ready()
        self.assertEqual((self.state / "local-ready.json").stat().st_mode & 0o777, 0o600)
        calls = [json.loads(line) for line in (self.data / "calls.jsonl").read_text().splitlines()]
        self.assertEqual([call[0] for call in calls if call[0] in ("unshare", "python")], ["unshare", "python"])
        # Retry uses the same venv path, not a relocated environment.
        self.install()
        self.ready()

    def test_each_tier_uses_the_manifest(self):
        for tier in self.spec["tiers"]:
            with self.subTest(tier=tier):
                shutil.rmtree(self.data / "models", ignore_errors=True)
                self.reset_calls()
                self.config["tier"] = tier
                self.write_config()
                self.install()
                self.ready()
                calls = [json.loads(line) for line in (self.data / "calls.jsonl").read_text().splitlines()]
                urls = [call[-1] for call in calls if call[0] == "curl"]
                expected = [a["url"] for a in self.spec["artifacts"] if a["id"] in self.spec["tiers"][tier]["artifacts"]]
                self.assertEqual(urls, expected)
                if self.spec["tiers"][tier]["provider"] == "cuda":
                    wheel = self.spec["runtimes"]["sherpa-onnx"]["cudaWheel"]
                    self.assertIn(wheel["url"], (self.data / "requirements-cuda.lock").read_text())
                    self.assertIn(wheel["sha256"], (self.data / "requirements-cuda.lock").read_text())

    def test_hash_and_control(self):
        artifact = next(a for a in self.spec["artifacts"] if a["id"] == "silero")
        path = self.downloads / Path(artifact["url"]).name
        path.write_bytes(b"bad hash")
        result = self.install(1)
        self.assertIn("download=hash-mismatch", result.stderr)
        self.not_ready()
        self.assertFalse((self.state / "local-ready.json").exists())
        self.assertFalse(list((self.data / "models").glob("*.partial")))
        self.mutant("if judge.sha256(partial) != digest:", "if False and judge.sha256(partial) != digest:")
        # The input verifier independently refuses corrupted model bytes.
        result = self.install(1)
        self.assertNotIn("download=hash-mismatch", result.stderr)
        self.assertIn("input=hash-mismatch", result.stderr)

    def test_child_failure_rules_and_controls(self):
        for key, code in (("uv_exit", 6), ("curl_exit", 7), ("probe_exit", 1), ("probe_exit", 77)):
            with self.subTest(key=key, code=code):
                self.install()
                self.ready()
                self.config[key] = code
                self.write_config()
                if key == "curl_exit":
                    artifact = next(a for a in self.spec["artifacts"]
                                    if a["id"] == self.spec["tiers"]["small"]["artifacts"][0])
                    (self.data / "models" / Path(artifact["url"]).name).unlink()
                self.install(code)
                self.not_ready()
                self.assertFalse((self.state / "local-ready.json").exists())
                # Preserve the rule's text while changing its effect.
                self.mutant("if result.returncode != 0:", "if False and result.returncode != 0:")
                self.install()
                self.ready()
                (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
                del self.config[key]
                self.write_config()

    def test_marker_invalidation_control(self):
        self.install()
        self.ready()
        self.config["uv_exit"] = 77
        self.write_config()
        self.install(77)
        self.assertFalse((self.state / "local-ready.json").exists())
        self.config["uv_exit"] = 0
        self.write_config()
        self.install()
        self.mutant("marker.unlink(missing_ok=True)", "False and marker.unlink(missing_ok=True)")
        self.config["uv_exit"] = 77
        self.write_config()
        self.install(77)
        self.assertTrue((self.state / "local-ready.json").exists(), "invalidation control did not reach the marker")

    def test_retired_tier_reads_unavailable_and_control(self):
        # A marker or a Local voice setting saved while the multilingual tiers
        # were declared names a tier the manifest no longer has.
        self.install()
        self.ready()
        marker = self.state / "local-ready.json"
        saved = json.loads(marker.read_text())
        for tier in ("multilingual-cpu", "multilingual-cuda"):
            with self.subTest(tier=tier):
                marker.write_text(json.dumps(dict(saved, tier=tier)))
                report = self.report()
                self.assertEqual([report["tone"], report["action"]], ["warning", True])
                self.assertIsNone(self.offered()["ready"])
                self.reset_calls()
                result = self.run_command("install", tier)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual([call[0] for call in self.calls() if call[0] != "nvidia-smi"], [])
        # A planted migration that reads a retired tier as another.
        self.mutant('tier = saved["tier"]\n',
                    'tier = saved["tier"] = {"multilingual-cuda": "small"}.get(saved["tier"], saved["tier"])\n')
        with self.assertRaises(AssertionError):
            self.not_ready()

    def test_identity_and_controls(self):
        cases = [
            ("requirements-local.lock", "lock"),
            ("venv/installed", "runtime"),
        ]
        for filename, name in cases:
            with self.subTest(name=name):
                self.install()
                path = self.data / filename if filename.startswith("venv/") else self.plugin / filename
                original = path.read_bytes()
                path.write_bytes(original + b"\n# changed\n")
                self.not_ready()
                needle = 'if {key: item for key, item in saved.items() if key != "memory"} != identity(judge, tier, data):'
                self.mutant(needle, 'if False and ' + needle[3:])
                self.ready()
                path.write_bytes(original)
                (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())

    def test_identity_ignores_display_text_and_pins_selected_artifacts(self):
        self.install()
        self.ready()
        artifact = next(a for a in self.spec["artifacts"]
                        if a["id"] == self.spec["tiers"]["small"]["artifacts"][0])
        original = json.dumps(self.spec)
        self.spec["tiers"]["small"]["name"] = "Tiny"
        self.spec["tiers"]["small"]["description"] = "English, display-only"
        self.spec["tiers"]["small"]["downloadBytes"] += 1
        artifact["description"] = "display-only artifact note"
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        self.ready()
        artifact["url"] = artifact["url"].replace("https://fixture.invalid/", "https://mirror.invalid/")
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        self.not_ready()
        (self.plugin / "artifacts.json").write_text(original)
        self.spec = json.loads(original)
        self.ready()
        artifact = next(a for a in self.spec["artifacts"]
                        if a["id"] in self.spec["tiers"]["small"]["artifacts"]
                        and a["directory"] != "." and not a.get("auxiliaryDirectories"))
        archive = self.data / "models" / Path(artifact["url"]).name
        archive_bytes = archive.read_bytes()
        archive.write_bytes(b"identity-only archive hash")
        artifact["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        self.not_ready()
        needle = 'if {key: item for key, item in saved.items() if key != "memory"} != identity(judge, tier, data):'
        self.mutant(needle, 'if False and ' + needle[3:])
        self.ready()
        (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
        archive.write_bytes(archive_bytes)
        (self.plugin / "artifacts.json").write_text(original)
        self.spec = json.loads(original)
        self.mutant("hashed_files = [", 'hashed_files = [("artifacts.json", HERE / "artifacts.json"),')
        self.install()
        self.spec["tiers"]["small"]["name"] = "Tiny"
        self.spec["tiers"]["small"]["description"] = "English, display-only"
        artifact = next(a for a in self.spec["artifacts"]
                        if a["id"] == self.spec["tiers"]["small"]["artifacts"][0])
        artifact["description"] = "display-only artifact note"
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        self.not_ready()
        (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
        (self.plugin / "artifacts.json").write_text(original)
        self.spec = json.loads(original)
        self.install()
        artifact = next(a for a in self.spec["artifacts"]
                        if a["id"] == self.spec["tiers"]["small"]["artifacts"][0])
        artifact["url"] = artifact["url"].replace("https://fixture.invalid/", "https://mirror.invalid/")
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        needle = 'if {key: item for key, item in saved.items() if key != "memory"} != identity(judge, tier, data):'
        self.mutant(needle, 'if False and ' + needle[3:])
        self.ready()
        (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())

    def test_install_reuses_verified_models_and_redownloads_only_corrupt_model(self):
        self.install()
        self.ready()
        self.reset_calls()
        self.install()
        self.ready()
        self.assertEqual([call[-1] for call in self.calls() if call[0] == "curl"], [])
        small = set(self.spec["tiers"]["small"]["artifacts"])
        medium = set(self.spec["tiers"]["medium"]["artifacts"])
        by_id = {artifact["id"]: artifact for artifact in self.spec["artifacts"]}
        small_only = [by_id[name] for name in self.spec["tiers"]["small"]["artifacts"] if name not in medium]
        old_entries = []
        for old in small_only:
            old_entries.append(self.data / "models" / Path(old["url"]).name)
            if old["directory"] != ".":
                old_entries.append(self.data / "models" / old["directory"])
        self.reset_calls()
        self.config["tier"] = "medium"
        self.write_config()
        self.install()
        self.ready()
        expected = [by_id[name]["url"] for name in self.spec["tiers"]["medium"]["artifacts"] if name not in small]
        self.assertEqual([call[-1] for call in self.calls() if call[0] == "curl"], expected)
        for path in old_entries:
            self.assertFalse(path.exists(), path)
        self.config["tier"] = "small"
        self.write_config()
        self.install()
        self.ready()
        self.reset_calls()
        self.mutant("        if path.name in keep:\n", "        if True or path.name in keep:\n")
        self.config["tier"] = "medium"
        self.write_config()
        self.install()
        self.ready()
        for path in old_entries:
            self.assertTrue(path.exists(), path)
        (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
        self.config["tier"] = "small"
        self.write_config()
        self.install()
        self.ready()
        artifact = next(a for a in self.spec["artifacts"]
                        if a["id"] in self.spec["tiers"]["small"]["artifacts"] and a["directory"] != ".")
        corrupt = next(iter(artifact["files"]))
        (self.data / "models" / artifact["directory"] / corrupt).write_text("corrupt model")
        self.reset_calls()
        self.install()
        self.ready()
        self.assertEqual([call[-1] for call in self.calls() if call[0] == "curl"], [artifact["url"]])
        self.reset_calls()
        self.mutant("verified = reuse(judge, value, models, artifacts)",
                    "verified = set() if reuse(judge, value, models, artifacts) is not None else set()")
        self.install()
        expected = [a["url"] for a in self.spec["artifacts"]
                    if a["id"] in self.spec["tiers"]["small"]["artifacts"]]
        self.assertEqual(set(call[-1] for call in self.calls() if call[0] == "curl"), set(expected))

    def test_changed_during_probe_control(self):
        self.config["change_runtime"] = True
        self.write_config()
        result = self.install(1)
        self.assertIn("runtime=changed-during-probe", result.stderr)
        self.not_ready()
        self.mutant("if ready != identity(judge, tier, data):", "if False and ready != identity(judge, tier, data):")
        self.install()
        # The saved pre-probe identity still makes status refuse.
        self.assertTrue((self.state / "local-ready.json").exists())
        self.not_ready()

    def test_memory_publication_and_controls(self):
        self.install()
        marker = self.state / "local-ready.json"
        saved = json.loads(marker.read_text())
        self.assertEqual(saved["memory"], {"ram": 4096, "gpu": None})
        for need in (None, {"ram": 0, "gpu": None}, {"ram": True, "gpu": None}):
            with self.subTest(need=need):
                marker.write_text(json.dumps(dict(saved, memory=need)))
                self.not_ready()
        marker.write_text(json.dumps(dict(saved, memory={"ram": 0, "gpu": None})))
        self.mutant('judge.validate_memory(saved["memory"], value["tiers"][tier]["provider"])',
                    'False and judge.validate_memory(saved["memory"], value["tiers"][tier]["provider"])')
        setup = self.load_module()
        current = setup.identity(setup.measurement(), "small", self.data)
        marker.write_text(json.dumps(dict(current, memory={"ram": 0, "gpu": None})))
        self.ready()
        (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
        self.config["probe_record"] = {"scope": "wrong", "provider_requested": "cpu",
            "artifact_ids": self.spec["tiers"]["small"]["artifacts"], "peak_rss_bytes": 4096,
            "gpu_peak_bytes": None}
        self.write_config()
        result = self.install(1)
        self.assertIn("memory-measurement=mismatched", result.stderr)
        self.assertFalse(marker.exists())
        self.assertFalse((self.data / "venv").exists())
        path = self.plugin / "measure-local"
        source = path.read_text()
        needle = 'if (record.get("scope") != scope or record.get("provider_requested") != provider'
        self.assertEqual(source.count(needle), 1)
        path.write_text(source.replace(needle, 'if False and (record.get("scope") != scope or record.get("provider_requested") != provider'))
        self.install()
        self.ready()

    def test_serialization_and_control(self):
        self.install()
        self.ready()
        marker = (self.state / "local-ready.json").read_bytes()
        # A copy with a one-second bound keeps the busy case short.
        self.mutant("LOCK_WAIT = 30\n", "LOCK_WAIT = 1\n")
        with (self.state / "local-setup.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.install(1)
            self.assertIn("setup=busy", result.stderr)
            self.assertEqual(self.report(), {"tone": "info", "text": "Setting up", "action": False})
            self.assertEqual((self.state / "local-ready.json").read_bytes(), marker)
            self.mutant("fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)",
                        "False and fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)")
            self.install()

    def test_install_waits_for_a_status_reader_and_control(self):
        # A status read holds the lock shared while it verifies; install
        # waits for it rather than ending busy. The child must still be
        # waiting a second after it starts: a run that ends busy exits at
        # once, well inside that second.
        def held_install():
            with (self.state / "local-setup.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
                child = subprocess.Popen([sys.executable, "-I", str(self.plugin / "setup-local"), "install", "small"],
                                         env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                deadline = time.monotonic() + 1
                while time.monotonic() < deadline and child.poll() is None:
                    time.sleep(0.05)
                waited = child.poll() is None
            out, err = child.communicate(timeout=60)
            return waited, child.returncode, err
        self.state.mkdir(parents=True, exist_ok=True)
        waited, code, err = held_install()
        self.assertEqual([waited, code], [True, 0], err)
        self.ready()
        self.mutant("                if time.monotonic() >= deadline:", "                if True or time.monotonic() >= deadline:")
        waited, code, err = held_install()
        self.assertEqual([waited, code], [False, 1], err)
        self.assertIn("setup=busy", err)

    def test_archive_path_control(self):
        archive = self.root / "unsafe.tar"
        with tarfile.open(archive, "w") as bundle:
            item = tarfile.TarInfo("../escaped")
            item.size = 1
            bundle.addfile(item, io.BytesIO(b"x"))
        # The extractor itself, not a second implementation.
        module = self.load_module()
        with self.assertRaisesRegex(ValueError, "archive=unsafe-member"):
            module.extract(archive, self.root / "models")
        self.mutant('if path.is_absolute() or ".." in path.parts or not (member.isdir() or member.isfile()):',
                    'if False and (path.is_absolute() or ".." in path.parts or not (member.isdir() or member.isfile())):')
        module = self.load_module()
        # Python's data filter remains a separate dependency guard.
        with self.assertRaises(tarfile.OutsideDestinationError):
            module.extract(archive, self.root / "models")

    def test_status_lock_control(self):
        self.install()
        self.ready()
        with (self.state / "local-setup.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.report(), {"tone": "info", "text": "Setting up", "action": False})
        self.mutant("fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)",
                    "False and fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)")
        self.install()
        with (self.state / "local-setup.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.ready()

    def load_module(self):
        loader = importlib.machinery.SourceFileLoader("setup_case", str(self.plugin / "setup-local"))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        return module

    def test_probe_delegation_and_control(self):
        module = self.load_module()
        calls = []
        class Judge:
            def run(self, value, artifacts, models, provider, seconds, scope):
                calls.append((artifacts, models, provider, seconds, scope))
        module.probe(Judge(), self.spec, "large", self.data)
        artifacts = [a for a in self.spec["artifacts"] if a["id"] in self.spec["tiers"]["large"]["artifacts"]]
        self.assertEqual(calls, [(artifacts, self.data / "models", "cuda", None, "large")])
        self.mutant('judge.run(value, artifacts, data / "models", provider, None, tier)',
                    'False and judge.run(value, artifacts, data / "models", provider, None, tier)')
        calls.clear()
        self.load_module().probe(Judge(), self.spec, "large", self.data)
        self.assertEqual(calls, [], "probe control must break delegation")

    def test_installed_probe_keeps_selected_roots(self):
        self.config["entry_probe"] = str(REPO / "scripts/fixtures/jarvis-setup/installed-probe.py")
        self.write_config()
        data_alias, state_alias = self.root / "data-alias", self.root / "state-alias"
        (self.root / "state").mkdir(exist_ok=True)
        data_alias.symlink_to(self.root / "data", target_is_directory=True)
        state_alias.symlink_to(self.root / "state", target_is_directory=True)
        # These sentinel values are never credentials or live endpoints.
        self.env.update(API_KEY="must-not-forward", DBUS_SESSION_BUS_ADDRESS="must-not-forward",
                        PULSE_SERVER="must-not-forward")
        original = (PLUGIN / "setup-local").read_text()
        layouts = [
            ("root-alias", data_alias, state_alias),
            ("inner-vgs", self.root / "data", self.root / "state"),
        ]
        for name, data_root, state_root in layouts:
            with self.subTest(layout=name):
                if name == "inner-vgs":
                    # Move the large plugin data without changing its XDG root.
                    for kind in ("data", "state"):
                        path = self.root / kind / "vgshell"
                        target = self.root / ("stored-" + kind)
                        path.rename(target)
                        path.symlink_to(target, target_is_directory=True)
                (self.plugin / "setup-local").write_text(original)
                self.env.update(XDG_DATA_HOME=str(data_root), XDG_STATE_HOME=str(state_root))
                expected = {"models": str(self.data / "models"), "data": str(self.data),
                            "state": str(self.state), "provider": "cpu",
                            "artifacts": self.spec["tiers"]["small"]["artifacts"]}
                (self.data / "probe-expected.json").write_text(json.dumps(expected))
                self.install()
                self.ready()
                observed = json.loads((self.data / "probe-observed.json").read_text())
                self.assertEqual(observed, {key: expected[key] for key in ("models", "data", "state")})
                self.mutant("return env", 'env.pop("XDG_DATA_HOME", None)\n    return env')
                # The real measurement entry now reaches its load lock
                # before inference can report the missing model inputs.
                result = self.install(1)
                self.assertEqual(result.stderr.splitlines()[0].split("=", 2)[:2],
                                 ["jarvis-setup: failed", "probe log"])
                self.assertIn(str(self.home / ".local/share/vgshell/jarvis/local/local-load.lock"),
                              (self.state / "local-setup.log").read_text())
                self.assertFalse((self.state / "local-ready.json").exists())
                self.assertEqual(self.report(), {"tone": "warning", "text": "Not set up", "action": True})
                if name == "inner-vgs":
                    (self.plugin / "setup-local").write_text(original)
                    self.mutant("return env",
                        'env["XDG_DATA_HOME"] = str(data.resolve().parents[2])\n    return env')
                    self.install(1)
                    self.assertFalse((self.state / "local-ready.json").exists())
                    self.assertEqual(self.report(), {"tone": "warning", "text": "Not set up", "action": True})

    def test_lock_install_flags_control(self):
        self.install()
        self.ready()
        self.mutant('"--require-hashes", "--only-binary", ":all:", str(requirements)',
                    '"--only-binary", ":all:", str(requirements)')
        self.install(1)
        self.not_ready()

    def test_cancel_and_retry(self):
        self.install()
        self.config["hold_probe"] = True
        self.write_config()
        with subprocess.Popen([sys.executable, "-I", str(self.plugin / "setup-local"), "install", "small"],
                              env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as child:
            # Wait for the private interpreter double to reach inference.
            deadline = time.monotonic() + 10
            while not (self.data / "probe-held").exists():
                self.assertIsNone(child.poll())
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.01)
            child.send_signal(signal.SIGTERM)
            self.assertEqual(child.wait(timeout=10), 143)
        self.assertFalse((self.state / "local-ready.json").exists())
        self.assertFalse((self.data / "venv").exists())
        self.not_ready()
        # Release the double, not a host interpreter or process by name.
        (self.data / "probe-release").write_text("release")
        self.config["hold_probe"] = False
        self.write_config()
        self.install()
        self.ready()
        # No extra control is needed for Python's process termination.
        # The marker-invalidation and child-exit controls prove the owned
        # readiness mechanism; the OS signal is not a new production guard.

    def test_tui_and_control(self):
        # Neutral core presentation double. The actual TUI executes the real
        # installer with the tier it is handed, or none for the pick.
        # The confirmation double records each question and answers CONFIRM.
        library = self.root / "tui-lib.sh"
        questions = self.root / "questions"
        library.write_text('vgs_tui_header() { :; }\nvgs_tui_error() { :; }\n'
                           'vgs_tui_confirm() { printf "%s\\n" "$1" >>"$QUESTIONS"; return "$CONFIRM"; }\n')
        env = dict(self.env, VGS_TUI_LIB=str(library), VGS_PLUGIN_DIR=str(self.plugin),
                   QUESTIONS=str(questions), CONFIRM="0")
        script = self.plugin / "tui/setup-local.sh"
        run = lambda *args: subprocess.run(["bash", str(script), *args],
            env=env, capture_output=True, text=True, check=False, timeout=30)
        # With no argument, a PX13-class laptop's pick, small, ends ready.
        self.plant_machine(None, 32000000, 24)
        result = run()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.ready()
        # The page's choice reaches the installer.
        self.config["tier"] = "medium"
        self.write_config()
        self.assertFalse(questions.exists(), "nothing was ready, so nothing is replaced")
        result = run("medium")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.ready()
        self.assertEqual(len(questions.read_text().splitlines()), 1, "replacing small asks once")
        # A No keeps the ready tier and installs nothing.
        source = script.read_text()
        for name, changed in (("shipped", source),
                              ("control", source.replace('if [[ -n $question ]] && ! vgs_tui_confirm', 'if false && ! vgs_tui_confirm'))):
            with self.subTest(case=name):
                self.assertNotEqual(name == "control", changed == source)
                script.write_text(changed)
                # The double's probe accepts small, so a run that ignores
                # the No replaces medium.
                self.config["tier"] = "small"
                self.write_config()
                env["CONFIRM"] = "1"
                result = run("small")
                env["CONFIRM"] = "0"
                self.assertEqual(self.report()["text"], "Ready: " + ("medium" if name == "shipped" else "small"))
                if name == "shipped":
                    self.assertEqual(result.returncode, 130, result.stdout + result.stderr)
        script.write_text(source)
        self.assertEqual(run("medium", "small").returncode, 2)
        (self.commands / "uv").unlink()
        self.assertEqual(run().returncode, 77)
        source = script.read_text()
        needle = 'exec python3 -I "$VGS_PLUGIN_DIR/setup-local" install "$@"'
        self.assertEqual(source.count(needle), 1)
        changed = source.replace(needle, ': python3 -I "$VGS_PLUGIN_DIR/setup-local" install "$@"')
        self.assertNotEqual(changed, source)
        script.write_text(changed)
        shutil.copyfile(DOUBLE, self.commands / "uv")
        (self.commands / "uv").chmod(0o700)
        (self.state / "local-ready.json").unlink()
        self.assertEqual(run().returncode, 0)
        self.not_ready()

    # The pick for a machine reading: [label, GPU MiB or None, RAM MiB,
    # threads, tier]. This host and a PX13-class laptop are the issue's
    # machines; the others each prove one input is read.
    PICKS = [
        ("this host: RTX 5090, MemTotal 129444736 kB, 32 threads", 32607, 129444736 / 1024, 32, "large"),
        ("a PX13-class laptop: no NVIDIA GPU, about 32 GB, 24 threads", None, 32000000 / 1024, 24, "small"),
        ("a 4 GiB GPU on a PX13-class laptop is small", 4096, 32000000 / 1024, 24, "small"),
        ("a 6 GiB GPU on a PX13-class laptop is small", 6144, 32000000 / 1024, 24, "small"),
        ("a GPU of twice large's sampled peak and dictation's model is large", 11504, 129444736 / 1024, 32, "large"),
        ("a GPU one MiB below that is not large", 11503, 129444736 / 1024, 32, "medium"),
        ("a large GPU on 24 threads is large", 32607, 129444736 / 1024, 24, "large"),
        ("a large GPU with 16 GiB of RAM is medium", 32607, 16384, 32, "medium"),
        ("128 GB, 32 threads and no GPU is medium", None, 131072, 32, "medium"),
        ("128 GB, 24 threads and no GPU is small", None, 131072, 24, "small"),
        ("12 GiB, 32 threads and no GPU is small", None, 12288, 32, "small"),
    ]

    def assert_picks(self, module):
        for label, gpu, ram, threads, tier in self.PICKS:
            self.assertEqual(module.pick({"gpu": gpu, "ram": ram, "threads": threads}), tier, label)

    def test_pick_reads_each_input_and_controls(self):
        self.assert_picks(self.load_module())
        # Each control keeps the rule's text and drops one input from it.
        original = (self.plugin / "setup-local").read_text()
        for name, needle, replacement in (
                ("GPU memory", 'reading["gpu"] is not None and reading["gpu"] >= GPU_SHARE * (NEED["large"]["gpu"] + DICTATION_GPU)', 'reading["gpu"] is not None'),
                ("dictation's model", '(NEED["large"]["gpu"] + DICTATION_GPU)', 'NEED["large"]["gpu"]'),
                ("RAM for large", '\n            and reading["ram"] >= RAM_SHARE * NEED["large"]["ram"]):', "):"),
                ("RAM for medium", 'if (reading["ram"] >= RAM_SHARE * NEED["medium"]["ram"]\n            and ', "if ("),
                ("threads", '\n            and reading["threads"] is not None and reading["threads"] >= MEDIUM_THREADS):', "):")):
            with self.subTest(control=name):
                self.mutant(needle, replacement)
                with self.assertRaises(AssertionError):
                    self.assert_picks(self.load_module())
                (self.plugin / "setup-local").write_text(original)

    # The characters the closed Local voice field drew of a 58-character
    # automatic label before it cut the rest: scripts/sandbox-shots.sh
    # jarvis-setup on host cachy, 2026-10-11, dark and light. The core's
    # choices judge accepts more, STATUS_LABEL_MAX of shell/Core/PluginLogic.js.
    AUTO_LABEL_FIT = 48

    def assert_auto_label(self, label, row):
        """The automatic row reads the pick's name, description and download
        size, in a line the closed field draws whole."""
        self.assertIn(f": {row['name']}, {row['description']}, ", label)
        self.assertRegex(label, r", [0-9]+(\.[0-9])? (MB|GB)$")
        self.assertLessEqual(len(label), self.AUTO_LABEL_FIT, label)

    def test_choices_follow_the_machine_and_control(self):
        tiers = self.spec["tiers"]
        # Discovery floors: the producer declares both providers.
        cpu = [tier for tier, row in tiers.items() if row["provider"] == "cpu"]
        self.assertIn("small", cpu, "tier discovery is broken: no small CPU tier")
        self.assertIn("large", [tier for tier, row in tiers.items() if row["provider"] == "cuda"])
        tiers["small"]["downloadBytes"] = 796490765
        tiers["medium"]["downloadBytes"] = 1455131612
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        # [machine, pick, the tiers offered after auto].
        for machine, pick, rest in (
                ((32607, 129444736, 32), "large", [tier for tier in tiers if tier != "large"]),
                ((None, 129444736, 32), "medium", [tier for tier in cpu if tier != "medium"]),
                ((None, 32000000, 24), "small", [tier for tier in cpu if tier != "small"])):
            with self.subTest(pick=pick):
                self.plant_machine(*machine)
                offered = self.offered()
                self.assertEqual([offered["pick"], offered["ready"]], [pick, None])
                self.assertEqual(offered["choices"][0]["value"], "auto")
                self.assert_auto_label(offered["choices"][0]["label"], tiers[pick])
                self.assertEqual([row["value"] for row in offered["choices"][1:]], rest)
                for row in offered["choices"]:
                    # The core's choices judge: a printable line of at most 60 characters.
                    self.assertTrue(row["label"].isprintable() and 0 < len(row["label"]) <= 60, row)
                for row in offered["choices"][1:]:
                    self.assertTrue(row["label"].startswith(tiers[row["value"]]["name"] + ": "), row)
                    self.assertRegex(row["label"], r", [0-9]+(\.[0-9])? (MB|GB)$")
                labels = {row["value"]: row["label"] for row in offered["choices"]}
                self.assertTrue(labels.get("small", " 796 MB").endswith(" 796 MB"), labels)
                self.assertTrue(labels.get("medium", " 1.5 GB").endswith(" 1.5 GB"), labels)
        self.assertIn(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"], self.calls())
        # Controls on the host reading: the name alone, then a description
        # that makes the label one character longer than the field draws.
        self.plant_machine(32607, 129444736, 32)
        longest = self.offered()["choices"][0]["label"]
        self.assert_auto_label(longest, tiers["large"])
        original = (self.plugin / "setup-local").read_text()
        self.mutant("label(f\"Auto: {value['tiers'][best]['name']}, \", value[\"tiers\"][best])",
                    "\"Auto: \" + value[\"tiers\"][best][\"name\"]")
        with self.assertRaises(AssertionError):
            self.assert_auto_label(self.offered()["choices"][0]["label"], tiers["large"])
        (self.plugin / "setup-local").write_text(original)
        fitted = (self.plugin / "artifacts.json").read_text()
        tiers["large"]["description"] += "x" * (self.AUTO_LABEL_FIT + 1 - len(longest))
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        over = self.offered()["choices"][0]["label"]
        self.assertEqual(len(over), self.AUTO_LABEL_FIT + 1)
        with self.assertRaises(AssertionError):
            self.assert_auto_label(over, tiers["large"])
        (self.plugin / "artifacts.json").write_text(fitted)
        self.plant_machine(None, 32000000, 24)
        # The ready tier, as status verifies it.
        self.config["tier"] = "small"
        self.write_config()
        self.install()
        self.assertEqual(self.offered()["ready"], "small")
        self.mutant('return reading["gpu"] is not None', "return True")
        self.assertIn("large", [row["value"] for row in self.offered()["choices"]])

    def test_install_without_tier_installs_the_pick_and_control(self):
        # The double's probe asserts the tier it is run for.
        for machine, tier in (((32607, 129444736, 32), "large"), ((None, 32000000, 24), "small")):
            with self.subTest(tier=tier):
                self.plant_machine(*machine)
                self.config["tier"] = tier
                self.write_config()
                self.install(tier=False)
                self.ready()
        self.plant_machine(32607, 129444736, 32)
        self.config["tier"] = "large"
        self.write_config()
        self.mutant("pick(reading) if args.tier is None else args.tier", '"small" if args.tier is None else args.tier')
        self.install(1, tier=False)
        self.not_ready()

    def test_gpu_refusal_keeps_ready_and_control(self):
        self.install()
        self.ready()
        marker = (self.state / "local-ready.json").read_bytes()
        (self.data / "calls.jsonl").unlink()
        self.config.update(tier="large", gpu_exit=9)
        self.write_config()
        result = self.install(1)
        self.assertEqual(result.stderr.splitlines()[0], "jarvis-setup: failed=gpu=unavailable tier=large")
        self.assertEqual([call[0] for call in self.calls()], ["nvidia-smi"])
        self.assertEqual((self.state / "local-ready.json").read_bytes(), marker)
        self.assertEqual(self.report(), {"tone": "ok", "text": "Ready: small", "action": False})
        self.mutant("if not runnable(provider, reading):", "if False and not runnable(provider, reading):")
        self.install()
        self.ready()

    def test_disk_refusal_and_control(self):
        self.install()
        (self.data / "calls.jsonl").unlink()
        self.spec["tiers"]["small"]["downloadBytes"] = 10**18
        (self.plugin / "artifacts.json").write_text(json.dumps(self.spec))
        result = self.install(1)
        self.assertRegex(result.stderr.splitlines()[0], r"^jarvis-setup: failed=disk=insufficient "
                         r"need=[0-9]+ free=[0-9]+ path=" + re.escape(str(self.data)) + "$")
        # The machine reading's GPU query is the one child before the refusal.
        self.assertEqual([call[0] for call in self.calls()], ["nvidia-smi"])
        self.assertTrue((self.state / "local-ready.json").exists())
        self.mutant("if free < need:", "if False and free < need:")
        self.install()
        self.ready()

    def test_probe_failure_reports_plainly_and_controls(self):
        engine = 'Traceback (most recent call last):\n  File "probe"\nRuntimeError: fixture provider\n'
        self.config.update(probe_exit=1, probe_stderr=engine)
        self.write_config()
        log = self.state / "local-setup.log"
        original = (self.plugin / "setup-local").read_text()
        result = self.install(1)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn(engine, log.read_text())
        lines = result.stderr.splitlines()
        self.assertEqual(lines[0], f"jarvis-setup: failed=probe log={log}")
        for name in ("venv", "models", "requirements-cuda.lock"):
            self.assertFalse((self.data / name).exists(), name)
        # What remains is reported: every regular file below the data root.
        kept = sum(path.lstat().st_size for path in self.data.rglob("*")
                   if path.is_file() and not path.is_symlink())
        self.assertGreater(kept, 0)
        self.assertEqual([line for line in lines if line.startswith("jarvis-setup: kept=")],
                         [f"jarvis-setup: kept={self.data} bytes={kept}"])
        # Only a CUDA tier is told to fall back to a tier that runs on any computer.
        fallback = "choose a model that runs on any computer"
        self.assertNotIn(fallback, result.stderr)
        self.config["tier"] = "large"
        self.write_config()
        result = self.install(1)
        self.assertEqual(result.stderr.splitlines()[0], f"jarvis-setup: failed=probe log={log}")
        self.assertIn(fallback, result.stderr)
        self.config["tier"] = "small"
        self.write_config()
        self.mutant('if provider == "cuda" else ""', 'if True or provider == "cuda" else ""')
        self.assertIn(fallback, self.install(1).stderr)
        (self.plugin / "setup-local").write_text(original)
        self.mutant('"probe", tier], data, offline=True, stderr=output, stdout=reading)',
                    '"probe", tier], data, offline=True, stdout=reading)')
        self.assertIn("Traceback", self.install(1).stderr)
        (self.plugin / "setup-local").write_text(original)
        self.mutant("except BaseException:\n            remove_runtime(data)",
                    "except BaseException:\n            False and remove_runtime(data)")
        self.install(1)
        self.assertTrue((self.data / "venv").exists(), "cleanup control did not reach the runtime")

    def test_missing_setup_requirement_and_control(self):
        script = self.plugin / "tui/setup-local.sh"
        source = script.read_text()
        # The presentation boundary records all attempted setup work. Every
        # executable in PATH is a stand-in and none reaches an installer.
        commands = self.root / "tui-commands"
        commands.mkdir()
        required = ("gum", "uv", "curl", "unshare", "python3")
        declared = {row["command"] for row in json.loads(
            (self.plugin / "manifest.json").read_text())["requirements"]}
        self.assertTrue(set(required) <= declared)
        for tool in required:
            path = commands / tool
            path.write_text('#!/bin/sh\nprintf "%s\\n" called >>"$SETUP_CALLS"\nexit 99\n')
            path.chmod(0o700)
        calls = self.root / "setup-calls"
        library = self.root / "setup-library"
        library.write_text((REPO / "bin/lib/tui.sh").read_text() +
            '\nvgs_tui_header() { printf "header\\n" >>"$SETUP_CALLS"; }\n'
            'vgs_tui_choose() { printf "choose\\n" >>"$SETUP_CALLS"; return 99; }\n')
        env = dict(self.env, PATH=str(commands), VGS_TUI_LIB=str(library),
                   VGS_PLUGIN_DIR=str(self.plugin), SETUP_CALLS=str(calls))
        def run():
            return subprocess.run(["/bin/bash", str(script)], env=env,
                capture_output=True, text=True, check=False, timeout=30)
        def assert_withheld(tool):
            result = run()
            self.assertEqual(result.returncode, 77, result.stderr)
            self.assertEqual(result.stderr.splitlines()[0],
                             "jarvis-setup: command=missing name=" + tool)
            self.assertEqual(result.stdout, "")
            self.assertFalse(calls.exists(), "missing requirement started setup")
        for tool in required:
            with self.subTest(tool=tool):
                path = commands / tool
                original = path.read_text()
                path.unlink()
                assert_withheld(tool)
                path.write_text(original)
                path.chmod(0o700)
        needle = 'command -v "$tool" >/dev/null || {'
        self.assertEqual(source.count(needle), 1)
        changed = source.replace(needle, 'true || {')
        self.assertNotEqual(changed, source)
        self.assertFalse(script.is_symlink())
        script.write_text(changed)
        (commands / "gum").unlink()
        with self.assertRaises(AssertionError):
            assert_withheld("gum")
        self.assertTrue(calls.exists(), "guard control never started setup")

    def test_install_tree_namespace_result_controls(self):
        # Copy the real installation assertions, namespace consumer and closing
        # verdict into a private script. Omit unrelated package/control rows.
        # Both effectful producers are explicit local doubles inside J09.
        tree = self.root / "install-source"
        (tree / "scripts/lib").mkdir(parents=True)
        (tree / "packaging").mkdir()
        helper = tree / "scripts/lib/jarvis-env.sh"
        helper.write_text('#!/usr/bin/env bash\nprintf "jarvis-env: status=not-measured reason=namespaces-unavailable\\n" >&2\nexit 77\n')
        helper.chmod(0o700)
        installer = tree / "packaging/install-system.sh"
        source = (REPO / "scripts/test-install-tree.sh").read_text()

        def section(text, start, end=None):
            self.assertEqual(text.count(start), 1, start)
            result = text.split(start, 1)[1]
            if end is not None:
                self.assertEqual(result.count(end), 1, end)
                result = result.split(end, 1)[0]
            return start + result

        functions = section(source, "ok() {", "voice_command=")
        install = section(source, 'run_capture "$tmp/install.out"', 'run_capture "$tmp/check.out"')
        readiness = section(source, 'setup_standins="$tmp/setup-standins"', 'private_node=')
        ending = section(source, 'if [[ $failures -gt 0 ]]; then')
        program = self.root / "install-check.sh"
        env = dict(self.env, FIXTURE_TREE=str(tree), FIXTURE_SCRATCH=str(self.root))

        def run(changed=None, broken_install=False, generator_missing=False):
            installer.write_text('#!/usr/bin/env bash\n' + ('exit 1\n' if broken_install else
                'printf "install-system: ok prefix=/usr root=%s/usr\\n" "$DESTDIR"\n'))
            installer.chmod(0o700)
            program.write_text('set -euo pipefail\nrepo="$FIXTURE_TREE"\ntmp="$FIXTURE_SCRATCH"\n'
                               'dest="$tmp/install"\nfailures=0\nunavailable=false\n' +
                               'generator_missing=%s\n' % ("true" if generator_missing else "false") +
                               functions + install + (readiness if changed is None else changed[0]) +
                               (ending if changed is None else changed[1]))
            return subprocess.run(["bash", str(program)], env=env, capture_output=True,
                                  text=True, check=False, timeout=30)

        result = run()
        self.assertEqual(result.returncode, 77, result.stdout + result.stderr)
        self.assertIn("test-install-tree: status=not-measured reason=jarvis-isolation", result.stdout)
        self.assertNotIn("test-install-tree: ok", result.stdout)
        self.assertNotIn("  FAIL", result.stdout)
        needle = "if [[ $unavailable == true ]]; then"
        self.assertEqual(ending.count(needle), 1)
        changed = ending.replace(needle, "if false && [[ $unavailable == true ]]; then")
        self.assertNotEqual(changed, ending)
        result = run((readiness, changed))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("test-install-tree: ok", result.stdout)
        needle = "if [[ $status == 77 ]]; then"
        self.assertEqual(readiness.count(needle), 1)
        changed = readiness.replace(needle, "if false && [[ $status == 77 ]]; then")
        self.assertNotEqual(changed, readiness)
        result = run((changed, ending))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("installed local readiness reads without source-tree files", result.stdout)
        # The suite's real installation assertion, not a planted counter.
        result = run(broken_install=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("  FAIL  the installer succeeds into a staged /usr prefix", result.stdout)
        self.assertNotIn("test-install-tree: status=not-measured reason=jarvis-isolation", result.stdout)
        needle = "if [[ $failures -gt 0 ]]; then"
        self.assertEqual(ending.count(needle), 1)
        changed = ending.replace(needle, "if false && [[ $failures -gt 0 ]]; then")
        self.assertNotEqual(changed, ending)
        result = run((readiness, changed), broken_install=True)
        self.assertEqual(result.returncode, 77, result.stdout + result.stderr)
        self.assertIn("  FAIL  the installer succeeds into a staged /usr prefix", result.stdout)
        # A host without the autostart generator, the namespace readiness
        # left out so unavailable stays false: the autostart branch alone
        # turns the verdict into 77.
        result = run(("", ending), generator_missing=True)
        self.assertEqual(result.returncode, 77, result.stdout + result.stderr)
        self.assertIn("test-install-tree: status=not-measured reason=autostart-generator-missing", result.stdout)
        self.assertNotIn("test-install-tree: ok", result.stdout)
        needle = "  [[ $unavailable == true ]] || exit 77\n"
        self.assertEqual(ending.count(needle), 1)
        changed = ending.replace(needle, "")
        self.assertNotEqual(changed, ending)
        result = run(("", changed), generator_missing=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("test-install-tree: ok", result.stdout)

    # The cloned voice. A large tier is ready first: the clone runs beside it.
    def large(self):
        self.config["tier"] = "large"
        self.write_config()
        self.install()
        self.ready()
        self.reset_calls()

    def clone(self, *args, stdin=None):
        return subprocess.run([sys.executable, "-I", str(self.plugin / "setup-local"), "clone", *args],
                              env=self.env, input=stdin, capture_output=True, check=False, timeout=30)

    def clone_status(self):
        result = self.clone("status")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def tone(self, seconds, amplitude=0.5):
        return b"".join(int(amplitude * 32767 * ((i // 50) % 2 * 2 - 1)).to_bytes(2, "little", signed=True)
                        for i in range(int(seconds * 24000)))

    def tree(self):
        """Every file below the scratch world's state and data roots, with its bytes."""
        return {str(path): path.read_bytes() for root in (self.root / "state", self.root / "data")
                for path in root.rglob("*") if path.is_file()}

    def clone_tui(self, script, answers, source=None):
        """Run a clone TUI with a presentation double: each confirmation
        takes the next of ANSWERS, yes once they run out."""
        library, answered = self.root / "clone-lib.sh", self.root / "answers"
        library.write_text('vgs_tui_header() { :; }\nvgs_tui_step() { :; }\nvgs_tui_success() { :; }\n'
                           'vgs_tui_error() { :; }\nvgs_tui_confirm() { local answers; mapfile -t answers <"$ANSWERS"; '
                           'printf "%s\\n" "${answers[@]:1}" >"$ANSWERS"; [[ ${answers[0]:-yes} == yes ]]; }\n')
        answered.write_text("".join(answer + "\n" for answer in answers))
        path = self.plugin / "tui" / script
        if source is not None:
            path.write_text(source)
        env = dict(self.env, VGS_TUI_LIB=str(library), VGS_PLUGIN_DIR=str(self.plugin), ANSWERS=str(answered),
                   UV_CACHE_DIR=str(self.data / "cache"))
        return subprocess.run(["bash", str(path)], env=env, capture_output=True, text=True, check=False, timeout=60)

    # One row per consent question: a No there, a planted Yes on the other.
    CONSENT = [
        ("read the use text", ["no", "yes"], 'vgs_tui_confirm "Have you read Resemble AI\'s text above?" || declined'),
        ("own voice or permission", ["yes", "no"],
         'vgs_tui_confirm "Is the voice you will record your own, or do you have the speaker\'s permission?" || declined'),
    ]

    def test_clone_consent_rows_and_controls(self):
        self.large()
        source = (PLUGIN / "tui/clone-voice.sh").read_text()
        for name, answers, gate in self.CONSENT:
            with self.subTest(question=name):
                before = self.tree()
                result = self.clone_tui("clone-voice.sh", answers, source)
                self.assertEqual(result.returncode, 130, result.stdout + result.stderr)
                self.assertEqual(self.calls(), [], "a No downloads and runs nothing")
                self.assertEqual(self.tree(), before, "a No writes no file")
                # The control drops this question's gate and keeps its text.
                self.assertEqual(source.count(gate), 1)
                control = source.replace(gate, gate.replace("|| declined", "|| true"))
                result = self.clone_tui("clone-voice.sh", answers, control)
                self.assertNotEqual(self.tree(), before, "must-fail control stayed green: " + name)
                self.assertTrue(any(call[0] == "curl" for call in self.calls()))
                self.clone("remove")
                shutil.rmtree(self.data / "clone")
                (self.state / "clone-setup.log").unlink(missing_ok=True)
                (self.state / "clone-setup.lock").unlink(missing_ok=True)
                self.reset_calls()
        (self.plugin / "tui/clone-voice.sh").write_text(source)

    def test_clone_setup_recording_and_remove(self):
        self.large()
        self.assertEqual(self.clone_status(), {"tone": "info", "text": "Not set up", "action": "setup",
                                               "recording": False, "tierReady": True})
        result = self.clone_tui("clone-voice.sh", ["yes", "yes"])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        row = next(a for a in self.spec["artifacts"] if a["id"] == "chatterbox")
        self.assertEqual([call[-1] for call in self.calls() if call[0] == "curl"],
                         [row["baseUrl"] + name for name in row["files"]])
        reference = self.state / "voice-reference.wav"
        info = reference.lstat()
        self.assertEqual((stat.S_ISREG(info.st_mode), stat.S_IMODE(info.st_mode)), (True, 0o600))
        self.assertFalse(reference.resolve().is_relative_to(self.plugin.resolve()))
        self.assertEqual((self.data / "clone-probed").read_bytes(), reference.read_bytes(), "the probe read the recording")
        with wave.open(str(reference)) as wav:
            self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()),
                             (1, 2, 24000, 10 * 24000))
        # One environment holds one onnxruntime: the projection swaps that pin alone.
        local = (PLUGIN / "requirements-local.lock").read_text().splitlines()
        projected = (self.data / "clone/requirements-clone.lock").read_text().splitlines()
        self.assertEqual([line for line in projected if line not in local],
                         [line for line in (PLUGIN / "requirements-clone.lock").read_text().splitlines()
                          if line.startswith("onnxruntime-gpu==")])
        self.assertEqual([line for line in local if line not in projected],
                         [line for line in local if line.startswith("onnxruntime==")])
        self.assertEqual(self.clone_status(), {"tone": "ok", "text": "Ready", "action": "remove",
                                               "recording": True, "tierReady": True})
        # Remove deletes the recording and the marker; the model stays.
        result = self.clone_tui("clone-voice-remove.sh", ["yes"])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(reference.exists())
        self.assertFalse((self.state / "clone-ready.json").exists())
        self.assertTrue((self.data / "clone/models/tokenizer.json").is_file())
        self.assertEqual(self.clone_status()["action"], "setup")
        # A No keeps it.
        self.clone_tui("clone-voice.sh", ["yes", "yes"])
        self.assertEqual(self.clone_tui("clone-voice-remove.sh", ["no"]).returncode, 130)
        self.assertTrue(reference.exists())
        needle = '        (state / REFERENCE).unlink(missing_ok=True)\n    print("jarvis-setup: clone=removed"'
        self.mutant(needle, '    print("jarvis-setup: clone=removed"')
        self.clone_tui("clone-voice-remove.sh", ["yes"])
        self.assertTrue(reference.exists(), "must-fail control: the recording survives a Remove")

    def test_clone_status_needs_row_and_recording_and_controls(self):
        self.large()
        self.assertEqual(self.clone_tui("clone-voice.sh", ["yes", "yes"]).returncode, 0)
        self.assertEqual(self.clone_status()["tone"], "ok")
        reference = self.state / "voice-reference.wav"
        model = self.data / "clone/models/onnx/language_model_fp16.onnx_data"
        original = model.read_bytes()
        # The row must verify: a corrupt model file reads not ready.
        model.write_bytes(b"corrupt")
        self.assertEqual(self.clone_status()["tone"], "warning")
        model.write_bytes(original)
        self.assertEqual(self.clone_status()["tone"], "ok")
        # The recording must exist as this user's 0600 file.
        recording = reference.read_bytes()
        reference.unlink()
        self.assertEqual(self.clone_status(), {"tone": "info", "text": "Not set up", "action": "setup",
                                               "recording": False, "tierReady": True})
        reference.write_bytes(recording)
        reference.chmod(0o644)
        self.assertNotEqual(self.clone_status()["tone"], "ok")
        reference.chmod(0o600)
        self.assertEqual(self.clone_status()["tone"], "ok")
        # A tier off the graphics card leaves it not ready.
        self.config["tier"] = "small"
        self.write_config()
        self.install()
        self.assertEqual(self.clone_status()["tierReady"], False)
        self.assertNotEqual(self.clone_status()["tone"], "ok")
        self.config["tier"] = "large"
        self.write_config()
        self.install()
        self.assertEqual(self.clone_status()["tone"], "ok")
        # Controls: each drops one rule; its defect then reads ready.
        for name, needle, replacement, plant, restore in [
                ("row verifies", '            judge.verify(value, data / CLONE / "models", [clone_row(value)])\n        except',
                 "        except", lambda: model.write_bytes(b"corrupt"), lambda: model.write_bytes(original)),
                ("recording mode", "stat.S_IMODE(info.st_mode) == 0o600 and ", "",
                 lambda: reference.chmod(0o644), lambda: reference.chmod(0o600))]:
            with self.subTest(control=name):
                plant()
                self.assertNotEqual(self.clone_status()["tone"], "ok")
                self.mutant(needle, replacement)
                self.assertEqual(self.clone_status()["tone"], "ok", "must-fail control stayed green: " + name)
                (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
                restore()

    def test_clone_status_verifies_no_tier_and_control(self):
        # The Local voice row verifies the tier; the clone row reads its
        # marker, so a tier model the verifier would refuse leaves the
        # clone row's tier verdict as the marker gives it.
        self.large()
        self.assertEqual(self.clone_tui("clone-voice.sh", ["yes", "yes"]).returncode, 0)
        tier_model = next(path for path in (self.data / "models").rglob("*") if path.is_file())
        tier_model.write_bytes(b"corrupt")
        self.not_ready()
        self.assertEqual(self.clone_status()["tone"], "ok")
        self.mutant("tier = marked_tier(judge.manifest(HERE / \"artifacts.json\"), state)",
                    "tier = clone_tier(judge, judge.manifest(HERE / \"artifacts.json\"), state, data)")
        self.assertEqual(self.clone_status()["tierReady"], False, "must-fail control: the clone row verified the tier")
        # A marker naming a CPU tier, or none, reads no graphics card tier.
        (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
        marker = self.state / "local-ready.json"
        saved = marker.read_text()
        for text in (json.dumps(dict(json.loads(saved), tier="small")), "{", ""):
            with self.subTest(marker=text[:20]):
                marker.write_text(text)
                self.assertEqual(self.clone_status()["tierReady"], False)
        marker.unlink()
        self.assertEqual(self.clone_status()["tierReady"], False)

    def test_clone_install_needs_large_tier_and_control(self):
        self.install()
        self.ready()
        self.reset_calls()
        result = self.clone("install")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stderr.decode().splitlines()[0], "jarvis-setup: failed=clone=needs-large-tier")
        self.assertEqual([call[0] for call in self.calls()], [], "nothing is built or downloaded")
        self.assertFalse((self.data / "clone").exists())
        self.mutant("if not clone_tier(judge, value, state, data):", "if False:")
        self.assertEqual(self.clone("install").returncode, 0)
        self.assertTrue(any(call[0] == "curl" for call in self.calls()))

    def test_clone_install_failure_removes_what_it_made(self):
        self.large()
        bad = next(iter(next(a for a in self.spec["artifacts"] if a["id"] == "chatterbox")["files"]))
        (self.downloads / "clone" / bad).write_bytes(b"bad hash")
        result = self.clone("install")
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"download=hash-mismatch", result.stderr)
        self.assertEqual(sorted(path.name for path in (self.data / "clone").iterdir()), [])
        self.mutant("            remove_runtime(root, CLONE_RUNTIME)\n", "")
        self.clone("install")
        self.assertTrue((self.data / "clone/venv").exists(), "must-fail control kept the runtime")

    # Recordings record refuses: (label, PCM, keyed refusal, needle of its rule).
    RECORDINGS = [
        ("too short", 2, 0.5, "recording=length", "if len(pcm) % 2 or not REFERENCE_SECONDS[0] <= seconds <= REFERENCE_SECONDS[1]:"),
        ("too long", 16, 0.5, "recording=length", "if len(pcm) % 2 or not REFERENCE_SECONDS[0] <= seconds <= REFERENCE_SECONDS[1]:"),
        ("no sound", 10, 0, "recording=silent", "if max(map(abs, samples)) < REFERENCE_PEAK:"),
    ]

    def test_clone_record_refusals_and_controls(self):
        self.large()
        self.assertEqual(self.clone("install").returncode, 0)
        for label, seconds, amplitude, key, needle in self.RECORDINGS:
            with self.subTest(recording=label):
                result = self.clone("record", stdin=self.tone(seconds, amplitude))
                self.assertEqual(result.returncode, 1)
                self.assertRegex(result.stderr.decode().splitlines()[0], "^jarvis-setup: failed=" + key + "( seconds=[0-9.]+)?$")
                self.assertFalse((self.state / "voice-reference.wav").exists())
                self.mutant(needle, "if False:")
                self.assertEqual(self.clone("record", stdin=self.tone(seconds, amplitude)).returncode, 0,
                                 "must-fail control stayed green: " + label)
                self.assertTrue((self.state / "voice-reference.wav").exists())
                (self.plugin / "setup-local").write_text((PLUGIN / "setup-local").read_text())
                self.clone("remove")
        # A failed probe keeps no recording and publishes nothing.
        self.config["clone_probe_exit"] = 1
        self.write_config()
        result = self.clone("record", stdin=self.tone(10))
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"jarvis-setup: failed=clone-probe", result.stderr)
        self.assertFalse((self.state / "voice-reference.wav").exists())
        self.assertFalse((self.state / "clone-ready.json").exists())

    def test_clone_lock_projection_control(self):
        self.large()
        lock = self.plugin / "requirements-clone.lock"
        original = lock.read_text()
        lock.write_text(original + original.splitlines()[-1] + "\n")
        result = self.clone("install")
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"clone-lock=unprojectable pins=2 replaced=1", result.stderr)
        self.mutant("if len(pins) != 1 or len(replaced) != 1:", "if False:")
        self.assertEqual(self.clone("install").returncode, 0)

    def test_shipped_lock_runtime_pins(self):
        lines = (PLUGIN / "requirements-local.lock").read_text().splitlines()
        lines += (PLUGIN / "requirements-local-cpu.lock").read_text().splitlines()
        lines += (PLUGIN / "requirements-clone.lock").read_text().splitlines()
        pins = {}
        for line in lines:
            if not line or line.startswith(("#", "-r ")):
                continue
            match = re.fullmatch(r"([a-z0-9-]+)==([0-9.]+) --hash=sha256:([a-f0-9]{64})", line)
            self.assertIsNotNone(match, line)
            self.assertNotIn(match[1], pins)
            pins[match[1]] = match[2]
        for name, runtime in self.spec["runtimes"].items():
            self.assertIn(pins[name], runtime["versions"])
        self.assertIn("sherpa-onnx-core", pins)
        # This data test has no production behavior to mutate. The install
        # fixture separately refuses removing require-hashes from its argv.


if __name__ == "__main__":
    namespace_entry()
    unittest.main()
