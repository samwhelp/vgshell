#!/usr/bin/env bash
# Only a key's provider and name reach the shell: no step here reads a key.
# One question names the key. Every keyed line goes to the Jarvis setup log;
# the screen shows a plain sentence.
set -euo pipefail
# shellcheck source=/dev/null
source "$VGS_TUI_LIB"
log="${XDG_STATE_HOME:-$HOME/.local/state}/vgshell/jarvis/setup.log"
opened_elsewhere="Open Remove key from the Jarvis page in Settings."
[[ $# == 0 ]] || vgs_tui_refuse "$log" 2 "jarvis-keys: arguments=none" "$opened_elsewhere" || exit
keys() { vgs_tui_logged "$log" node "$VGS_PLUGIN_DIR/backend/keys.js" "$@"; }
vgs_tui_header "Remove an API key" "Deletes a key you stored for Jarvis from your desktop keyring." \
  "A conversation that is open now uses the key until it ends."
choices="$(keys stored "$(vgs_tui_columns)")" ||
  { vgs_tui_failed "$log" "Jarvis could not read your keys. Close this window and try again."; exit 1; }
[[ -n $choices ]] || { vgs_tui_warn "Jarvis has no stored key."; exit 0; }
chosen="$(vgs_tui_choose --label-delimiter=$'\t' --header "Select the key to remove." <<<"$choices")" || exit 130
IFS=$'\t' read -r provider account <<<"$chosen"
[[ -n $provider && -n $account ]] || exit 130
vgs_tui_confirm "Remove the key $provider / $account?" || { vgs_tui_cancelled "The key stays."; exit 130; }
result="$(keys remove-key "$provider" "$account")" ||
  { vgs_tui_failed "$log" "Jarvis could not remove the key." "Make sure that your keyring is unlocked, then try again."; exit 1; }
printf '%s\n' "$result" >>"$log"
if [[ $result == "jarvis-keys: removed=libsecret" ]]; then
  vgs_tui_success "The key is removed from your keyring."
else
  vgs_tui_success "Jarvis no longer uses the key. It stays in your keyring, where another app saved it."
fi
