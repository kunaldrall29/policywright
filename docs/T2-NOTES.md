# Tranche 2 notes

A parking lot. Work that belongs to **T2 — Testnet expansion** (target 15 Oct 2026) gets written down here and left alone, so Tranche 1 stays in scope and
nothing is lost.

T2 scope, per the funded plan: MCP server (`record` / `synthesize` / `simulate` /
`verify`), Claude skill, dry-run harness + argument-level scope, net-new policy
codegen with storage segregation, wallet integration (testnet, end-to-end).

**Nothing in this file is a commitment for Tranche 1.**

---

## Already landed (early)

### Argument-level scope — `--constrain-arguments`

Shipped in commit `c076ff9`, before the tranche boundary was being tracked.
Disposition (decided 2026-08-03): **keep the code, correct the claims.**

- It is config-gated and **off by default** ([src/types.ts](../src/types.ts),
  `DEFAULT_SYNTH_CONFIG.constrainArguments: false`), so the T1 pipeline does not
  depend on it. With the flag off, an unobserved swap route is _flagged_
  (advisory), not denied — the pre-existing behaviour.
- It is tested ([test/synthesizer.test.ts](../test/synthesizer.test.ts),
  [test/simulate.test.ts](../test/simulate.test.ts)) and documented.
- Removing it would delete working, reviewed code and change demo output for no
  correctness gain.
- What was corrected instead: the README no longer presented it as a completed
  Tranche 1/2 deliverable set. T2 is now marked _not started_ with this single
  item called out as an early landing.

Remaining T2 work on this item: it covers the swap `path` argument only, and
constrains the _set_ of tokens the path may touch — not ordering, hop count, or
amounts. Generalising beyond `path` is T2.

---

## Deferred to T2

### Function-level scope enforcement as a policy

Verified in [FACTS.md §2.2](FACTS.md): an OZ `ContextRule` binds to one contract
via `ContextRuleType::CallContract(Address)` and carries **no** function name.
Function-level narrowing has to live in a policy's `enforce`, which does receive
`ContractContext { contract, fn_name, args }`.

policywright's spec models `(contract, fnName)` pairs on the rule itself
([RECONCILIATION.md rows 13–14](RECONCILIATION.md);
[src/types.ts](../src/types.ts) `ContextRule.scopedCalls`). Making that
installable needs:

- one context rule per contract, and
- a generated policy that checks `context.fn_name` against the observed set.

That generated policy is also the natural home for argument-level constraints,
which is why the two are grouped here. **The T1 decision was made in D1.2
(2026-08-03): the emitted shape is fixed** — `context-rule.json` emits one
`CallContract` rule per contract with observed function names carried as
advisory `observedFns` ([schema](context-rule-schema.md)). What remains here
for T2 is exactly the _policy codegen_ half: a generated policy whose
`enforce` checks `context.fn_name` against the observed set.

### Net-new policy codegen with storage segregation

The current generated `FrequencyLimitPolicy` keys storage on
`(smart_account, context_rule.id)`, which is already per-account. T2 wants this
generalised and stated as a deliberate multi-tenancy design across all generated
policies, with tests.

### MCP server

Tools: `record`, `synthesize`, `simulate`, `verify`. Not started. The CLI
surface in [src/cli.ts](../src/cli.ts) is the obvious thing to wrap; keeping the
core modules free of I/O side effects makes that cheap.

### Claude skill

Packaged agent skill over the MCP server. Not started.

### Wallet integration (testnet, end-to-end)

Installing a synthesized rule + policies on a real smart account and signing
through it. Not started. This is the point at which
[FACTS.md §2.2](FACTS.md) (`valid_until` is a ledger sequence, not a Unix
timestamp) stops being a documentation issue and becomes a blocking bug — the
conversion needs a ledger-sequence estimate from the network.

### Simulated-transaction recording path

~~Listed under T1 in the funded plan and not yet built; noted here only because
it is adjacent to the RPC adapter work. **It stays T1.**~~ Resolved by D1.1
(2026-08-03): built as [src/sources/simulation.ts](../src/sources/simulation.ts)
behind `record --from-simulation`, fixture-tested against the committed real
`simulateTransaction` capture
([examples/live/simulated-soroswap-swap.json](../examples/live/simulated-soroswap-swap.json)).

---

## Observations parked, not scheduled

- ~~`deriveRuleName` truncates on JS string length; OZ's `MAX_NAME_SIZE` is 20
  **bytes**. Equivalent for the ASCII Soroban symbols in play today
  ([FACTS.md §2.3](FACTS.md)). Only matters if a non-ASCII name source
  appears.~~ Resolved by D1.2 (`f64e472`): `deriveRuleName` truncates via
  `truncateToBytes` in [src/synthesizer.ts](../src/synthesizer.ts), with a
  multibyte-symbol test.
- ~~`use soroban_sdk::panic_with_error;` emitted at the bottom of the generated
  Rust~~ Resolved by the D1.3 template (2026-08-03): the import sits in the
  top-of-file `use soroban_sdk::{…}` block of
  [contracts/frequency-limit-policy/src/lib.rs](../contracts/frequency-limit-policy/src/lib.rs).
- OZ `v0.8.0-rc.3` exists. FACTS.md pins `v0.7.2` (latest stable). Re-verify the
  trait and `ContextRule` shapes when 0.8.0 goes stable.
