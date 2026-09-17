# Demo script — Tranche 2 recorded demo (≤5:00)

Teleprompter for the T2 submission video. One continuous story on one real
flow — not a five-feature tour.

**Opening line / arc:**

> In Tranche 1 this worked from the command line — in Tranche 2, an agent can
> use it, a human still signs, and the chain enforces what was granted.

**EXPECT capture date:** 2026-09-17. Narrated submission videos committed under
`evidence/demo/` (primary: `t2-demo-complete-with-audio.mp4`). Freighter
preferred path remains **BLOCKED-honest** for unpacked extension bridge —
[evidence/freighter/SESSION-2026-09-17.md](../evidence/freighter/SESSION-2026-09-17.md).

**Honest gate summary:**

| Beat                  | Surface                           | Status (2026-09-17)                                                                                                                |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0 Cold open           | repo, CI, docs                    | Recorded (narrated) — docs live (`policywright.lemmalabs.space`, Shipped)                                                          |
| 1 Agent asks          | MCP + Claude skill                | Recorded — transcripts + narrated deck / live CLI synth                                                                            |
| 2 Deny table          | dry-run + `--constrain-arguments` | Recorded (narrated)                                                                                                                |
| 3 Artefacts           | compose + generate                | Recorded (narrated)                                                                                                                |
| 4 Install / Freighter | wallet + verify                   | Verify green on camera (local-signer); Freighter popup **BLOCKED-honest**. **Omit chain kill-shot** (S3 BLOCKED).                  |
| 5 Proof wall          | EVIDENCE + close                  | Recorded (narrated)                                                                                                                |

S3 chain enforcement through the C-account was **BLOCKED-honest**
([evidence/REALITY-CHECK.md](../evidence/REALITY-CHECK.md)). Do **not** film
or imply an on-chain over-cap reject.

---

## RECORDING NOTES

- Target cut ≤ **5:00** continuous; jump-cut slow tool calls with visible
  timestamps.
- Terminal ≥16pt dark theme; 1080p+; clean browser profile.
- Freighter on **testnet only**; never show seed phrases or `.env`.
- Lower-thirds: `D2.1 · MCP`, `D2.2 · Claude skill`, `D2.3 · Simulate`,
  `D2.4 · Emit`, `D2.5 · Install`, `Evidence`.
- Prefer morning-of live hashes inside RPC retention when filming Beat 1; the
  offline stand-in below uses the committed claim→swap recording (RPC aged
  out — explorer links still work).
- Upload public or unlisted; open the link logged out before submitting.
- If Freighter / agent sessions are not ready, film Beats 0, 2, 3, 5 and
  title-card the blocked beats — never splice a mock Freighter popup.

Prep:

```bash
git clone https://github.com/kunaldrall29/policywright && cd policywright
npm ci
```

Repo: <https://github.com/kunaldrall29/policywright>  
Docs: <https://policywright.lemmalabs.space>  
Evidence: [evidence/EVIDENCE.md](../evidence/EVIDENCE.md)

---

## Beat 0 — Cold open (0:00–0:25)

**SHOW**

1. GitHub repo root with CI badge.
2. Docs roadmap: <https://policywright.lemmalabs.space/roadmap/> (after
   redeploy — see TRANCHE2-FORM deploy checklist if Overview is stale).

**SAY**

> In Tranche 1 this worked from the command line — in Tranche 2, an agent can
> use it, a human still signs, and the chain enforces what was granted.

---

## Beat 1 — The agent asks (0:25–1:15) · D2.2 + D2.1

**Lower-third:** `D2.2 · Claude skill` → `D2.1 · MCP tools` while tools fire

**Status: filmable / recorded** — MCP server and skill are in-repo. Film against
a real MCP session (`npm run mcp`) with the skill loaded, or use the committed
narrated deck + [evidence/sessions/](../evidence/sessions/).

**SHOW**

1. Claude (or Cursor) with `skills/policywright/` loaded.
2. Natural ask (committed stand-in path):

   > Grant the tightest permission to repeat our Blend claim → Soroswap swap
   > from `examples/live/recorded-claim-swap.json`.

3. MCP tools fire: `record` and/or `synthesize`, then clarification on cap /
   lifetime.
4. Skill presents the rule + **UNAUDITED** banner. No install tool.

**SAY**

> The agent recorded the flow, asked before widening the grant, and showed the
> unaudited banner before anyone signed.

**DO** (engine underneath — REAL capture 2026-09-16 for numbers on screen):

```bash
npx tsx src/cli.ts synth --input examples/live/recorded-claim-swap.json
```

**`[EXPECT]`** (_deterministic_ — captured 2026-09-16):

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

Policies (2)
--------
  - spending-limit: native <= 1.1 per 86400s (observed gross out 1)
  - frequency-limit: <= 5 call(s) per 86400s

Installable OZ context rules (3) — see context-rule.json
----------------------------
  pw:swap  CallContract(CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD)
    - custom:FrequencyLimitPolicy { window_secs: 86400, max_calls: 5 }
  pw:harvest  CallContract(CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357)
    - custom:FrequencyLimitPolicy { window_secs: 86400, max_calls: 5 }
  pw:xfer:native  CallContract(CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
    - stock:spending_limit { spending_limit: 11000000, period_ledgers: 17280 } (caps native transfers)

Note: the generated FrequencyLimitPolicy Rust is ILLUSTRATIVE and
UNAUDITED — a starting point, not deploy-ready code.
```

---

## Beat 2 — Prove it's not too loose (1:15–2:00) · D2.3

**Lower-third:** `D2.3 · Simulate`

**SHOW** (same conversation, or CLI if filming without agent):

```bash
npx tsx src/cli.ts simulate --input examples/live/recorded-claim-swap.json
npx tsx src/cli.ts simulate --input examples/live/recorded-claim-swap.json --constrain-arguments
```

Hold on **BLND→XLM**: flag with constraints off, deny with them on.

**SAY**

> Same recorded flow is permitted. Over the spend cap is denied. An unobserved
> route is only a flag until argument constraints are on — then it is a deny.

**`[EXPECT]`** — constraints **off** (_captured 2026-09-16_):

```
# policywright dry-run report

Source: `examples/live/recorded-claim-swap.json`
constrainArguments: **off** (default — unobserved routes FLAG / advisory only)

| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 native exceeds the 1.1 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357 is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1787699317 is after the rule expires at 1787699316 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |
| route through an unobserved token | ⚠️ flag (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ; not enforced (constrainArguments is off) |
| BLND→XLM (unobserved route) | ⚠️ flag (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF; not enforced (constrainArguments is off) |
```

**`[EXPECT]`** — constraints **on** (_captured 2026-09-16_):

```
constrainArguments: **on** (argument constraints enforced — unobserved routes DENIED)

| BLND→XLM (unobserved route) | ⛔ deny (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF |
```

(Full table matches off, except unobserved-route rows flip flag → deny.)

Committed twins:
[simulation-report-args-off.md](../examples/live/simulation-report-args-off.md),
[simulation-report-args-on.md](../examples/live/simulation-report-args-on.md).

---

## Beat 3 — What it actually produced (2:00–2:40) · D2.4

**Lower-third:** `D2.4 · Emit`

**SHOW** side-by-side:

```bash
jq '.contextRules[] | select(.policies[].policy == "stock:spending_limit")
  | {name, policy: .policies[] | select(.policy=="stock:spending_limit")}' \
  examples/live/context-rule.json

npm run demo >/dev/null
head -20 out/FrequencyLimitPolicy.rs
```

**SAY**

> Stock OpenZeppelin where it can express the constraint; generated code only
> where it can't.

**`[EXPECT]`** — stock spending*limit (\_captured 2026-09-16*):

```json
{
  "name": "pw:xfer:native",
  "policy": {
    "policy": "stock:spending_limit",
    "address": null,
    "installParams": {
      "spending_limit": "11000000",
      "period_ledgers": 17280
    },
    "paramsSource": "OpenZeppelin/stellar-contracts@v0.7.2 packages/accounts/src/policies/spending_limit.rs:88-94 — SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 }; install guards :367-405 (CallContract-only, positive params, AlreadyInstalled)",
    "derivedFrom": {
      "asset": {
        "contractId": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        "symbol": "native",
        "decimals": 7,
        "resolved": true
      },
      "observedGrossOut": "10000000",
      "spendWindowSecs": 86400
    }
  }
}
```

**`[EXPECT]`** — generated Rust banner (_captured 2026-09-16_):

```
// =============================================================================
//  ILLUSTRATIVE / UNAUDITED — NOT DEPLOY-READY
//
//  Generated contracts are illustrative and unaudited — not for production
//  deployment until the Audit Bank audit.
```

On-chain generated policy:
[`CDSVPSTS…`](https://stellar.expert/explorer/testnet/contract/CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP).

---

## Beat 4 — Install and human sign (2:40–3:50) · D2.5

**Lower-third:** `D2.5 · Install`

**Status:** Testnet smart account already holds three installed rules.
Local-signer install path is green on camera; **Freighter preferred path is
BLOCKED-honest** for unpacked extension bridge (documented — do not mock).

**SHOW (recordable today without Freighter)**

1. Live verify (REAL):

```bash
npx tsx src/cli.ts verify \
  --smart-account CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT \
  --context-rule examples/live/context-rule.json
```

**`[EXPECT]`** (_captured 2026-09-16_):

```
verify ok — 3 context rule(s) match on-chain snapshot (live CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT).
```

2. Explorer: SA
   [`CAXBVHXP…`](https://stellar.expert/explorer/testnet/contract/CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT)
   - install txs
     [`5907ecbf…`](https://stellar.expert/explorer/testnet/tx/5907ecbf76be7738fc1468dbfb4023a4833fe63a011dbe73b85268ce9b6fe8da),
     [`589faaad…`](https://stellar.expert/explorer/testnet/tx/589faaad0a4ff19fed88b5fe9714f21d930b4b541b9b24469d34868bb54b30aa),
     [`36791fe4…`](https://stellar.expert/explorer/testnet/tx/36791fe400463f32654ed8b003c7d7c776e5fe9775bc3631ff835e1a41a44654).

**SHOW when Freighter available ([BLOCKER] until then)**

1. Simulate-first (reuse Beat 2 table).
2. Hold Freighter `signAuthEntry` popup a full beat.
3. Approve → submit → verify green.

**SAY** (only when Freighter frame is real)

> Simulate first. The human signs in Freighter. The chain holds the grant.

**Chain kill-shot: OMIT entirely.** S3 was BLOCKED (AuthPayload /
stellar-cli cannot sign nested C-account auth). Do not imply on-chain
rejection of an over-cap call. Disclose in evidence if asked — never invent
the shot.

Narration fallback if only local-signer is on camera:

> Install used the labeled local-signer fallback for headless testnet; Freighter
> remains the preferred interactive path.

---

## Beat 5 — Proof wall and honest close (3:50–4:45)

**Lower-third:** `Evidence`

**SHOW**

1. Scroll [evidence/EVIDENCE.md](../evidence/EVIDENCE.md) — D2.1–D2.5 criteria
   verbatim → links/hashes.
2. [evidence/REALITY-CHECK.md](../evidence/REALITY-CHECK.md) scorecard (S1/S2/S6
   PASS; S3/S4/S5 honest blockers).
3. End card:

   ```
   github.com/kunaldrall29/policywright
   policywright.lemmalabs.space
   ```

**SAY**

> Adversarially usage-tested where we could; findings fixed or disclosed.
> Limits: testnet-only; unaudited until the Tranche 3 Audit Bank audit. MCP and
> skill sessions are recorded under evidence/sessions; Freighter interactive
> signing remains preferred-path polish when the browser bridge is available.

---

## Appendix — Morning-of refresh

```bash
# Optional live record (hashes inside RPC retention):
npm run record -- <claimHash> <swapHash> --network testnet --account <subject> \
  > /tmp/t2-morning.json
npx tsx src/cli.ts synth --input /tmp/t2-morning.json | tee /tmp/t2-synth.txt
npx tsx src/cli.ts simulate --input /tmp/t2-morning.json
npx tsx src/cli.ts simulate --input /tmp/t2-morning.json --constrain-arguments
# Paste fresh [EXPECT] into Beats 1–2 before filming.
```
