# policywright dry-run report — compose + generate (D2.4)

Source: `examples/live/recorded-claim-swap.json`

Criterion: *Generates both a composed-policy configuration and a net-new
stateful policy contract; both compile and pass simulation.*

Both constraints attach to one conceptual authorization derived from this
recording (see [`context-rule.json`](./context-rule.json)):

| Constraint | Mechanism | Install artifact |
| --- | --- | --- |
| Spend cap (native XLM) | **Composed** stock `spending_limit` | `pw:xfer:native` → `stock:spending_limit` `{ spending_limit, period_ledgers }` — OZ `spending_limit.rs:88-94` |
| Call frequency | **Generated** `FrequencyLimitPolicy` | `custom:FrequencyLimitPolicy` `{ window_secs, max_calls }` — [`contracts/frequency-limit-policy`](../../contracts/frequency-limit-policy) |

## Criterion scenarios

| Scenario | Decision | Constraint class | Reason |
| --- | --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | — (baseline) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | **composed** spending_limit | outflow of 1.1000001 native exceeds the 1.1 cap per 86400s |
| over the frequency limit | ⛔ deny (frequency-limit) | **generated** FrequencyLimitPolicy | this would be call 6 within 86400s, over the cap of 5 |

## Full harness table

| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 native exceeds the 1.1 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357 is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1787699317 is after the rule expires at 1787699316 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |
| route through an unobserved token | ⚠️ flag (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ; not enforced (constrainArguments is off) |
| BLND→XLM (unobserved route) | ⚠️ flag (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF; not enforced (constrainArguments is off) |

## Reproduce

```bash
npm run --silent cli -- simulate --input examples/live/recorded-claim-swap.json
```

See [docs/compose-vs-generate.md](../../docs/compose-vs-generate.md) for the
compose-first decision boundary and proof links.
