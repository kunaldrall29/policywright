# policywright dry-run report

Source: `examples/sample-vault/recorded-deposit-withdraw.json`
constrainArguments: **off** (default — unobserved routes FLAG / advisory only)

| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 CCQWXNKSWWTD247KFW5E7NMGJOMZ6ZED37ZOIU7Z2VMZGOD3S2M5PCW3 exceeds the 1.1 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CDEYULOATO7CGEAOOZR2GHHLRRZL4TRYD4NUWNXUHUOBD7P2SU2S5RVB is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1792182393 is after the rule expires at 1792182392 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |

