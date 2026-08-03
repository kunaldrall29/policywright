# Architecture

policywright is a small, single-direction pipeline. Each stage is a pure-ish function over
the types in [`src/types.ts`](../src/types.ts), which is the single source of truth for
every shape in the system.

```
                  ┌──────────────┐
  tx hash ───────▶│ sources/rpc  │─┐
                  └──────────────┘ │   ┌──────────────┐   ┌──────────────┐
                                   ├──▶│ synthesizer  │──▶│   emitter    │
  fixtures/ ──────▶ sources/      ─┘   └──────────────┘   └──────────────┘
                    fixture            SmartAccountSpec      spec.json
                  RecordedTx                 │               context-rule.json
                                             │               summary.txt
                                             │               FrequencyLimitPolicy.rs
                                             ▼
                                       ┌──────────────┐
                                       │  simulate    │──▶ dry-run report
                                       └──────────────┘
```

## Stages

### 1. Recording (`src/sources/`)

Produces a `RecordedTx`: the transaction hash/network, the ordered `ScopedCall`s
(`contract`, `fnName`, decoded `args`), and the `AssetFlow`s (token, direction, amount).

- **`fixture.ts`** loads `fixtures/recorded-tx.json`, a deterministic, offline Blend-claim
  → Soroswap-swap recording. It validates the document defensively and reconstructs
  `bigint` amounts (the JSON stores them as decimal strings, since JSON has no bigint).
  This source drives the demo and the test suite with no network dependency.
- **`rpc.ts`** is the optional live adapter. It fetches one or more transactions from a
  Soroban RPC node by hash and merges them — in ledger-close-time order, each call tagged
  with its `sourceHash` — into a single `RecordedTx` (via the shared decoders in
  `decode.ts`).
- **`simulation.ts`** ingests a saved `simulateTransaction` exchange
  (`record --from-simulation <file>`) into a `RecordedTx` with `source: "simulation"` —
  simulation discovers the authorization tree an unsigned envelope does not carry.
- **`recorded.ts`** re-loads a previously saved recording (`synth --input <file>`).

  Decoding assumptions (Soroban protocol 27 / CAP-67, `@stellar/stellar-sdk` 15.1.0 —
  every shape verified against the committed captures, [FACTS.md §3](FACTS.md)):
  - the transaction is a v1 (or fee-bump-wrapping-v1) envelope;
  - contract calls come from `InvokeHostFunction` operations whose host function is
    `InvokeContract` (`InvokeContractArgs` → contract, function, args via `scValToNative`);
  - token movements come from CAP-67/SEP-41 token events — `transfer`, SAC
    `mint`/`burn`/`clawback` — in both coexisting topic shapes (SAC events carry a 4th
    SEP-0011 asset-string topic; plain SEP-41 tokens emit 3 topics) with `i128` or
    CAP-67 muxed-map `data`, attributed to the subject account when it is the `from`
    (out) or `to` (in);
  - the subject account is passed explicitly (`--account <G…|C…>`) — the economic actor
    of a smart-account flow is often a `C…` contract address, not the envelope source;
    without it the first transaction's source account is assumed and a warning records
    the assumption;
  - each token's symbol/decimals are resolved by simulating its SEP-41 `symbol()` /
    `decimals()` getters against the same node, cached per token. A token that is not a
    standard SAC/SEP-41 token (or a node that rejects the simulation) falls back to the
    full contract id with `resolved: false` — never a silent guess.

  Failure modes (not found, failed on-chain, wrong network, no contract calls, malformed
  envelope) return a typed `RecorderError` — `BAD_INPUT` / `TX_NOT_FOUND` / `NETWORK` /
  `DECODE_FAILED` ([src/sources/errors.ts](../src/sources/errors.ts)) — rather than a
  silent empty result.

### 2. Synthesis (`src/synthesizer.ts`)

`synthesize(tx, config, now) → SmartAccountSpec`. The design mirrors OZ's smart-account
model: a **context rule** fixes scope, and a small set of **policies** bound to it enforce
quantitative limits.

- **Scope** — the distinct `(contract, fn)` pairs observed, in first-seen order, plus a
  short derived rule name (OZ caps rule names at 20 **bytes** — multibyte symbols count
  per byte; [FACTS.md §2.3](FACTS.md)).
- **Spending limits** — per asset, sum the **gross outflow** (ignoring inflows) and cap it
  at `gross × capMultiplier` (rounded up so the cap never sits below what was observed).
  - _Gross, not net:_ an asset received then sent within the same flow (BLND: claimed in,
    swapped out) nets to ~zero, but the account still moved the gross amount out, so that
    is what is capped.
  - _Inflow-only assets get no cap_ — the USDC received from the swap moves nothing out, so
    no spending policy is emitted for it. This is the minimal-permission case.
- **Frequency** — one frequency-limit policy is always emitted from config.
- **Argument scope** — the set of token addresses a swap `path` touched is always recorded
  on the spec as `argumentScopes`. When `config.constrainArguments` is enabled it is also
  added to `policies` (and thus enforced as a denial); otherwise it is advisory and the
  simulator only flags violations. It constrains the token _set_, not ordering/hops/amounts
  (see the README for limits).
- **Policy budget** — OZ allows at most `MAX_POLICIES` (5) policies per context rule;
  exceeding that adds a warning to the spec rather than failing.

`SynthConfig` is validated up front and echoed into the spec for reproducibility. All of
the above knobs are exposed as CLI flags on `synth`/`simulate`.

### 3. Emission (`src/emitter.ts`, `src/rust-policy.ts`)

Renders the spec four ways:

- **`spec.json`** — bigint-safe JSON (amounts as decimal strings).
- **`context-rule.json`** — installable OZ context rules + policy install params
  ([schema](context-rule-schema.md)).
- **`summary.txt`** — a human-readable rundown of the observed flow, the context rule, the
  policies (with amounts formatted by token decimals), and any warnings.
- **`FrequencyLimitPolicy.rs`** — the custom policy in Rust, implementing OZ's real
  `Policy` trait (associated `AccountParams`; `install` / `enforce` / `uninstall`;
  `enforce` rejects by panicking — there is no `can_enforce` hook). At the default
  config the emitted source is byte-identical to the compiled-and-tested crate at
  [contracts/frequency-limit-policy](../contracts/frequency-limit-policy) (equality locked
  by [test/rust-policy.test.ts](../test/rust-policy.test.ts); non-default
  `--frequency-window`/`--frequency-max` values are substituted into the template). Every
  generated Rust file is stamped **ILLUSTRATIVE / UNAUDITED — NOT DEPLOY-READY**; the
  summary carries the same note.

### 4. Simulation (`src/simulate.ts`)

`simulateCall(spec, candidate) → SimulationResult`. Checks run in a fixed order; the first
failure decides the outcome:

1. **scope** — is the `(contract, fn)` pair authorised? (deny: unseen function)
2. **lifetime** — is the call within the rule's validity window? (deny: expired)
3. **argument-constraint** (enforced) — does the swap route through an unobserved token?
   (deny — only when `constrainArguments` is enabled)
4. **spending-limit** — does any outflow exceed its asset's cap? (deny: over-cap)
5. **frequency-limit** — would this call exceed the rolling call cap? (deny: too frequent)
6. **argument-constraint** (advisory) — when not enforced, an unobserved route is **flagged**
   rather than permitted silently.

If every check passes the call is permitted. `buildScenarios` derives the standard
permit/deny/flag set generically from a spec, and `renderReport` formats results as
Markdown.

## Design choices

- **`bigint` everywhere for token amounts** — no float rounding in money math; formatting
  to human decimals happens only at the edges (`emitter.formatAmount`).
- **Explicit `now`** — synthesis takes the current time as a parameter rather than reading
  the clock, keeping it deterministic and testable.
- **Offline-first** — the fixture is the default source; the live RPC adapter is opt-in, so
  the demo, tests, and CI never depend on network state or RPC retention windows.
