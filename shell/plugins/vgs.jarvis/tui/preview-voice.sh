#!/usr/bin/env bash
# Playback stays with the daemon and its Session. This screen asks first
# when the preview uses a provider key, then only asks the daemon to speak.
set -euo pipefail
source "$VGS_TUI_LIB"
vgs_tui_header "Preview voice" "Jarvis says one sentence in the voice chosen under Voice in Settings > Jarvis."
kind="$(vgshell ipc call vgs.jarvis invoke preview-voice kind)" || exit 1
case $kind in
  local) ;;
  cloud) vgs_tui_confirm "This preview uses your OpenAI key and may cost money. Play it?" || exit 0 ;;
  *) vgs_tui_error "Jarvis cannot play a preview now. Wait until Jarvis is not listening or speaking, then try again."; exit 1 ;;
esac
answer="$(vgshell ipc call vgs.jarvis invoke preview-voice play)" || exit 1
[[ $answer == ok ]] || { vgs_tui_error "Jarvis cannot play a preview now. Wait until Jarvis is not listening or speaking, then try again."; exit 1; }
vgs_tui_success "Jarvis is speaking the preview."
