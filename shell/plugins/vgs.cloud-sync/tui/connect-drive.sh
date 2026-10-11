#!/usr/bin/env bash
# The vgs.cloud-sync `connect-drive` floating TUI: the consent for the
# download client (connect.sh).
set -euo pipefail
[[ $# == 0 ]] || { printf 'cloud-sync: refused: arguments=none\n' >&2; exit 2; }
exec "$VGS_PLUGIN_DIR/tui/connect.sh" pull
