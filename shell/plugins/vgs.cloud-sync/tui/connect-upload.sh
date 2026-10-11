#!/usr/bin/env bash
# The vgs.cloud-sync `connect-upload` floating TUI: the consent for the
# upload folder's own client (connect.sh).
set -euo pipefail
[[ $# == 0 ]] || { printf 'cloud-sync: refused: arguments=none\n' >&2; exit 2; }
exec "$VGS_PLUGIN_DIR/tui/connect.sh" upload
