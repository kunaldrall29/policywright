#!/usr/bin/env bash
# Deploy bare-token + sample-vault to testnet and run deposit → withdraw.
# Captures tx hashes for the policywright pipeline (Phase 4 S2).
#
# Requires: stellar 27.1.0, .env with STELLAR_SECRET_KEY / STELLAR_PUBLIC_KEY.
# NEVER prints secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VAULT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "error: .env missing" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
: "${STELLAR_SECRET_KEY:?}"
: "${STELLAR_PUBLIC_KEY:?}"

export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
export STELLAR_ACCOUNT="$STELLAR_SECRET_KEY"
unset STELLAR_RPC_URL STELLAR_NETWORK STELLAR_NETWORK_PASSPHRASE
NETWORK=testnet
SOURCE="$STELLAR_PUBLIC_KEY"

OUT_DIR="$VAULT_DIR/out"
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/flow.log"
: >"$LOG"

echo "==> identity: $SOURCE (testnet)" | tee -a "$LOG"

echo "==> build" | tee -a "$LOG"
(cd "$VAULT_DIR" && stellar contract build) | tee -a "$LOG"

TOKEN_WASM="$VAULT_DIR/target/wasm32v1-none/release/bare_token.wasm"
VAULT_WASM="$VAULT_DIR/target/wasm32v1-none/release/sample_vault.wasm"

upload() {
  local wasm=$1
  local err
  err=$(mktemp)
  local hash
  # Signing via STELLAR_ACCOUNT=secret (same as scripts/deploy-testnet.sh).
  if ! hash=$(stellar contract upload --wasm "$wasm" --network "$NETWORK" 2>"$err"); then
    cat "$err" >&2
    rm -f "$err"
    exit 1
  fi
  hash=$(echo "$hash" | tr -d '[:space:]' | grep -Eo '[0-9a-f]{64}' | tail -1)
  cat "$err" >>"$LOG" || true
  rm -f "$err"
  echo "$hash"
}

echo "==> upload bare-token" | tee -a "$LOG"
TOKEN_HASH=$(upload "$TOKEN_WASM")
echo "token wasm hash: $TOKEN_HASH" | tee -a "$LOG"

echo "==> upload vault" | tee -a "$LOG"
VAULT_HASH=$(upload "$VAULT_WASM")
echo "vault wasm hash: $VAULT_HASH" | tee -a "$LOG"

deploy_err() {
  local label=$1
  shift
  local err
  err=$(mktemp)
  local id
  if ! id=$(stellar contract deploy --network "$NETWORK" "$@" 2>"$err"); then
    echo "deploy $label failed:" >&2
    cat "$err" >&2
    rm -f "$err"
    exit 1
  fi
  id=$(echo "$id" | tr -d '[:space:]' | grep -Eo 'C[A-Z0-9]{55}' | tail -1)
  local tx
  tx=$(grep -Eo 'explorer/testnet/tx/[0-9a-f]{64}' "$err" | tail -1 | sed 's|.*/||' || true)
  cat "$err" >>"$LOG" || true
  rm -f "$err"
  echo "$id|$tx"
}

echo "==> deploy bare-token (admin=$SOURCE)" | tee -a "$LOG"
TOKEN_DEPLOY=$(deploy_err token --wasm-hash "$TOKEN_HASH" -- \
  --admin "$SOURCE")
TOKEN_ID=${TOKEN_DEPLOY%%|*}
TOKEN_DEPLOY_TX=${TOKEN_DEPLOY#*|}
echo "TOKEN_ID=$TOKEN_ID" | tee -a "$LOG"
echo "TOKEN_DEPLOY_TX=$TOKEN_DEPLOY_TX" | tee -a "$LOG"

echo "==> deploy vault (token=$TOKEN_ID)" | tee -a "$LOG"
VAULT_DEPLOY=$(deploy_err vault --wasm-hash "$VAULT_HASH" -- \
  --token "$TOKEN_ID")
VAULT_ID=${VAULT_DEPLOY%%|*}
VAULT_DEPLOY_TX=${VAULT_DEPLOY#*|}
echo "VAULT_ID=$VAULT_ID" | tee -a "$LOG"
echo "VAULT_DEPLOY_TX=$VAULT_DEPLOY_TX" | tee -a "$LOG"

invoke_tx() {
  local err
  err=$(mktemp)
  local out
  if ! out=$(stellar contract invoke --network "$NETWORK" --send=yes "$@" 2>"$err"); then
    echo "invoke failed: $*" >&2
    cat "$err" >&2
    rm -f "$err"
    exit 1
  fi
  local tx
  tx=$(grep -Eo 'explorer/testnet/tx/[0-9a-f]{64}' "$err" | tail -1 | sed 's|.*/||' || true)
  if [[ -z "$tx" ]]; then
    tx=$(grep -Eoi '[0-9a-f]{64}' "$err" | tail -1 || true)
  fi
  cat "$err" >>"$LOG" || true
  echo "$out" >>"$LOG" || true
  rm -f "$err"
  echo "$tx"
}

AMOUNT=10000000  # 1.0 with 7-decimal fallback display

echo "==> mint $AMOUNT to $SOURCE" | tee -a "$LOG"
MINT_TX=$(invoke_tx --id "$TOKEN_ID" -- mint --to "$SOURCE" --amount "$AMOUNT")
echo "MINT_TX=$MINT_TX" | tee -a "$LOG"

echo "==> deposit $AMOUNT into vault" | tee -a "$LOG"
DEPOSIT_TX=$(invoke_tx --id "$VAULT_ID" -- deposit --from "$SOURCE" --amount "$AMOUNT")
echo "DEPOSIT_TX=$DEPOSIT_TX" | tee -a "$LOG"

WITHDRAW_AMT=4000000
echo "==> withdraw $WITHDRAW_AMT from vault" | tee -a "$LOG"
WITHDRAW_TX=$(invoke_tx --id "$VAULT_ID" -- withdraw --to "$SOURCE" --amount "$WITHDRAW_AMT")
echo "WITHDRAW_TX=$WITHDRAW_TX" | tee -a "$LOG"

cat >"$OUT_DIR/addresses.env" <<EOF
TOKEN_ID=$TOKEN_ID
VAULT_ID=$VAULT_ID
TOKEN_DEPLOY_TX=$TOKEN_DEPLOY_TX
VAULT_DEPLOY_TX=$VAULT_DEPLOY_TX
MINT_TX=$MINT_TX
DEPOSIT_TX=$DEPOSIT_TX
WITHDRAW_TX=$WITHDRAW_TX
ACCOUNT=$SOURCE
AMOUNT=$AMOUNT
WITHDRAW_AMT=$WITHDRAW_AMT
EOF

echo "==> wrote $OUT_DIR/addresses.env" | tee -a "$LOG"
cat "$OUT_DIR/addresses.env"
