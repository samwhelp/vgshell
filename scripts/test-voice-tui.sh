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

for tool in bash sleep python3 paste grep script; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'test-voice-tui: status=not-measured missing=%s\n' "$tool"
    exit 77
  fi
done

# The screens' whole world: a gum that prints, an rm, a voxtype that
# records its call and answers `status` with the `alt` word in
# `voxtype-alt`, failing when a case wrote none, and a systemctl that
# records every call, answers `show` with the file `show` a case writes,
# and exits with the status in `exit-<verb>`, 0 when a case wrote none.
# Only Stop the other voxtype may call systemctl: the core runs voxtype,
# and no user unit does.
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
if [[ \$1 == status ]]; then
  [[ -f $TMP_ROOT/voxtype-alt ]] || exit 1
  printf '{"text": "", "alt": "%s", "class": "%s"}\n' "\$(<"$TMP_ROOT/voxtype-alt")" "\$(<"$TMP_ROOT/voxtype-alt")"
fi
SH
cat >"$tools/systemctl" <<SH
#!/usr/bin/env bash
printf 'systemctl %s\n' "\$*" >>"$TMP_ROOT/calls"
[[ \$2 != show ]] || printf '%s\n' "\$(<"$TMP_ROOT/show")"
code=0
[[ ! -f $TMP_ROOT/exit-\$2 ]] || read -r code <"$TMP_ROOT/exit-\$2"
exit "\$code"
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
# answers, plants the unit file it names, sets what the stand-ins answer,
# and runs the screen, which confirms unattended. Each control is a copy of
# the screen with one rule taken out, and must turn its case red.
stop_screen="$plugin/tui/stop-other.sh"
show_call='systemctl --user show voxtype.service --property=LoadState,ActiveState,FragmentPath'
disable_call='systemctl --user disable --now voxtype.service'
reload_call='systemctl --user daemon-reload'
status_call='voxtype status --format json'
package_unit="$TMP_ROOT/usr/lib/systemd/user/voxtype.service"
own_unit() { printf '%s\n' "$TMP_ROOT/home-stop-$1/.config/systemd/user/voxtype.service"; } # NAME
stop_world() { # LOAD ACTIVE FRAGMENT [SETTING...]
  # SETTING: alt=WORD, the `alt` voxtype status reads (the read fails when
  # absent); VERB=CODE, systemctl VERB's exit status.
  local setting
  rm -f -- "${TMP_ROOT:?}"/exit-* "${TMP_ROOT:?}/voxtype-alt"
  printf 'LoadState=%s\nActiveState=%s\nFragmentPath=%s\n' "$1" "$2" "$3" >"$TMP_ROOT/show"
  if [[ -n $3 ]]; then mkdir -p -- "${3%/*}"; printf '[Unit]\n' >"$3"; fi
  shift 3
  for setting; do
    case "$setting" in
      alt=*) printf '%s\n' "${setting#alt=}" >"$TMP_ROOT/voxtype-alt" ;;
      *=*) printf '%s\n' "${setting#*=}" >"$TMP_ROOT/exit-${setting%%=*}" ;;
      *) printf 'test-voice-tui: setting=%s\n' "$setting" >&2; exit 2 ;;
    esac
  done
}
stop_run() { # NAME SCRIPT LOAD ACTIVE FRAGMENT [SETTING...]
  local name="$1" script="$2"
  shift 2
  stop_world "$@"
  run_screen "$TMP_ROOT/home-stop-$name" "$script" "${stop_path:-$tools}"
  first_err="$(head -n 1 -- "$TMP_ROOT/err")"
}
stop_copy() { # NAME NEEDLE REPLACEMENT: a copy of the screen with NEEDLE replaced, once
  control="$TMP_ROOT/stop-other-$1.sh"
  python3 - "$stop_screen" "$control" "$2" "$3" <<'PY'
import sys
source = open(sys.argv[1]).read()
if source.count(sys.argv[3]) != 1:
    raise SystemExit('needle count: ' + sys.argv[3])
changed = source.replace(sys.argv[3], sys.argv[4])
if changed == source:
    raise SystemExit('unchanged: ' + sys.argv[3])
open(sys.argv[2], 'w').write(changed)
PY
}

user_unit="$(own_unit own)"
stop_run own "$stop_screen" loaded active "$user_unit"
if [[ $status == 0 && $calls == "$show_call|$disable_call|$reload_call" && ! -e $user_unit ]]; then ok "stop-other turns off the user's own running unit, removes its file and reloads"; else fail "stop-other own unit: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

package_kept() {
  [[ $status == 0 && $calls == "$show_call|$disable_call" && -f $package_unit ]]
}
stop_run package "$stop_screen" loaded active "$package_unit"
if package_kept; then ok "stop-other turns off a package's running unit and keeps its file"; else fail "stop-other package unit: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

# shellcheck disable=SC2016 # the needle and its replacement are source text
stop_copy anypath '[[ ${fragment%/*} == "$user_units" ]] && own=true' 'own=true'
stop_run package-control "$control" loaded active "$package_unit"
if package_kept; then fail "control path check: the copy that removes any unit file still kept the package's file"; else ok "control path check turns the package case red (calls=[$calls])"; fi

# A unit that is loaded but does not run did not start the other voxtype:
# the screen changes no unit and no file, reads the daemon, and refuses
# while one still answers.
inactive_unit="$(own_unit inactive)"
inactive_refused() {
  [[ $status == 1 && $first_err == 'vgs-voice: refused: unit=not-running load=loaded active=inactive daemon=idle' && $calls == "$show_call|$status_call" && -f $inactive_unit ]]
}
stop_run inactive "$stop_screen" loaded inactive "$inactive_unit" alt=idle
if inactive_refused; then ok "stop-other keeps an inactive own unit and refuses while another daemon answers"; else fail "stop-other inactive unit: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

stop_copy noactive 'active | activating | reloading) service_runs=true ;;' '*) service_runs=true ;;'
inactive_unit="$(own_unit inactive-control)"
stop_run inactive-control "$control" loaded inactive "$inactive_unit" alt=idle
if inactive_refused; then fail "control active check: the copy that acts on an inactive unit still kept its file"; else ok "control active check turns the inactive-unit case red (calls=[$calls])"; fi

# No voxtype unit at all: once the daemon reads stopped the place is free,
# and exit 0 has the core start its own; while a daemon answers, or its
# status cannot be read, the screen refuses.
stop_run gone "$stop_screen" not-found inactive "" alt=stopped
if [[ $status == 0 && $calls == "$show_call|$status_call" ]]; then ok "stop-other with no unit and no daemon running ends with 0 and changes nothing"; else fail "stop-other no unit, stopped: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

elsewhere_refused() { # DAEMON
  [[ $status == 1 && $first_err == "vgs-voice: refused: unit=not-running load=not-found active=inactive daemon=$1" && $calls == "$show_call|$status_call" ]]
}
stop_run elsewhere "$stop_screen" not-found inactive "" alt=idle
if elsewhere_refused idle; then ok "stop-other with no unit refuses with one keyed line while another daemon answers"; else fail "stop-other no unit, idle: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

stop_run unanswered "$stop_screen" not-found inactive ""
if elsewhere_refused unread; then ok "stop-other with no unit refuses with one keyed line when the daemon's status cannot be read"; else fail "stop-other no unit, unread status: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

# shellcheck disable=SC2016 # the needle and its replacement are source text
stop_copy noread 'if [[ $service_runs != true ]]; then' $'if [[ $service_runs != true ]]; then\n  exit 0'
stop_run elsewhere-noread "$control" not-found inactive "" alt=idle
if elsewhere_refused idle; then fail "control status read: the copy that ends with 0 unread still refused"; else ok "control status read turns the no-unit idle case red (status=$status)"; fi

# shellcheck disable=SC2016 # the needle and its replacement are source text
stop_copy nogate 'if [[ $service_runs != true ]]; then' 'if false; then'
stop_run elsewhere-nogate "$control" not-found inactive "" alt=idle
if elsewhere_refused idle; then fail "control unit check: the copy without the check still refused cleanly"; else ok "control unit check turns the no-unit idle case red (status=$status calls=[$calls])"; fi

stop_run unread "$stop_screen" "" "" "" show=1
if [[ $status == 1 && $first_err == 'vgs-voice: refused: unit=unread' && $calls == "$show_call" ]]; then ok "stop-other refuses with one keyed line when systemctl cannot answer"; else fail "stop-other unread: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

# shellcheck disable=SC2016 # the needle and its replacement are source text
stop_copy unread 'if ! shown="$(systemctl --user show "$unit" --property=LoadState,ActiveState,FragmentPath)"; then' $'shown="$(systemctl --user show "$unit" --property=LoadState,ActiveState,FragmentPath)" || true\nif false; then'
stop_run unread-control "$control" "" "" "" show=1
if [[ $status == 1 && $first_err == 'vgs-voice: refused: unit=unread' ]]; then fail "control show check: the copy that ignores a failed show still refused as unread"; else ok "control show check turns the unread case red (first=[$first_err])"; fi

# Each change after the confirm that fails ends the run with its keyed line
# and exit 1, so the core does not start its daemon on a place still held.
disable_failed() { # FRAGMENT
  [[ $status == 1 && $first_err == 'vgs-voice: failed: disable=voxtype.service' && $calls == "$show_call|$disable_call" && -f $1 ]]
}
user_unit="$(own_unit disable-fails)"
stop_run disable-fails "$stop_screen" loaded active "$user_unit" disable=1
if disable_failed "$user_unit"; then ok "stop-other keeps the unit file and fails with one keyed line when disable fails"; else fail "stop-other disable fails: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

# shellcheck disable=SC2016 # the needle and its replacement are source text
stop_copy disable-ignored 'if ! systemctl --user disable --now "$unit"; then' 'if ! { systemctl --user disable --now "$unit" || true; }; then'
user_unit="$(own_unit disable-control)"
stop_run disable-control "$control" loaded active "$user_unit" disable=1
if disable_failed "$user_unit"; then fail "control disable check: the copy that ignores a failed disable still failed cleanly"; else ok "control disable check turns the failed-disable case red (calls=[$calls])"; fi

rm_fails="$TMP_ROOT/tools-rm-fails"
mkdir -p -- "$rm_fails"
for tool in "$tools"/*; do
  [[ ${tool##*/} == rm ]] || ln -s -- "$tool" "$rm_fails/${tool##*/}"
done
printf '#!/usr/bin/env bash\nexit 1\n' >"$rm_fails/rm"
chmod 755 "$rm_fails/rm"
remove_failed() { # FRAGMENT
  [[ $status == 1 && $first_err == "vgs-voice: failed: remove=$1" && $calls == "$show_call|$disable_call" ]]
}
user_unit="$(own_unit remove-fails)"
stop_path="$rm_fails" stop_run remove-fails "$stop_screen" loaded active "$user_unit"
if remove_failed "$user_unit"; then ok "stop-other fails with one keyed line when the unit file cannot be removed"; else fail "stop-other remove fails: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

# shellcheck disable=SC2016 # the needle and its replacement are source text
stop_copy remove-ignored 'if ! rm -f -- "$fragment"; then' 'if ! { rm -f -- "$fragment" || true; }; then'
user_unit="$(own_unit remove-control)"
stop_path="$rm_fails" stop_run remove-control "$control" loaded active "$user_unit"
if remove_failed "$user_unit"; then fail "control remove check: the copy that ignores a failed remove still failed cleanly"; else ok "control remove check turns the failed-remove case red (calls=[$calls])"; fi

reload_failed() { # FRAGMENT
  [[ $status == 1 && $first_err == 'vgs-voice: failed: reload' && $calls == "$show_call|$disable_call|$reload_call" && ! -e $1 ]]
}
user_unit="$(own_unit reload-fails)"
stop_run reload-fails "$stop_screen" loaded active "$user_unit" daemon-reload=1
if reload_failed "$user_unit"; then ok "stop-other fails with one keyed line when the reload fails"; else fail "stop-other reload fails: status=$status calls=[$calls] err=$(cat "$TMP_ROOT/err")"; fi

stop_copy reload-ignored 'if ! systemctl --user daemon-reload; then' 'if ! { systemctl --user daemon-reload || true; }; then'
user_unit="$(own_unit reload-control)"
stop_run reload-control "$control" loaded active "$user_unit" daemon-reload=1
if reload_failed "$user_unit"; then fail "control reload check: the copy that ignores a failed reload still failed cleanly"; else ok "control reload check turns the failed-reload case red (calls=[$calls])"; fi

# No at the confirm: the screen runs on a pseudo-terminal script(1) opens,
# without VGS_TUI_UNATTENDED, so vgs_tui_confirm asks gum, whose stand-in
# records that it was asked and answers No.
asked_no="$TMP_ROOT/tools-no"
mkdir -p -- "$asked_no"
for tool in "$tools"/*; do
  [[ ${tool##*/} == gum ]] || ln -s -- "$tool" "$asked_no/${tool##*/}"
done
cat >"$asked_no/gum" <<SH
#!/usr/bin/env bash
if [[ \$1 == confirm ]]; then
  printf '%s\n' "\$*" >"$TMP_ROOT/asked"
  exit 1
fi
printf '%s\n' "\$*"
SH
chmod 755 "$asked_no/gum"
script_bin="$(command -v script)"
bash_bin="$(command -v bash)"
stop_on_terminal() { # NAME SCRIPT FRAGMENT
  local home="$TMP_ROOT/home-stop-$1"
  stop_world loaded active "$3"
  rm -f -- "${TMP_ROOT:?}/asked"
  : >"$TMP_ROOT/calls"
  mkdir -p -- "$home"
  status=0
  env -i PATH="$asked_no" HOME="$home" XDG_CONFIG_HOME="$home/.config" SHELL="$bash_bin" VGS_TUI_LIB="$repo/bin/lib/tui.sh" VGS_PLUGIN_DIR="$plugin" "$script_bin" -qec "$(printf '%q ' "$bash_bin" "$2")" /dev/null </dev/null >"$TMP_ROOT/out" 2>&1 || status=$?
  calls="$(paste -sd '|' "$TMP_ROOT/calls")"
}
answered_no() { # FRAGMENT
  [[ $status == 0 && $calls == "$show_call" && -f $1 && -f $TMP_ROOT/asked ]]
}
user_unit="$(own_unit no)"
stop_on_terminal no "$stop_screen" "$user_unit"
if answered_no "$user_unit"; then ok "stop-other answered No changes nothing and ends with 0"; else fail "stop-other No: status=$status calls=[$calls] out=$(cat "$TMP_ROOT/out")"; fi

stop_copy no-proceeds '  1) exit 0 ;;' '  1) ;;'
user_unit="$(own_unit no-control)"
stop_on_terminal no-control "$control" "$user_unit"
if answered_no "$user_unit"; then fail "control No: the copy that goes on after No still changed nothing"; else ok "control No turns the answered-No case red (calls=[$calls])"; fi

if [[ $failures -gt 0 ]]; then
  printf 'test-voice-tui: failures=%d\n' "$failures"
  exit 1
fi
printf 'test-voice-tui: ok\n'
