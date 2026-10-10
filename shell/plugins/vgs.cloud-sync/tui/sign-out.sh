#!/usr/bin/env bash
# Signs one direction out of Google Drive, which sign-out-drive.sh and
# sign-out-upload.sh run: after a yes, the runner's `sign-out` clears the
# direction's sign-in from the keyring. The client ID and secret and every
# file stay. Keyed lines go to the Cloud Sync setup log; the screen shows a
# plain sentence.
#
#   sign-out.sh pull|upload
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/cloud-sync/setup.log"
runner="$VGS_PLUGIN_DIR/bin/cloud-sync"
mkdir -p -- "${log%/*}"
case "${1:-}:$#" in
  pull:1) group="Download" long="Download: Google Drive to this computer" ;;
  upload:1) group="Upload" long="Upload: this computer to Google Drive" ;;
  *) vgs_tui_refuse "$log" 2 "cloud-sync: refused: direction=${1:-missing}" "Select Sign out in the Download or Upload group on the Cloud Sync page in Settings." || exit ;;
esac
direction="$1"
vgs_tui_header "Sign out of $group" "$long" "Cloud Sync stops syncing the $group folder pairs until you sign in again." \
  "Their files stay on this computer and on Google Drive."
status=0
vgs_tui_confirm "Sign out of Google Drive for $group?" || status=$?
case "$status" in
  0) ;;
  1) exit 0 ;;
  *) exit "$status" ;;
esac
logged="$(stat -c %s -- "$log" 2>/dev/null)" || logged=0
if vgs_tui_logged "$log" "$runner" sign-out "$direction" >>"$log"; then
  vgs_tui_success "Google Drive is signed out for $group."
  exit 0
fi
# The refusal this run logged, not an earlier run's.
refusal="$(tail -c "+$((logged + 1))" -- "$log" | grep '^cloud-sync: refused: ' | tail -n 1)" || refusal=""
case "$refusal" in
  *credential=locked*) vgs_tui_failed "$log" "Your keyring is locked. Unlock it, then try again." ;;
  *) vgs_tui_failed "$log" "VGS could not sign out of Google Drive." ;;
esac
exit 1
