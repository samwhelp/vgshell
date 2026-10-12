# Smoke rows write shell.json beside the watched path, then rename it, so
# Config.qml reads the old file or the new file whole.
set -euo pipefail
user_config_write() ( # COMMAND [ARG...]
  local destination="$home/.config/vgshell/shell.json" staged
  staged="$(mktemp "$home/.config/vgshell/.shell.json.XXXXXX")" || return
  trap 'rm -f -- "$staged"' EXIT
  "$@" >"$staged" || return
  if [[ -e $destination ]]; then
    chmod --reference="$destination" -- "$staged" || return
  fi
  mv -T -- "$staged" "$destination"
)
user_config_restore() { user_config_write cat -- "$1"; } # BACKUP
