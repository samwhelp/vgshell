# The Jarvis session row against the real core and the shipped helper,
# with a stand-in for the Jarvis package's `jarvis-session` in the home
# folder (scripts/fixtures/jarvis/session-package.py): it records each call
# and answers what the row wrote beside it, and starts nothing, so no
# session and no tmux server exists at any point. In a home without the
# command the row reads that no session can start and names the package.
# With Start Jarvis at boot off a shell start reads the session and asks
# for no start. Turned on in a running shell, the row reads that the next
# boot starts it, the session choices are offered and still no start is
# asked. Each shell start then asks the package for one boot start, in the
# home, for the account's app, and a second shell start asks again and VGS
# starts nothing itself. The Start step asks for a manual start. Disabling
# Jarvis asks for one stop with the app's Off, and a shell restart asks for
# none. A home selection that fails its check, None here, leaves the live
# session's home as the one the service holds, and the Off then stops the
# session there. Controls: a tree whose helper asks twice reads two starts
# for one shell start, and a tree whose service follows a refused selection
# holds the new home.
# No latency ceiling. Reads poll once per nested IPC round trip.
# The home's Jarvis package is the copy VGS writes there; the row adds only
# the stand-in command beside it.
# inputs: shell/plugins/vgs.jarvis/* shell/plugins/vgs.jarvis/backend/* packaging/jarvis-home/* scripts/fixtures/jarvis/session-package.py shell/Core/Plugins.qml shell/Commons/AccountDirectories.js bin/lib/account-folders.js bin/lib/anchored.js bin/lib/qml-library.js shell/Core/PluginStatus.qml scripts/smoke/rows/jarvis.sh
set -euo pipefail
session_config="$home/.config/vgshell/shell.json"
session_home="$home/SmokeJarvis"
session_account="$home/.claude"
session_package="$session_home/.agents/skills/jarvis"
mkdir -p -- "$session_home"
session_account_made=false
[[ -d $session_account ]] || { mkdir -- "$session_account"; session_account_made=true; }
# The account's id as the Jarvis page saves it.
session_brain="$(python3 -c 'import hashlib,json,sys; print("cli:" + hashlib.sha256(json.dumps(["claude", sys.argv[1]], separators=(",", ":")).encode()).hexdigest()[:32])' "$session_account")"

# The stand-in's answers by verb, as "STATE REASON" words; its calls start over.
session_answers() { # STATUS START STOP
  python3 - "$session_package/scripts" "$session_home" "$session_account" "$@" <<'PY'
import json, os, sys
folder, home, account = sys.argv[1:4]
answers = {}
for verb, words in zip(["status", "start", "stop"], sys.argv[4:]):
    state, reason = words.split()
    answers[verb] = {"exit": 0, "object": {"state": state, "reason": reason, "home": home, "harness": "claude", "account": account}}
json.dump(answers, open(os.path.join(folder, "answers.json"), "w"))
if os.path.exists(os.path.join(folder, "calls.log")):
    os.unlink(os.path.join(folder, "calls.log"))
PY
}
# The argv of each call of VERB the stand-in took, as a JSON list.
session_calls() { # VERB
  python3 - "$session_package/scripts/calls.log" "$1" <<'PY'
import json, os, sys
lines = open(sys.argv[1]).read().splitlines() if os.path.exists(sys.argv[1]) else []
try:
    print(json.dumps([row["argv"] for row in map(json.loads, lines) if row["argv"][0] == sys.argv[2]]))
except ValueError:
    print("partial")
PY
}
session_start_words() { # MODE ORIGIN...
  python3 -c 'import json,sys; print(json.dumps([["start", "--harness", "claude", "--account", sys.argv[1], "--mode", sys.argv[3], "--origin", origin, "--home", sys.argv[2]] for origin in sys.argv[4:]]))' \
    "$session_account" "$session_home" "$@"
}
# The row as [text, hint], or pending before the service's first answer.
session_row() {
  ipc smoke jarvisProcess | py_reply '
import json,sys
value=json.load(sys.stdin)["status"].get("sessionStart")
print(json.dumps([value["text"], value.get("hint", "")]) if isinstance(value, dict) and "text" in value else "pending")
'
}
session_text() {
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
session_tmux() {
  local listed
  listed="$(env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$rt_dir" tmux list-sessions -F '#{session_name}' 2>/dev/null)" || listed=""
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1].split()))' "$listed"
}
# VALUES, a JSON object, written over Jarvis's settings; null removes a key.
session_set() { # VALUES
  user_config_write python3 - "$session_config" "$1" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1]); value = json.loads(path.read_text())
row = next((r for r in value.setdefault("plugins", []) if r["id"] == "vgs.jarvis"), None)
if row is None:
    row = {"id": "vgs.jarvis"}; value["plugins"].append(row)
for key, setting in json.loads(sys.argv[2]).items():
    if setting is None: row.pop(key, None)
    else: row[key] = setting
print(json.dumps(value))
PY
}
session_shell_start() { # TREE NAME
  stop_shell || :
  start_shell "$1" "$sandbox/jarvis-session-$2.log"
  jarvis_enable
}

jarvis_setup_requirements
session_set "$(python3 -c 'import json,sys; print(json.dumps({"brain": sys.argv[1], "home": "~/SmokeJarvis"}))' "$session_brain")"
session_shell_start "$repo" no-package
expect_poll "a home without the package's command reads that no session can start" \
  '["Cannot start", "Install or update the Jarvis package in this home folder"]' session_row

mkdir -p -- "$session_package/scripts"
cp -- "$source_repo/scripts/fixtures/jarvis/session-package.py" "$session_package/scripts/jarvis-session"
chmod 755 "$session_package/scripts/jarvis-session"
session_answers "stopped never-started" "running existing" "stopping stop-requested"
session_shell_start "$repo" off
expect_poll "with the setting off the row reads not started" "Not started" session_text
expect "with the setting off the page is offered no session choice" '[]' session_modes
expect "with the setting off a shell start asks for no start" '[]' session_calls start

session_set '{"startAtBoot": true}'
expect "the configuration reloads with the setting on" ok ipc shell reloadConfig
expect_poll "turned on in a running shell, the row reads the next boot" "Starts at the next boot" session_text
expect "the page is offered both session choices" '["resume", "new"]' session_modes
expect "turning the setting on asks for no start" '[]' session_calls start

session_answers "running existing" "running existing" "stopping stop-requested"
session_shell_start "$repo" first
expect_poll "a shell start with the setting on asks the package for one boot start" "$(session_start_words resume boot)" session_calls start
expect_poll "the row reads the session the package answers" Running session_text
session_shell_start "$repo" second
expect_poll "a second shell start asks the package again" "$(session_start_words resume boot boot)" session_calls start
expect_poll "the row reads running after the second start" Running session_text
expect "VGS itself starts no session" '[]' session_tmux

copy_tree jarvis-session-twice
if edit_tree jarvis-session-twice shell/plugins/vgs.jarvis/backend/session-control.js \
    '        if (started === null) return failed;' \
    '        await run(at, ["start", "--harness", who.harness, "--account", who.directory, "--mode", mode, "--origin", origin]);
        if (started === null) return failed;'; then
  session_answers "running existing" "running existing" "stopping stop-requested"
  session_shell_start "$sandbox/tree-jarvis-session-twice" twice
  expect_poll "control: a helper that asks twice reads two starts for one shell start" "$(session_start_words resume boot boot)" session_calls start
fi

session_answers "stopped ended" "running new-requested" "stopping stop-requested"
session_set '{"bootSession": "new", "startAtBoot": false}'
session_shell_start "$repo" manual
expect_poll "with the setting off again the shell start only reads" "Not started" session_text
expect "the Start step is taken" ok ipc vgs.jarvis invoke start-session ''
expect_poll "the Start step asks the package for a manual start in the chosen mode" "$(session_start_words new manual)" session_calls start

# The home the service holds for the session, and the block of a selection
# that failed its check, as [home, block].
session_held() {
  ipc smoke itemValues service vgs.jarvis SessionStart sessionHome,unapplied | py_reply '
import json,sys
rows=json.load(sys.stdin)
print(json.dumps([rows[0]["sessionHome"], rows[0]["unapplied"]]) if len(rows) == 1 else "pending")
'
}
session_refuse() { # LABEL
  session_set '{"home": null}'
  expect "$1: the configuration reloads with no home folder" ok ipc shell reloadConfig
}
copy_tree jarvis-session-follows
if edit_tree jarvis-session-follows shell/plugins/vgs.jarvis/SessionStart.qml \
    '        if (answer.kind === "answer" && answer.unapplied !== undefined) unapplied = answer.unapplied;' \
    '        if (answer.kind === "answer" && answer.unapplied !== undefined) { unapplied = answer.unapplied; sessionHome = current.home; }'; then
  session_answers "running existing" "running existing" "stopping stop-requested"
  session_shell_start "$sandbox/tree-jarvis-session-follows" follows
  expect_poll "control: the copy reads the running session" '["~/SmokeJarvis", ""]' session_held
  session_refuse control
  expect_poll "control: a service that follows a refused selection holds the new home" '["", "no-home"]' session_held
  session_set '{"home": "~/SmokeJarvis"}'
fi

session_answers "running existing" "running existing" "stopping stop-requested"
session_shell_start "$repo" restart
expect_poll "the restarted shell reads the running session" Running session_text
expect "a shell restart asks for no stop" '[]' session_calls stop
session_refuse "a refused selection"
expect_poll "a refused home selection leaves the live session's home held" '["~/SmokeJarvis", "no-home"]' session_held
expect "the row still reads the session that runs" Running session_text
expect "a refused selection asks for no stop" '[]' session_calls stop
expect "disabling Jarvis is accepted" ok ipc shell setPluginEnabled vgs.jarvis false
expect_poll "disabling Jarvis asks for one stop, with the app's Off, in the home the session lives in" \
  "$(python3 -c 'import json,sys; print(json.dumps([["stop", "--origin", "app-off", "--home", sys.argv[1]]]))' "$session_home")" session_calls stop

session_set '{"startAtBoot": null, "bootSession": null, "brain": null, "home": null}'
expect "the configuration reloads with the manifest's settings" ok ipc shell reloadConfig
rm -f -- "${session_package:?}/scripts/jarvis-session" "${session_package:?}/scripts/answers.json" "${session_package:?}/scripts/calls.log"
rmdir -- "$session_package/scripts"
[[ $session_account_made == false ]] || rmdir -- "$session_account"
jarvis_restore_requirements
