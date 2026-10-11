#!/usr/bin/env bash
set -euo pipefail
self="$(readlink -f -- "${BASH_SOURCE[0]}")"
repo="$(cd -- "$(dirname -- "$self")/.." && pwd)"
plugin_src="$repo/shell/plugins/vgs.cloud-sync"
TMP_ROOT="$(mktemp -d -p "$repo/tmp" test-cloud-sync-tui-XXXXXX)" || { echo "test-cloud-sync-tui: scratch=mktemp-failed" >&2; exit 1; }
cleanup(){ python3 - "$repo" "$TMP_ROOT" <<'PY'
import pathlib, shutil, sys
repo = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
allowed = (repo / "tmp").resolve()
if target.name.startswith("test-cloud-sync-tui-") and target.parent == allowed:
    shutil.rmtree(target)
PY
}
trap cleanup EXIT
for tool in script python3 stat tail grep dirname mkdir cat stty bash; do command -v "$tool" >/dev/null || { echo "test-cloud-sync-tui: status=not-measured missing=$tool"; exit 77; }; done
failures=0
ok(){ printf '  ok    %s\n' "$*"; }
fail(){ failures=$((failures+1)); printf '  FAIL  %s\n' "$*"; }
tools="$TMP_ROOT/tools"; plugin="$TMP_ROOT/plugin"; home="$TMP_ROOT/home"; log="$home/.local/state/vgshell/cloud-sync/setup.log"
mkdir -p "$tools" "$plugin/bin" "$plugin/tui" "$home"
python3 - "$repo/bin/lib/tui.sh" "$TMP_ROOT/tui.sh" <<'PY_LIB'
import sys
s=open(sys.argv[1]).read()
s=s.replace("_vgs_tui_has_terminal() { : 2>/dev/null <>/dev/tty; }", "_vgs_tui_has_terminal() { true; }")
open(sys.argv[2], "w").write(s)
PY_LIB
for tool in bash sh script stat tail grep dirname mkdir cat stty; do ln -s -- "$(command -v "$tool")" "$tools/$tool"; done
cat >"$tools/gum" <<SH2
#!$(command -v bash)
next(){ local n=0; [[ -f "$TMP_ROOT/answered" ]] && n=\$(<"$TMP_ROOT/answered"); mapfile -t answers <"$TMP_ROOT/answers"; printf '%s' "\$((n+1))" >"$TMP_ROOT/answered"; printf '%s' "\${answers[n]-}"; }
case "\$1" in input|choose) next; printf '\n';; confirm) [[ \$(next) == yes ]];; *) printf '%s\n' "\$*";; esac
SH2
cat >"$plugin/bin/cloud-sync" <<SH2
#!$(command -v bash)
$(command -v python3) -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "\$@" >>"$TMP_ROOT/calls"
mode=""; [[ -f "$TMP_ROOT/mode" ]] && mode="\$(<"$TMP_ROOT/mode")"
if [[ \$mode == fail* ]]; then [[ -n \${mode#fail} ]] && printf '%s\n' "\${mode#fail }" >&2; exit 1; fi
case "\$1" in install) echo installed=vgs-cloud-sync.timer;; authorize) echo authorized=drive;; sign-out) echo signed-out=drive;; pairs) printf 'docs\tDocuments\n';; pairs-reset) echo reset=pairs.json.damaged-20261011T091349Z;; pair-add) echo added=docs;; pair-remove) echo removed="\$2";; esac
SH2
chmod 755 "$tools/gum" "$plugin/bin/cloud-sync"
cat >"$TMP_ROOT/plain-lib.sh" <<'SHLIB'
vgs_tui_header(){ :; }
vgs_tui_step(){ :; }
vgs_tui_success(){ printf '%s\n' "$*"; }
vgs_tui_failed(){ shift; printf '%s\n' "$*"; return 1; }
vgs_tui_refuse(){ local file="$1" status="$2" key="$3"; shift 3; mkdir -p -- "$(dirname -- "$file")"; printf '%s\n' "$key" >>"$file"; printf '%s\n' "$*"; return "$status"; }
vgs_tui_input(){ local n=0; [[ -f "$TMP_ROOT/plain-answered" ]] && n=$(<"$TMP_ROOT/plain-answered"); mapfile -t answers <"$TMP_ROOT/answers"; printf '%s' "$((n+1))" >"$TMP_ROOT/plain-answered"; printf '%s\n' "${answers[n]-}"; }
vgs_tui_choose(){ vgs_tui_input; }
vgs_tui_confirm(){ vgs_tui_input | grep -qx yes; }
vgs_tui_logged(){ local file="$1"; shift; mkdir -p -- "$(dirname -- "$file")"; "$@" 2>>"$file"; }
SHLIB
copy_scripts(){ cp -- "$plugin_src"/tui/*.sh "$plugin/tui/"; }
tui(){ local script="$1" mode="$2" answers="$3" command; shift 3; printf '%s' "$mode" >"$TMP_ROOT/mode"; printf '%s\n' "$answers" >"$TMP_ROOT/answers"; python3 - "$TMP_ROOT/answered" "$TMP_ROOT/calls" <<'PY'
import pathlib, sys
for name in sys.argv[1:]:
    try:
        pathlib.Path(name).unlink()
    except FileNotFoundError:
        pass
PY
  : >"$TMP_ROOT/calls"; command="$(printf '%q ' bash "$script" "$@")"; status=0; env -i PATH="$tools" HOME="$home" TERM=dumb VGS_TUI_LIB="$TMP_ROOT/tui.sh" VGS_PLUGIN_ID=vgs.cloud-sync VGS_PLUGIN_DIR="$plugin" XDG_STATE_HOME="$home/.local/state" script -qec "$command" /dev/null </dev/null >"$TMP_ROOT/screen" 2>&1 || status=$?; screen="$(tr -d '\r' <"$TMP_ROOT/screen")"; calls="$(python3 -c 'import json,sys; print(json.dumps([json.loads(l) for l in open(sys.argv[1]) if l.strip()]))' "$TMP_ROOT/calls")"; }
shows(){ [[ $screen == *"$1"* ]]; }
plain_tui(){ local script="$1" mode="$2" answers="$3"; shift 3; printf '%s' "$mode" >"$TMP_ROOT/mode"; printf '%s\n' "$answers" >"$TMP_ROOT/answers"; : >"$TMP_ROOT/calls"; python3 - "$TMP_ROOT/plain-answered" <<'PY'
import pathlib, sys
try:
    pathlib.Path(sys.argv[1]).unlink()
except FileNotFoundError:
    pass
PY
  status=0; screen="$(env -i PATH="$tools" HOME="$home" TERM=dumb VGS_TUI_LIB="$TMP_ROOT/plain-lib.sh" VGS_PLUGIN_ID=vgs.cloud-sync VGS_PLUGIN_DIR="$plugin" XDG_STATE_HOME="$home/.local/state" TMP_ROOT="$TMP_ROOT" bash "$script" "$@" 2>&1)" || status=$?; calls="$(python3 -c 'import json,sys; print(json.dumps([json.loads(l) for l in open(sys.argv[1]) if l.strip()]))' "$TMP_ROOT/calls")"; }
defined(){ python3 -c 'import json,sys; c=json.loads(sys.argv[1]); print(json.dumps(json.loads(c[0][2]), sort_keys=True) if len(c)==1 and c[0][:2]==["pair-add","--definition"] else "calls="+sys.argv[1])' "$calls"; }
case_setup(){ tui "$1" "" ""; [[ $status == 0 && $calls == '[["install"]]' ]] && shows "runs every hour"; }
case_connect(){ tui "$1" "" ""; [[ $status == 0 && $calls == '[["authorize"]]' ]] && shows "Google Drive is connected"; }
case_connect_refusal(){ tui "$1" "fail cloud-sync: refused: credential=absent account=client-secret" ""; [[ $status == 1 ]] && shows "Add the client ID and the client secret" && ! shows "credential=absent"; }
case_add_pair(){ plain_tui "$1" "" "$(printf '%s\n' 'My "Docs" \\ 2026' 'Docs/Taxes/' "$home/gdrive/")"; [[ $status == 0 ]] || return 1; [[ $(defined) == "$(python3 -c 'import json,sys; print(json.dumps({"id":"my-docs-2026","label":"My \\"Docs\\" \\\\ 2026","remote":"Docs/Taxes","local":sys.argv[1]+"/gdrive"}, sort_keys=True))' "$home")" ]]; }
case_add_refusal(){ plain_tui "$1" "fail cloud-sync: refused: pair=docs rule=local-overlap" "$(printf '%s\n' Docs Docs "$home/gdrive")"; [[ $status == 1 ]] && shows "overlaps" && ! shows "rule=local-overlap"; }
case_remove(){ tui "$1" "" "$(printf '%s\n' docs yes)"; [[ $status == 0 && $calls == '[["pairs", "--lines"], ["pair-remove", "docs"]]'  ]]; }
case_reset(){ tui "$1" "" yes; [[ $status == 0 && $calls == '[["pairs-reset"]]' ]]; }
case_sign_out(){ tui "$1" "" yes; [[ $status == 0 && $calls == '[["sign-out"]]' ]] && shows "signed out"; }
case_sign_out_refusal(){ tui "$1" "fail cloud-sync: refused: credential=locked account=token" yes; [[ $status == 1 ]] && shows "keyring is locked" && ! shows "credential=locked"; }
case_args(){ for script in setup add-pair connect sign-out reset-pairs; do tui "$plugin/tui/$script.sh" "" "" extra; [[ $status == 2 && $calls == '[]' ]] || return 1; done; tui "$plugin/tui/remove-pair.sh" "" "" docs extra; [[ $status == 2 && $calls == '[]' ]]; }
CASES=(case_setup:setup case_connect:connect case_connect_refusal:connect case_remove:remove-pair case_reset:reset-pairs case_sign_out:sign-out case_sign_out_refusal:sign-out case_args:setup)
copy_scripts
for entry in "${CASES[@]}"; do c="${entry%%:*}"; s="${entry#*:}"; if "$c" "$plugin/tui/$s.sh"; then ok "${c#case_}"; else fail "${c#case_}: status=$status calls=$calls screen=[${screen//$'\n'/ | }]"; fi; done
CONTROL_CASES=(case_setup case_connect case_sign_out case_sign_out_refusal)
CONTROL_SCRIPTS=(setup connect sign-out sign-out)
CONTROL_NEEDLES=('"$runner" install >>"$log"' '"$runner" authorize >>"$log"' '"$runner" sign-out >>"$log"' '*credential=locked*)')
CONTROL_REPL=('true >>"$log"' '"$runner" authorize drive >>"$log"' '"$runner" sign-out drive >>"$log"' '*credential=no-such*)')
for i in "${!CONTROL_CASES[@]}"; do copy_scripts; script="$plugin/tui/${CONTROL_SCRIPTS[i]}.sh"; if ! python3 - "$script" "${CONTROL_NEEDLES[i]}" "${CONTROL_REPL[i]}" <<'PY2'
import sys
p,n,r=sys.argv[1:]
s=open(p).read()
if s.count(n)!=1:
    sys.exit('count=%d needle=%s'%(s.count(n),n))
open(p,'w').write(s.replace(n,r))
PY2
then fail "control ${CONTROL_CASES[i]} edit"; elif "${CONTROL_CASES[i]}" "$script"; then fail "control ${CONTROL_CASES[i]} passed"; else ok "control ${CONTROL_CASES[i]}"; fi; done
if [[ $failures -gt 0 ]]; then printf 'test-cloud-sync-tui: failures=%d\n' "$failures"; exit 1; fi
printf 'test-cloud-sync-tui: ok cases=%d controls=%d\n' "${#CASES[@]}" "${#CONTROL_CASES[@]}"
