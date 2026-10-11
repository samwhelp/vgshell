#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"

# Another voxtype holds the place the core's own voxtype daemon needs. When
# the voxtype user unit runs, this screen turns it off and, when it is the
# user's own file, the one `voxtype setup systemd` writes, removes it; a
# unit a package installed is turned off and kept. voxtype-bin ships such a
# unit, so a loaded unit that does not run says nothing about the voxtype
# that does: then no unit or file changes, and the screen only reads
# whether a daemon still answers. The service has the core start its
# daemon again once the run ends with code 0. Refusals and failures, one
# keyed line on stderr first, exit 1:
#   vgs-voice: refused: unit=unread    systemctl cannot answer
#   vgs-voice: refused: unit=not-running load=<LoadState> active=<ActiveState> daemon=<alt|unread>
#                                      no unit runs it, and a daemon still
#                                      answers or cannot be read
#   vgs-voice: failed: disable=<unit>, remove=<path> or reload
unit="voxtype.service"
user_units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
vgs_tui_header "Stop the other voxtype" "VGS starts its own voxtype once the other one is stopped."

shown=""
if ! shown="$(systemctl --user show "$unit" --property=LoadState,ActiveState,FragmentPath)"; then
  printf 'vgs-voice: refused: unit=unread\n' >&2
  vgs_tui_error "VGS could not read your voxtype service."
  exit 1
fi
load=""
active=""
fragment=""
while IFS='=' read -r key value; do
  case "$key" in
    LoadState) load="$value" ;;
    ActiveState) active="$value" ;;
    FragmentPath) fragment="$value" ;;
  esac
done <<<"$shown"
service_runs=false
if [[ $load == loaded && -n $fragment ]]; then
  case "$active" in
    active | activating | reloading) service_runs=true ;;
  esac
fi

# `voxtype status --format json` prints one JSON object whose `alt` is
# `stopped` when no daemon runs, the word shell/Core/DictationModel.js
# reads too (voxtype src/app/status.rs:50-56). Its stderr is dropped so the
# keyed line stays first; a failed or unparsed read is daemon=unread.
if [[ $service_runs != true ]]; then
  daemon=unread
  alt_pattern='"alt"[[:space:]]*:[[:space:]]*"([^"]*)"'
  if read_status="$(voxtype status --format json 2>/dev/null)" && [[ $read_status =~ $alt_pattern ]]; then
    daemon="${BASH_REMATCH[1]}"
  fi
  if [[ $daemon == stopped ]]; then
    vgs_tui_success "The other voxtype is no longer running. VGS starts its own now."
    exit 0
  fi
  printf 'vgs-voice: refused: unit=not-running load=%s active=%s daemon=%s\n' "${load:-none}" "${active:-none}" "$daemon" >&2
  vgs_tui_error "The other voxtype was not started by its service, so VGS cannot stop it. Close it, then press Stop the other voxtype again."
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
  if ! rm -f -- "$fragment"; then
    printf 'vgs-voice: failed: remove=%s\n' "$fragment" >&2
    vgs_tui_error "VGS stopped the other voxtype but could not remove its service file."
    exit 1
  fi
  if ! systemctl --user daemon-reload; then
    printf 'vgs-voice: failed: reload\n' >&2
    vgs_tui_error "VGS stopped the other voxtype but could not reload your services."
    exit 1
  fi
fi
vgs_tui_success "The other voxtype is stopped. VGS starts its own now."
