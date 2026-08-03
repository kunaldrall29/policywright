# Demo script — the short recorded demo (Tranche 1)

The exact command sequence for the recorded demo: real recorded transactions →
synthesized least-privilege authorization → the emitted installable rule with
its real OpenZeppelin parameters → the deployed generated policy contract,
hash-verified against testnet.

Total run time: ~3 minutes of terminal work. Every expected-output block below
was produced by actually running the command on 2026-08-03; blocks marked
_deterministic_ reproduce byte-for-byte on any machine.

## Prep (off camera)

```bash
git clone https://github.com/kunal-drall/policywright && cd policywright
npm ci
```

Also needed on the machine: `jq`, and `stellar` (stellar-cli, v27.1.0 used
here) for the final on-chain beat. No secrets and no `.env` are needed for any
step of this demo.

---

## Beat 1 — the real recorded flow

Say: _"We start from two real testnet transactions a user performed — a Blend
rewards claim and a Soroswap swap of 1 XLM into USDC."_

The committed recording was produced by this exact command while the hashes
were inside the public RPC's ~7-day retention window (D1.1, 2026-08-03):

```bash
npm run record -- \
  acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452 \
  2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b \
  --network testnet \
  --account CCW6R5ZKEIJJ75YT54TEHMRUYTP4XQGUI6H63EE3W65H4P4FAUICXP3Q \
  > examples/live/recorded-claim-swap.json
```

**Honesty note:** those two hashes have since left the retention window
(verified 2026-08-03 — the command now returns a typed `TX_NOT_FOUND` error
that explains exactly that). On camera, show the committed recording instead
— both transactions remain independently verifiable on the explorer:
[claim `acf256…`](https://stellar.expert/explorer/testnet/tx/acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452),
[swap `2dcff6…`](https://stellar.expert/explorer/testnet/tx/2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b).
To record truly live on camera instead, see the appendix.

```bash
jq -r '.calls[] | "\(.fnName) @ \(.contract)  (tx \(.sourceHash[0:8])…)"' \
  examples/live/recorded-claim-swap.json
jq -r '.flows[] | "\(.direction)  \(.amount)  \(.asset.symbol)"' \
  examples/live/recorded-claim-swap.json
```

Expected output (_deterministic_):

```
swap_exact_tokens_for_tokens @ CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD  (tx 2dcff661…)
harvest @ CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357  (tx acf256a0…)
out  10000000  native
in  308600  USDC
```

Say: _"One merged recording: the exact contract calls the user authorized,
and the exact token movements — 1 XLM out, 0.03 USDC in."_

## Beat 2 — synthesize the least-privilege authorization

```bash
npm run cli -- synth --input examples/live/recorded-claim-swap.json
```

Expected output (_deterministic_; the summary section — spec.json and
context-rule.json follow it on screen):

```
policywright — synthesized smart-account authorization
======================================================

Source tx : 2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b
Network   : testnet (recorded from rpc)

Observed flow
-------------
  call swap_exact_tokens_for_tokens @ CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD
  call harvest @ CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357
  out  1 native
  in   0.03086 USDC
...
Installable OZ context rules (3) — see context-rule.json
----------------------------
  pw:swap  CallContract(CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD)
    valid until ledger 4336170; observed fns: swap_exact_tokens_for_tokens
    - custom:FrequencyLimitPolicy { window_secs: 86400, max_calls: 5 }
  pw:harvest  CallContract(CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357)
    valid until ledger 4336170; observed fns: harvest
    - custom:FrequencyLimitPolicy { window_secs: 86400, max_calls: 5 }
  pw:xfer:native  CallContract(CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
    valid until ledger 4336170; observed fns: transfer
    - stock:spending_limit { spending_limit: 11000000, period_ledgers: 17280 } (caps native transfers)

  6 composition note(s) in context-rule.json (unit conversions,
  deltas the stock policies cannot express).

Note: the generated FrequencyLimitPolicy Rust is ILLUSTRATIVE and
UNAUDITED — a starting point, not deploy-ready code.
```

Say: _"Three context rules, scoped to exactly the contracts the user touched.
The XLM that left the account gets the stock OpenZeppelin spending-limit with
its real install parameters — capped at 1.1× what was observed. The USDC that
only came IN gets no cap at all: least privilege."_

## Beat 3 — the emitted installable rule + params

```bash
jq '.contextRules[] | {name, contract: .contextType.contract,
    policies: [.policies[] | {policy, installParams}]}' \
  examples/live/context-rule.json
```

Expected output (_deterministic_; committed artifact from the same recording):

```json
{
  "name": "pw:swap",
  "contract": "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD",
  "policies": [
    { "policy": "custom:FrequencyLimitPolicy", "installParams": { "window_secs": 86400, "max_calls": 5 } }
  ]
}
{
  "name": "pw:harvest",
  "contract": "CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357",
  "policies": [
    { "policy": "custom:FrequencyLimitPolicy", "installParams": { "window_secs": 86400, "max_calls": 5 } }
  ]
}
{
  "name": "pw:xfer:native",
  "contract": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  "policies": [
    { "policy": "stock:spending_limit", "installParams": { "spending_limit": "11000000", "period_ledgers": 17280 } }
  ]
}
```

Say: _"These are the real OpenZeppelin v0.7.2 install shapes —
`spending_limit: i128, period_ledgers: u32` — 11000000 stroops is the observed
1 XLM outflow times 1.1, and 17280 ledgers is one day at 5 seconds per ledger,
OpenZeppelin's own DAY_IN_LEDGERS. A CI test validates this committed file
against the OZ install signature."_

## Beat 4 — the deployed generated policy, hash-verified live

```bash
stellar contract fetch \
  --id CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP \
  --network testnet -o /tmp/onchain.wasm
shasum -a 256 /tmp/onchain.wasm
```

Expected output (re-verified live 2026-08-03):

```
42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed  /tmp/onchain.wasm
```

Say: _"The generated frequency-limit policy is a compiled Rust crate — 25 unit
tests against the real OpenZeppelin Policy trait — and this instance is
deployed on testnet. We just pulled its wasm back off-chain: the SHA-256
matches the reproducible local build, recorded in FACTS.md §1.5 and in the
deployment log in evidence/EVIDENCE.md. Unaudited, testnet-only — the audit is
a Tranche 3 deliverable."_

Contract on the explorer:
[`CDSVPSTS…2ZPP`](https://stellar.expert/explorer/testnet/contract/CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP).

## Beat 5 (optional close) — the offline dry-run harness

```bash
npm run demo
```

Expected output ends with (_deterministic_):

```
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1357.9500001 BLND exceeds the 1357.95 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CBGAPUV74GVQYQYBHMIN4LF5ZEHYIMM4L5VBGUBB4IJXM5D4RQ7275J7 is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1751414401 is after the rule expires at 1751414400 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |
| route through an unobserved token | ⚠️ flag (argument-constraint) | ... |

All 6 dry-run scenarios behaved as expected.
Artefacts written to /Volumes/projects/policywright/out/
```

Say: _"And before anything is installed on-chain, the dry-run harness proves
the authorization permits exactly the recorded flow and denies everything
outside it."_

---

## Appendix — recording truly live on camera

The `record` beat can be performed against fresh hashes instead of the
committed recording:

1. Execute a small testnet Soroswap swap (XLM → USDC, tens of XLM at most —
   the pair's liquidity is shallow) from any funded testnet account. Easiest:
   <https://app.soroswap.finance> switched to Testnet. Details and contract
   IDs: [FACTS.md §4](FACTS.md).
2. Then, within the RPC retention window (~7 days):

```bash
npm run record -- <yourTxHash> --network testnet --account <yourG...address> \
  > /tmp/my-recording.json
npm run cli -- synth --input /tmp/my-recording.json
```

The output has the same shape as Beats 1–3, with your own hash in
`sourceHashes`. (`--account` is the subject whose authorizations are being
scoped; use the account that signed the swap.)
