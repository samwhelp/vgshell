#!/usr/bin/env bash
# The vgs.cloud-sync `add-pair` floating TUI: asks for a folder pair's
# name, direction, Google Drive folder and folder on this computer, and
# hands it to the runner's `pair-add`, which judges it. Keyed lines go to
# the Cloud Sync setup log; the screen shows a plain sentence.
#
#   add-pair.sh
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/cloud-sync/setup.log"
runner="$VGS_PLUGIN_DIR/bin/cloud-sync"
mkdir -p -- "${log%/*}"
[[ $# == 0 ]] || vgs_tui_refuse "$log" 2 "cloud-sync: refused: arguments=none" "Open Add a folder pair from the Cloud Sync page in Settings." || exit

# A JSON string of $1: a backslash and a quote escaped. A control
# character stays, and the runner refuses the definition.
json_string() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; }
# The pair's id from its name: lower case letters and digits, each other
# run as one dash, at most 32 characters (the runner's id rule).
pair_id() {
  local s="${1,,}"
  s="${s//[^abcdefghijklmnopqrstuvwxyz0123456789]/-}"
  while [[ $s == *--* ]]; do s="${s//--/-}"; done
  s="${s#-}"
  s="${s:0:32}"
  s="${s%-}"
  printf '%s' "${s:-pair}"
}

vgs_tui_header "Add a folder pair" "Cloud Sync keeps a Google Drive folder and a folder on this computer in step." \
  "It only adds and updates files. It never deletes a file."
label="$(vgs_tui_input --header "A name for this folder pair. The bar shows it." --placeholder "for example Documents")" || exit 130
[[ -n $label ]] || exit 130
direction="$(vgs_tui_choose --label-delimiter=$'\t' --header "Select the direction." \
  <<<$'Download from Google Drive to this computer\tpull\nUpload from this computer to Google Drive\tupload')" || exit 130
[[ -n $direction ]] || exit 130
remote="$(vgs_tui_input --header "The Google Drive folder, from the top of your Drive." --placeholder "for example Documents/Taxes")" || exit 130
[[ -n $remote ]] || exit 130
local_dir="$(vgs_tui_input --header "The folder on this computer, as a full path." --value "$HOME/")" || exit 130
[[ -n $local_dir ]] || exit 130
remote="${remote#/}"
remote="${remote%/}"
local_dir="${local_dir%/}"
definition="{\"id\":$(json_string "$(pair_id "$label")"),\"label\":$(json_string "$label"),\"direction\":$(json_string "$direction"),\"remote\":$(json_string "$remote"),\"local\":$(json_string "$local_dir")}"
logged="$(stat -c %s -- "$log" 2>/dev/null)" || logged=0
if vgs_tui_logged "$log" "$runner" pair-add --definition "$definition" >>"$log"; then
  vgs_tui_success "Cloud Sync added $label. It syncs at the next hourly run, or when you select Sync now."
  exit 0
fi
# The refusal this run logged, not an earlier run's.
refusal="$(tail -c "+$((logged + 1))" -- "$log" | grep '^cloud-sync: refused: ' | tail -n 1)" || refusal=""
case "$refusal" in
  *rule=home-or-above*) sentence="Choose a folder inside your home folder, not your home folder itself." ;;
  *rule=repository-root*) sentence="Choose a folder that is not a Git repository." ;;
  *rule=drive-root*) sentence="Choose a Google Drive folder, not the whole Drive." ;;
  *rule=local-overlap* | *rule=remote-overlap*) sentence="This folder overlaps a folder of another folder pair." ;;
  *rule=state-overlap*) sentence="Choose a folder outside the folder where Cloud Sync keeps its records." ;;
  *rule=remote) sentence="Enter the Google Drive folder as a path, such as Documents/Taxes." ;;
  *rule=local) sentence="Enter the folder on this computer as a full path, such as $HOME/Documents." ;;
  *rule=duplicate-id*) sentence="A folder pair with this name exists. Choose another name." ;;
  *rule=label*) sentence="Enter a name of 1 to 64 characters." ;;
  *) sentence="VGS could not add the folder pair." ;;
esac
vgs_tui_failed "$log" "$sentence"
exit 1
