#!/usr/bin/env bash
# Attach to the daemon's existing private tmux session. The task id alone
# travels in argv; tmux owns the terminal's content and detach action.
set -Eeuo pipefail
[[ $# == 1 && $1 =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]] || {
  printf 'jarvis-task-view: arguments=id\n' >&2
  exit 2
}
# tmux(1): -S selects a full socket path; = requires an exact session name.
# https://man.openbsd.org/tmux#COMMANDS
exec tmux -S "${XDG_RUNTIME_DIR:?}/vgshell/jarvis/tmux.sock" attach-session -t "=jarvis-$1"
