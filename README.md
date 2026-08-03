# policywright

[![CI](https://github.com/kunal-drall/policywright/actions/workflows/ci.yml/badge.svg)](https://github.com/kunal-drall/policywright/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

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
 (fixture or                (context rules +          ├─▶ context-rule.json
  live RPC)                  minimal policies)         ├─▶ summary.txt
                                  │                    └─▶ FrequencyLimitPolicy.rs
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
3. **Emit** — render the spec as JSON, a human-readable summary, an _illustrative_
   custom Rust policy, and **`context-rule.json`**: the installable OpenZeppelin
   context rules (one `CallContract` rule per contract, plus a rule per token whose
   `transfer` the subject authorized — where the **stock `spending_limit`** attaches
   with its real install params, `{ spending_limit: i128, period_ledgers: u32 }`).
   Units are converted to the on-chain ledger basis, every param shape carries its OZ
   source citation, and anything the stock policies cannot express is recorded as a
   delta note rather than emitted in a shape the real contract would reject. Schema:
   [docs/context-rule-schema.md](docs/context-rule-schema.md).
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

| Command                                                                                                      | What it does                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run demo`                                                                                               | End-to-end pipeline + dry-run self-check (offline).                                                                                                       |
| `npm run cli -- synth [--input <recorded.json>]`                                                             | Synthesize from the fixture (or a saved record output, e.g. `examples/live/recorded-claim-swap.json`) and print the summary, spec, and context-rule JSON. |
| `npm run cli -- simulate`                                                                                    | Run the dry-run scenarios against the fixture's spec.                                                                                                     |
| `npm run record -- <txHash>... [--account <G\|C>] [--network testnet\|mainnet\|futurenet] [--rpc-url <url>]` | Fetch live transaction(s) by hash and print one merged recording. `record --from-simulation <file>` ingests a saved simulation instead.                   |

The live `record` path is optional: the network fetch itself is not exercised by the demo
or tests, but its decoders and multi-hash merge logic run network-free in
[test/recorder.test.ts](test/recorder.test.ts) against the committed raw captures of real
testnet transactions in [examples/live/](examples/live/). Given valid transaction hashes
within the RPC node's retention window, it decodes the `InvokeContract` calls and
CAP-67/SEP-41 token events into one merged `RecordedTx`, resolving each token's symbol/
decimals from its SAC metadata (with an explicit `resolved: false` fallback when that is
not possible). `--account <G…|C…>` names the subject whose authorizations are scoped;
`--from-simulation <file>` ingests a saved `simulateTransaction` exchange instead.
Not-found, failed, wrong-network, and decode failures return clear, actionable errors.

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

> Argument-level scope is **Tranche 2** scope that landed early. It is off by default and
> the Tranche 1 pipeline does not depend on it. See [docs/T2-NOTES.md](docs/T2-NOTES.md).

The synthesizer always records the set of token addresses a swap `path` touched (surfaced
as `argumentScopes` in the spec). What that observation does depends on the flag:

- **Off (default):** the prior behaviour is preserved — a candidate swap routing through a
  token never observed is **flagged** (advisory), not denied.
- **On:** the observation becomes an enforced policy — the same swap is **denied** (the
  route-through-an-unobserved-token scenario in the demo).

**Limits.** This constrains the _set of tokens the path may touch_, not the ordering,
intermediate-hop count, or amounts. A multi-hop route through only-observed tokens is
allowed; amount bounds are the spending-limit policy's job. It currently covers the swap
`path` argument only.

## The generated Rust policy is illustrative

The emitted `FrequencyLimitPolicy.rs` implements OpenZeppelin's real `Policy` trait
(`install` / `enforce` / `uninstall`, with `enforce` rejecting by panicking) and is
byte-identical to the compiled-and-tested crate at
[contracts/frequency-limit-policy](contracts/frequency-limit-policy) (25 Rust tests
against `stellar-accounts` v0.7.2; equality locked by
[test/rust-policy.test.ts](test/rust-policy.test.ts)). **It is not audited; deployment is
TESTNET-only and it must never be deployed to mainnet or used to guard real value** —
every generated Rust file is stamped with that warning, and the emitted summary carries
the same note.

## Development

| Script                                    | Purpose                                                      |
| ----------------------------------------- | ------------------------------------------------------------ |
| `npm test`                                | Run the Vitest suite.                                        |
| `npm run test:coverage`                   | Run tests with coverage (synthesizer + simulator held ≥90%). |
| `npm run lint`                            | ESLint (typescript-eslint, type-checked rules).              |
| `npm run format:check` / `npm run format` | Check / apply Prettier.                                      |
| `npm run typecheck`                       | `tsc --noEmit`.                                              |
| `npm run build`                           | Emit `dist/` (`tsconfig.build.json`).                        |

CI ([ci.yml](.github/workflows/ci.yml)) is configured for pushes to `main` and pull
requests, with three jobs: **build** (npm ci → lint → format:check → typecheck → test →
demo), **site** (docs-site build), and **contracts** (pinned Rust 1.97.1: `cargo fmt
--check` → `clippy -D warnings` → `cargo test`, then a `stellar contract build` of the
policy crate with the same pinned stellar-cli 27.1.0 used for the testnet deploy). Both
toolchains are cached. Because this repository is a GitHub fork, runs are currently
dispatched manually and cited per deliverable in
[evidence/EVIDENCE.md](evidence/EVIDENCE.md) (see the CI-trigger note there).

## Project layout

| Path                                   | Purpose                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                         | Core domain types (single source of truth).                                                                      |
| `src/sources/fixture.ts`               | Loads the baked-in offline recording.                                                                            |
| `src/sources/rpc.ts`                   | Optional live Soroban RPC adapter.                                                                               |
| `src/synthesizer.ts`                   | `RecordedTx` → `SmartAccountSpec`.                                                                               |
| `src/emitter.ts`, `src/rust-policy.ts` | Render spec JSON, context-rule JSON, summary, and Rust.                                                          |
| `src/simulate.ts`                      | Dry-run evaluator + scenarios + report.                                                                          |
| `src/demo.ts`, `src/cli.ts`            | Demo orchestration and CLI.                                                                                      |
| `fixtures/recorded-tx.json`            | The committed offline recording.                                                                                 |
| `contracts/`                           | Rust workspace: the compiled-and-tested frequency-limit-policy crate (source of truth for the emitted template). |
| `scripts/deploy-testnet.sh`            | Testnet-only build + upload + deploy + hash-verify; appends the deployment log to evidence/EVIDENCE.md.          |

See [docs/architecture.md](docs/architecture.md) for the design in depth.

## Documentation site

[`site/`](site/) contains the public documentation site
(<https://policywright.lemmalabs.space>), built with Astro + Starlight. It is
fully static — no backend, no analytics — with built-in Pagefind search.

```bash
cd site
npm ci
npm run dev     # local dev server
npm run build   # static build to site/dist/
```

CI builds the site on every push and pull request (the `site` job in
[ci.yml](.github/workflows/ci.yml)).

### Deploying to policywright.lemmalabs.space (Vercel)

1. **Import the repo** at <https://vercel.com/new>. The committed
   [vercel.json](vercel.json) points install/build at `site/` and serves
   `site/dist`, so no build settings are needed. (Equivalent alternative:
   set the project's **Root Directory** to `site` in the Vercel dashboard and
   let it auto-detect Astro — in that case Vercel ignores the root
   `vercel.json`.)
2. **Add the domain** in the Vercel project: Settings → Domains →
   `policywright.lemmalabs.space`.
3. **DNS** — in the DNS zone for `lemmalabs.space`, add the record Vercel
   shows for the subdomain:

   | Type  | Name           | Value                   |
   | ----- | -------------- | ----------------------- |
   | CNAME | `policywright` | `cname.vercel-dns.com.` |

   Certificates are provisioned automatically once the record propagates.

## Deliverables

This project is built for Stellar SCF #44 — the awarded submission
["Record-to-Policy MCP + Agent skill"](https://communityfund.stellar.org/project/policywright-j8x)
— against a three-tranche plan. All dates are targets. The table tracks the funded deliverables and
what is actually verifiable in this repository today — see
[the roadmap](https://policywright.lemmalabs.space/roadmap/) for the full plan.

| Tranche                    | Target      | Deliverables                                                                                                                          | Status          |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **T1 — MVP (testnet)**     | 31 Aug 2026 | Recording layer (live + simulated); least-privilege synthesizer; generated-policy compile + testnet deploy; open-source CLI + CI      | 🚧 In progress  |
| **T2 — Testnet expansion** | 15 Oct 2026 | MCP server; Claude skill; dry-run harness + argument-level scope; net-new policy codegen with storage segregation; wallet integration | ⏳ Not started¹ |
| **T3 — Mainnet launch**    | 30 Nov 2026 | Three end-to-end walkthroughs; OpenZeppelin validation; production release; mainnet demonstration; audit readiness (SCF Audit Bank)   | ⏳ Not started  |

**Shipped and verifiable today**: the recording layer from the
offline fixture, from a live Soroban RPC node (multi-hash sequences with authorization
trees), and from a saved `simulateTransaction` exchange; the synthesizer (exact scope
binding, gross-outflow spend caps, minimal-permission inflows, frequency limits, and
installable OZ context rules with real stock-policy install params —
[docs/context-rule-schema.md](docs/context-rule-schema.md)); the emitter (`spec.json`,
`context-rule.json`, `summary.txt`, stamped illustrative Rust — the same source as the
compiled-and-tested crate in [contracts/](contracts/), 25 Rust tests, reproducible wasm
build per [docs/FACTS.md](docs/FACTS.md) §1.5); the offline dry-run
harness; the CLI; the Vitest suite with coverage thresholds; and CI. The emitted
artifacts for a real testnet claim+swap sequence are committed under
[`examples/live/`](examples/live/).

**Delivered late in T1:** the generated policy compiles, passes its Rust test suite, and
is deployed to testnet — contract ID and hash-verification trail in the deployment log in
[evidence/EVIDENCE.md](evidence/EVIDENCE.md). The deployed instance is testnet-only and
unaudited.

¹ One T2 deliverable pair landed early: the offline dry-run harness and its
config-gated argument-level scope (`--constrain-arguments`, off by default) — the T2 row
lists "dry-run harness + argument-level scope". The rest of T2 — MCP server, Claude
skill, storage-segregated codegen, wallet integration — has not been started. See
[docs/T2-NOTES.md](docs/T2-NOTES.md).

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
  tool, not a wallet; it does not sign, deploy, or relay user transactions — the only
  on-chain action in the repo is the opt-in, testnet-only deployment of the generated
  policy contract itself ([scripts/deploy-testnet.sh](scripts/deploy-testnet.sh)).
