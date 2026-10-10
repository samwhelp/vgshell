# Cloud Sync, vgs.cloud-sync. The harness starts it disabled; this row
# stands in every command it and its runner reach in the shell's own PATH
# directory, then enables it: automations_stand_ins' systemctl, which logs
# every verb, and its notify-send; a secret-tool that answers the plugin's
# accounts from files under the row's directory and every other call as the
# harness's sentinel does; and an rclone that logs its argv, swaps the
# drive remote for rclone's `local` backend rooted at a fixture Drive
# beside the run's home and runs the host's rclone. No call reaches the
# host's systemd user manager, keyring, Google Drive or network. The row
# runs the runner, bin/cloud-sync, as the systemd service runs it, with
# the sandbox's directories, and reads what the shell's service publishes.
#
# Rows: the service publishes its declared status, its record and IPC
# target go with a disable, and it reads the stand-in keyring's presence;
# the Settings page offers Set up Cloud Sync while no unit is installed and
# its press hands the terminal the setup TUI; the window maps with the
# record and its Sync now asks systemd to start the one service, which the
# systemctl stand-in logs, and runs no rclone; a Drive-side add and change
# reach the mirror after one run; a local edit since the last download
# keeps both versions and reads `local-edit` in the published status, and
# the service asks for one notification for it, which the core delivers
# or drops by its own rule (rows/notify.sh); a Drive deletion keeps the
# file and reads `removed-on-drive`; a run during another is `busy` and
# starts no copy;
# pause stops the next run's copy and survives a shell restart, read
# through the published status; the bar widget stays hidden until a folder
# pair exists, then derives its tooltip from the published labels and
# states, never a file name. Must-fail controls:
# runner copies with a dry-run copy, with every displaced file taken as
# the runner's own and with the pair lock always granted each fail their
# check in a world of their own; a plugin copy whose service drops every
# read of the record leaves a pause the runner writes unpublished. The row
# ends with the pair removed, the units gone and the plugin disabled, as
# it found it, and its stand-ins removed. No latency reading.
# inputs: shell/plugins/vgs.cloud-sync/* shell/plugins/vgs.settings/* shell/Commons/WatchedFile.qml shell/Core/PluginStatus.qml shell/Core/TuiRunner.qml bin/vgshell-tui
set -euo pipefail
cs_dir="$sandbox/cloudsync"
cs_stub="$cs_dir/stub"
cs_runner="$repo/shell/plugins/vgs.cloud-sync/bin/cloud-sync"
cs_err="$cs_dir/runner.err"
mkdir -p -- "$cs_stub/secrets" "$cs_dir/controls"
: >"$cs_err"

# The world a runner call runs in: HOME, the runtime directory and the
# runner file. The fixture Drive is cloudsync-drive beside HOME, which the
# rclone stand-in reads from the HOME the runner hands it.
cs_use() { # HOME RUNTIME RUNNER
  cs_home="$1" cs_rt="$2" cs_file="$3"
  cs_drive="$(dirname -- "$1")/cloudsync-drive/Docs"
  cs_mirror="$1/cloudsync/docs"
  cs_state="$1/.local/state/vgshell/cloud-sync"
  mkdir -p -- "$cs_drive"
}
cs() {
  env -i HOME="$cs_home" PATH="$shell_start_path" LANG=C.UTF-8 XDG_RUNTIME_DIR="$cs_rt" XDG_CONFIG_HOME="$cs_home/.config" \
    XDG_STATE_HOME="$cs_home/.local/state" XDG_DATA_HOME="$cs_home/.local/share" node "$cs_file" "$@" 2>>"$cs_err"
}
# The runner's answer to ARGS and its exit status on one line.
cs_answer() { local out status=0; out="$(cs "$@")" || status=$?; printf '%s exit=%s\n' "${out//$'\n'/ }" "$status"; }
cs_put() { mkdir -p -- "$(dirname -- "$cs_drive/$1")" && printf '%s' "$2" >"$cs_drive/$1"; }
cs_read() { if [[ -f $cs_mirror/$1 ]]; then cat -- "$cs_mirror/$1"; else echo absent; fi; }
# The runner's record, read afresh: KEY's [kind, path] pairs of conflicts.
cs_conflicts() { cs status | py_reply 'import json,sys; print(json.dumps(sorted([c["kind"], c["path"]] for c in json.load(sys.stdin)["conflicts"])))'; }
cs_kept() { cs status | py_reply 'import json,sys; c=[c for c in json.load(sys.stdin)["conflicts"] if c["kind"] == "local-edit"]; print(open(c[0]["storedPath"]).read() if c else "none")'; }
cs_copies() { if [[ -f $cs_stub/rclone.calls ]]; then grep -c '"copy"' -- "$cs_stub/rclone.calls" || true; else echo 0; fi; }
cs_blocked() { if [[ -e $cs_stub/blocked ]]; then echo yes; else echo no; fi; }
# The values the shell's service publishes, and one of them.
cs_values() { ipc vgs.cloud-sync invoke status ""; }
cs_value() { cs_values | py_reply 'import json,sys; v=json.load(sys.stdin)
for part in sys.argv[1].split("."):
    if not isinstance(v, dict) or part not in v:
        print("unset"); sys.exit()
    v = v[part]
print(json.dumps(v))' "$1"; }
cs_last_sync() { cs_value lastSync | py_reply 'import sys; t=sys.stdin.read().strip(); print("set" if t.isdigit() else t)'; }
cs_sync() { cs_values | py_reply 'import json,sys; v=json.load(sys.stdin).get("sync"); print(json.dumps(v if v is None else [v["tone"], v["text"], v.get("action")]))'; }
cs_published_conflicts() { cs_values | py_reply 'import json,sys; c=json.load(sys.stdin).get("cloud", {}).get("conflicts", []); print(json.dumps(sorted([x["kind"], x["path"]] for x in c)))'; }
cs_keys() { cs_values | py_reply 'import json,sys; print(json.dumps([[k["secret"], k["value"]] for k in json.load(sys.stdin).get("keys", [])]))'; }
cs_lent() { ipc shell lent | py_reply 'import json,sys; d=json.load(sys.stdin); r=d["status"].get("vgs.cloud-sync"); print(json.dumps([sorted(r["keys"]) if r else None, "vgs.cloud-sync" in d["ipcTargets"]]))'; }
# The systemctl calls the stand-in logged for Cloud Sync: a reload and
# each call that names one of its units.
cs_systemctl() { if [[ -f $cs_stub/systemd/systemctl.calls ]]; then py_reply 'import json,sys; print(json.dumps([c for c in map(json.loads, sys.stdin) if "daemon-reload" in c or any(a.startswith("vgs-cloud-sync.") for a in c)]))' <"$cs_stub/systemd/systemctl.calls"; else echo '[]'; fi; }
cs_click_sync() { click_in "window:Cloud Sync" window vgs.cloud-sync Button "Sync now" && echo ok; }
cs_dropped() { ipc smoke readInstance service vgs.cloud-sync smokeDropped; }
cs_dropped_after() { local now; now="$(cs_dropped)" || return; [[ $now =~ ^[0-9]+$ && $now -gt $1 ]] && echo read || echo "$now"; }
# The attention key the runner's record holds, and the one the service
# last asked a notification for.
cs_attention() { cs status | py_reply 'import json,sys; a=json.load(sys.stdin)["attention"]; print(a["key"] if a else "none")'; }
cs_notified() { ipc smoke readInstance service vgs.cloud-sync notifiedKey | py_reply 'import json,sys; print(json.load(sys.stdin) or "none")'; }
cs_widget_shown() { ipc smoke readInstance "$(bar_key)" vgs.cloud-sync visible; }
cs_widget() { ipc smoke readInstance "$(bar_key)" vgs.cloud-sync tip | py_reply 'import json,sys; t=json.load(sys.stdin); print(json.dumps([t["title"], t["details"].split("\n")[:2]]))'; }
cs_widget_names_files() { ipc smoke readInstance "$(bar_key)" vgs.cloud-sync tip | py_reply 'import json,sys; t=json.load(sys.stdin); print(any(n in t["title"] + t["details"] for n in sys.argv[1:]))' a.txt b.txt; }

# The checks the controls replay against a broken runner: each runs in the
# world cs_use set and fails through expect.
check_copy() {
  expect "the pair is added" added=docs cs pair-add --definition "{\"id\":\"docs\",\"label\":\"Documents\",\"direction\":\"pull\",\"remote\":\"Docs\",\"local\":\"$cs_mirror\"}"
  cs_put a.txt "one"
  expect "a run copies the Drive folder" "pair=docs result=idle exit=0" cs_answer run
  expect "the Drive-side add reaches the mirror" one cs_read a.txt
  cs_put a.txt "one, changed on Drive"
  cs_put b.txt "added on Drive"
  expect "the next run copies the change and the add" "pair=docs result=idle exit=0" cs_answer run
  expect "the Drive-side change reaches the mirror after one run" "one, changed on Drive" cs_read a.txt
  expect "the second Drive-side add reaches the mirror" "added on Drive" cs_read b.txt
}
check_local_edit() {
  printf '%s' "edited here, a longer local version" >"$cs_mirror/a.txt"
  expect "a run after a local edit finishes" "pair=docs result=idle exit=0" cs_answer run
  expect "the mirror holds the Drive version" "one, changed on Drive" cs_read a.txt
  expect "the local edit is kept" "edited here, a longer local version" cs_kept
  expect "the record reads local-edit" '[["local-edit", "a.txt"]]' cs_conflicts
}
check_removed() {
  rm -- "$cs_drive/b.txt"
  expect "a run after a Drive deletion finishes" "pair=docs result=idle exit=0" cs_answer run
  expect "the file Drive removed stays" "added on Drive" cs_read b.txt
  expect "the record reads removed-on-drive" '[["local-edit", "a.txt"], ["removed-on-drive", "b.txt"]]' cs_conflicts
}
check_lock() {
  local held held_out="$cs_dir/held.out" before
  cs_put c.txt "held"
  rm -f -- "$cs_stub/blocked" "$cs_stub/release"
  mkfifo -- "$cs_stub/release"
  : >"$cs_stub/block"
  cs run >"$held_out" &
  held=$!
  expect_poll "the first run holds its copy" yes cs_blocked
  before="$(cs_copies)"
  expect "a run during another is busy" "pair=docs result=busy exit=75" cs_answer run
  expect "the busy run starts no copy" "$before" cs_copies
  rm -f -- "$cs_stub/block"
  printf 'go\n' >"$cs_stub/release"
  wait "$held" || true
  rm -f -- "$cs_stub/release" "$cs_stub/blocked"
  expect "the held run finishes" "pair=docs result=idle" cat -- "$held_out"
}
# control_red NAME CHECK...: the checks against a runner copy whose FROM
# reads TO, in a world of its own; `red` when they fail, as they must.
control_red() { # NAME FROM TO CHECK...
  local name="$1" from="$2" to="$3" dir="$cs_dir/controls/$1" log
  shift 3
  mkdir -p -- "$dir/home" "$dir/run"
  log="$dir/checks.log"
  python3 - "$cs_runner" "$dir/cloud-sync" "$from" "$to" <<'PY' || { echo "edit-failed"; return; }
import sys
source, target, old, new = sys.argv[1:]
text = open(source).read()
if text.count(old) != 1:
    sys.exit("occurs %d times" % text.count(old))
open(target, "w").write(text.replace(old, new))
PY
  cmp -s -- "$cs_runner" "$dir/cloud-sync" && { echo unchanged; return; }
  (
    failures=0 behaviour_failures=0
    cs_use "$dir/home" "$dir/run" "$dir/cloud-sync"
    for check; do "$check"; done
    rm -f -- "$cs_stub/block" "$cs_stub/release" "$cs_stub/blocked"
    if [[ $failures -gt 0 ]]; then echo red; else echo green; fi
  ) 2>&1 | tee "$log" | tail -n 1
}

cloudsync_row() {
  local host_rclone shell_path
  host_rclone="$(command -v rclone)"
  automations_stand_ins "$cs_stub/systemd"
  terminal_stand_in
  cat >"$shim/rclone" <<SH
#!/usr/bin/env bash
python3 -c 'import json,os,sys; print(json.dumps({"argv": sys.argv[1:], "env": {k: v for k, v in os.environ.items() if k.startswith("RCLONE_")}}))' "\$@" >>"$cs_stub/rclone.calls"
export RCLONE_CONFIG_VGSDRIVE_TYPE=local
unset RCLONE_CONFIG_VGSDRIVE_CLIENT_ID RCLONE_CONFIG_VGSDRIVE_CLIENT_SECRET RCLONE_CONFIG_VGSDRIVE_TOKEN RCLONE_CONFIG_VGSDRIVE_SCOPE
cd "\$(dirname -- "\$HOME")/cloudsync-drive" || exit 9
if [[ -f "$cs_stub/block" && ! -e "$cs_stub/blocked" && \$3 == copy ]]; then
  : >"$cs_stub/blocked"
  read -r _ <"$cs_stub/release"
fi
exec "$host_rclone" "\$@"
SH
  chmod 755 "$shim/rclone"
  sentinel_stand_over "$shim/secret-tool" <<SH
#!/usr/bin/env bash
if [[ \${1:-} == search && \${2:-} == service && \${3:-} == vgs-cloud-sync && \${4:-} == account && \$# -eq 5 ]]; then
  if [[ -f "$cs_stub/secrets/\$5" ]]; then
    printf '[/1]\\nlabel = VGS Cloud Sync %s\\nsecret = %s\\n' "\$5" "\$(<"$cs_stub/secrets/\$5")"
    printf 'attribute.service = vgs-cloud-sync\\nattribute.account = %s\\n' "\$5" >&2
  fi
  exit 0
fi
case "\${1:-}" in
  search) exit 0 ;;
  lookup) exit 1 ;;
esac
printf '%s\\n' "secret-tool \$*" >>"$auth_log"
exit 1
SH
  expect "the rclone command resolves to the row's stand-in on the shell's PATH" "$shim/rclone" shell_resolves rclone
  cs_use "$home" "$rt_dir" "$cs_runner"

  # The service, built over the stand-ins.
  expect "Cloud Sync starts disabled" '[null, false]' cs_lent
  expect "enabling Cloud Sync is allowed" ok ipc shell setPluginEnabled vgs.cloud-sync true
  expect "placing Cloud Sync's widget is allowed" ok ipc shell setPluginPlaced vgs.cloud-sync true
  expect_poll "the service holds its status record and IPC target" '[["cloud", "keys", "sync"], true]' cs_lent
  expect_poll "with no pair and no unit the sync reads not set up and offers Set up" '["warning", "Not set up", "setup"]' cs_sync
  expect_poll "with no folder pair the widget is hidden" false cs_widget_shown
  expect_poll "with no key stored every key reads absent" '[["pull-client-id", "absent"], ["pull-client-secret", "absent"], ["pull-token", "absent"], ["upload-client-id", "absent"], ["upload-client-secret", "absent"], ["upload-token", "absent"]]' cs_keys
  printf 'fixture-client' >"$cs_stub/secrets/pull-client-id"
  printf 'fixture-secret' >"$cs_stub/secrets/pull-client-secret"
  printf '{"access_token":"fixture","token_type":"Bearer","refresh_token":"fixture-refresh"}' >"$cs_stub/secrets/pull-token"
  expect "the service reads the keys again on request" ok ipc vgs.cloud-sync invoke refresh ""
  expect_poll "the stored download keys read present" '[["pull-client-id", "present"], ["pull-client-secret", "present"], ["pull-token", "present"], ["upload-client-id", "absent"], ["upload-client-secret", "absent"], ["upload-token", "absent"]]' cs_keys

  # Set up Cloud Sync, D061: the Settings page offers the step while no
  # unit is installed, and its press opens the setup TUI. The stand-in
  # terminal runs no shipped script, so the row runs the install the
  # script runs.
  settings_page_open vgs.cloud-sync
  forget_record
  expect "Set up Cloud Sync is pressed" ok settings_act vgs.cloud-sync sync
  expect_poll "Set up hands the terminal the setup TUI" "$(words vgs.cloud-sync/setup tui/setup.sh)" recorded_tail
  expect_run_end "the setup run ends" vgs.cloud-sync/setup
  settings_page_close vgs.cloud-sync
  expect "the install the setup TUI runs writes the units" "installed=vgs-cloud-sync.timer changed=2 exit=0" cs_answer install
  expect "install reloads the stand-in manager and enables the timer" '[["--user", "daemon-reload"], ["--user", "enable", "--now", "vgs-cloud-sync.timer"]]' cs_systemctl
  expect "the service reads the record again after the setup run" ok ipc vgs.cloud-sync invoke refresh ""
  expect_poll "with the units installed and no pair nothing is offered" '["warning", "Not set up", null]' cs_sync

  # A Drive-side add and change, a local edit and a Drive deletion, each
  # after one run, and the service's reading of each.
  check_copy
  expect_poll "the service publishes the pair's state" '["Documents: Up to date"]' cs_value sync.lines
  expect_poll "the service publishes the last sync" set cs_last_sync
  check_local_edit
  expect_poll "the service publishes the local edit" '[["local-edit", "a.txt"]]' cs_published_conflicts
  expected_errors+=('notify: unsent plugin=vgs\.cloud-sync')
  expect_poll "the service asks for one notification for the local edit" "$(cs_attention)" cs_notified
  check_removed
  expect_poll "the service publishes the Drive deletion" '[["local-edit", "a.txt"], ["removed-on-drive", "b.txt"]]' cs_published_conflicts
  check_lock

  # The widget names the pair and its state, never a file.
  expect "with a folder pair the widget shows" true cs_widget_shown
  expect_poll "the widget's tooltip names the pair and the files to review" '["Cloud Sync: Up to date", ["Documents: Up to date", "2 files to review"]]' cs_widget
  expect "the widget's tooltip names no file" False cs_widget_names_files

  # The window, and Sync now through the one service.
  expect "the window is summoned" ok ipc shell summon window vgs.cloud-sync '{}'
  expect_poll "the window maps, titled Cloud Sync" 1 window_count "Cloud Sync"
  expect_poll "the window reads the units installed" true ipc smoke readInstance window vgs.cloud-sync setUp
  local copies
  copies="$(cs_copies)"
  : >"$cs_stub/systemd/systemctl.calls"
  expect "Sync now is clicked" ok cs_click_sync
  expect_poll "Sync now asks systemd to start the one service" '[["--user", "start", "--no-block", "vgs-cloud-sync.service"]]' cs_systemctl
  expect "Sync now runs no rclone of its own" "$copies" cs_copies
  expect "the window is hidden" ok ipc shell hide window vgs.cloud-sync
  expect_poll "the window is gone" 0 window_count "Cloud Sync"

  # Pause stops the next run's copy and survives a restart.
  cs_put d.txt "while paused"
  expect "Pause through the service" ok ipc vgs.cloud-sync invoke pause ""
  expect_poll "the service publishes the pause" true cs_value cloud.paused
  expect "a paused run copies nothing" "pair=docs result=paused exit=0" cs_answer run
  expect "the paused run left the add on Drive" absent cs_read d.txt
  stop_shell || fail "cloudsync: the shell stops before the restart"
  start_shell "$repo" "$sandbox/qs-cloudsync.log" || return 0
  expect_poll "after a restart the service publishes the pause" true cs_value cloud.paused
  expect_poll "after a restart the sync reads paused" '["info", "Paused", null]' cs_sync
  expect "Resume through the service" ok ipc vgs.cloud-sync invoke resume ""
  expect_poll "the service publishes the resume" false cs_value cloud.paused
  expect "a resumed run copies the add" "pair=docs result=idle exit=0" cs_answer run
  expect "the add made while paused reaches the mirror" "while paused" cs_read d.txt

  # Controls: each runner rule broken in a copy, in a world of its own.
  expect "control: a dry-run copy fails the copy check" red control_red copy 'rclone(["copy", remotePath(pair), pair.local,' 'rclone(["copy", "--dry-run", remotePath(pair), pair.local,' check_copy
  expect "control: every displaced file taken as the runner's own fails the local-edit check" red control_red local-edit "const unedited = base !== undefined" "const unedited = true || base !== undefined" check_copy check_local_edit
  expect "control: a lock always granted fails the lock check" red control_red lock "if (out.status === 0) return fd;" "if (out.status === 0 || true) return fd;" check_copy check_lock

  # Control: a plugin copy whose service drops every read of the record
  # leaves a pause the runner writes unpublished.
  local copy="$home/.config/vgshell/plugins/vgs.cloud-sync" dropped
  mkdir -p -- "$copy"
  cp -R -- "$repo/shell/plugins/vgs.cloud-sync/." "$copy/"
  expected_errors+=('plugins: hidden by a higher-precedence plugin with the same id: vgs\.cloud-sync')
  if edit_file_once "$copy/Service.qml" "            onLoaded: content => root.accept(content)" "            onLoaded: content => root.smokeDropped += 1" &&
    edit_file_once "$copy/Service.qml" "    property bool registered: false" "    property bool registered: false
    property int smokeDropped: 0"; then
    rescan "the control copy is scanned"
    expect_poll "the control copy's service reads the record" read cs_dropped_after 0
    dropped="$(cs_dropped)" || fail "the control copy's read count is unreadable"
    expect "the runner pauses under the control" paused=all cs pause
    expect_poll "the control copy's service reads the paused record" read cs_dropped_after "$dropped"
    expect "the control copy leaves the pause unpublished" unset cs_value cloud.paused
    expect "the runner resumes under the control" resumed=all cs resume
  else
    fail "the plugin control's edit failed"
  fi
  rm -r -- "$copy"
  rescan "the shipped plugin is scanned again"
  expect_poll "the shipped service publishes the record again" false cs_value cloud.paused

  # The world as the row found it.
  expect "the pair is removed" removed=docs cs pair-remove docs
  rm -f -- "$home/.config/systemd/user/vgs-cloud-sync.service" "$home/.config/systemd/user/vgs-cloud-sync.timer"
  expect "the service reads the record again" ok ipc vgs.cloud-sync invoke refresh ""
  expect_poll "with no pair and no unit the sync reads not set up" '["warning", "Not set up", "setup"]' cs_sync
  expect "unplacing Cloud Sync's widget is allowed" ok ipc shell setPluginPlaced vgs.cloud-sync false
  expect "disabling Cloud Sync is allowed" ok ipc shell setPluginEnabled vgs.cloud-sync false
  expect_poll "the disabled plugin holds no status record or IPC target" '[null, false]' cs_lent
  sentinel_restore "$shim/secret-tool"
  rm -f -- "$shim/rclone"
  automations_stand_ins_restore "$cs_stub/systemd"
}

# edit_file_once FILE OLD NEW: FILE with its one OLD replaced by NEW.
edit_file_once() {
  python3 - "$@" <<'PY'
import sys
path, old, new = sys.argv[1:]
text = open(path).read()
if text.count(old) != 1:
    sys.exit("%s: occurs %d times: %s" % (path, text.count(old), old))
open(path, "w").write(text.replace(old, new))
PY
}

if command -v rclone >/dev/null 2>&1; then
  cloudsync_row
else
  not_measured cloudsync missing=rclone
fi
