# Phase 4 — Reality check

**Branch:** `cursor/t2-complete-production-93d7`  
**Date:** 2026-09-16  
**Method:** Execute S1/S2/S6; document S3/S4/S5. Findings recorded **before** patches. Fixes land in separate commits.

Severity: `BLOCKER` | `BUG` | `DOC-GAP` | `UX-FRICTION` | `DESIGN-QUESTION` (→T3)

---

## Scorecard (live — updated as scenarios close)

| Scenario | Status | Notes |
| -------- | ------ | ----- |
| S1 Cold developer, docs-only | **FAIL** → fixing | Clone path works; `npm pack` consumer cannot run CLI (DOC-GAP) |
| S2 Novel flow (sample-vault) | in progress | — |
| S3 Chain enforcement | pending | Account `CAXBVHXP…ERXT` verify-green; exercise or honest BLOCKED |
| S4 Agent session | **BLOCKED-honest** | Human runs + records |
| S5 Skill session | **BLOCKED-honest** | Human runs + records |
| S6 Hostile inputs | **FAIL** → fixing | Zero-involvement `--account` silent success (BUG); others OK |

**Verdict (interim):** S1/S6 not green until documented fixes land; S4/S5 blocked on human.

---

## Findings (recorded before patches)

| ID | Scenario | Severity | Finding |
| -- | -------- | -------- | ------- |
| F1 | S1 | DOC-GAP | No README/docs path for consuming an `npm pack` tarball as a dependency. Cold persona has only clone+`npm ci` guidance. |
| F2 | S1 | DOC-GAP / BUG | Tarball installs production deps only; CLI scripts invoke `tsx` (devDependency) → `tsx: not found`. `bin.policywright-mcp` points at `dist/` which is gitignored and absent from the pack. Pack is not a runnable install. |
| F3 | S1 | (ok) | README Commands table + `examples/README.md` point golden synth at **`examples/live/recorded-claim-swap.json`** (committed recording). Quickstart `npm run demo` uses **`fixtures/recorded-tx.json`**. Both succeed from a clean docs-only copy. |
| F4 | S6 | BUG | Explicit `--account` with **zero token involvement** still returns a `RecordedTx` (calls present, `flows: []`, no warning). Should be typed `BAD_INPUT` with an actionable message. |
| F5 | S6 | (ok) | Garbage hash → `[BAD_INPUT]`; nonexistent 64-hex → `[TX_NOT_FOUND]` (retention + “right network”); empty hashes → `[BAD_INPUT]`; duplicates → `[BAD_INPUT]`; mainnet hash + `--network testnet` → `[TX_NOT_FOUND]` with network hint; malformed MCP `hashes` → `{ code: "BAD_INPUT", … }`. |
| F6 | S6 | DOC-GAP | Getting-started claims distinct “wrong-network” errors; implementation reuses `TX_NOT_FOUND` with an actionable network hint (no separate code). Acceptable if documented honestly. |

---

## S1 — Cold developer (docs-only)

### A. Clean tree from public README + docs

- Temp dir: `/tmp/pw-s1-cold/repo` (tar copy excluding `.env`, `node_modules`, `dist`, `out`).
- Followed README Quickstart: `npm ci` → `npm run demo` → **PASS** (7 dry-run scenarios).
- Followed README Commands / examples README for golden sequence:

```bash
npm run cli -- synth --input examples/live/recorded-claim-swap.json
```

- **Golden pointer:** README points to **`examples/live/recorded-claim-swap.json`** (fixture path is the offline demo default, not the live golden).
- Result: synthesized `pw:swap+harvest` with native spend cap + FrequencyLimitPolicy; installable rules emitted. **PASS** for clone path.

### B. `npm pack` → second clean consumer

```text
npm pack → policywright-0.1.0.tgz
npm install ../policywright-0.1.0.tgz
(cd node_modules/policywright && npm run cli -- synth --input examples/live/recorded-claim-swap.json)
→ sh: 1: tsx: not found
```

- No public docs describe this path (**F1**).
- Packaged CLI is non-runnable (**F2**).

**S1 status:** FAIL until F1/F2 fixed.

---

## S2 — Novel flow (generality)

Status: in progress (building `examples/sample-vault/`).

---

## S3 — Chain enforcement

Status: pending. Known account `CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT` with installed rules + live verify green (`evidence/demo-addresses.md`). Will attempt (a)–(d) or record honest BLOCKED → `docs/T3-NOTES.md`.

---

## S4 / S5 — Agent / Skill

Prepared session docs (see `docs/reality-agent-session.md`, `docs/reality-skill-session.md`) marked **`[BLOCKER: human runs + records]`**.

---

## S6 — Hostile inputs

| Case | Observed | Typed? | Actionable? |
| ---- | -------- | ------ | ----------- |
| Garbage hash | `[BAD_INPUT] "…" is not a 64-character hex transaction hash` | yes | yes |
| Valid nonexistent | `[TX_NOT_FOUND] … retention … Also check the hash is on the right network.` | yes | yes |
| Mainnet hash vs `--network testnet` | same `TX_NOT_FOUND` + network hint | yes | yes (F6: not a distinct code) |
| Empty sequence | `[BAD_INPUT] record requires hashes, fromSimulation, or recordedTx…` | yes | yes |
| Duplicate hashes | `[BAD_INPUT] duplicate transaction hashes given…` | yes | yes |
| Zero involvement `--account` | **silent success**, `flows: []` | **no** | **no** → **F4 BUG** |
| Malformed MCP tool input | `{ ok:false, code:"BAD_INPUT", message:"[BAD_INPUT] hashes must be an array of strings" }` | yes | yes |

**S6 status:** FAIL until F4 fixed.

---

## Fixes applied

_(none yet — findings committed first)_

---

## Unresolved → Phase 5 + T3-NOTES

- S4/S5 human recordings
- S3 pending
- F6 documentation honesty on wrong-network vs TX_NOT_FOUND
