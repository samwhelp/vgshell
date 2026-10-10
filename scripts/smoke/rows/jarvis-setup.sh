# No latency budget. Poll once per nested IPC round trip.
# Process, local-speech and allow-listed TUI stand-ins run here.
# The Setup section reads the real daemon's engine answer by row: label,
# chip tone, the screen beside a step and its line count. A fresh profile
# reads the AI model and local voice to do; an AI model whose account is
# not there yet stays to do until an Accounts screen ends with the
# account added, and local voice until its marker is there, its setup
# run ends and the sidecar reports ready. Browser and input are optional rows. Its
# controls are two Service copies, one whose key and account readers send
# no snapshot when their checks end and one whose local voice reader
# sends none. Last, a `pi` stand-in below the floor the manifest gives Pi:
# chosen as the AI model, the daemon refuses it, the AI model step offers
# Update Pi, the Setup section draws it beside the step, and a click on it
# raises the core's notice for pi; the same Pi at its floor offers no
# update, which is the control. The Local voice setting: a start opens no
# local setup, which a reader copy that reads its start setting from the
# binding breaks; a change opens local setup with the wanted tier,
# Automatic with none; the run's end writes back the tier it left ready,
# which opens nothing, and nor does a wanted tier that is ready. Its
# control is a LocalTier copy that opens no run.
# inputs: shell/plugins/vgs.jarvis/* shell/plugins/vgs.settings/* shell/Commons/Reply.js scripts/smoke/fixtures/tui/vgs.jarvis/* shell/Core/TuiRunner.qml scripts/fixtures/jarvis-setup/status.py scripts/fixtures/jarvis-local-speech/standin.py scripts/smoke/rows/jarvis.sh bin/vgshell-tui bin/lib/account-folders.js bin/lib/codex-account.js bin/lib/anchored.js shell/Commons/AccountDirectories.js bin/lib/qml-library.js bin/vgshell-scan shell/Core/Registry.qml shell/Core/Notices.qml shell/Core/PluginLogic.js
set -euo pipefail
local_reader="$repo/shell/plugins/vgs.jarvis/LocalRuntime.qml"
local_tui="$repo/shell/plugins/vgs.jarvis/tui/setup-local.sh"
cp -- "$local_reader" "$sandbox/local-reader-original"
cp -- "$local_tui" "$sandbox/local-tui-original"
cp -- "$source_repo/scripts/smoke/fixtures/tui/vgs.jarvis/tui/setup-local.sh" "$local_tui"
accounts_tui="$repo/shell/plugins/vgs.jarvis/tui/accounts.sh"
cp -- "$accounts_tui" "$sandbox/accounts-tui-original"
cp -- "$source_repo/scripts/smoke/fixtures/tui/vgs.jarvis/tui/accounts.sh" "$accounts_tui"
sign_in_tui="$repo/shell/plugins/vgs.jarvis/tui/sign-in.sh"
cp -- "$sign_in_tui" "$sandbox/sign-in-tui-original"
cp -- "$source_repo/scripts/smoke/fixtures/tui/vgs.jarvis/tui/sign-in.sh" "$sign_in_tui"
jarvis_setup_requirements
terminal_stand_in
terminal_ready "Jarvis local setup"
# A `pi` for the last section. The daemon's world copies its stand-ins when
# it starts (scripts/lib/jarvis-env.sh), so the program is written before
# Jarvis is enabled; it answers `--version` with the line setup_pi_version
# holds and nothing else, and fails while that file is absent.
setup_pi_version="$sandbox/jarvis-world/pi-version"
setup_pi_standin="$sandbox/jarvis-world/standins/pi"
printf '#!/bin/bash\n[[ $# == 1 && $1 == --version ]] || exit 2\nexec cat %q\n' "$setup_pi_version" >"$setup_pi_standin" && chmod 755 "$setup_pi_standin" ||
  fail "the daemon's Pi stand-in is not written"
jarvis_rescan
forget_record
jarvis_enable
settings_page_open vgs.jarvis

local_value() {
  status_row vgs.jarvis localRuntime | py_reply '
import json,sys
r=json.load(sys.stdin)
expected={"absent":{"tone":"warning","text":"Not set up","action":True},
          "ready":{"tone":"ok","text":"Ready: small","action":False},
          "failed":{"tone":"warning","text":"Setup check failed","action":True},
          "invalid":{"tone":"warning","text":"Setup check returned invalid status","action":True}}[sys.argv[1]]
print("matched" if r["value"]==expected and r["action"]["offered"]==expected["action"] else "pending")
' "$1"
}
local_control_count() {
  local output
  output="$("$@")" || return 1
  printf '%s\n' "${output##*$'\n'}"
}
# The daemon's state and data roots, the hand-added Codex account the
# engine takes as its AI model, and local setup's marker.
setup_state="$home/.local/state/vgshell/jarvis"
setup_data="$home/.local/share/vgshell/jarvis"
setup_codex="$home/setup-codex"
setup_marker="$setup_state/local-ready.json"
setup_config="$home/.config/vgshell/shell.json"
setup_service="$repo/shell/plugins/vgs.jarvis/Service.qml"
# Setup rows use manifest ids. The renderer puts its summary first and
# labels each step from its manifest entry. Optional rows read their chip
# category because their readers depend on the world.
setup_rows() {
  ipc smoke setupRows window vgs.settings | py_reply '
import json,sys
rows=json.load(sys.stdin)
try:
    with open(sys.argv[1]) as stream:
        manifest=json.load(stream)
except (OSError, ValueError):
    print("unread")
    sys.exit(0)
steps=[(key, entry["label"]) for key, entry in manifest["status"].items() if entry.get("group")=="Setup" and key!="setup"]
ids={label:key for key, label in steps}
if len(ids)!=len(steps):
    print("unread")
    sys.exit(0)
out=[]
for index, r in enumerate(rows):
    if r["label"] == "Sign in":
        continue
    key="setup" if index==0 else ids.get(r["label"], "unmapped")
    if key in ("setupBrowser", "setupInput"):
        out.append([key, len(r["chips"]) == 1 and r["chips"][0][1] in ("success", "info")])
    else:
        out.append([key, [c[1] for c in r["chips"]], [b["tui"] for b in r["buttons"]], len(r["lines"])])
print(json.dumps(out))
' "$repo/shell/plugins/vgs.jarvis/manifest.json"
}
setup_fresh='[["setup", ["warning"], [], 3], ["setupModel", ["warning"], [], 1], ["setupVoice", ["warning"], ["setup-local"], 1], ["setupBrowser", true], ["setupInput", true]]'
setup_voice_left='[["setup", ["warning"], [], 2], ["setupModel", ["success"], [], 1], ["setupVoice", ["warning"], ["setup-local"], 1], ["setupBrowser", true], ["setupInput", true]]'
setup_ready='[["setup", ["success"], [], 1], ["setupModel", ["success"], [], 1], ["setupVoice", ["success"], [], 1], ["setupBrowser", true], ["setupInput", true]]'
# BRAIN as the Jarvis AI model setting, "" for none, delivered by a reload.
setup_brain() { # BRAIN
  python3 - "$setup_config" "$1" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); value=json.loads(p.read_text())
row=next((r for r in value.setdefault("plugins",[]) if r["id"]=="vgs.jarvis"),None)
if row is None:
    row={"id":"vgs.jarvis"}; value["plugins"].append(row)
if sys.argv[2]: row["brain"]=sys.argv[2]
else: row.pop("brain",None)
p.write_text(json.dumps(value))
PY
  expect "deliver the Jarvis AI model" ok ipc shell reloadConfig
}
# The AI model setting the running daemon's Session holds.
setup_daemon_brain() {
  ipc smoke jarvisProcess | py_reply '
import json,sys
d=json.load(sys.stdin)
detail=d.get("status",{}).get("detail") if isinstance(d,dict) else None
print(json.dumps(detail["state"]["settings"]["brain"]) if isinstance(detail,dict) else "none")
'
}
# The hand-added Codex folder in the account list, and its id as the
# account helper lists it. The helper runs with no PATH entry, so no
# vendor command or port read starts.
setup_add_codex() {
  python3 - "$setup_state/accounts.json" "$setup_codex" <<'PY'
import json,sys
open(sys.argv[1],"w").write(json.dumps([{"provider": "codex", "directory": sys.argv[2], "label": "setup"}]))
PY
}
setup_codex_id() {
  mkdir -p -- "$sandbox/setup-no-path" &&
  env -i PATH="$sandbox/setup-no-path" HOME="$home" XDG_STATE_HOME="$home/.local/state" XDG_CONFIG_HOME="$home/.config" \
    XDG_DATA_HOME="$home/.local/share" "$node_bin" "$repo/shell/plugins/vgs.jarvis/backend/accounts.js" --tree "$repo" list |
    py_reply 'import json,sys; print(next(a["id"] for a in json.load(sys.stdin) if a["source"].get("directory")==sys.argv[1]))' "$setup_codex"
}
# Local setup's marker for the plugin's first declared tier and the data
# root the engine compares (LocalSpeech.select).
setup_write_marker() {
  mkdir -p -- "$setup_data/local/venv/bin" &&
  cp -- "$source_repo/scripts/fixtures/jarvis-local-speech/standin.py" "$setup_data/local/venv/bin/python" &&
  chmod 700 -- "$setup_data/local/venv/bin/python" &&
  python3 - "$repo/shell/plugins/vgs.jarvis/artifacts.json" "$setup_data/local" "$setup_marker" <<'PY'
import json,os,sys
tier=next(iter(json.load(open(sys.argv[1]))["tiers"]))
open(sys.argv[3],"w").write(json.dumps({"tier": tier, "data": os.path.realpath(sys.argv[2])}))
open(os.path.join(sys.argv[2],"scenario.json"),"w").write(json.dumps({"start":"ready"}))
PY
}
# The key reader with no check pending, its last one ended.
setup_keys_idle() {
  ipc smoke itemValues service vgs.jarvis Keys pending,code | py_reply '
import json,sys
rows=json.load(sys.stdin)
print("idle" if len(rows)==1 and rows[0]["pending"] is False and rows[0]["code"] != -1 else "pending")
'
}
# Every reader whose end sends a snapshot is idle, so a later snapshot is
# the step's own.
setup_readers_idle() { # LABEL
  expect_poll "$1: the local voice reader is idle" idle jarvis_setup_reader_idle LocalRuntime
  expect_poll "$1: the account reader is idle" idle jarvis_accounts_reader_idle
  expect_poll "$1: the key reader is idle" idle setup_keys_idle
}
setup_accounts_end() {
  forget_record
  expect "the launcher opens the accounts screen" ok ipc shell openTui vgs.jarvis/accounts
  expect_run_end "the fixture accounts terminal ends" vgs.jarvis/accounts
}
setup_sign_in_value() {
  status_row vgs.jarvis setupSignIn | py_reply '
import json,sys
r=json.load(sys.stdin)
print(json.dumps([r["value"]["tone"], r["action"]["offered"], r["action"]["tui"]]))
'
}
setup_sign_in_end() {
  forget_record
  expect "Settings starts the declared vendor sign-in terminal" ok settings_act vgs.jarvis setupSignIn
  expect_poll "sign-in uses the core floating terminal and declared script" \
    '["vgs.jarvis/sign-in", "tui/sign-in.sh"]' recorded_tail
  expect_run_end "the fixture sign-in terminal ends without authentication" vgs.jarvis/sign-in
}
# A Service copy whose readers named by NEEDLES send no snapshot.
setup_service_without() { # NEEDLE...
  python3 - "$setup_service" "$@" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
assert not p.is_symlink()
s=p.read_text()
for needle in sys.argv[2:]:
    assert s.count(needle)==1, needle
    s=s.replace(needle, needle.replace("; onRefreshed: root.hello() }", " }"))
p.write_text(s)
PY
}
setup_keys_hook="Jarvis.Keys { shell: root.shell; onRefreshed: root.hello() }"
setup_accounts_hook="Jarvis.Accounts { id: accountReader; shell: root.shell; onRefreshed: root.hello() }"
setup_local_hook="Jarvis.LocalRuntime { shell: root.shell; onRefreshed: root.hello() }"
# The Local voice reader's answer (scripts/fixtures/jarvis-setup/status.py
# --choices): PICK, READY ("none" for none) and the offers of a machine that
# runs every English tier.
setup_tiers="$sandbox/jarvis-world/local-tiers.json"
setup_tiers_answer() { # PICK READY
  python3 - "$setup_tiers" "$1" "$2" <<'PY'
import json,os,sys
path,pick,ready=sys.argv[1],sys.argv[2],None if sys.argv[3]=="none" else sys.argv[3]
labels={"small":"Small: English, quickest to set up, 796 MB","medium":"Medium: English, more accurate speech, 1.5 GB",
        "large":"Large: English, more accurate, graphics card, 1.7 GB"}
choices=[{"value":"auto","label":"Automatic: "+pick.capitalize()}]+[{"value":t,"label":l} for t,l in labels.items() if t!=pick]
open(path+".next","w").write(json.dumps({"pick":pick,"ready":ready,"choices":choices}))
os.replace(path+".next",path)
PY
}
# The reader's last answer as [pick, ready] once no read is running.
setup_tier_reading() {
  ipc smoke itemValues service vgs.jarvis LocalTier reading,pending,code | py_reply '
import json,sys
rows=json.load(sys.stdin)
r=rows[0] if len(rows)==1 else {}
print(json.dumps([r["reading"]["pick"], r["reading"]["ready"]]) if r.get("reading") and r["pending"] is False and r["code"]==0 else "pending")
'
}
# The first offer the service publishes for the page's Local voice field.
setup_tiers_published() {
  ipc smoke jarvisProcess | py_reply '
import json,sys
offers=json.load(sys.stdin)["status"].get("localTiers") or []
print(json.dumps(offers[0]) if offers else "none")
'
}
# VALUE as the Local voice setting, delivered by a reload.
setup_tier() { # VALUE
  python3 - "$setup_config" "$1" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); value=json.loads(p.read_text())
row=next((r for r in value.setdefault("plugins",[]) if r["id"]=="vgs.jarvis"),None)
if row is None:
    row={"id":"vgs.jarvis"}; value["plugins"].append(row)
row["localTier"]=sys.argv[2]
p.write_text(json.dumps(value))
PY
  expect "deliver the Local voice setting $1" ok ipc shell reloadConfig
}
setup_tier_saved() {
  python3 -c 'import json,sys; print(next((r.get("localTier","unset") for r in json.load(open(sys.argv[1])).get("plugins",[]) if r["id"]=="vgs.jarvis"),"unset"))' "$setup_config"
}
# The run id of the last terminal the launcher started, "absent" for none.
setup_run_id() {
  python3 -c '
import os,sys
w=open(sys.argv[1]).read().split("\n") if os.path.exists(sys.argv[1]) else []
print(w[w.index("--run")+1] if "--run" in w else "absent")' "$tui_record"
}
# A launch a delivered setting asks for is pending in the turn that
# delivers it, so once the key is idle no later terminal is to come.
setup_tier_opens_none() { # LABEL RUN_ID
  expect_run_end "$1: no local setup is pending" vgs.jarvis/setup-local
  expect "$1: no terminal opened" "$2" setup_run_id
}
setup_tier_reader="$repo/shell/plugins/vgs.jarvis/LocalTier.qml"
# A start with the default answer, small the pick and nothing ready, opens
# no local setup: the reader acts only on a change of the setting.
setup_tier_start_none() {
  expect_poll "the Local voice reader reads the default answer at start" '["small", null]' setup_tier_reading
  expect_run_end "no local setup is pending after the start" vgs.jarvis/setup-local
  expect "the start opened no local setup" absent recorded
}
setup_tier_start_none
# Control: a reader copy that takes the start setting from its binding,
# which still reads "" when the shell arrives, opens local setup at start.
cp -- "$setup_tier_reader" "$sandbox/local-tier-original"
python3 - "$setup_tier_reader" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
assert not p.is_symlink()
s=p.read_text()
needle="decided = shell.settings.localTier;"
assert s.count(needle)==1
p.write_text(s.replace(needle, "decided = wanted;"))
PY
forget_record
jarvis_rescan
setup_tier_start_control() {
  (failures=0 behaviour_failures=0
   setup_tier_start_none >"$sandbox/tier-start-control.log"
   echo "$failures")
}
expect "a start setting read from the binding opens local setup" 1 local_control_count setup_tier_start_control
cp -- "$sandbox/local-tier-original" "$setup_tier_reader"
jarvis_rescan
local_open() { # manager action or listed launcher entry
  local revision snapshot
  revision="$(jarvis_revision)" || return 1
  snapshot="$rt_dir/vgshell-sources-$shell_qs_pid/$revision"
  forget_record
  if [[ $1 == status ]]; then
    expect "Settings starts its declared local setup action" ok settings_act vgs.jarvis localRuntime
  else
    expect "the launcher starts its listed local setup" ok ipc shell openTui vgs.jarvis/setup-local
  fi
  expect_poll "setup receives the private plugin snapshot and declared argv" \
    "$(words --app-id=org.vgs.tui "--title=VGS · Set up Jarvis local voice" -- "$tui_self" present --presentation full \
      --plugin vgs.jarvis --dir "$snapshot" --record vgs.jarvis/setup-local --run RUN --record-dir "$rt_dir/vgshell/tui" \
      --app-id org.vgs.tui --window-title "VGS · Set up Jarvis local voice" -- tui/setup-local.sh)" recorded
  expect_run_end "the fixture local setup terminal ends" vgs.jarvis/setup-local
}
expect_poll "local setup is offered before verification" matched local_value absent
ipc shell listTuis | py_reply '
import json,sys
rows=json.load(sys.stdin)
assert any(row["key"]=="vgs.jarvis/setup-local" and row["group"]=="Jarvis" for row in rows)
'
expect_poll "the Setup fixture retains its present key" matched jarvis_key_value present
expect_poll "the Setup fixture retains its signed-in app" matched jarvis_account_hint signed-in
expect_poll "a fresh profile's Setup section reads the AI model and local voice to do" "$setup_fresh" setup_rows
expect_poll "Setup offers its declared Sign in action beside Add key" \
  '["info", true, "sign-in"]' setup_sign_in_value
setup_sign_in_end
# An AI model the engine takes: a hand-added Codex folder, by the id the
# account helper lists. Chosen while its account is not there, it stays
# to do; an Accounts screen that ends with the account added sends the
# daemon a fresh snapshot, with no rescan.
mkdir -p -- "$setup_codex"
[[ ! -e $setup_state/accounts.json ]] || cp -- "$setup_state/accounts.json" "$sandbox/setup-accounts-before"
setup_add_codex
setup_brain_id="$(setup_codex_id)" || fail "the account helper lists no id for the Codex folder"
rm -- "$setup_state/accounts.json"
setup_brain "$setup_brain_id"
expect_poll "the daemon holds the chosen AI model" "\"$setup_brain_id\"" setup_daemon_brain
expect_poll "an AI model whose account is not there stays to do" "$setup_fresh" setup_rows
setup_readers_idle "before the account is added"
setup_add_codex
setup_sign_in_end
expect_poll "the ended Accounts screen reaches the daemon: only local voice remains" "$setup_voice_left" setup_rows

# Control: the key and account readers' ends send no snapshot, so the
# daemon keeps its answer after the account is added.
cp -- "$setup_service" "$sandbox/setup-service-original"
setup_service_without "$setup_keys_hook" "$setup_accounts_hook"
rm -- "$setup_state/accounts.json"
jarvis_rescan
expect_poll "the account control first reads the AI model to do" "$setup_fresh" setup_rows
setup_readers_idle "the account control"
setup_add_codex
setup_accounts_end
setup_account_control() {
  (failures=0 behaviour_failures=0
   expect_poll "the ended Accounts screen must reach the daemon" "$setup_voice_left" setup_rows
   echo "$failures")
}
expect "account reader ends that send no snapshot break the AI model read" 1 local_control_count setup_account_control
cp -- "$sandbox/setup-service-original" "$setup_service"
jarvis_rescan
expect_poll "the restored service reads only local voice left" "$setup_voice_left" setup_rows
expect_poll "the restored local voice reader is idle" idle jarvis_setup_reader_idle LocalRuntime

setup_write_marker || fail "local setup's marker is not written"
printf 'ready\n' >"$sandbox/jarvis-world/local-mode"
local_open status
expect_poll "the service rereads readiness after the Settings action ends" matched local_value ready
expect_poll "the ended local setup reaches the daemon: the Setup section reads ready" "$setup_ready" setup_rows

# Control: the local voice reader's end sends no snapshot, so the daemon
# keeps its answer after the marker appears and local setup ends.
setup_service_without "$setup_local_hook"
rm -- "$setup_marker"
jarvis_rescan
expect_poll "the local voice control first reads local voice to do" "$setup_voice_left" setup_rows
setup_readers_idle "the local voice control"
setup_write_marker || fail "local setup's marker is not written"
local_open launcher
setup_local_control() {
  (failures=0 behaviour_failures=0
   expect_poll "the ended local setup must reach the daemon" "$setup_ready" setup_rows
   echo "$failures")
}
expect "a local voice reader end that sends no snapshot breaks the ready read" 1 local_control_count setup_local_control
cp -- "$sandbox/setup-service-original" "$setup_service"
jarvis_rescan
expect_poll "the restored service reads ready" "$setup_ready" setup_rows

# The Local voice setting, with small ready and large the pick. A rescan
# is a requirement scan, after which the reader reads again.
cp -- "$setup_tiers" "$sandbox/local-tiers-original"
setup_tiers_answer large small
rescan "the Local voice reader reads large as the pick"
expect_poll "the Local voice reader reads large as the pick, small ready" '["large", "small"]' setup_tier_reading
expect "the page offers Automatic first, named for the pick" '{"value": "auto", "label": "Automatic: Large"}' setup_tiers_published
forget_record
setup_tier medium
expect_poll "choosing Medium opens local setup for medium" '["vgs.jarvis/setup-local", "tui/setup-local.sh", "medium"]' recorded_tail
expect_run_end "the Medium run ends" vgs.jarvis/setup-local
setup_tier_run="$(setup_run_id)"
expect_poll "the run's end writes back the ready tier" small setup_tier_saved
setup_tier_opens_none "the written-back tier" "$setup_tier_run"
setup_tier auto
expect_poll "Automatic opens local setup with no tier" '["vgs.jarvis/setup-local", "tui/setup-local.sh"]' recorded_tail
expect_run_end "the Automatic run ends" vgs.jarvis/setup-local
expect_poll "the run's end writes back the ready tier again" small setup_tier_saved
# A wanted tier that is ready opens nothing, by name or as Automatic.
setup_tiers_answer large large
rescan "the Local voice reader reads large ready"
expect_poll "the Local voice reader reads large ready" '["large", "large"]' setup_tier_reading
setup_tier_run="$(setup_run_id)"
setup_tier large
setup_tier_opens_none "Large while large is ready" "$setup_tier_run"
setup_tier auto
setup_tier_opens_none "Automatic while the pick is ready" "$setup_tier_run"
# Control: a reader copy that opens no run breaks the Medium read.
cp -- "$setup_tier_reader" "$sandbox/local-tier-original"
python3 - "$setup_tier_reader" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
assert not p.is_symlink()
s=p.read_text()
needle='const answer = shell.tui.run("setup-local", args);'
assert s.count(needle)==1
p.write_text(s.replace(needle, 'const answer = "ok";'))
PY
jarvis_rescan
expect_poll "the run control's reader reads large ready" '["large", "large"]' setup_tier_reading
setup_tiers_answer large small
rescan "the run control's reader reads small ready"
expect_poll "the run control's reader reads small ready" '["large", "small"]' setup_tier_reading
forget_record
setup_tier medium
setup_tier_control() {
  (failures=0 behaviour_failures=0
   expect_poll "choosing Medium must open local setup" '["vgs.jarvis/setup-local", "tui/setup-local.sh", "medium"]' recorded_tail
   echo "$failures")
}
expect "a reader that opens no run breaks the Medium read" 1 local_control_count setup_tier_control
cp -- "$sandbox/local-tier-original" "$setup_tier_reader"
cp -- "$sandbox/local-tiers-original" "$setup_tiers"
setup_tier auto
jarvis_rescan
expect_poll "the restored Local voice reader reads the default answer" '["small", null]' setup_tier_reading
printf 'failed\n' >"$sandbox/jarvis-world/local-mode"
local_open launcher
expect_poll "exit 77 replaces a previous ready status" matched local_value failed
printf 'invalid\n' >"$sandbox/jarvis-world/local-mode"
local_open launcher
expect_poll "invalid output cannot retain ready" matched local_value invalid

# Preserve the handler text and drop its effect on a disposable copy.
python3 - "$local_reader" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
assert not p.is_symlink()
s=p.read_text()
needle="onEndedAtChanged: if (endedAt !== null) refresh()"
assert s.count(needle)==1
changed=s.replace(needle,"onEndedAtChanged: if (false && endedAt !== null) refresh()")
assert changed != s
p.write_text(changed)
PY
printf 'ready\n' >"$sandbox/jarvis-world/local-mode"
jarvis_rescan
expect_poll "the refresh control first reads ready" matched local_value ready
expect_poll "the refresh control first reads ready: reader is idle" idle jarvis_setup_reader_idle LocalRuntime
printf 'failed\n' >"$sandbox/jarvis-world/local-mode"
local_open launcher
local_refresh_control() {
  (failures=0 behaviour_failures=0
   expect_poll "the completed TUI must replace ready" matched local_value failed
   echo "$failures")
}
expect "removing end refresh breaks its consumer read" 1 local_control_count local_refresh_control
cp -- "$sandbox/local-reader-original" "$local_reader"
printf 'absent\n' >"$sandbox/jarvis-world/local-mode"
jarvis_rescan
expect_poll "the restored reader offers setup" matched local_value absent

python3 - "$local_reader" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
needle='if (code === 0) value = JSON.parse(output);'
assert s.count(needle)==1
changed=s.replace(needle, 'if (code !== 0) return;\n            ' + needle)
assert changed != s
p.write_text(changed)
PY
printf 'ready\n' >"$sandbox/jarvis-world/local-mode"
jarvis_rescan
expect_poll "the failed-probe control first reads ready" matched local_value ready
expect_poll "the failed-probe control first reads ready: reader is idle" idle jarvis_setup_reader_idle LocalRuntime
printf 'failed\n' >"$sandbox/jarvis-world/local-mode"
local_open launcher
local_failure_control() {
  (failures=0 behaviour_failures=0
   expect_poll "a failed check must clear ready" matched local_value failed
   echo "$failures")
}
expect "retaining ready after probe failure breaks its consumer read" 1 local_control_count local_failure_control
cp -- "$sandbox/local-reader-original" "$local_reader"
cp -- "$sandbox/local-tui-original" "$local_tui"
cp -- "$sandbox/accounts-tui-original" "$accounts_tui"
cp -- "$sandbox/sign-in-tui-original" "$sign_in_tui"
printf 'absent\n' >"$sandbox/jarvis-world/local-mode"
jarvis_rescan
expect_poll "the restored setup action is offered" matched local_value absent
rm -f -- "$setup_marker" "$setup_state/accounts.json"
[[ ! -e $sandbox/setup-accounts-before ]] || cp -- "$sandbox/setup-accounts-before" "$setup_state/accounts.json"
rm -rf -- "${setup_codex:?}"
setup_brain ""
expect_poll "without the AI model and the marker the Setup section reads both steps to do again" "$setup_fresh" setup_rows

# A Pi below its floor. The stand-in answers `--version` and nothing else,
# so no Pi program runs a turn; its folder is added by hand, as the Codex
# folder above is. The shell's scan reads the same program from the
# sandbox PATH, and the daemon the copy its world took at its start.
setup_pi="$home/.pi/agent"
pi_version() { # VERSION
  printf '%s\n' "$1" >"$setup_pi_version.next" && mv -T -- "$setup_pi_version.next" "$setup_pi_version"
}
cp -- "$setup_pi_standin" "$shim/pi" && chmod 755 "$shim/pi" || fail "the shell's Pi stand-in is not written"
setup_pi_id() {
  env -i PATH="$sandbox/setup-no-path" HOME="$home" XDG_STATE_HOME="$home/.local/state" XDG_CONFIG_HOME="$home/.config" \
    XDG_DATA_HOME="$home/.local/share" "$node_bin" "$repo/shell/plugins/vgs.jarvis/backend/accounts.js" --tree "$repo" list |
    py_reply 'import json,sys; print(next(a["id"] for a in json.load(sys.stdin) if a["source"].get("directory")==sys.argv[1]))' "$setup_pi"
}
# The AI model step's published action, the label of its button and
# whether the button is offered.
setup_model_step() {
  status_row vgs.jarvis setupModel | py_reply 'import json,sys; r=json.load(sys.stdin); print(json.dumps([r["value"].get("action"), r["action"]["label"], r["action"]["offered"]]))'
}
# The actions the Setup section draws beside its AI model step, each as
# the screen it opens, "" for one the manager acts on, and whether it takes
# a press.
setup_model_drawn() {
  ipc smoke setupRows window vgs.settings | py_reply 'import json,sys
t=sys.stdin.read()
r=[x for x in (json.loads(t) if t.startswith("[") else []) if x["label"]=="AI model"]
print(json.dumps([[b["tui"], b["enabled"]] for b in r[0]["buttons"]]) if r else "absent")'
}
setup_model_updates() { setup_model_step | py_reply 'import json,sys; print("update" if json.load(sys.stdin)[0]=="update" else "no-update")'; }
pi_floor="$(python3 -c 'import json,sys; print(next(r["floor"] for r in json.load(open(sys.argv[1]))["requirements"] if r.get("command")=="pi"))' "$repo/shell/plugins/vgs.jarvis/manifest.json")" || fail "the manifest gives Pi no floor"
mkdir -p -- "$setup_pi" && printf '{}\n' >"$setup_pi/auth.json" || fail "the Pi folder is not written"
[[ ! -e $setup_state/accounts.json ]] || cp -- "$setup_state/accounts.json" "$sandbox/setup-accounts-before-pi"
python3 - "$setup_state/accounts.json" "$setup_pi" <<'PY' || fail "the Pi folder is not added to the account list"
import json,os,sys
held=json.load(open(sys.argv[1])) if os.path.exists(sys.argv[1]) else []
open(sys.argv[1],"w").write(json.dumps(held + [{"provider": "pi", "directory": sys.argv[2], "label": "setup"}]))
PY
pi_version 1.0.2 || fail "the Pi stand-in below its floor is not written"
rescan "a rescan after the Pi stand-in appears starts"
setup_pi_brain="$(setup_pi_id)" || fail "the account helper lists no id for the Pi folder"
setup_brain "$setup_pi_brain"
expect_poll "the daemon holds Pi as the chosen AI model" "\"$setup_pi_brain\"" setup_daemon_brain
expect_poll "a Pi below its floor offers Update Pi on the AI model step" '["update", "Update Pi", true]' setup_model_step
expect_poll "the Setup section draws the step beside the AI model" '[["", true]]' setup_model_drawn
settings_press --type RowAction "Update Pi" || fail "the click on Update Pi failed"
expect_poll "the core's notice lists the outdated Pi" '["vgs.jarvis", ["pi"], ["pi"], false]' notice_shown
expect_poll "Pi's notice holds the keyboard" true ipc smoke noticeFocused
type_keys -k Escape || fail "sending Escape failed"
expect_poll "Escape closes Pi's notice" null notice_shown
# The control: the daemon judges the choice again when it is made again.
pi_version "$pi_floor" || fail "the Pi stand-in at its floor is not written"
rescan "a rescan with Pi at its floor starts"
setup_brain ""
expect_poll "the daemon holds no AI model between the two choices" '""' setup_daemon_brain
setup_brain "$setup_pi_brain"
expect_poll "the daemon holds Pi at its floor as the chosen AI model" "\"$setup_pi_brain\"" setup_daemon_brain
expect_poll "a Pi at its floor offers no update" no-update setup_model_updates
rm -f -- "${shim:?}/pi" "${setup_state:?}/accounts.json" "${setup_pi_version:?}" "${setup_pi_standin:?}"
[[ ! -e $sandbox/setup-accounts-before-pi ]] || cp -- "$sandbox/setup-accounts-before-pi" "$setup_state/accounts.json"
rm -rf -- "${home:?}/.pi"
setup_brain ""
rescan "a rescan after the Pi stand-in goes starts"
expect_poll "without Pi the Setup section reads both steps to do again" "$setup_fresh" setup_rows
settings_page_close vgs.jarvis
jarvis_disable
jarvis_restore_requirements
