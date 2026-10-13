#!/usr/bin/env bash
# Capture stays with the daemon and its indicator. This action only asks it to start.
set -euo pipefail
source "$VGS_TUI_LIB"
vgs_tui_header "Check microphone" "Say Hey Jarvis. The microphone opens for three seconds." \
  "The result appears under Voice in Settings > Jarvis."
answer="$(vgshell ipc call vgs.jarvis invoke check-microphone '')" || exit 1
[[ $answer == ok ]] || { vgs_tui_error "Jarvis cannot check the microphone now. Press Check microphone on the Setup tab of the Jarvis page again."; exit 1; }
