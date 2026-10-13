#!/usr/bin/env bash
# Controls for `vgshell --version` and `vgshell version [--json]`: the VERSION
# read, the describe form in a checkout, the checkout test and the
# refusals. Rows run copies of bin/vgshell in trees under $tmp, never this
# repository's own checkout. An exported tree holds bin/ and VERSION and no
# repository; a checkout is one g built. Expected values come from the
# repository's VERSION and from each fixture's own git, never from vgshell.
set -euo pipefail

# shellcheck source=scripts/vgshell-rows.sh
source "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/vgshell-rows.sh"

want_version="$(<"$repo/VERSION")"
version_tree() { # DIR [VERSION_TEXT]: bin/ and the repository's VERSION, or VERSION_TEXT
  mkdir -p "$1"
  cp -R -- "$repo/bin" "$1/"
  if [[ $# -gt 1 ]]; then printf '%s' "$2" >"$1/VERSION"; else cp -- "$repo/VERSION" "$1/VERSION"; fi
}
cfg="$tmp/cfg-version"
exported="$tmp/version-export"; version_tree "$exported"
INST_BIN="$exported/bin/vgshell" inst "--version in an exported tree prints VERSION" "$cfg" "$rt_empty" 0 "vgshell $want_version" "" --version
check "--version prints one line on stdout" test "$(<"$tmp/out")" == "vgshell $want_version"
check "--version prints nothing on stderr" test ! -s "$tmp/err"
INST_BIN="$exported/bin/vgshell" inst "version reports no running shell" "$cfg" "$rt_empty" 0 "running=none" "" version
check "version keeps its tree version line" has_line "vgshell $want_version"
INST_BIN="$exported/bin/vgshell" inst "version --json outside a checkout has a null describe" "$cfg" "$rt_empty" 0 "{\"version\":\"$want_version\",\"describe\":null,\"running\":null,\"restart\":null}" "" version --json

# The export sits untracked inside a repository with a commit, so git
# finds that repository's top level above the tree.
foreign="$tmp/version-foreign"; mkdir -p "$foreign"; printf 'fixture\n' >"$foreign/README"
g init -q "$foreign"; g -C "$foreign" add README; g -C "$foreign" commit -q -m foreign
version_tree "$foreign/vgshell"
check "the nested export's repository is the foreign one" test "$(g -C "$foreign/vgshell" rev-parse --show-toplevel)" == "$foreign"
INST_BIN="$foreign/vgshell/bin/vgshell" inst "an export inside another repository prints VERSION alone" "$cfg" "$rt_empty" 0 "vgshell $want_version" "" --version
# GIT_DIR alone makes git take the working directory for the top level.
check "a caller's GIT_DIR makes plain git call the export a checkout" test "$("${base_env[@]}" GIT_DIR="$foreign/.git" git -C "$exported" rev-parse --show-toplevel)" == "$exported"
saved_env=("${base_env[@]}"); base_env+=(GIT_DIR="$foreign/.git")
INST_BIN="$exported/bin/vgshell" inst "a caller's GIT_DIR never gives the export a describe" "$cfg" "$rt_empty" 0 "{\"version\":\"$want_version\",\"describe\":null,\"running\":null,\"restart\":null}" "" version --json
base_env=("${saved_env[@]}")

checkout="$tmp/version-checkout"; version_tree "$checkout"
g init -q "$checkout"; g -C "$checkout" add -A; g -C "$checkout" commit -q -m one
for note in two three; do
  printf '%s\n' "$note" >"$checkout/NOTE"; g -C "$checkout" add NOTE; g -C "$checkout" commit -q -m "$note"
done
hash="$(g -C "$checkout" rev-parse --short HEAD)"
INST_BIN="$checkout/bin/vgshell" inst "a checkout with no release tag counts every commit" "$cfg" "$rt_empty" 0 "vgshell $want_version.r3.g$hash" "" --version
INST_BIN="$checkout/bin/vgshell" inst "version --json in a checkout carries the describe form" "$cfg" "$rt_empty" 0 "{\"version\":\"$want_version\",\"describe\":\"$want_version.r3.g$hash\",\"running\":null,\"restart\":null}" "" version --json
# A repository's core.abbrev of 12 would lengthen git's own abbreviation;
# the describe form keeps 7 hex digits, the AUR -git package convention.
g -C "$checkout" config core.abbrev 12
check "the fixture's own git abbreviates to 12 digits" test "$(g -C "$checkout" rev-parse --short HEAD)" == "$(g -C "$checkout" rev-parse HEAD | cut -c1-12)"
INST_BIN="$checkout/bin/vgshell" inst "a checkout's describe keeps a 7-digit hash under core.abbrev=12" "$cfg" "$rt_empty" 0 "vgshell $want_version.r3.g${hash:0:7}" "" --version

# The owner and overseer parse running/restart. The stand-in answers only
# the read-only IPC call; the lock names a process this suite still owns.
cat >"$tmp/qs" <<'SH'
#!/usr/bin/env bash
[[ $1 == ipc && $2 == --pid && $4 == call && $5 == shell && $6 == version ]] || exit 1
printf '%s\n' "$STUB_REPLY"
SH
chmod +x "$tmp/qs"
env -i PATH="$PATH" sleep 300 &
version_pid=$!
trap 'kill "$version_pid" 2>/dev/null || :; wait "$version_pid" 2>/dev/null || :; rows_cleanup' EXIT
rt_version="$tmp/rt-version"; mkdir -p "$rt_version"
printf '%s\n' "$version_pid" >"$rt_version/vgshell.lock"
checkout_describe="$want_version.r3.g${hash:0:7}"
version_running_is() { # RUNNING RESTART: empty arguments mean JSON null
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if (d["running"], d["restart"]) == (sys.argv[2] or None, sys.argv[3] or None) else 1)' "$tmp/out" "$1" "$2"
}
for state in equal different absent; do
  running="$checkout_describe" restart=none rt="$rt_version"
  case "$state" in
    different) running=9.8.7.r1.gabcdef0; restart=needed ;;
    absent) running=""; restart=""; rt="$rt_empty" ;;
  esac
  INST_BIN="$checkout/bin/vgshell" INST_REPLY="$running" inst "version text reads $state" "$cfg" "$rt" 0 "running=${running:-none}${restart:+ restart=$restart}" "" version
  check "version keeps its checkout line ($state)" has_line "vgshell $checkout_describe"
  INST_BIN="$checkout/bin/vgshell" INST_REPLY="$running" inst "version JSON reads $state" "$cfg" "$rt" 0 "$any_out" "" version --json
  check "version JSON reports running/restart ($state)" version_running_is "$running" "$restart"
done

# Remove the comparison in a disposable copy. The same JSON assertion
# must reject its answer for a different running commit.
comparison="$tmp/version-comparison"; cp -R -- "$checkout" "$comparison"
python3 - "$comparison/bin/vgshell" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); text = p.read_text()
old = '[[ $running != "${describe:-$version}" ]] || restart=none'
assert text.count(old) == 1
p.write_text(text.replace(old, 'restart=none'))
PY
INST_BIN="$comparison/bin/vgshell" INST_REPLY=9.8.7.r1.gabcdef0 inst "control: comparison mutant answers" "$cfg" "$rt_version" 0 "$any_out" "" version --json
if version_running_is 9.8.7.r1.gabcdef0 needed; then fail "control: the restart assertion accepts a removed comparison"; else ok "control: the restart assertion rejects a removed comparison"; fi
INST_BIN="$checkout/bin/vgshell" INST_REPLY='not-a-version' inst "a malformed running answer is unavailable" "$cfg" "$rt_version" 69 "" 'vgshell: refused: ipc=shell.version reason=malformed-reply' version --json

# nightly and v3-beta sit on HEAD, nearer than v0.0.9: a describe that
# counted them would name them.
tagged="$tmp/version-tagged"; version_tree "$tagged"
g init -q "$tagged"; g -C "$tagged" add -A; g -C "$tagged" commit -q -m one; g -C "$tagged" tag -a -m v0.0.9 v0.0.9
for note in two three; do
  printf '%s\n' "$note" >"$tagged/NOTE"; g -C "$tagged" add NOTE; g -C "$tagged" commit -q -m "$note"
done
g -C "$tagged" tag nightly; g -C "$tagged" tag v3-beta
hash="$(g -C "$tagged" rev-parse --short HEAD)"
INST_BIN="$tagged/bin/vgshell" inst "a checkout prints the release tag's version and the distance from it" "$cfg" "$rt_empty" 0 "vgshell 0.0.9.r2.g$hash" "" --version
INST_BIN="$tagged/bin/vgshell" inst "version --json keeps VERSION beside the tag's describe form" "$cfg" "$rt_empty" 0 "{\"version\":\"$want_version\",\"describe\":\"0.0.9.r2.g$hash\",\"running\":null,\"restart\":null}" "" version --json
g -C "$tagged" config core.abbrev 12
INST_BIN="$tagged/bin/vgshell" inst "a tagged describe keeps a 7-digit hash under core.abbrev=12" "$cfg" "$rt_empty" 0 "vgshell 0.0.9.r2.g${hash:0:7}" "" --version
g -C "$tagged" tag v3.0
INST_BIN="$tagged/bin/vgshell" inst "a release tag that is not v<X.Y.Z> is refused" "$cfg" "$rt_empty" 1 "" "vgshell: refused: tag=v3.0 reason=not-a-version" --version

unborn="$tmp/version-unborn"; version_tree "$unborn"; g init -q "$unborn"
INST_BIN="$unborn/bin/vgshell" inst "a checkout with no commit is refused" "$cfg" "$rt_empty" 1 "" "vgshell: refused: git=describe path=$unborn" --version

bad="$tmp/version-bad"; version_tree "$bad"; rm -- "$bad/VERSION"
INST_BIN="$bad/bin/vgshell" inst "a missing VERSION is refused" "$cfg" "$rt_empty" 1 "" "vgshell: refused: version=missing path=$bad/VERSION" --version
INST_BIN="$bad/bin/vgshell" inst "a refused version --json prints nothing on stdout" "$cfg" "$rt_empty" 1 "" "vgshell: refused: version=missing path=$bad/VERSION" version --json
for text in '0.1\n' '0.1.0' 'v0.1.0\n' '0.1.0\n0.2.0\n' '0.1.0\n\n'; do
  printf '%b' "$text" >"$bad/VERSION"
  INST_BIN="$bad/bin/vgshell" inst "a VERSION of [$text] is refused" "$cfg" "$rt_empty" 1 "" "vgshell: refused: version=malformed path=$bad/VERSION" --version
done
for args in 'version extra' '--version extra' '--version --json' 'version --json extra'; do
  read -r -a words <<<"$args"
  INST_BIN="$exported/bin/vgshell" inst "$args is a bad invocation" "$cfg" "$rt_empty" 2 "" "vgshell: refused: argument=${words[-1]}" "${words[@]}"
done

# The must-fail control: a copy of vgshell that prints a fixed version instead
# of reading VERSION passes every row above whose tree holds the
# repository's VERSION, and fails the row below, whose VERSION differs.
other="$tmp/version-other"; version_tree "$other" $'9.8.7\n'
INST_BIN="$other/bin/vgshell" inst "--version prints the tree's own VERSION" "$cfg" "$rt_empty" 0 "vgshell 9.8.7" "" --version
python3 - "$other/bin/vgshell" "$want_version" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
old = 'cat -- "$file" 2>/dev/null'
count = text.count(old)
if count != 1:
    raise SystemExit(f"version-read-control: expected one match, found {count}")
changed = text.replace(old, f"printf '%s\\n' {sys.argv[2]}")
if changed == text:
    raise SystemExit("version-read-control: mutation changed nothing")
path.write_text(changed)
PY
INST_BIN="$other/bin/vgshell" inst "the VERSION-ignoring mutant prints its fixed version, not the tree's" "$cfg" "$rt_empty" 0 "vgshell $want_version" "" --version

rows_done test-vgshell-version
