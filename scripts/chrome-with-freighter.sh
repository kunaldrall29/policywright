#!/usr/bin/env bash
# Launch Chrome with Freighter for the policywright demo.
#
# Chrome ≥137 disables --load-extension on branded Stable. Prefer BiDi install:
#   python3 scripts/install-freighter-via-bidi.py
# This script still launches Stable with the demo profile; if Freighter is not
# present, it prints the BiDi installer hint.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/tools/freighter-extension"
PROFILE="${CHROME_PROFILE:-$HOME/.config/google-chrome-policywright}"
BIN="${CHROME_BIN:-/usr/bin/google-chrome-stable}"
mkdir -p "$PROFILE"
if [[ ! -f "$EXT/manifest.json" ]]; then
  echo "Freighter not found at $EXT — run ./scripts/install-freighter-extension.sh first" >&2
  exit 1
fi
echo "Note: on Chrome Stable 148+, use scripts/install-freighter-via-bidi.py to load Freighter." >&2
echo "Opening Chrome with profile $PROFILE …" >&2
exec "$BIN" \
  --no-sandbox \
  --test-type \
  --disable-dev-shm-usage \
  --use-gl=angle \
  --use-angle=swiftshader-webgl \
  --password-store=basic \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-port="${REMOTE_DEBUGGING_PORT:-9222}" \
  --user-data-dir="$PROFILE" \
  --enable-unsafe-extension-debugging \
  "$@"
