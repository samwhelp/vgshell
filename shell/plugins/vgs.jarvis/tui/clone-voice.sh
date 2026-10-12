#!/usr/bin/env bash
# The core presents this script from a private copy of the whole plugin.
# Consent comes first: the publisher's use text, then two questions, and
# any answer but two yeses ends the script before a download or a file.
# Then setup-local fetches the model, pw-record captures a bounded
# reference and setup-local stores it, checks it and publishes it.
set -euo pipefail
source "$VGS_TUI_LIB"
[[ $# == 0 ]] || { printf 'jarvis-clone: arguments=none\n' >&2; exit 2; }
# The recording's length, inside setup-local's bounds of 5 to 15 s.
seconds=10
declined() {
  printf 'Nothing was downloaded or stored.\n'
  exit 130
}
vgs_tui_header "Set up cloned voice" \
  "Jarvis will speak in a voice recorded on this computer, with Chatterbox Turbo by Resemble AI. The model and the recording stay on this computer." \
  "Resemble AI's model card says:" \
  "Don't use this model to do bad things. Prompts are sourced from freely available data on the internet."
vgs_tui_confirm "Have you read Resemble AI's text above?" || declined
vgs_tui_confirm "Is the voice you will record your own, or do you have the speaker's permission?" || declined
vgs_tui_step "Downloading the model"
python3 -I "$VGS_PLUGIN_DIR/setup-local" clone install
vgs_tui_step "Recording"
printf 'Recording runs for %s seconds. Read this aloud in your normal voice:\n\n' "$seconds"
printf '  "The quick brown fox jumps over the lazy dog. I am recording my voice so that Jarvis can speak with it on this computer."\n'
vgs_tui_confirm "Start recording?" || { printf 'The model stays for a later setup. No recording was stored.\n'; exit 130; }
capture() {
  local status=0
  timeout --signal=INT "$seconds" pw-record --raw --rate 24000 --channels 1 --format s16 - || status=$?
  # timeout answers 124 when the bound ends the recording, as it should.
  [[ $status == 0 || $status == 124 ]]
}
capture | python3 -I "$VGS_PLUGIN_DIR/setup-local" clone record
vgs_tui_success "The cloned voice is ready. Turn on Cloned voice under Local voice on the Jarvis page."
