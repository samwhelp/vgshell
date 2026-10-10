#!/usr/bin/env bash
# Google's consent for one direction's OAuth client, which connect-drive.sh
# and connect-upload.sh run: the runner's `authorize` opens Google's page
# in the browser through rclone and stores the token it returns in the
# keyring. The token never reaches this script, the screen or the log.
# Keyed lines go to the Cloud Sync setup log; the screen shows a plain
# sentence.
#
#   connect.sh pull|upload
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/cloud-sync/setup.log"
runner="$VGS_PLUGIN_DIR/bin/cloud-sync"
mkdir -p -- "${log%/*}"
case "${1:-}:$#" in
  pull:1) what="downloads" ;;
  upload:1) what="the upload folder" ;;
  *) vgs_tui_refuse "$log" 2 "cloud-sync: refused: direction=${1:-missing}" "Open Connect Google Drive from the Cloud Sync page in Settings." || exit ;;
esac
direction="$1"
vgs_tui_header "Connect Google Drive" "Sign in to Google in your browser and allow access for $what." \
  "The sign-in stays in your desktop keyring. VGS does not show it."
vgs_tui_step "Google opens in your browser. Come back here when the browser says that you can close it."
logged="$(stat -c %s -- "$log" 2>/dev/null)" || logged=0
if vgs_tui_logged "$log" "$runner" authorize "$direction" >>"$log"; then
  vgs_tui_success "Google Drive is connected for $what."
  exit 0
fi
# The refusal this run logged, not an earlier run's.
refusal="$(tail -c "+$((logged + 1))" -- "$log" | grep '^cloud-sync: refused: ' | tail -n 1)" || refusal=""
case "$refusal" in
  *"credential=absent account=$direction-client-"*)
    vgs_tui_failed "$log" "Add the client ID and the client secret for $what under Setup first." ;;
  *credential=locked*) vgs_tui_failed "$log" "Your keyring is locked. Unlock it, then try again." ;;
  *authorize=no-token*) vgs_tui_failed "$log" "Google did not send a sign-in. Try again, and allow access in the browser." ;;
  *) vgs_tui_failed "$log" "VGS could not connect Google Drive." ;;
esac
exit 1
