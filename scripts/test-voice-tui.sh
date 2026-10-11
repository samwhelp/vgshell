#!/usr/bin/env bash
set -euo pipefail

self="$(readlink -f -- "${BASH_SOURCE[0]}")"
repo="$(cd -- "$(dirname -- "$self")/.." && pwd)"
plugin="$repo/shell/plugins/vgs.voice"
TMP_ROOT="$repo/tmp/voice-tui-test-$$"
rm -rf -- "${TMP_ROOT:?}"
mkdir -p -- "$TMP_ROOT"
trap 'rm -rf -- "${TMP_ROOT:?}"' EXIT

failures=0
ok() { printf '  ok    %s\n' "$*"; }
fail() { failures=$((failures + 1)); printf '  FAIL  %s\n' "$*"; }

for tool in bash sleep python3 paste grep; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'test-voice-tui: status=not-measured missing=%s\n' "$tool"
    exit 77
  fi
done

# The screens' whole world: a gum that prints, a voxtype that records its
# call, and a systemctl that records a call no screen may make, since the
# core runs voxtype and no user unit does.
tools="$TMP_ROOT/tools"
mkdir -p -- "$tools"
for tool in bash sleep python3; do ln -s -- "$(command -v "$tool")" "$tools/$tool"; done
cat >"$tools/gum" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*"
SH
for tool in systemctl voxtype; do
  cat >"$tools/$tool" <<SH
#!/usr/bin/env bash
printf '$tool %s\n' "\$*" >>"$TMP_ROOT/calls"
SH
done
chmod 755 "$tools/gum" "$tools/systemctl" "$tools/voxtype"

run_screen() { # HOME SCRIPT [PATH]
  local home="$1" script="$2" path="${3:-$tools}"
  : >"$TMP_ROOT/calls"
  mkdir -p -- "$home"
  status=0
  env -i PATH="$path" HOME="$home" XDG_CONFIG_HOME="$home/.config" VGS_TUI_UNATTENDED=1 VGS_TUI_LIB="$repo/bin/lib/tui.sh" VGS_PLUGIN_DIR="$plugin" bash "$script" >"$TMP_ROOT/out" 2>"$TMP_ROOT/err" || status=$?
  calls="$(paste -sd '|' "$TMP_ROOT/calls")"
}

# Each screen runs voxtype's own screen and nothing else: the service has
# the core start its daemon again once the run ends with code 0. Each
# screen's control is a copy that restarts a user unit after it.
declare -A screen_call=([configure]='voxtype configure' [model]='voxtype setup model')
for screen in configure model; do
  run_screen "$TMP_ROOT/home-$screen-run" "$plugin/tui/$screen.sh"
  if [[ $status == 0 && $calls == "${screen_call[$screen]}" ]]; then ok "$screen runs voxtype's screen and no systemctl"; else fail "$screen: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

  control="$TMP_ROOT/$screen-restarts.sh"
  cp -- "$plugin/tui/$screen.sh" "$control"
  printf '%s\n' 'systemctl --user restart voxtype' >>"$control"
  run_screen "$TMP_ROOT/home-$screen-restarts" "$control"
  if [[ $status == 0 && $calls == "${screen_call[$screen]}" ]]; then fail "control systemctl: the $screen copy that restarts a user unit still passed"; else ok "control systemctl turns the $screen case red (calls=[$calls])"; fi
done

# Without voxtype on PATH, each Voice screen refuses with its keyed line
# before it changes anything, and no shell error reaches the terminal. Each
# screen's control is a copy without its check.
no_voxtype="$TMP_ROOT/tools-no-voxtype"
mkdir -p -- "$no_voxtype"
for tool in "$tools"/*; do
  [[ ${tool##*/} == voxtype ]] || ln -s -- "$tool" "$no_voxtype/${tool##*/}"
done
missing_refused() { # HOME
  [[ $status == 1 && $(head -n 1 "$TMP_ROOT/err") == 'vgs-voice: refused: voxtype=missing' ]] &&
    ! grep -q 'command not found' "$TMP_ROOT/err" && [[ ! -e $1/.config/voxtype && -z $calls ]]
}
for screen in configure model; do
  run_screen "$TMP_ROOT/home-$screen" "$plugin/tui/$screen.sh" "$no_voxtype"
  if missing_refused "$TMP_ROOT/home-$screen"; then ok "$screen without voxtype refuses with one keyed line and changes nothing"; else fail "$screen without voxtype: status=$status err=$(cat "$TMP_ROOT/err")"; fi

  control="$TMP_ROOT/$screen-nocheck.sh"
  python3 - "$plugin/tui/$screen.sh" "$control" <<'PY'
import sys
source = open(sys.argv[1]).read()
needle = 'if ! command -v voxtype >/dev/null; then'
if source.count(needle) != 1:
    raise SystemExit('voxtype check count')
open(sys.argv[2], 'w').write(source.replace(needle, 'if false; then'))
PY
  chmod 755 "$control"
  run_screen "$TMP_ROOT/home-$screen-control" "$control" "$no_voxtype"
  if missing_refused "$TMP_ROOT/home-$screen-control"; then fail "control voxtype check: the $screen copy without the check still refused cleanly"; else ok "control voxtype check turns the missing-voxtype $screen case red (status=$status)"; fi
done

if [[ $failures -gt 0 ]]; then
  printf 'test-voice-tui: failures=%d\n' "$failures"
  exit 1
fi
printf 'test-voice-tui: ok\n'
