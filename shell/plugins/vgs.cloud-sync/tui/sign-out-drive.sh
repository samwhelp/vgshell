#!/usr/bin/env bash
# The vgs.cloud-sync `sign-out-drive` floating TUI: signs the download
# client out of Google Drive (sign-out.sh).
set -euo pipefail
[[ $# == 0 ]] || { printf 'cloud-sync: refused: arguments=none\n' >&2; exit 2; }
exec "$VGS_PLUGIN_DIR/tui/sign-out.sh" pull
