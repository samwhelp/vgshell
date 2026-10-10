#!/usr/bin/env bash
# The core presents this script from a private copy of the whole plugin.
# No argument installs the tier setup-local picks for this computer; the
# Jarvis page's Local voice choice passes another tier, which setup-local
# judges.
set -euo pipefail
source "$VGS_TUI_LIB"
[[ $# -le 1 ]] || { printf 'jarvis-setup: arguments=at-most-one\n' >&2; exit 2; }
for tool in gum uv curl unshare python3; do
  command -v "$tool" >/dev/null || {
    printf 'jarvis-setup: command=missing name=%s\n' "$tool" >&2
    vgs_tui_error "Install requirements on the Jarvis page in Plugins before setting up local voice."
    exit 77
  }
done
if [[ $# == 0 ]]; then
  vgs_tui_header "Set up local voice" "Downloads the local voice model that runs best on this computer and a private Python runtime." \
    "You can choose another model under Local voice on the Jarvis page." "No microphone, speaker or system settings are opened."
else
  vgs_tui_header "Set up local voice" "Downloads the local voice model you chose on the Jarvis page and a private Python runtime." \
    "No microphone, speaker or system settings are opened."
fi
exec python3 -I "$VGS_PLUGIN_DIR/setup-local" install "$@"
