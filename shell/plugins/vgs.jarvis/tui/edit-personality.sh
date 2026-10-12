#!/usr/bin/env bash
# The service opens AGENTS.md of the home the daemon judged ready with gio;
# this screen only asks it to.
set -euo pipefail
source "$VGS_TUI_LIB"
answer="$(vgshell ipc call vgs.jarvis invoke edit-personality '')" || exit 1
[[ $answer == ok ]] || { vgs_tui_error "Jarvis cannot open AGENTS.md. Choose a home folder first in Settings > Jarvis > Home folder."; exit 1; }
