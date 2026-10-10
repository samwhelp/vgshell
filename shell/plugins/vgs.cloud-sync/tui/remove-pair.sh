#!/usr/bin/env bash
# The vgs.cloud-sync `remove-pair` floating TUI: lists the folder pairs,
# asks which one to remove and to confirm, and hands it to the runner's
# `pair-remove`, which deletes no file. Keyed lines go to the Cloud Sync
# setup log; the screen shows a plain sentence.
#
#   remove-pair.sh
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/cloud-sync/setup.log"
runner="$VGS_PLUGIN_DIR/bin/cloud-sync"
mkdir -p -- "${log%/*}"
[[ $# == 0 ]] || vgs_tui_refuse "$log" 2 "cloud-sync: refused: arguments=none" "Open Remove a folder pair from the Cloud Sync page in Settings." || exit
vgs_tui_header "Remove a folder pair" "Cloud Sync stops syncing the folder pair. Its files stay on this computer and on Google Drive."
pairs="$(vgs_tui_logged "$log" "$runner" pairs --lines)" ||
  { vgs_tui_failed "$log" "VGS could not read the folder pairs."; exit 1; }
if [[ -z $pairs ]]; then
  vgs_tui_step "There are no folder pairs."
  exit 0
fi
# Each line is `<id>\t<label>`; gum shows the label and prints the id.
choices=""
while IFS=$'\t' read -r id label; do choices+="$label"$'\t'"$id"$'\n'; done <<<"$pairs"
id="$(vgs_tui_choose --label-delimiter=$'\t' --header "Select the folder pair to remove." <<<"${choices%$'\n'}")" || exit 130
[[ -n $id ]] || exit 130
status=0
vgs_tui_confirm "Remove this folder pair? Its files stay." || status=$?
case "$status" in
  0) ;;
  1) exit 0 ;;
  *) exit "$status" ;;
esac
vgs_tui_logged "$log" "$runner" pair-remove "$id" >>"$log" ||
  { vgs_tui_failed "$log" "VGS could not remove the folder pair."; exit 1; }
vgs_tui_success "Cloud Sync no longer syncs this folder pair. Its files stay."
