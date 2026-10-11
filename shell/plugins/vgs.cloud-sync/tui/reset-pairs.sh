#!/usr/bin/env bash
# The vgs.cloud-sync `reset-pairs` floating TUI: after a yes, keeps a
# damaged folder pair list beside a new empty list through the runner's
# `pairs-reset`. Keyed lines go to the Cloud Sync setup log; the screen
# shows a plain sentence.
#
#   reset-pairs.sh
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/cloud-sync/setup.log"
runner="$VGS_PLUGIN_DIR/bin/cloud-sync"
mkdir -p -- "${log%/*}"
[[ $# == 0 ]] || vgs_tui_refuse "$log" 2 "cloud-sync: refused: arguments=none" "Open Start the folder pair list again from the Cloud Sync page in Settings." || exit

vgs_tui_header "Start the folder pair list again" "VGS keeps the damaged folder pair list beside a new empty list." \
  "No folder or synced file is deleted. Add the folder pairs again after."
status=0
vgs_tui_confirm "Start the folder pair list again?" || status=$?
case "$status" in
  0) ;;
  1) exit 0 ;;
  *) exit "$status" ;;
esac

logged="$(stat -c %s -- "$log" 2>/dev/null)" || logged=0
answer=""
if answer="$(vgs_tui_logged "$log" "$runner" pairs-reset)"; then
  kept="${answer#reset=}"
  [[ $kept != "$answer" && -n $kept ]] || kept="the damaged file"
  vgs_tui_success "Cloud Sync kept $kept and started an empty folder pair list."
  exit 0
fi
refusal="$(tail -c "+$((logged + 1))" -- "$log" | grep '^cloud-sync: refused: ' | tail -n 1)" || refusal=""
case "$refusal" in
  *"pairs=valid"*) vgs_tui_success "The folder pair list reads correctly. Nothing changed." ;;
  *) vgs_tui_failed "$log" "VGS could not start the folder pair list again."; exit 1 ;;
esac
