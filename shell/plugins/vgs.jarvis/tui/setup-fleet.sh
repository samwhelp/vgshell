#!/usr/bin/env bash
# The core opens this script from the plugin's published snapshot, from the
# Agent fleet row's Install mail tool, once gum, node, git and kendex are found.
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
    "Open Install mail tool from the Jarvis page in Settings." || exit
lib="$VGS_TUI_LIB"
tree="${lib%/bin/lib/tui.sh}"
[[ $tree != "$lib" && -n ${VGS_PLUGIN_ID:-} && -n ${VGS_PLUGIN_DIR:-} ]] ||
  vgs_tui_refuse "$log" 2 "jarvis: fleet-setup=tui=missing" \
    "Open Install mail tool from the Jarvis page in Settings." || exit
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
    "Choose a home folder in Settings > Jarvis > Home folder, then try again." || exit
if helper tool >/dev/null; then
  vgs_tui_step "The kendex mail tool is already in the home folder"
  exit 0
fi
[[ -d $folder ]] ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=home-absent" \
    "The home folder is not there. Turn Jarvis on so it makes the folder, then try again." || exit

vgs_tui_confirm "Set up this home folder and install the kendex mail tool?" || exit 130
helper manual ||
  vgs_tui_refuse "$log" 1 "jarvis: fleet-setup=install-failed" \
    "VGS could not install the mail tool." "Check the setup log, then try again." || exit
vgs_tui_step "Agent fleet ready"
vgs_tui_success "Jarvis offers fleet requests once your Jarvis session reads this folder's mail."
