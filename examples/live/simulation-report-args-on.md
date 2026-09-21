# policywright dry-run report

Source: `examples/live/recorded-claim-swap.json`
constrainArguments: **on** (argument constraints enforced — unobserved routes DENIED)

| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 native exceeds the 1.1 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357 is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1787699317 is after the rule expires at 1787699316 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |
| route through an unobserved token | ⛔ deny (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ |
| BLND→XLM (unobserved route) | ⛔ deny (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF |

