# sample-vault (Phase 4 S2)

Minimal **original** Soroban flow used to check that policywright generalises
beyond Blend / Soroswap:

1. `bare-token` — SEP-41-shaped `transfer` / `mint` / `approve` **without**
   `symbol` / `decimals` / `name` (forces `resolved: false` metadata fallback).
2. `vault` — `deposit` / `withdraw` against that token.

## Build & run (testnet)

Requires stellar-cli **27.1.0**, Rust via `rust-toolchain.toml` (1.97.1), and
repo-root `.env` (`STELLAR_SECRET_KEY` / `STELLAR_PUBLIC_KEY`). Secrets are
never printed.

```bash
./examples/sample-vault/scripts/run-flow.sh
```

Writes deploy + flow hashes to `out/addresses.env` (gitignored).

## Pipeline

```bash
# from repo root — use the two-step deposit → withdraw hashes
npx tsx src/cli.ts record <DEPOSIT_TX> <WITHDRAW_TX> \
  --network testnet --account <G…> > examples/sample-vault/recorded-deposit-withdraw.json

npx tsx src/cli.ts synth --input examples/sample-vault/recorded-deposit-withdraw.json
npx tsx src/cli.ts simulate --input examples/sample-vault/recorded-deposit-withdraw.json
```

A committed recording from the 2026-09-16 testnet run is
[`recorded-deposit-withdraw.json`](./recorded-deposit-withdraw.json); addresses
and hashes are in [`ADDRESSES.md`](./ADDRESSES.md).
