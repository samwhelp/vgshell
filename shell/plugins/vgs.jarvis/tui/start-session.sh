#!/usr/bin/env bash
# The Jarvis session row's Start and Retry: asks the service, which asks the
# Jarvis package in the home folder to start the session. The presentation
# is plain, so a failure holds the window on the library's own close prompt.
set -Eeuo pipefail
source "$VGS_TUI_LIB"
trap 'status=$?; [[ $status == 0 ]] || vgs_tui_close_prompt "$status"' EXIT
answer="$(vgshell ipc call vgs.jarvis invoke start-session '')" || exit 1
[[ $answer == ok ]] || { vgs_tui_error "Jarvis is not running. Check Settings > Jarvis."; exit 1; }
