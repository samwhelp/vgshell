# The Start Jarvis at boot setting against the real core, the shipped
# helper and tmux on the sandbox's own server: the harness sets TMUX_TMPDIR
# to the sandbox's runtime directory, so no start reaches the caller's
# server. With the setting off a shell start starts no session. Turned on
# in a running shell, the Jarvis session row reads that the next boot
# starts it, the session choices are offered and still no session runs. A
# shell start then starts one session, `jarvis`, in the home folder, which
# runs the account's program with its resume form, and a second shell start
# starts no second session and runs no second program. With Start a new
# session chosen, a shell start runs the program with no resume form.
# Control: a tree whose launcher skips its session check reads the second
# start as not started. The program is a fixture `claude` in the shell's
# stand-in directory: it records its argv and account folder and holds its
# session open. No vendor program and no account runs.
# No latency ceiling. Reads poll once per nested IPC round trip, and a
# session read runs one tmux client.
# inputs: shell/plugins/vgs.jarvis/* shell/plugins/vgs.jarvis/backend/* shell/Commons/AccountDirectories.js bin/lib/account-folders.js bin/lib/anchored.js bin/lib/judge-files.js bin/lib/qml-library.js shell/Core/PluginStatus.qml scripts/smoke/rows/jarvis.sh
set -euo pipefail
session_config="$home/.config/vgshell/shell.json"
session_home="$home/SmokeJarvis"
session_account="$home/.claude"
mkdir -p -- "$session_home"
session_account_made=false
[[ -d $session_account ]] || { mkdir -- "$session_account"; session_account_made=true; }
# The account's id as the Jarvis page saves it.
session_brain="$(python3 -c 'import hashlib,json,sys; print("cli:" + hashlib.sha256(json.dumps(["claude", sys.argv[1]], separators=(",", ":")).encode()).hexdigest()[:32])' "$session_account")"
# Only a start in the session's folder is the session: the daemon's sign-in
# check of the chosen account runs this program elsewhere and gets no answer.
cat >"$shim/claude" <<PROGRAM
#!/usr/bin/env python3
import json, os, sys, time
if os.getcwd() != "$session_home":
    sys.exit(1)
fd = os.open("starts.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
os.write(fd, (json.dumps({"argv": sys.argv[1:], "account": os.environ.get("CLAUDE_CONFIG_DIR")}) + "\n").encode())
os.close(fd)
while not os.path.exists("release"):
    time.sleep(0.02)
PROGRAM
chmod 755 "$shim/claude"

session_tmux() { env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$rt_dir" tmux "$@"; }
# The sandbox server's session names as a JSON list; none without a server.
session_names() {
  local listed
  listed="$(session_tmux list-sessions -F '#{session_name}' 2>/dev/null)" || listed=""
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1].split()))' "$listed"
}
# Each recorded start as [argv, account folder].
session_starts() {
  python3 - "$session_home/starts.log" <<'PY'
import json, os, sys
lines = open(sys.argv[1]).read().splitlines() if os.path.exists(sys.argv[1]) else []
try:
    print(json.dumps([[row["argv"], row["account"]] for row in map(json.loads, lines)]))
except ValueError:
    print("partial")
PY
}
session_row() {
  ipc smoke jarvisProcess | py_reply '
import json,sys
value=json.load(sys.stdin)["status"].get("sessionStart")
print(value["text"] if isinstance(value, dict) and "text" in value else "pending")
'
}
session_modes() {
  ipc smoke jarvisProcess | py_reply '
import json,sys
print(json.dumps([choice["value"] for choice in json.load(sys.stdin)["status"].get("sessionModes") or []]))
'
}
# VALUES, a JSON object, written over Jarvis's settings; null removes a key.
session_set() { # VALUES
  python3 - "$session_config" "$1" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]); value = json.loads(path.read_text())
row = next((r for r in value.setdefault("plugins", []) if r["id"] == "vgs.jarvis"), None)
if row is None:
    row = {"id": "vgs.jarvis"}; value["plugins"].append(row)
for key, setting in json.loads(sys.argv[2]).items():
    if setting is None: row.pop(key, None)
    else: row[key] = setting
path.write_text(json.dumps(value))
PY
}
session_shell_start() { # TREE NAME
  stop_shell || :
  start_shell "$1" "$sandbox/jarvis-session-$2.log"
  jarvis_enable
}
session_end() {
  : >"$session_home/release"
  expect_poll "the released program ends its session" '[]' session_names
  rm -f -- "$session_home/release" "$session_home/starts.log"
}

jarvis_setup_requirements
session_shell_start "$repo" off
expect_poll "with the setting off the row reads not started at boot" "Not started at boot" session_row
expect "with the setting off the page is offered no session choice" '[]' session_modes
expect "with the setting off a shell start starts no session" '[]' session_names

session_set "$(python3 -c 'import json,sys; print(json.dumps({"startAtBoot": True, "brain": sys.argv[1], "home": "~/SmokeJarvis"}))' "$session_brain")"
expect "the configuration reloads with the setting on" ok ipc shell reloadConfig
expect_poll "turned on in a running shell, the row reads the next boot" "Starts at the next boot" session_row
expect "the page is offered both session choices" '["resume", "new"]' session_modes
expect "turning the setting on starts no session" '[]' session_names

session_shell_start "$repo" first
expect_poll "a shell start with the setting on starts the session" '["jarvis"]' session_names
expect_poll "the session runs the account's program with its resume form" "$(python3 -c 'import json,sys; print(json.dumps([[["--continue"], sys.argv[1]]]))' "$session_account")" session_starts
expect_poll "the row reads running" Running session_row

session_shell_start "$repo" second
expect_poll "a second shell start finds the session" Running session_row
expect "a second shell start starts no second session" '["jarvis"]' session_names
expect "a second shell start runs no second program" 1 python3 -c 'import sys; print(len(open(sys.argv[1]).read().splitlines()))' "$session_home/starts.log"

copy_tree jarvis-session-duplicate
if edit_tree jarvis-session-duplicate shell/plugins/vgs.jarvis/backend/TaskRunner.js \
    '    if (found.signal === null && found.code === 0) return "running";' ''; then
  session_shell_start "$sandbox/tree-jarvis-session-duplicate" duplicate
  expect_poll "control: a launcher without its session check reads the second start as not started" "Not started" session_row
fi

session_end
session_set '{"bootSession": "new"}'
session_shell_start "$repo" new
expect_poll "a shell start with Start a new session starts the session" '["jarvis"]' session_names
expect_poll "the new session runs the program with no resume form" "$(python3 -c 'import json,sys; print(json.dumps([[[], sys.argv[1]]]))' "$session_account")" session_starts

session_end
session_set '{"startAtBoot": null, "bootSession": null, "brain": null, "home": null}'
expect "the configuration reloads with the manifest's settings" ok ipc shell reloadConfig
expect_poll "with the setting off again the row reads not started at boot" "Not started at boot" session_row
jarvis_disable
rm -f -- "$shim/claude"
[[ $session_account_made == false ]] || rmdir -- "$session_account"
jarvis_restore_requirements
