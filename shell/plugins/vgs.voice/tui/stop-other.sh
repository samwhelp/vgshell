#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"

# A voxtype user unit holds the place the core's own voxtype daemon needs.
# This screen turns that unit off and, when it is the user's own file, the
# one `voxtype setup systemd` writes, removes it; a unit a package installed
# is turned off and kept. The service has the core start its daemon again
# once the run ends with code 0. Refusals, one keyed line on stderr first,
# exit 1, nothing changed: `vgs-voice: refused: unit=unread` when systemctl
# cannot answer, `vgs-voice: refused: unit=none load=<LoadState>` when no
# voxtype unit file is loaded.
unit="voxtype.service"
user_units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
vgs_tui_header "Stop the other voxtype" "VGS starts its own voxtype once the other one is stopped."

shown=""
if ! shown="$(systemctl --user show "$unit" --property=LoadState,FragmentPath)"; then
  printf 'vgs-voice: refused: unit=unread\n' >&2
  vgs_tui_error "VGS could not read your voxtype service."
  exit 1
fi
load=""
fragment=""
while IFS='=' read -r key value; do
  case "$key" in
    LoadState) load="$value" ;;
    FragmentPath) fragment="$value" ;;
  esac
done <<<"$shown"
if [[ $load != loaded || -z $fragment ]]; then
  printf 'vgs-voice: refused: unit=none load=%s\n' "${load:-none}" >&2
  vgs_tui_error "VGS found no voxtype service of yours to stop."
  exit 1
fi

# Only the file directly in the user's own unit directory is the user's to
# remove; any other path is a package's or an administrator's.
own=false
[[ ${fragment%/*} == "$user_units" ]] && own=true
if [[ $own == true ]]; then
  vgs_tui_step "Found your voxtype service at $fragment"
  printf '%s\n' "It is your own, so VGS turns it off and removes its file."
else
  vgs_tui_step "Found a voxtype service at $fragment"
  printf '%s\n' "It came with a package, so VGS turns it off and keeps its file."
fi

status=0
vgs_tui_confirm "Stop the other voxtype?" || status=$?
case "$status" in
  0) ;;
  1) exit 0 ;;
  *) exit "$status" ;;
esac

if ! systemctl --user disable --now "$unit"; then
  printf 'vgs-voice: failed: disable=%s\n' "$unit" >&2
  vgs_tui_error "VGS could not stop the other voxtype."
  exit 1
fi
if [[ $own == true ]]; then
  rm -f -- "$fragment"
  systemctl --user daemon-reload
fi
vgs_tui_success "The other voxtype is stopped. VGS starts its own now."
