#!/usr/bin/env bash
# Playback stays with the daemon and its Session. This screen asks first
# when the preview uses a provider key, then only asks the daemon to speak.
set -euo pipefail
source "$VGS_TUI_LIB"
vgs_tui_header "Preview voice" "Jarvis says one sentence in the voice chosen under Voice in Settings > Jarvis."
# Each refusal the service answers (Service.qml previewVoice), with its cause
# and the next step.
refused() {
  case $1 in
    "refused: preview=muted") vgs_tui_error "Jarvis is muted. Unmute Jarvis, then try again." ;;
    "refused: preview=busy") vgs_tui_error "Jarvis is listening, thinking or speaking. Try again when it is quiet." ;;
    "refused: preview=down") vgs_tui_error "Jarvis is not ready to speak. Finish the steps under Setup in Settings > Jarvis." ;;
    *) vgs_tui_error "Jarvis is not running. Check Settings > Jarvis." ;;
  esac
  exit 1
}
kind="$(vgshell ipc call vgs.jarvis invoke preview-voice kind)" || exit 1
case $kind in
  local) ;;
  cloud) vgs_tui_confirm "This preview uses your OpenAI key and may cost money. Play it?" || exit 0 ;;
  *) refused "$kind" ;;
esac
answer="$(vgshell ipc call vgs.jarvis invoke preview-voice play)" || exit 1
[[ $answer == ok ]] || refused "$answer"
vgs_tui_success "Jarvis received the preview request."
