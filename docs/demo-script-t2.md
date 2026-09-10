# Demo script — Tranche 2 recorded demo (~4:30)

Teleprompter for the T2 submission video. One continuous story on one real
flow — not a five-feature tour. Generated against the amended
[Prompt 6](prompts/prompt-6.md) beat list (MCP session + skill conversation
merged; proof-wall close; conditional Scenario-3 shot).

**Opening line / arc:**

> In Tranche 1 this worked from the command line — in Tranche 2, an agent can
> use it, a human still signs, and the chain enforces what was granted.

**EXPECT capture date:** 2026-09-10 (offline / committed artefacts). Replace
any `_live_` blocks the morning you record with fresh hashes inside RPC
retention.

**Honest gate summary (read before recording):**

| Beat | Surface | Status in this repo (2026-09-10) |
| ---- | ------- | -------------------------------- |
| Cold open | repo, CI, docs roadmap | Recordable |
| Agent asks (D2.1+D2.2) | MCP server + Claude skill | **GATE** — not started ([T2-NOTES.md](T2-NOTES.md)). Do not film a staged agent. |
| Deny table (D2.3) | dry-run + `--constrain-arguments` | Recordable via CLI today (agent wraps the same harness when shipped) |
| Artefacts (D2.4) | `context-rule.json` + generated Rust | Recordable |
| Install / Freighter / chain (D2.5) | wallet + on-chain install | **GATE** — not started. Prompt R Scenario 3: **not run** → omit the on-chain over-cap shot; say nothing implied. |
| Proof wall | `EVIDENCE.md`, docs site | Recordable (T1 criteria today; flip T2 rows when evidenced) |

Until the gates clear, record only the recordable beats and cut the gated ones
out of the cut — never splice a mock Freighter popup or a simulated chain
reject.

---

## Production checklist (off camera)

- [ ] Fresh testnet claim + swap the morning of recording; keep hashes.
- [ ] `npm ci`; terminal ≥16pt dark theme; 1080p+; clean browser profile.
- [ ] Freighter on testnet only; seed phrases and `.env` never on screen.
- [ ] Lower-thirds ready: `D2.1 · MCP`, `D2.2 · Claude skill`, `D2.3 · Simulate`, `D2.4 · Emit`, `D2.5 · Install`, `Evidence`.
- [ ] Record beat-by-beat; jump-cut with visible timestamps on slow tool calls.
- [ ] Upload public or unlisted; open the link logged out before submitting.

Prep:

```bash
git clone https://github.com/kunaldrall29/policywright && cd policywright
npm ci
# optional local docs:
(cd site && npm ci && npm run dev -- --host 0.0.0.0 --port 4321)
```

Repo: <https://github.com/kunaldrall29/policywright>  
Docs: <https://policywright.lemmalabs.space>  
CI badge: green on `main` (verify the morning you record).

---

## Beat 0 — Cold open (0:00–0:25)

**Lower-third:** _(none — brand the repo)_

**SHOW**

1. GitHub repo root with the green CI badge visible.
2. Docs roadmap: <https://policywright.lemmalabs.space/roadmap/> — T1 approved /
   shipped rows; T2 rows flipped only when those deliverables are evidenced
   (do not Photoshop the roadmap).

**SAY**

> In Tranche 1 this worked from the command line — in Tranche 2, an agent can
> use it, a human still signs, and the chain enforces what was granted.

---

## Beat 1 — The agent asks (0:25–1:15) · D2.2 + D2.1 in one motion

**Lower-third:** `D2.2 · Claude skill` (switch to `D2.1 · MCP tools` while tool
calls are on screen, then back)

**GATE:** MCP server (`record` / `synthesize` / `simulate` / `verify`) and the
Claude skill are **not started**. Skip this beat on camera until both ship.
The dialogue below is the prescribed shape — film it only against the real
skill + MCP, with visible timestamps on tool latency.

**SHOW**

1. Claude (or Cursor) with the policywright skill loaded.
2. Type the natural ask (substitute morning-of hashes / observed amounts):

   > Here are two testnet transactions — claiming my Blend yield and swapping
   > to USDC. Draft the tightest policy that lets a delegate repeat exactly
   > this.

3. MCP tool calls fire visibly: `record`, then `synthesize`.
4. Skill clarification (do not skip):

   > Cap at the observed _N_ BLND, or allow more per window?

5. Answer (example): cap at observed × 1.1 (the synthesizer default).
6. Skill presents the rule in plain language, with warnings and the
   **UNAUDITED** banner.

**SAY** (after the exchange lands)

> The agent recorded the flow, asked before widening the grant, and showed the
> unaudited banner before anyone signed.

**DO** (engine underneath — same day capture for `[EXPECT]` when MCP lands)

```bash
# Morning-of live record (hashes inside RPC retention):
npm run record -- <claimHash> <swapHash> --network testnet --account <C...|G...> \
  > /tmp/t2-morning.json
npm run cli -- synth --input /tmp/t2-morning.json
```

**Offline stand-in used to pin numbers for this script (fixture, deterministic):**

```bash
npm run cli -- synth
```

**`[EXPECT]`** (_deterministic_ — fixture 2026-09-10):

```
Observed flow
-------------
  call claim @ CCFZSK3W5W54JT2QPLBDDQ5W4JEIVBG3PUFONKE5YOMS52L6GQIPIV4V
  call swap_exact_tokens_for_tokens @ CBGAPUV74GVQYQYBHMIN4LF5ZEHYIMM4L5VBGUBB4IJXM5D4RQ7275J7
  in   1234.5 BLND
  out  1234.5 BLND
  in   49.38 USDC

Policies (2)
--------
  - spending-limit: BLND <= 1357.95 per 86400s (observed gross out 1234.5)
  - frequency-limit: <= 5 call(s) per 86400s

Note: the generated FrequencyLimitPolicy Rust is ILLUSTRATIVE and
UNAUDITED — a starting point, not deploy-ready code.
```

Clarification copy for the skill (adapt _N_ to the morning recording; fixture
_N_ = **1234.5 BLND**, default cap **1357.95**):

> Cap at the observed 1234.5 BLND, or allow more per window?

---

## Beat 2 — Prove it's not too loose (1:15–2:00) · D2.3

**Lower-third:** `D2.3 · Simulate`

**SHOW**

Continue the **same** agent conversation:

> show me what this would deny.

Until the skill ships, the identical table is the CLI dry-run (film this):

```bash
npm run cli -- simulate
npm run cli -- simulate --constrain-arguments
```

Hold on the argument-scope pair: **BLND→XLM flagged with constraints off,
denied with them on.** That before/after is the whole feature in ~10 seconds.

**SAY**

> Same recorded flow is permitted. Over the spend cap is denied. An unobserved
> route is only a flag until argument constraints are on — then it is a deny.

**`[EXPECT]`** — constraints **off** (_deterministic_ 2026-09-10):

```
| Scenario | Decision | Reason |
| --- | --- | --- |
| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |
| over the spend cap | ⛔ deny (spending-limit) | outflow of 1357.9500001 BLND exceeds the 1357.95 cap per 86400s |
| call to an unseen function | ⛔ deny (scope) | set_admin @ CBGAPUV74GVQYQYBHMIN4LF5ZEHYIMM4L5VBGUBB4IJXM5D4RQ7275J7 is outside the context rule's scope |
| call after rule expiry | ⛔ deny (lifetime) | call at 1751414401 is after the rule expires at 1751414400 |
| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |
| route through an unobserved token | ⚠️ flag (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ; not enforced (constrainArguments is off) |
```

**`[EXPECT]`** — constraints **on** (_deterministic_ 2026-09-10):

```
| route through an unobserved token | ⛔ deny (argument-constraint) | swap_exact_tokens_for_tokens path routes through unobserved token(s) CZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ |
```

(Full table identical to off, except that last row flips flag → deny.)

---

## Beat 3 — What it actually produced (2:00–2:40) · D2.4

**Lower-third:** `D2.4 · Emit`

**SHOW**

Side-by-side file shots:

1. Composed `spending_limit` (live committed artefact — stock OZ where a direct
   transfer was authorized):

```bash
jq '.contextRules[] | select(.policies[].policy == "stock:spending_limit")
  | {name, policy: .policies[] | select(.policy=="stock:spending_limit")}' \
  examples/live/context-rule.json
```

2. Generated Rust banner at the top:

```bash
npm run demo >/dev/null
head -20 out/FrequencyLimitPolicy.rs
```

**SAY**

> Stock OpenZeppelin where it can express the constraint; generated code only
> where it can't.

**`[EXPECT]`** — stock spending_limit with OZ citation (_deterministic_,
committed live artefact):

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

**`[EXPECT]`** — generated Rust banner (_deterministic_):

```
// =============================================================================
//  ILLUSTRATIVE / UNAUDITED — NOT DEPLOY-READY
//
//  Generated contracts are illustrative and unaudited — not for production
//  deployment until the Audit Bank audit.
```

**Honesty note for narration:** the fixture claim→swap path records BLND via
pool/router auth, so the BLND gross-out cap is a **DELTA note** in
`context-rule.json` (stock `spending_limit` only meters direct `transfer`).
The live XLM→USDC half of `examples/live/` is where stock `spending_limit`
attaches — show that file for the OZ citation shot.

---

## Beat 4 — Install and enforce (2:40–3:50) · D2.5

**Lower-third:** `D2.5 · Install`

**GATE:** Wallet integration (Freighter sign → install on a smart account →
on-chain enforce) is **not started**. Do not film this beat until it ships.

**Prescribed shape (film only against the real path):**

1. Simulate-first (reuse Beat 2 table on screen).
2. Freighter popup — **hold a full beat**; that frame proves client-side
   signing and "never auto-deploys."
3. Approve → submit → verify diff green.
4. Explorer view of the C-address with the rule and policies live.

**Conditional Scenario 3 (Prompt R):**

- If Scenario 3 **passed** the morning of recording: ~10 seconds on an over-cap
  attempt **rejected by the chain**, error on screen. Capture the tx / error
  verbatim into `[EXPECT]` `_live YYYY-MM-DD_`.
- If Scenario 3 was **honestly blocked**: **cut this shot and say nothing
  implied** — never simulate the chain's verdict.

**Status 2026-09-10:** Scenario 3 not run → **omit** the on-chain rejection
shot from the cut.

**SAY** (only when Freighter + install are real)

> Simulate first. The human signs in Freighter. The chain holds the grant.

---

## Beat 5 — Proof wall and honest close (3:50–4:30)

**Lower-third:** `Evidence`

**SHOW**

1. Scroll `evidence/EVIDENCE.md` slowly — criteria verbatim → links.
2. Live docs pages (roadmap, security, getting-started).
3. End card:

   ```
   github.com/kunaldrall29/policywright
   policywright.lemmalabs.space
   ```

**SAY**

> _(only if earned)_ Adversarially usage-tested; findings fixed or disclosed.
>
> Limits: testnet-only; unaudited until the Tranche 3 Audit Bank audit. T3 is
> audit, mainnet, and the three walkthroughs.

**DO**

```bash
# Confirm CI still green the morning you record:
# https://github.com/kunaldrall29/policywright/actions
less evidence/EVIDENCE.md
```

---

## Appendix A — CLI rehearsal cut (recordable today)

If you need a same-day assembly draft before MCP / skill / Freighter land,
record this shortened cut from the recordable beats only:

| Time | Content |
| ---- | ------- |
| 0:00–0:25 | Cold open (repo, CI, roadmap) + opening line |
| 0:25–1:10 | D2.3 simulate off → on (title card: "dry-run harness — agent will call the same tool") |
| 1:10–1:50 | D2.4 side-by-side spending_limit citation + Rust banner |
| 1:50–2:30 | Proof wall + honest close (state gates out loud: agent + wallet still T2) |

Do **not** label a CLI rehearsal as the T2 submission video.

---

## Appendix B — Morning-of refresh commands

```bash
# 1) Execute claim + swap on testnet; copy hashes while RPC retention holds.
# 2) Record + synth + simulate:
npm run record -- <h1> <h2> --network testnet --account <subject> > /tmp/t2-morning.json
npm run cli -- synth --input /tmp/t2-morning.json | tee /tmp/t2-synth.txt
# 3) Paste fresh [EXPECT] blocks into Beats 1–2 before filming.
# 4) When MCP/skill/wallet exist, replace CLI steps with the agent conversation
#    and Freighter path; keep the same SAY lines.
```
