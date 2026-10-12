#!/usr/bin/env bash
# The core presents this script from a private copy of the whole plugin.
# One question, then setup-local deletes the recording and marker while
# keeping the model for a later setup. A No says the recording stays and
# waits for a key.
set -euo pipefail
# The recording log and state directory hold a user's voice setup evidence.
umask 077
source "$VGS_TUI_LIB"
[[ $# == 0 ]] || { printf 'jarvis-clone: arguments=none\n' >&2; exit 2; }
state="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/jarvis"
log="$state/clone-voice.log"
mkdir -p -- "$state"
: >"$log"
details() {
  vgs_tui_error "The details are in ${log/#"$HOME"/\~}."
}
vgs_tui_header "Remove recording" "Deletes the recording Jarvis's cloned voice speaks in." \
  "The model stays on this computer for a later setup."
vgs_tui_confirm "Remove the recording?" || { vgs_tui_cancelled "The recording stays."; exit 130; }
if ! vgs_tui_split "$log" jarvis-setup python3 -I "$VGS_PLUGIN_DIR/setup-local" clone remove; then
  details
  exit 1
fi
vgs_tui_success "The recording is removed. Cloned voice turns off when you close this window."
