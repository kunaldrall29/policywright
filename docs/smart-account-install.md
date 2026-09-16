# Smart-account create + install (D2.5)

Testnet-only flow: deploy an OpenZeppelin smart account, install an emitted
`context-rule.json` (policies attached via `add_context_rule`), then live-verify.

## Prerequisites

- `.env` with `STELLAR_SECRET_KEY`, `STELLAR_PUBLIC_KEY`, `STELLAR_NETWORK=testnet`
  (gitignored; never commit).
- `stellar` CLI **27.1.0** on `PATH` (with `$HOME/.cargo/bin`).
- Built wasms: `(cd contracts && stellar contract build)`.

## Signing hierarchy (FACTS.md §5.3) — honest labeling

1. **Preferred:** browser Freighter via `stellar-wallets-kit` `signAuthEntry`
   (secret never leaves the wallet).
2. **Fallback (this CLI path):** local ed25519 from `.env` via `stellar-cli`
   (`STELLAR_ACCOUNT`). The CLI **always** prints
   `signing: local-signer-fallback` and the reason string when this path runs.
   Never claim Freighter signed when the fallback ran.

### [BLOCKER] Freighter interactive step

When using Freighter (preferred), the human must confirm the wallet popup for
each `add_context_rule` auth entry. That interactive confirmation is the only
manual gate on the Freighter path. Headless agents use the local-signer
fallback instead.

## Commands

### 1. Create smart account

```bash
npm run cli -- account:create --network testnet
```

Deploys `oz_smart_account.wasm` with:

```text
--signers '[{"Delegated":"<G from .env>"}]'
--policies '{}'
```

Prints the **C-address**, appends it + deploy tx to `evidence/EVIDENCE.md` and
`evidence/demo-addresses.md`.

### 2. Synthesize (emitter output — install consumes it unmodified)

```bash
npm run cli -- synth --input examples/live/recorded-claim-swap.json > /tmp/synth.out
# or use the committed examples/live/context-rule.json
```

Install reads `installParams` **values** from the emitter as-is and only applies
the stellar-cli ScVal wire encoding (alphabetically ordered symbol map). It does
not invent different caps or windows.

### 3. Install (simulate, then submit)

```bash
npm run cli -- install \
  --smart-account <C…> \
  --context-rule examples/live/context-rule.json \
  --frequency-policy CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP \
  --spending-limit-policy <C… spending-limit wrapper> \
  --signer <G…> \
  --network testnet
```

Flags:

| Flag | Meaning |
| ---- | ------- |
| `--dry-run` | Simulate only (`--send=no`); never submit |
| `--only pw:swap,pw:harvest` | Install a subset of rules |
| `--frequency-policy` | Default `CDSVPSTS…` |
| `--spending-limit-policy` | Required for `stock:spending_limit` rules |

Behavior:

- Recomputes `validUntilLedger` from the **live** ledger head (recording-era
  values are past — FACTS.md §2.2).
- Always simulates each rule before submit (`--send=no`).
- Submit uses the **OZ Delegated AuthPayload path** (local-signer): stellar-cli
  alone cannot sign `add_context_rule` on a C-account (`Missing signing key for
  account C…`). The CLI builds `AuthPayload` + nested G `__check_auth(auth_digest)`
  and submits via RPC — still labeled local-signer fallback, never as Freighter.
- If spending-limit address is missing, installs the **frequency** subset and
  writes `out/installed-context-rule.json` for verify.
- Auth: `add_context_rule` requires the smart account's auth; with
  `Delegated(G)`, the G key authorizes via nested `require_auth_for_args`.

### 4. Live verify

```bash
npm run cli -- verify \
  --context-rule out/installed-context-rule.json \
  --smart-account <C…> \
  --frequency-policy CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP \
  --network testnet
```

Fetches `get_context_rules_count` + `get_context_rule` for each id, enriches
FrequencyLimit / spending-limit install params when possible, diffs against the
emitted doc. OZ constructor `Default` rules are ignored. Live snapshots skip
`validUntilLedger` equality (recomputed at install).

Offline fixture path remains:

```bash
npm run cli -- verify \
  --context-rule examples/live/context-rule.json \
  --on-chain-snapshot fixtures/verify/on-chain-snapshot-match.json
```

## MCP

Exactly four tools (`record` / `synthesize` / `simulate` / `verify`). **Never**
`install`. MCP `verify` accepts optional `smartAccount` for the same live fetch
library used by the CLI.

## Contracts

| Crate | Role |
| ----- | ---- |
| `contracts/oz-smart-account` | Deployable OZ SmartAccount (no Upgradeable) |
| `contracts/spending-limit-policy` | Thin wrapper over stock `spending_limit` |
| `contracts/frequency-limit-policy` | Generated FrequencyLimitPolicy (already on testnet as `CDSVPSTS…`) |
