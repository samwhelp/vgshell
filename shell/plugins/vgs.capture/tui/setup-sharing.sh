#!/usr/bin/env bash
# Explicit Settings action. A service probe must never run this write/restart.
# The picker's keyed causes go to the capture setup log; the screen shows a
# plain sentence.
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
[[ $# == 0 ]] || exit 2
lib="$VGS_TUI_LIB"
tree="${lib%/bin/lib/tui.sh}"
[[ $tree != "$lib" && -n ${VGS_PLUGIN_ID:-} ]] || exit 2
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/capture/setup.log"
vgs_tui_lock capture-sharing
vgs_tui_header "Set up screen sharing" "Applies the VGS picker to screen sharing requests."
vgs_tui_warn "A running screen share stops when setup applies the picker."
vgs_tui_confirm "Apply the VGS picker?" || exit 130
result=0
# On 73 the picker's stdout is its refusal and the step that fixes it.
said="$(vgs_tui_logged "$log" "$tree/bin/vgshell-share-picker" --configure)" || result=$?
case "$result" in
  0) vgs_tui_step "The VGS screen sharing picker is ready." ;;
  73) vgs_tui_error "$said" ;;
  75) vgs_tui_warn "Setup could not apply the picker to the running portal. The picker takes effect at the next portal start." ;;
  *) vgs_tui_failed "$log" "Screen sharing setup failed. Select Set up screen sharing on the Capture page to try again." ;;
esac
exit "$result"
