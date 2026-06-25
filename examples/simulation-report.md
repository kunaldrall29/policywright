# policywright dry-run report

| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1357.9500001 BLND exceeds the 1357.95 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CBGAPUV74GVQYQYBHMIN4LF5ZEHYIMM4L5VBGUBB4IJXM5D4RQ7275J7 is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1751414401 is after the rule expires at 1751414400 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |
| route through an unobserved token | ⚠️ flag (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ; not enforced (constrainArguments is off) |
