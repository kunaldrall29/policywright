#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/tools/freighter-extension"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Freighter CRX…"
curl -fsSL -A "Mozilla/5.0" \
  "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=133.0&acceptformat=crx3&x=id%3Dhcjhpkgbmechpabifbgiidnhoaiaphnd%26uc" \
  -o "$TMP/freighter.crx"

python3 - <<PY
import zipfile, pathlib, shutil, struct, sys
crx = pathlib.Path("$TMP/freighter.crx")
data = crx.read_bytes()
if data[:4] != b"Cr24":
    sys.exit("not a CRX3 file")
header_size = struct.unpack_from("<I", data, 8)[0]
zip_start = 12 + header_size
zip_path = pathlib.Path("$TMP/freighter.zip")
zip_path.write_bytes(data[zip_start:])
dest = pathlib.Path("$DEST")
if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)
with zipfile.ZipFile(zip_path) as zf:
    zf.extractall(dest)
print(f"Unpacked Freighter to {dest}")
print("Launch with: ./scripts/chrome-with-freighter.sh")
PY
