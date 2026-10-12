#!/usr/bin/env python3
"""Read the destination while the real smoke writer stages its source.

The FIFO holds the writer after its first byte. The checks fail when the
writer skips staging, skips rename publishing, drops stdin, loses the old mode
or publishes output from a failed command.
"""
import errno
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import time
import unittest

REPO = Path(__file__).resolve().parents[1]
WRITER = REPO / "scripts/smoke/user-config.sh"
BASH = shutil.which("bash")
ENV = {"PATH": os.defpath, "LANG": "C"}
BEFORE = b'{"version":2,"plugins":[]}\n'
AFTER = b'{"version":2,"plugins":[{"id":"acme.tick"}]}\n'
SCRATCH_PARENT = REPO / "tmp/test-smoke-user-config"


def restore(writer, home, backup):
    return subprocess.Popen(
        [BASH, "-c", 'set -euo pipefail; source "$1"; home="$2"; user_config_restore "$3"',
         "restore", str(writer), str(home), str(backup)],
        env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )


def stdin_write(writer, home, source):
    return subprocess.Popen(
        [BASH, "-c", 'set -euo pipefail; source "$1"; home="$2"; user_config_write cat <"$3"',
         "stdin-write", str(writer), str(home), str(source)],
        env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )


def failed_write(writer, home):
    return subprocess.Popen(
        [BASH, "-c",
         'set -uo pipefail; source "$1"; home="$2"; shift 2; user_config_write "$@" || exit $?',
         "failed-write", str(writer), str(home), "python3", "-c",
         'import sys; sys.stdout.write("{\\"half"); raise SystemExit(1)'],
        env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )


def scratch_dir():
    SCRATCH_PARENT.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=SCRATCH_PARENT)


def mutant_writer(scratch, old, new):
    text = WRITER.read_text()
    assert text.count(old) == 1
    changed = text.replace(old, new)
    assert changed != text
    mutant = scratch / "mutant-user-config.sh"
    mutant.write_text(changed)
    return mutant


def concurrent_read(writer, scratch, start):
    home = scratch / "home"
    config = home / ".config/vgshell"
    config.mkdir(parents=True)
    destination = config / "shell.json"
    destination.write_bytes(BEFORE)
    os.chmod(destination, 0o644)
    before_inode = destination.stat().st_ino
    fifo = scratch / "backup.fifo"
    os.mkfifo(fifo)
    child = start(writer, home, fifo)
    fd = None
    try:
        deadline = time.monotonic() + 5
        while fd is None:
            try:
                fd = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)
            except OSError as error:
                if error.errno != errno.ENXIO:
                    raise
                assert child.poll() is None, "restore stopped before opening the backup"
                assert time.monotonic() < deadline, "restore never opened the backup"
                time.sleep(0.01)
        os.write(fd, AFTER[:1])
        # A non-empty staging file or a changed destination proves the writer
        # made progress. The source stays open until after the concurrent read.
        while not (any(p.stat().st_size for p in config.glob(".shell.json.*"))
                   or destination.read_bytes() != BEFORE):
            assert child.poll() is None, "restore stopped before copying the prefix"
            assert time.monotonic() < deadline, "restore never copied the prefix"
            time.sleep(0.01)
        assert child.poll() is None, "restore ended before the source finished"
        observed = json.loads(destination.read_bytes())
        assert observed == {"version": 2, "plugins": []}, "unfinished restore replaced the document"
        os.write(fd, AFTER[1:])
        os.close(fd)
        fd = None
        out, errors = child.communicate(timeout=5)
        assert child.returncode == 0, (out, errors)
        assert destination.read_bytes() == AFTER, "completed restore lost backup bytes"
        assert destination.stat().st_ino != before_inode, "completed restore did not publish by rename"
        assert stat.S_IMODE(destination.stat().st_mode) == 0o644, "completed restore lost the old mode"
        assert not list(config.glob(".shell.json.*")), "completed restore left staging files"
    finally:
        if fd is not None:
            os.close(fd)
        if child.poll() is None:
            child.terminate()
        child.communicate(timeout=5)


def check_failed_write_keeps_document(writer, scratch):
    home = scratch / "home"
    config = home / ".config/vgshell"
    config.mkdir(parents=True)
    destination = config / "shell.json"
    destination.write_bytes(BEFORE)
    child = failed_write(writer, home)
    child.communicate(timeout=5)
    assert child.returncode != 0
    assert destination.read_bytes() == BEFORE
    assert list(config.glob(".shell.json.*")) == []


class RestoreTests(unittest.TestCase):
    def test_restore_keeps_complete_document(self):
        with scratch_dir() as scratch:
            concurrent_read(WRITER, Path(scratch), restore)

    def test_stdin_write_keeps_complete_document(self):
        with scratch_dir() as scratch:
            concurrent_read(WRITER, Path(scratch), stdin_write)

    def test_direct_copy_control_fails_same_contract(self):
        with scratch_dir() as scratch:
            scratch = Path(scratch)
            mutant = mutant_writer(
                scratch,
                '"$@" >"$staged" || return',
                '"$@" >"$destination" || return',
            )
            with self.assertRaises(json.JSONDecodeError):
                concurrent_read(mutant, scratch, restore)

    def test_failed_command_keeps_document_and_removes_staging(self):
        with scratch_dir() as scratch:
            check_failed_write_keeps_document(WRITER, Path(scratch))

    def test_failed_command_control_fails_without_return_guard(self):
        with scratch_dir() as scratch:
            scratch = Path(scratch)
            mutant = mutant_writer(scratch, '"$@" >"$staged" || return', '"$@" >"$staged"')
            with self.assertRaises(AssertionError):
                check_failed_write_keeps_document(mutant, scratch)

    def test_publish_control_fails_without_rename(self):
        with scratch_dir() as scratch:
            scratch = Path(scratch)
            mutant = mutant_writer(
                scratch,
                'mv -T -- "$staged" "$destination"',
                'cat -- "$staged" >"$destination"',
            )
            with self.assertRaises(AssertionError):
                concurrent_read(mutant, scratch, restore)

    def test_stdin_control_fails_when_command_loses_stdin(self):
        with scratch_dir() as scratch:
            scratch = Path(scratch)
            mutant = mutant_writer(
                scratch,
                '"$@" >"$staged" || return',
                'exec </dev/null; "$@" >"$staged" || return',
            )
            with self.assertRaises(AssertionError):
                concurrent_read(mutant, scratch, stdin_write)

    def test_mode_control_fails_without_chmod_reference(self):
        with scratch_dir() as scratch:
            scratch = Path(scratch)
            mutant = mutant_writer(
                scratch,
                'chmod --reference="$destination" -- "$staged" || return',
                ':',
            )
            with self.assertRaises(AssertionError):
                concurrent_read(mutant, scratch, restore)

    def test_repaired_rows_use_restore_owner(self):
        # This establishes wiring, separately from the executed writer test.
        required = {"hold-shortcuts", "jarvis-keys", "jarvis-widget", "sound", "network", "vpn"}
        consumers = set()
        for name in required:
            path = REPO / "scripts/smoke/rows" / (name + ".sh")
            text = path.read_text().replace("\r\n", "\n")
            if any(line.startswith("user_config_restore ") for line in text.splitlines()):
                consumers.add(path.stem)
                inputs = next(line for line in text.splitlines() if line.startswith("# inputs:"))
                self.assertIn("scripts/smoke/user-config.sh", inputs.split())
        self.assertTrue(required <= consumers, "a repaired row bypasses the restore owner")


if __name__ == "__main__":
    assert BASH and Path(BASH).is_absolute(), "bash is unavailable"
    unittest.main()
