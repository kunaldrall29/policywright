# policywright

Policywright turns a transaction a user already performed (or simulated) into the
least-privilege [OpenZeppelin smart-account](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account)
authorization that permits exactly that flow — a context rule plus the minimum set of
policies — and lets them verify it with a dry-run before installing.

The worked example throughout is a Stellar/Soroban flow: a **Blend** pool emissions claim
(BLND in) followed by a **Soroswap** exact-input swap of that BLND into **USDC** (BLND
out, USDC in).

## How it works

```
RecordedTx ─▶ synthesize ─▶ SmartAccountSpec ─▶ emit ─┬─▶ spec.json
 (fixture or                (context rule +           ├─▶ summary.txt
  live RPC)                  minimal policies)         └─▶ FrequencyLimitPolicy.rs
                                  │
                                  └─▶ dry-run simulator ─▶ permit / deny / flag report
```

1. **Record** — capture a transaction as a normalised `RecordedTx` (scoped contract
   calls + token in/out flows). Sourced from the baked-in offline fixture or, on demand,
   from a live Soroban RPC node.
2. **Synthesize** — derive a least-privilege `SmartAccountSpec`:
   - a context rule scoped to the exact `(contract, function)` pairs observed;
   - a **gross-outflow** spending-limit policy per asset that left the account (an asset
     received and then sent — like BLND here — nets to ~zero but is still capped on the
     gross amount it moved out);
   - **no cap** for assets that only flowed in (e.g. the USDC received) — the
     minimal-permission case;
   - an always-on frequency-limit policy.
3. **Emit** — render the spec as JSON, a human-readable summary, and an _illustrative_
   custom Rust policy.
4. **Simulate** — dry-run candidate calls against the spec and report whether each would
   be permitted or denied (and why), before anything is installed on-chain.

## Quickstart

```bash
npm ci
npm run demo
```

`npm run demo` records the fixture, synthesizes the spec, emits the artefacts to `out/`,
and runs the dry-run scenarios — asserting each behaves as expected. It exits non-zero if
any scenario deviates, so it doubles as a smoke test. It needs no network access.

## Commands

| Command                                                              | What it does                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run demo`                                                       | End-to-end pipeline + dry-run self-check (offline).              |
| `npm run cli -- synth`                                               | Synthesize a spec from the fixture and print the summary + JSON. |
| `npm run cli -- simulate`                                            | Run the dry-run scenarios against the fixture's spec.            |
| `npm run record -- <txHash> [--network testnet\|mainnet\|futurenet]` | Fetch a live transaction by hash and print the recording.        |

The live `record` path is optional and not exercised by the demo or tests. Given a valid
transaction hash within the RPC node's retention window, it decodes the `InvokeContract`
calls and SEP-41 transfer events into a `RecordedTx`. Not-found, failed, and decode
failures return clear, actionable errors.

## The generated Rust policy is illustrative

The emitted `FrequencyLimitPolicy.rs` models OpenZeppelin's real `Policy` trait shape
(`install` / `enforce` / `uninstall`, with `enforce` rejecting by panicking) so a
developer has a starting point. **It is not audited, not tested on-chain, and must not be
deployed as-is** — every generated file is stamped with that warning.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit dist/ (tsconfig.build.json)
```

## Project layout

| Path                                   | Purpose                                     |
| -------------------------------------- | ------------------------------------------- |
| `src/types.ts`                         | Core domain types (single source of truth). |
| `src/sources/fixture.ts`               | Loads the baked-in offline recording.       |
| `src/sources/rpc.ts`                   | Optional live Soroban RPC adapter.          |
| `src/synthesizer.ts`                   | `RecordedTx` → `SmartAccountSpec`.          |
| `src/emitter.ts`, `src/rust-policy.ts` | Render spec JSON, summary, and Rust.        |
| `src/simulate.ts`                      | Dry-run evaluator + scenarios + report.     |
| `src/demo.ts`, `src/cli.ts`            | Demo orchestration and CLI.                 |
| `fixtures/recorded-tx.json`            | The committed offline recording.            |

See [docs/architecture.md](docs/architecture.md) for the design in depth.
