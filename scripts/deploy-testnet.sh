#!/usr/bin/env bash
# Deploy the frequency-limit policy contract to Stellar TESTNET.
#
# Builds the wasm with stellar-cli (wasm32v1-none), uploads it, deploys an
# instance, then fetches the on-chain wasm back and verifies its SHA-256
# equals the locally built wasm's hash. Prints the contract ID, wasm hash, and
# transaction hashes, and appends them to evidence/EVIDENCE.md.
#
# Identity comes from the gitignored .env (STELLAR_SECRET_KEY). The secret is
# exported as STELLAR_ACCOUNT for stellar-cli (which accepts a raw secret key
# and signs with it) and is never printed.
#
# TESTNET ONLY. The generated contract is illustrative and unaudited — not
# for production deployment until the Audit Bank audit.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "error: .env not found — create it with STELLAR_SECRET_KEY=<testnet secret>" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
: "${STELLAR_SECRET_KEY:?error: STELLAR_SECRET_KEY missing from .env}"

NETWORK="${STELLAR_NETWORK:-testnet}"
if [[ "$NETWORK" != "testnet" ]]; then
  echo "error: this script deploys to testnet only (STELLAR_NETWORK=$NETWORK)" >&2
  exit 1
fi

export STELLAR_ACCOUNT="$STELLAR_SECRET_KEY"
# A named --network and STELLAR_RPC_URL are mutually exclusive in stellar-cli;
# the named network supplies both RPC URL and passphrase.
unset STELLAR_RPC_URL STELLAR_NETWORK STELLAR_NETWORK_PASSPHRASE
# The contracts workspace pins its toolchain via rust-toolchain.toml; make
# sure the rustup shims (which honor that pin) win over any Homebrew rust.
export PATH="$HOME/.cargo/bin:$PATH"

echo "==> deploy identity: ${STELLAR_PUBLIC_KEY:-<unknown public key>} (testnet)"

echo "==> building via stellar-cli (from clean, per the FACTS.md §1.5 reproducibility procedure)"
# rm -rf instead of cargo clean: this volume writes macOS AppleDouble ._*
# sidecar files that break cargo clean and the CLI's *.wasm glob.
(cd contracts && rm -rf target && stellar contract build --package frequency-limit-policy)
find contracts/target -name '._*' -delete 2>/dev/null || true
WASM=contracts/target/wasm32v1-none/release/frequency_limit_policy.wasm
LOCAL_SHA=$(shasum -a 256 "$WASM" | cut -d' ' -f1)
echo "==> local wasm sha256: $LOCAL_SHA"

UP_ERR=$(mktemp)
DEP_ERR=$(mktemp)
FETCHED=$(mktemp)
trap 'rm -f "$UP_ERR" "$DEP_ERR" "$FETCHED"' EXIT

echo "==> uploading wasm"
if ! WASM_HASH=$(stellar contract upload --wasm "$WASM" --network "$NETWORK" 2>"$UP_ERR"); then
  cat "$UP_ERR" >&2
  exit 1
fi
cat "$UP_ERR" >&2
# stellar-cli 27.1.0 prints the submitted tx as an explorer link on stderr
# ("🔗 https://stellar.expert/explorer/testnet/tx/<hex>"). Absent when the
# wasm was already installed (upload is idempotent).
UPLOAD_TX=$(grep -Eo 'explorer/testnet/tx/[0-9a-f]{64}' "$UP_ERR" | tail -1 | sed 's|.*/||' || true)

if [[ "$WASM_HASH" != "$LOCAL_SHA" ]]; then
  echo "error: uploaded wasm hash $WASM_HASH != local sha256 $LOCAL_SHA" >&2
  exit 1
fi

echo "==> deploying instance"
if ! CONTRACT_ID=$(stellar contract deploy --wasm-hash "$WASM_HASH" --network "$NETWORK" \
  --alias frequency-limit-policy 2>"$DEP_ERR"); then
  cat "$DEP_ERR" >&2
  exit 1
fi
cat "$DEP_ERR" >&2
DEPLOY_TX=$(grep -Eo 'explorer/testnet/tx/[0-9a-f]{64}' "$DEP_ERR" | tail -1 | sed 's|.*/||')

echo "==> fetching on-chain wasm for $CONTRACT_ID"
stellar contract fetch --id "$CONTRACT_ID" --network "$NETWORK" -o "$FETCHED"
ONCHAIN_SHA=$(shasum -a 256 "$FETCHED" | cut -d' ' -f1)

if [[ "$ONCHAIN_SHA" != "$LOCAL_SHA" ]]; then
  echo "error: on-chain wasm sha256 $ONCHAIN_SHA != local sha256 $LOCAL_SHA" >&2
  exit 1
fi

DATE_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EVIDENCE=evidence/EVIDENCE.md
if ! grep -q '^## Deployment log' "$EVIDENCE"; then
  {
    echo ''
    echo '## Deployment log'
    echo ''
    echo 'Auto-appended by [scripts/deploy-testnet.sh](../scripts/deploy-testnet.sh);'
    echo 'every row is re-checkable against the testnet explorer links.'
  } >>"$EVIDENCE"
fi
{
  echo ''
  echo "### $DATE_UTC — frequency-limit-policy"
  echo ''
  echo "| Item | Value |"
  echo "| --- | --- |"
  echo "| Contract ID | [\`$CONTRACT_ID\`](https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID) |"
  echo "| Wasm hash (= local sha256, = on-chain sha256) | \`$WASM_HASH\` |"
  echo "| Upload tx | ${UPLOAD_TX:+[\`$UPLOAD_TX\`](https://stellar.expert/explorer/testnet/tx/$UPLOAD_TX)}${UPLOAD_TX:-(wasm already on-chain; no upload tx)} |"
  echo "| Deploy tx | [\`$DEPLOY_TX\`](https://stellar.expert/explorer/testnet/tx/$DEPLOY_TX) |"
  echo "| Deployer | \`${STELLAR_PUBLIC_KEY:-unknown}\` |"
} >>"$EVIDENCE"

echo ''
echo '================ DEPLOYED ================'
echo "contract id : $CONTRACT_ID"
echo "wasm hash   : $WASM_HASH"
echo "upload tx   : ${UPLOAD_TX:-(wasm already on-chain; no upload tx)}"
echo "deploy tx   : $DEPLOY_TX"
echo "verified    : on-chain wasm sha256 == local wasm sha256"
echo "evidence    : appended to $EVIDENCE"
