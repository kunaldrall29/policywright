#!/usr/bin/env bash
# Deploy an OpenZeppelin multisig smart account on Testnet with one Delegated signer.
# Requires: stellar CLI, funded identity (default: policywright-demo).
set -euo pipefail
SOURCE="${1:-policywright-demo}"
NETWORK="${2:-testnet}"
G="$(stellar keys address "$SOURCE")"
WASM_DIR="${WASM_DIR:-/tmp/stellar-contracts/examples/accounts/multisig-account-example}"

if [[ ! -f "$WASM_DIR/target/wasm32v1-none/release/multisig_account_example.wasm" ]]; then
  echo "Build OZ example first (see evidence/demo-addresses.md)." >&2
  exit 1
fi

echo "Signer G: $G"
stellar contract deploy \
  --wasm "$WASM_DIR/target/wasm32v1-none/release/multisig_account_example.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- \
  --signers "{\"Delegated\": \"$G\"}" \
  --policies '[]'
