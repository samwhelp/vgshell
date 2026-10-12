#!/usr/bin/env bash
# The core presents this script from a private copy of the whole plugin.
# One question, then setup-local deletes the recording and its marker.
set -euo pipefail
source "$VGS_TUI_LIB"
[[ $# == 0 ]] || { printf 'jarvis-clone: arguments=none\n' >&2; exit 2; }
vgs_tui_header "Remove recording" "Deletes the recording Jarvis's cloned voice speaks in." \
  "The model stays on this computer for a later setup."
vgs_tui_confirm "Remove the recording?" || { printf 'The recording stays.\n'; exit 130; }
python3 -I "$VGS_PLUGIN_DIR/setup-local" clone remove
vgs_tui_success "The recording is removed. Jarvis speaks in the local voice model's voice."
