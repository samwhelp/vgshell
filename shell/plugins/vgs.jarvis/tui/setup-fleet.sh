#!/usr/bin/env bash
# The core opens this script from the plugin's published snapshot, from the
# Agent fleet row's Install kendex, once gum, node, git and kendex are found.
# In the Jarvis home folder the settings name, it makes the folder a git
# repository of its own where it is none, then installs kendex's orch skill,
# whose mail tool Jarvis hands a fleet request with, and leaves the files it
# wrote uncommitted for the user. Every refusal adds one keyed line,
# `jarvis: fleet-setup=<key> ...`, to the Jarvis setup log; the screen shows
# a plain sentence.
set -euo pipefail
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/jarvis/setup.log"
[[ $# == 0 ]] ||
  vgs_tui_refuse "$log" 2 "jarvis: fleet-setup=arguments" \
    "Open Install kendex from the Jarvis page in Settings." || exit
lib="$VGS_TUI_LIB"
tree="${lib%/bin/lib/tui.sh}"
[[ $tree != "$lib" && -n ${VGS_PLUGIN_ID:-} && -n ${VGS_PLUGIN_DIR:-} ]] ||
  vgs_tui_refuse "$log" 2 "jarvis: fleet-setup=tui=missing" \
    "Open Install kendex from the Jarvis page in Settings." || exit
vgs_tui_lock jarvis-fleet-setup
vgs_tui_header "Set up the agent fleet" "Installs the kendex mail tool in the Jarvis home folder." \
  "Jarvis then hands a request for your agent fleet to your Jarvis session."

settings="$(vgs_tui_logged "$log" "$tree/bin/vgshell" plugin settings "$VGS_PLUGIN_ID")" ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=settings-unreadable" \
    "VGS could not read the Jarvis settings." "Close this window and try again." || exit
setting="$(vgs_tui_logged "$log" node -e '
const home = JSON.parse(process.argv[1]).home;
if (typeof home !== "string") { process.stderr.write("jarvis: fleet-setup=home-setting\n"); process.exit(1); }
process.stdout.write(home);
' "$settings")" ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=settings-unreadable" \
    "VGS could not read the Jarvis settings." "Close this window and try again." || exit
# Home.js judges the setting and finds the tool, as Jarvis does.
helper() { vgs_tui_logged "$log" node "$VGS_PLUGIN_DIR/backend/fleet-setup.js" --tree "$tree" "$@" "$setting"; }
folder="$(helper folder)" ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=home-unchosen" \
    "Choose a home folder in Settings > Home, then try again." || exit
if helper tool >/dev/null; then
  vgs_tui_step "The kendex mail tool is already in the home folder"
  exit 0
fi
[[ -d $folder ]] ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=home-absent" \
    "The home folder is not there. Turn Jarvis on so it makes the folder, then try again." || exit

# lane-mail finds its mailbox in the repository its working folder belongs
# to, so the home is a repository of its own.
real="$(cd -- "$folder" && pwd -P)"
top="$(git -C "$folder" rev-parse --show-toplevel 2>/dev/null || :)"
if [[ -z $top || "$(cd -- "$top" && pwd -P)" != "$real" ]]; then
  vgs_tui_confirm "Make the home folder a git repository of its own?" || exit 130
  vgs_tui_logged "$log" git -C "$folder" init ||
    vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=git-init-failed" \
      "VGS could not make the home folder a git repository." || exit
fi
vgs_tui_confirm "Install the kendex mail tool in the home folder?" || exit 130
# --yes asks nothing more after the confirm above; --leave keeps the files
# kendex writes uncommitted, for the user to review.
(cd -- "$folder" && vgs_tui_logged "$log" kendex add vanillagreencom/kendex --skill orch --yes --leave) ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=install-failed" \
    "kendex could not install its mail tool." "Check your internet connection, then try again." || exit
helper tool >/dev/null ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=still-missing" \
    "kendex finished, but Jarvis cannot find its mail tool in the home folder." || exit
vgs_tui_step "Agent fleet ready"
vgs_tui_success "Jarvis offers fleet requests once your Jarvis session reads this folder's mail."
