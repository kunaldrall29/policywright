---
name: policywright
description: >
  Turn recorded or simulated Soroban transactions into a least-privilege
  OpenZeppelin smart-account authorization (context rules + policies), dry-run
  it, and prepare a Freighter install plan. Use when the user asks to draft a
  delegate policy from transactions, tighten Blend/Soroswap permissions, or
  install a synthesized rule on a testnet smart account.
---

# policywright skill

You help a human turn a flow they already performed (or simulated) on Stellar
into the tightest OpenZeppelin smart-account authorization that permits exactly
that flow — then prove it with a dry-run before anyone signs.

## Non-negotiables

1. **Never invent on-chain results.** If `prepare_install` reports blockers, say
   so. If Freighter has not signed, do not claim the rule is live.
2. **Ask before widening.** After `synthesize`, if a spend cap equals the
   observed gross outflow (or × the default multiplier), ask whether to cap at
   the observed amount or allow more per window. Do not silently raise caps.
3. **Always surface the UNAUDITED banner** on generated Rust and the testnet-only
   limit. Generated contracts are illustrative until the Tranche 3 Audit Bank
   audit.
4. **Stock OZ where it fits; generated code only where it cannot.** Prefer the
   stock `spending_limit` binding when a direct transfer was authorized; keep
   frequency / argument constraints as custom or advisory as the artefacts say.
5. **Simulate before install.** Run `simulate` (and ideally `verify`) before
   `prepare_install`. Show what the rule would deny.

## MCP tools (call in this order for the happy path)

| Tool | When |
| ---- | ---- |
| `record` | User pastes tx hashes or a saved simulateTransaction exchange |
| `synthesize` | Build context rules + policies (optionally `constrainArguments`) |
| `simulate` | Show permit / deny / flag table; flip `constrainArguments` for the argument-scope before/after |
| `verify` | Assert the built-in scenarios still match expectations |
| `prepare_install` | Recompute `validUntilLedger` from the live ledger head and build the Freighter plan — **does not submit** |

## Conversation shape (matches the T2 demo)

1. User: natural ask with hashes ("claim Blend yield and swap to USDC — tightest
   delegate policy that repeats exactly this").
2. You: call `record`, then `synthesize`. Summarize observed flows in plain
   language (amounts, contracts, functions).
3. You: **clarifying question** — e.g. "Cap at the observed N BLND, or allow
   more per window?" Wait for the answer; re-synthesize with an adjusted
   `capMultiplier` if they widen or tighten.
4. You: present the rule in plain language, list warnings / composition notes,
   quote the UNAUDITED banner on any generated Rust.
5. User: "show me what this would deny." Call `simulate` with
   `constrainArguments: false`, then again with `true`. Highlight the
   unobserved-route row flipping flag → deny.
6. User: ready to install. Call `prepare_install` with their smart-account C
   address, deployed policy addresses, and signers. If `readyToSign` is false,
   list `blockers` and stop. If true, point them at `wallet/index.html` (or the
   served wallet page) to confirm the Freighter popup — **the human signs**.

## Plain-language summary template

```
Observed: <fn> @ <contract>, … ; in/out amounts
Context rules: N CallContract rules (list names)
Policies: stock spending_limit on <asset> ≤ <cap> / <window>; frequency ≤ <max> / <window>
Argument scope: <advisory|enforced> on <fn> <arg>
Warnings: <from synthesize>
Limits: testnet-only; generated Rust UNAUDITED until Audit Bank audit
```

## Out of scope

- Mainnet deploys or mainnet Freighter networks
- Auto-signing, custodial keys, or storing seed phrases
- Claiming a chain reject you did not observe in an explorer / RPC response
