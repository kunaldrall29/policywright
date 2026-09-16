# T3 notes (Phase 4 carry-overs)

Notes that are out of scope for Phase 4 fixes, or blocked on tooling that
belongs in Tranche 3 validation / walkthroughs.

## S3 — On-chain enforcement through the smart account

**Account (verify-green):**
`CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT`
(see `evidence/demo-addresses.md`).

**Intended checks:**

| Case | Intent |
| ---- | ------ |
| (a) | In-scope action permitted through the account |
| (b) | Over spend-cap rejected |
| (c) | Out-of-scope call rejected |
| (d) | Frequency window enforced (if feasible) |

**Status:** See `evidence/REALITY-CHECK.md` §S3. If Phase 4 cannot complete
(a)–(d) without Freighter interactive auth or further OZ AuthPayload harness
work, record **BLOCKED-honest** here with the named cause — do not fake success.

## S4 / S5 — Human agent & skill recordings

Blocked on human-run sessions. Session prompts + rubrics:

- [reality-agent-session.md](./reality-agent-session.md)
- [reality-skill-session.md](./reality-skill-session.md)

## DESIGN-QUESTION → T3

- Whether `TX_NOT_FOUND` should split into a distinct `WRONG_NETWORK` code when
  a hash is known on another network (Phase 4 documents the current reuse).
- Full end-to-end walkthroughs with Freighter-preferred signing (preferred over
  local-signer fallback).
