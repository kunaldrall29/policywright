# policywright dry-run report

| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 exceeds the 1.1 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1792204388 is after the rule expires at 1792204387 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |

