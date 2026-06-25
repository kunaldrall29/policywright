# policywright

[![CI](https://github.com/kunaldrall29/policywright/actions/workflows/ci.yml/badge.svg)](https://github.com/kunaldrall29/policywright/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

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
calls and SEP-41 transfer events into a `RecordedTx`, resolving each token's symbol/
decimals from its SAC metadata (with an explicit `resolved: false` fallback when that is
not possible). Not-found, failed, wrong-network, and decode failures return clear,
actionable errors.

## Configuration

`synth` and `simulate` accept overrides for the synthesis knobs; anything omitted keeps
its default.

| Flag                        | Default         | Meaning                                           |
| --------------------------- | --------------- | ------------------------------------------------- |
| `--lifetime <secs>`         | `2592000` (30d) | Context-rule lifetime (sets `valid_until`).       |
| `--spend-window <secs>`     | `86400` (1d)    | Rolling window the spend cap is measured over.    |
| `--cap-multiplier <number>` | `1.1`           | Cap = observed gross outflow × this (rounded up). |
| `--frequency-window <secs>` | `86400` (1d)    | Rolling window for the frequency limit.           |
| `--frequency-max <count>`   | `5`             | Max calls allowed within the frequency window.    |
| `--constrain-arguments`     | off             | Enforce the swap-path token set (see below).      |

```bash
npm run cli -- synth --lifetime 604800 --cap-multiplier 1.25
npm run cli -- simulate --constrain-arguments
```

## Argument-level scope (`--constrain-arguments`)

The synthesizer always records the set of token addresses a swap `path` touched (surfaced
as `argumentScopes` in the spec). What that observation does depends on the flag:

- **Off (default):** the prior behaviour is preserved — a candidate swap routing through a
  token never observed is **flagged** (advisory), not denied.
- **On:** the observation becomes an enforced policy — the same swap is **denied** (the
  `BLND -> XLM` case in the demo).

**Limits.** This constrains the _set of tokens the path may touch_, not the ordering,
intermediate-hop count, or amounts. A multi-hop route through only-observed tokens is
allowed; amount bounds are the spending-limit policy's job. It currently covers the swap
`path` argument only.

## The generated Rust policy is illustrative

The emitted `FrequencyLimitPolicy.rs` models OpenZeppelin's real `Policy` trait shape
(`install` / `enforce` / `uninstall`, with `enforce` rejecting by panicking) so a
developer has a starting point. **It is not audited, not tested on-chain, and must not be
deployed as-is** — every generated file is stamped with that warning.

## Development

| Script                                    | Purpose                                                      |
| ----------------------------------------- | ------------------------------------------------------------ |
| `npm test`                                | Run the Vitest suite.                                        |
| `npm run test:coverage`                   | Run tests with coverage (synthesizer + simulator held ≥90%). |
| `npm run lint`                            | ESLint (typescript-eslint, type-checked rules).              |
| `npm run format:check` / `npm run format` | Check / apply Prettier.                                      |
| `npm run typecheck`                       | `tsc --noEmit`.                                              |
| `npm run build`                           | Emit `dist/` (`tsconfig.build.json`).                        |

CI runs `npm ci` then lint → format:check → typecheck → test → demo on every push to
`main` and on pull requests ([ci.yml](.github/workflows/ci.yml)).

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

## Deliverables

This project is built for Stellar SCF #43 ("OZ accounts policy builder"). The table tracks
deliverables against tranches and their status in this repository.

| Tranche                        | Deliverable                                                                                                                                      | Status     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1 — Spike / PoC                | Recording model, synthesizer (scope + spend caps + frequency), emitter (spec JSON, summary, illustrative Rust), offline dry-run + demo           | ✅ Done    |
| 2 — Production-grade           | Lint/format gates, Vitest suite + coverage, hardened live RPC adapter (SAC metadata), argument-level scope, configurable synthesis, CI, examples | ✅ Done    |
| 3 — Future (out of scope here) | Professional audit of the generated Rust policy, on-chain install/sign flow, broader argument constraints, a UI                                  | ⏳ Planned |

## Acknowledgements

policywright extends the prior art of **[kalepail/pollywallet](https://github.com/kalepail/pollywallet)**
by Tyler van der Hoeven — a passkey-secured smart-wallet demo on Stellar that deploys
OpenZeppelin smart-account contracts on Soroban and submits through an OZ Channels relayer
(in the lineage of [`passkey-kit`](https://github.com/kalepail/passkey-kit) and the
WebAuthn smart-wallet work).

Stated plainly:

- **Adopts** — OpenZeppelin's Stellar smart-account model (context rules + policies) and
  Soroban's account-abstraction primitives that pollywallet demonstrates.
- **Extends** — pollywallet shows how to _create and operate_ a smart wallet; policywright
  adds the missing step of _deriving the least-privilege authorization from a transaction
  the user already performed_, plus an offline dry-run to verify it before installing.
- **Replaces** — nothing in pollywallet. This is a complementary authoring/verification
  tool, not a wallet; it does not sign, deploy, or relay transactions.
