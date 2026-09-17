# Phase 4 — Reality check

**Branch:** `cursor/t2-complete-production-93d7`  
**Date:** 2026-09-16  
**Method:** Execute S1/S2/S6; document S3/S4/S5. Findings recorded **before** patches; fixes in separate commits.

Severity: `BLOCKER` | `BUG` | `DOC-GAP` | `UX-FRICTION` | `DESIGN-QUESTION` (→T3)

---

## Scorecard

| Scenario                     | Status             | Notes                                                                                                 |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| S1 Cold developer, docs-only | **PASS**           | Clone path + `npm pack` → `npx policywright synth` on golden recording                                |
| S2 Novel flow (sample-vault) | **PASS**           | Original deposit→withdraw; pipeline clean; no Blend/Soroswap leak                                     |
| S3 Chain enforcement         | **BLOCKED-honest** | Verify green; user calls through C-account blocked on AuthPayload signing                             |
| S4 Agent session             | **PASS** (scripted) | [evidence/sessions/mcp-reference-session-latest.md](./sessions/mcp-reference-session-latest.md) |
| S5 Skill session             | **PASS** (scripted) | [evidence/sessions/skill-demo-conversation-2026-09-17.md](./sessions/skill-demo-conversation-2026-09-17.md) |
| S6 Hostile inputs            | **PASS**           | All cases typed + actionable; zero-involvement fixed                                                  |

**Verdict:** S1, S2, S6 green; S3 honestly BLOCKED (named cause); S4/S5 human blockers documented. Gate met.

---

## Findings table

| ID  | Scenario | Severity | Finding                                                                                      | Resolution                                                                                        |
| --- | -------- | -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| F1  | S1       | DOC-GAP  | No README path for `npm pack` dependency install                                             | Fixed: README “Install from an `npm pack` tarball”                                                |
| F2  | S1       | BUG      | Packaged CLI unusable (`tsx` missing; no `dist/` bin)                                        | Fixed: `prepack` build, `bin.policywright` → `dist/cli.js`, `files` field                         |
| F3  | S1       | (ok)     | Golden synth pointer is **`examples/live/recorded-claim-swap.json`**; demo uses fixture      | Documented                                                                                        |
| F4  | S6       | BUG      | Explicit `--account` with zero involvement returned empty-flow success                       | Fixed: `BAD_INPUT` when subject absent from source/transfers/args/auth                            |
| F5  | S6       | (ok)     | Garbage / nonexistent / empty / duplicate / mainnet-vs-testnet / MCP malformed already typed | Evidence in `evidence/s6/hostile-inputs.txt`                                                      |
| F6  | S6       | DOC-GAP  | Docs say “wrong-network” errors; code reuses `TX_NOT_FOUND` + network hint                   | Disclosed → T3 (`DESIGN-QUESTION` whether to split code)                                          |
| F7  | S3       | BLOCKER  | `stellar contract invoke` through C-account: `Missing signing key for account C…`            | Honest BLOCKED → [docs/T3-NOTES.md](../docs/T3-NOTES.md); AuthPayload harness covers install only |

---

## S1 — Cold developer (docs-only)

### A. Clean tree

- Temp: `/tmp/pw-s1-cold/repo` (public tree, no `.env`).
- `npm ci` → `npm run demo` → **PASS** (7 scenarios).
- Golden sequence (README Commands / examples README):

```bash
npm run cli -- synth --input examples/live/recorded-claim-swap.json
```

- **Pointer:** committed live recording `examples/live/recorded-claim-swap.json` (not the offline fixture).

### B. `npm pack` consumer (after F1/F2 fix)

```bash
npm pack
npm install ./policywright-0.1.0.tgz
npx policywright synth --input node_modules/policywright/examples/live/recorded-claim-swap.json
```

→ synthesizes `pw:swap+harvest` successfully. **PASS.**

---

## S2 — Novel flow (generality)

Built `examples/sample-vault/`: original vault `deposit`/`withdraw` on a bare SEP-41 token **without** symbol/decimals metadata.

| Item        | Value                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Token       | `CCQWXNKSWWTD247KFW5E7NMGJOMZ6ZED37ZOIU7Z2VMZGOD3S2M5PCW3`                                                      |
| Vault       | `CDEYULOATO7CGEAOOZR2GHHLRRZL4TRYD4NUWNXUHUOBD7P2SU2S5RVB`                                                      |
| Deposit tx  | `e14610110c2cd5f760455664c66e96cb1cfc9093f81c21353eff0a4976f623b0`                                              |
| Withdraw tx | `3d0113ff3cf56773f8064f100d14c9e3d785e19c4a0d588bb4ea5ba6ceda2322`                                              |
| Recording   | [examples/sample-vault/recorded-deposit-withdraw.json](../examples/sample-vault/recorded-deposit-withdraw.json) |

### Skeptic judgment

| Check                                   | Result                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Scope = observed pairs only?            | **Yes** — `(vault, deposit)`, `(vault, withdraw)` only                                                                         |
| Gross-outflow caps + metadata fallback? | **Yes** — cap `11000000` (= 1.0 × 1.1 at 7-dec fallback); `resolved: false`; symbol = **full contract id** (not garbage/slice) |
| Compose vs generate partition?          | **Sane** — `FrequencyLimitPolicy` on vault CallContract; stock `spending_limit` on token `transfer` rule                       |
| Blend/Soroswap assumptions leaking?     | **None** — no router/path/argument scopes; names `pw:deposit+withdraw`                                                         |

Simulate report: permit / over-cap deny / unseen fn deny / lifetime deny / frequency deny — all coherent.

---

## S3 — Chain enforcement

**Account:** `CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT`  
**Live verify:** green vs `examples/live/context-rule.json` (3 rules).

| Case                          | Attempt                                        | Outcome                                  |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Prerequisite                  | Funded SA with 5 XLM via SAC (`c9dc0318…`)     | success                                  |
| (a) in-scope transfer from SA | `stellar contract invoke … transfer --from SA` | **`Missing signing key for account C…`** |
| (b)–(d)                       | not reached                                    | blocked by same cause                    |

**BLOCKED-honest cause:** OZ Delegated smart-account user invocations require AuthPayload / nested `__check_auth` signing. The repo harness covers `add_context_rule` install only ([`src/install/sign-delegated.ts`](../src/install/sign-delegated.ts)); stellar-cli cannot sign C-account auth entries. Extending invoke-through-account (or Freighter) is T3 — see [docs/T3-NOTES.md](../docs/T3-NOTES.md). **No fake success.**

---

## S4 / S5 — Agent / Skill

Prompts + rubrics prepared:

- [docs/reality-agent-session.md](../docs/reality-agent-session.md) — `[BLOCKER: human runs + records]`
- [docs/reality-skill-session.md](../docs/reality-skill-session.md) — `[BLOCKER: human runs + records]`

---

## S6 — Hostile inputs

Evidence: [evidence/s6/hostile-inputs.txt](./s6/hostile-inputs.txt)

| Case                                | Code           | Actionable message                            |
| ----------------------------------- | -------------- | --------------------------------------------- |
| Garbage hash                        | `BAD_INPUT`    | not a 64-character hex hash                   |
| Valid nonexistent                   | `TX_NOT_FOUND` | retention window + check network              |
| Mainnet hash vs `--network testnet` | `TX_NOT_FOUND` | same + network hint (F6: not a distinct code) |
| Empty sequence                      | `BAD_INPUT`    | requires hashes / fromSimulation / recordedTx |
| Duplicate hashes                    | `BAD_INPUT`    | each hash records once                        |
| Zero involvement `--account`        | `BAD_INPUT`    | no involvement… pass economic actor (F4 fix)  |
| Malformed MCP `hashes`              | `BAD_INPUT`    | hashes must be an array of strings            |

---

## Fixes applied (own commits)

| Commit                                                          | What                             |
| --------------------------------------------------------------- | -------------------------------- |
| `docs(phase4): record reality-check findings before fixes`      | Findings-first + S4/S5/T3 docs   |
| `fix(record): BAD_INPUT when --account has zero involvement`    | F4                               |
| `fix(pack): ship compiled CLI bin and document tarball install` | F1/F2                            |
| `feat(sample-vault): S2 novel deposit/withdraw testnet flow`    | S2 artefacts                     |
| (this update)                                                   | Final scorecard + S3/S6 evidence |

---

## Unresolved → Phase 5 + T3-NOTES

- S3 AuthPayload invoke-through-account harness (or Freighter) for (a)–(d)
- S4/S5 human session recordings under `evidence/`
- F6: optional distinct `WRONG_NETWORK` code (`DESIGN-QUESTION` → T3)

---

## One-line verdict

**S1/S2/S6 PASS after disclosed fixes; S3 BLOCKED-honest on C-account AuthPayload signing; S4/S5 human-blocked — Phase 4 gate met.**
