#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/tools/freighter-extension"
PROFILE="${FREIGHTER_PROFILE:-$HOME/.config/policywright-chrome-freighter}"
mkdir -p "$PROFILE"
exec google-chrome \
  --user-data-dir="$PROFILE" \
  --disable-extensions-except="$EXT" \
  --load-extension="$EXT" \
  --no-first-run \
  --no-default-browser-check \
  "$@"
