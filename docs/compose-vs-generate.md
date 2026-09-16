# When Policywright composes vs generates

Policywright's permanent default: **configure a stock OpenZeppelin policy
whenever one can express the constraint; generate fresh Rust only when none
can.** This page is the D2.4 proof map — decision rule, artifacts, harness, and
tests.

## Decision rule

| Observed constraint | Stock expressible? | Action |
| ------------------- | ------------------ | ------ |
| Gross outflow of a token the subject authorized a direct `transfer` on | Yes — OZ `spending_limit` meters `fn_name == "transfer"` on a `CallContract(token)` rule (`spending_limit.rs:222-294`) | **Compose** `stock:spending_limit` with real install params `{ spending_limit: i128, period_ledgers: u32 }` (`spending_limit.rs:88-94`) |
| Call frequency (max N enforcements per wall-clock window) | No stock counterpart | **Generate** `FrequencyLimitPolicy` (`contracts/frequency-limit-policy`) with `{ window_secs, max_calls }` |
| Spend cap without a subject-authorized direct transfer | No — stock would panic `NotAllowed` on non-`transfer` contexts | **DELTA note** only (offline dry-run still caps; no rejectable install params, no invented spend contract) |
| Swap-path / argument / function-name narrowing | No stock counterpart | Offline advisory or `--constrain-arguments` deny today; on-chain codegen is T2 follow-on ([T2-NOTES](T2-NOTES.md)) |

Implemented in [`src/synthesizer.ts`](../src/synthesizer.ts) (`deriveOzContextRules`).
The site primer is [compose-first](../site/src/content/docs/concepts/compose-first.mdx).

## Side-by-side artifacts (live claim→swap sequence)

From [`examples/live/recorded-claim-swap.json`](../examples/live/recorded-claim-swap.json):

| Artifact | Role | Proof |
| -------- | ---- | ----- |
| [`examples/live/context-rule.json`](../examples/live/context-rule.json) | Composed `pw:xfer:native` → `stock:spending_limit` `{ spending_limit: "11000000", period_ledgers: 17280 }` with OZ `paramsSource` citation; generated frequency bindings on `pw:swap` / `pw:harvest` | Field-by-field OZ install checks in [`test/oz-context-rules.test.ts`](../test/oz-context-rules.test.ts) |
| [`contracts/frequency-limit-policy`](../contracts/frequency-limit-policy) | Net-new stateful policy; storage keyed by `(smart_account, context_rule_id)` | `cargo test` in `contracts/`; emitter lock in [`test/rust-policy.test.ts`](../test/rust-policy.test.ts) |

Both compile: TypeScript synthesis + emit stay green under `npm test`; the Rust
crate under `cargo test` (contracts workspace).

## Harness: one conceptual rule, both constraints

The offline dry-run attaches both to the synthesized authorization and exercises:

1. **Permit** the original recorded flow
2. **Deny** over-cap → composed `spending-limit`
3. **Deny** repeat-within-window → generated `frequency-limit`

Committed report:

- [`examples/live/simulation-report-compose-and-generate.md`](../examples/live/simulation-report-compose-and-generate.md)

Reproduce:

```bash
npm run --silent cli -- simulate --input examples/live/recorded-claim-swap.json
# criterion-shaped render (same decisions) is what the committed report locks:
# see renderComposeAndGenerateReport in src/simulate.ts
```

## Decision-boundary tests

[`test/compose-boundary.test.ts`](../test/compose-boundary.test.ts) asserts:

| Case | Expectation |
| ---- | ----------- |
| Stock-expressible spend | `stock:spending_limit` on the token rule; never a custom spend policy |
| Frequency-style | Always `custom:FrequencyLimitPolicy` |
| Mixed (called contracts + transfer token) | Frequency on call rules; spending_limit on the transfer token rule |
| Live sequence | Same partition + harness permit / over-cap deny / frequency deny |
| Committed report | Byte-stable vs `renderComposeAndGenerateReport` |

## Why compose-first stays permanent

Generated authorization code guards user funds. Stock policies carry shared
review; parameters are legible at a glance. Generation stays the rare fallback
so the unaudited surface stays small — even after the generator hardens.
