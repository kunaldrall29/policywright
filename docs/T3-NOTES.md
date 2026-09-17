# T3 notes (Phase 4 carry-overs)

Notes that are out of scope for Phase 4 fixes, or blocked on tooling that
belongs in Tranche 3 validation / walkthroughs.

## S3 — On-chain enforcement through the smart account

**Account (verify-green):**
`CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT`
(see `evidence/demo-addresses.md`).

**Live verify (2026-09-16):** green vs `examples/live/context-rule.json` (3
CallContract rules).

**Intended checks:**

| Case | Intent                                        |
| ---- | --------------------------------------------- |
| (a)  | In-scope action permitted through the account |
| (b)  | Over spend-cap rejected                       |
| (c)  | Out-of-scope call rejected                    |
| (d)  | Frequency window enforced (if feasible)       |

### BLOCKED-honest (Phase 4)

**Named cause:** `Missing signing key for account C…` when invoking a SAC
`transfer` with `--from` = the smart account via stellar-cli.

- Funding the SA with native XLM succeeded (G→SA SAC transfer).
- Any call that requires the C-account to authorize hits stellar-cli’s inability
  to sign Delegated / AuthPayload entries for arbitrary user operations.
- The repo’s AuthPayload harness ([`src/install/sign-delegated.ts`](../src/install/sign-delegated.ts))
  covers **`add_context_rule` install only**, not general invoke-through-account.

**Do not fake (a)–(d).** T3 work: extend AuthPayload signing to policy-gated
user invocations, and/or Freighter `signAuthEntry` walkthroughs.

## S4 / S5 — Human agent & skill recordings

Blocked on human-run sessions. Session prompts + rubrics:

- [reality-agent-session.md](./reality-agent-session.md)
- [reality-skill-session.md](./reality-skill-session.md)

## DESIGN-QUESTION → T3

- Whether `TX_NOT_FOUND` should split into a distinct `WRONG_NETWORK` code when
  a hash is known on another network (Phase 4 documents the current reuse; F6).
- Full end-to-end walkthroughs with Freighter-preferred signing (preferred over
  local-signer fallback).
