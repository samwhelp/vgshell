#!/usr/bin/env bash
# Opens AGENTS.md of the home the daemon judged ready, whose path the service
# answers, with its default application. The presentation is plain, so a
# failure holds the window on the library's own close prompt.
set -Eeuo pipefail
source "$VGS_TUI_LIB"
trap 'status=$?; [[ $status == 0 ]] || vgs_tui_close_prompt "$status"' EXIT
file="$(vgshell ipc call vgs.jarvis invoke personality-file '')" || exit 1
[[ $file == /* ]] || { vgs_tui_error "Jarvis has no home folder. Choose a home folder first in Settings > Jarvis > Home folder."; exit 1; }
gio open "$file" 2>/dev/null || {
  vgs_tui_error "No application opens AGENTS.md. Choose a default application for text files in your desktop settings, then press Edit again."
  exit 1
}
