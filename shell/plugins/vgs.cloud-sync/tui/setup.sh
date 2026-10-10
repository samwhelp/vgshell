#!/usr/bin/env bash
# The vgs.cloud-sync `setup` floating TUI: installs the hourly user timer
# and the service that the plugin's Sync now and the command line start,
# through the runner's `install`. Keyed lines go to the Cloud Sync setup
# log; the screen shows a plain sentence.
#
#   setup.sh
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/cloud-sync/setup.log"
runner="$VGS_PLUGIN_DIR/bin/cloud-sync"
mkdir -p -- "${log%/*}"
[[ $# == 0 ]] || vgs_tui_refuse "$log" 2 "cloud-sync: refused: arguments=none" "Open Set up Cloud Sync from the Cloud Sync page in Settings." || exit
vgs_tui_header "Set up Cloud Sync" "Cloud Sync runs every hour while you are logged in, also while VGS is closed."
vgs_tui_logged "$log" "$runner" install >>"$log" ||
  { vgs_tui_failed "$log" "VGS could not set up the hourly sync."; exit 1; }
vgs_tui_success "Cloud Sync runs every hour while you are logged in."
