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

# The screens' whole world: a gum that prints, an rm, a voxtype that
# records its call, and a systemctl that records every call and answers
# `show` with the file `show` a case writes, exiting with the status in
# `show-status`. Only Stop the other voxtype may call systemctl: the core
# runs voxtype, and no user unit does.
tools="$TMP_ROOT/tools"
mkdir -p -- "$tools"
for tool in bash sleep python3 rm; do ln -s -- "$(command -v "$tool")" "$tools/$tool"; done
cat >"$tools/gum" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*"
SH
cat >"$tools/voxtype" <<SH
#!/usr/bin/env bash
printf 'voxtype %s\n' "\$*" >>"$TMP_ROOT/calls"
SH
cat >"$tools/systemctl" <<SH
#!/usr/bin/env bash
printf 'systemctl %s\n' "\$*" >>"$TMP_ROOT/calls"
if [[ \$2 == show ]]; then
  printf '%s\n' "\$(<"$TMP_ROOT/show")"
  read -r code <"$TMP_ROOT/show-status"
  exit "\$code"
fi
SH
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

# Stop the other voxtype. Each case writes what `systemctl --user show`
# answers, plants the unit file it names, and runs the screen, which
# confirms unattended.
show_call='systemctl --user show voxtype.service --property=LoadState,FragmentPath'
disable_call='systemctl --user disable --now voxtype.service'
user_unit="$TMP_ROOT/home-stop-own/.config/systemd/user/voxtype.service"
package_unit="$TMP_ROOT/usr/lib/systemd/user/voxtype.service"
stop_run() { # NAME SCRIPT LOAD FRAGMENT SHOW_STATUS
  printf 'LoadState=%s\nFragmentPath=%s\n' "$3" "$4" >"$TMP_ROOT/show"
  printf '%s\n' "$5" >"$TMP_ROOT/show-status"
  if [[ -n $4 ]]; then mkdir -p -- "${4%/*}"; printf '[Unit]\n' >"$4"; fi
  run_screen "$TMP_ROOT/home-stop-$1" "$2"
  first_err="$(head -n 1 -- "$TMP_ROOT/err")"
}
stop_screen="$plugin/tui/stop-other.sh"

stop_run own "$stop_screen" loaded "$user_unit" 0
if [[ $status == 0 && $calls == "$show_call|$disable_call|systemctl --user daemon-reload" && ! -e $user_unit ]]; then ok "stop-other turns off the user's own unit, removes its file and reloads"; else fail "stop-other own unit: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

package_kept() {
  [[ $status == 0 && $calls == "$show_call|$disable_call" && -f $package_unit ]]
}
stop_run package "$stop_screen" loaded "$package_unit" 0
if package_kept; then ok "stop-other turns off a package's unit and keeps its file"; else fail "stop-other package unit: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

control="$TMP_ROOT/stop-other-anypath.sh"
python3 - "$stop_screen" "$control" <<'PY'
import sys
source = open(sys.argv[1]).read()
needle = '[[ ${fragment%/*} == "$user_units" ]] && own=true'
if source.count(needle) != 1:
    raise SystemExit('path check count')
open(sys.argv[2], 'w').write(source.replace(needle, 'own=true'))
PY
stop_run package-control "$control" loaded "$package_unit" 0
if package_kept; then fail "control path check: the copy that removes any unit file still kept the package's file"; else ok "control path check turns the package case red (calls=[$calls])"; fi

no_unit_refused() {
  [[ $status == 1 && $first_err == 'vgs-voice: refused: unit=none load=not-found' && $calls == "$show_call" ]]
}
stop_run none "$stop_screen" not-found "" 0
if no_unit_refused; then ok "stop-other with no voxtype unit refuses with one keyed line and changes nothing"; else fail "stop-other no unit: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

control="$TMP_ROOT/stop-other-nocheck.sh"
python3 - "$stop_screen" "$control" <<'PY'
import sys
source = open(sys.argv[1]).read()
needle = 'if [[ $load != loaded || -z $fragment ]]; then'
if source.count(needle) != 1:
    raise SystemExit('unit check count')
open(sys.argv[2], 'w').write(source.replace(needle, 'if false; then'))
PY
stop_run none-control "$control" not-found "" 0
if no_unit_refused; then fail "control unit check: the copy without the check still refused cleanly"; else ok "control unit check turns the no-unit case red (status=$status calls=[$calls])"; fi

stop_run unread "$stop_screen" "" "" 1
if [[ $status == 1 && $first_err == 'vgs-voice: refused: unit=unread' && $calls == "$show_call" ]]; then ok "stop-other refuses with one keyed line when systemctl cannot answer"; else fail "stop-other unread: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

control="$TMP_ROOT/stop-other-unread.sh"
python3 - "$stop_screen" "$control" <<'PY'
import sys
source = open(sys.argv[1]).read()
needle = 'if ! shown="$(systemctl --user show "$unit" --property=LoadState,FragmentPath)"; then'
if source.count(needle) != 1:
    raise SystemExit('show check count')
open(sys.argv[2], 'w').write(source.replace(needle, 'shown="$(systemctl --user show "$unit" --property=LoadState,FragmentPath)" || true\nif false; then'))
PY
stop_run unread-control "$control" "" "" 1
if [[ $status == 1 && $first_err == 'vgs-voice: refused: unit=unread' ]]; then fail "control show check: the copy that ignores a failed show still refused as unread"; else ok "control show check turns the unread case red (first=[$first_err])"; fi

if [[ $failures -gt 0 ]]; then
  printf 'test-voice-tui: failures=%d\n' "$failures"
  exit 1
fi
printf 'test-voice-tui: ok\n'
