# Tranche 2 state audit

Produced 2026-09-16 against `cursor/t2-complete-production-93d7` (post
Phase 0–4 work). Status vocabulary:

| Status            | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| COMPLETE-verified | Criterion met and re-checked this session               |
| BLOCKED-human     | Code/docs ready; criterion needs a human recording      |
| EXISTS-unverified | Code/docs present; not yet re-proven this session       |
| PARTIAL           | Some pieces exist; criterion not literally reproducible |
| MISSING           | Not in tree on the working branch                       |

External ground truth refreshed in [FACTS.md](FACTS.md) (Gate 5+, 2026-09-16).
Assumption deltas for T2: [RECONCILIATION-T2.md](RECONCILIATION-T2.md).
Evidence pack: [EVIDENCE.md](../evidence/EVIDENCE.md) D2.1–D2.5.
Form paste: [TRANCHE2-FORM.md](../evidence/TRANCHE2-FORM.md).
Demo script: [demo-script-t2.md](demo-script-t2.md).

---

## D2.1 — MCP server

**Criterion:** "The server runs locally and an agent calls each tool end to
end; a reference session is recorded."

| Judgment | COMPLETE-verified (code + stdio) · BLOCKED-human (reference session) |
| -------- | -------------------------------------------------------------------- |

**Evidence (re-checked 2026-09-16):**

- Four tools only: `record` / `synthesize` / `simulate` / `verify` —
  [src/mcp/server.ts](../src/mcp/server.ts); `npm run mcp`.
- Stdio spawn tests green: [test/mcp-stdio.test.ts](../test/mcp-stdio.test.ts)
  (8/8 in `npm test`).
- Docs: [mcp-server.md](mcp-server.md), [mcp-determinism.md](mcp-determinism.md),
  [mcp-reference-session.md](mcp-reference-session.md).
- SDK `@modelcontextprotocol/sdk` **1.30.0**.

**[BLOCKER]** Human records the reference agent session per
`docs/mcp-reference-session.md`.

---

## D2.2 — Claude skill

**Criterion:** "Skill packaged; a demo shows 'grant permission to do X from
this transaction' producing a reviewed policy."

| Judgment | COMPLETE-verified (package + script) · BLOCKED-human (demo recording) |
| -------- | --------------------------------------------------------------------- |

**Evidence:**

- [skills/policywright/SKILL.md](../skills/policywright/SKILL.md) — Anthropic
  Agent Skills frontmatter (`name` + `description`).
- Clarification triggers + no-install guardrails.
- Demo walkthrough: [skill-demo-script.md](skill-demo-script.md).

**[BLOCKER]** Human records the skill demo conversation under `evidence/`.

---

## D2.3 — Dry-run harness + argument-level scope

**Criterion:** "The harness outputs a permit/deny/flag report for a generated
policy including an argument-constrained case (BLND→XLM denied when enabled);
tests green."

| Judgment | COMPLETE-verified |
| -------- | ----------------- |

**Evidence (commands re-run 2026-09-16):**

- [examples/live/simulation-report-args-off.md](../examples/live/simulation-report-args-off.md)
  — BLND→XLM **flag**.
- [examples/live/simulation-report-args-on.md](../examples/live/simulation-report-args-on.md)
  — BLND→XLM **deny**.
- [docs/argument-scope.md](argument-scope.md).
- `npm test` — 126 green.

---

## D2.4 — Net-new policy codegen with storage segregation

**Criterion:** "Generates both a composed-policy configuration and a net-new
stateful policy contract; both compile and pass simulation."

| Judgment | COMPLETE-verified |
| -------- | ----------------- |

**Evidence:**

- Composed stock `spending_limit` on
  [examples/live/context-rule.json](../examples/live/context-rule.json).
- Generated `FrequencyLimitPolicy`
  ([contracts/frequency-limit-policy](../contracts/frequency-limit-policy));
  storage `(smart_account, context_rule_id)`.
- Dual harness:
  [simulation-report-compose-and-generate.md](../examples/live/simulation-report-compose-and-generate.md).
- [test/compose-boundary.test.ts](../test/compose-boundary.test.ts);
  [docs/compose-vs-generate.md](compose-vs-generate.md).
- On-chain `CDSVPSTS…` wasm `42227f2b…6eed` (alive 2026-09-16).

---

## D2.5 — Wallet integration (own OZ smart account)

**Criterion:** "A testnet smart account with an installed generated policy;
end-to-end demo recorded."

| Judgment | COMPLETE-verified (local-signer install + live verify) · BLOCKED-human (Freighter preferred + demo video) |
| -------- | --------------------------------------------------------------------------------------------------------- |

**Evidence:**

- SA `CAXBVHXP…` deploy `8beb1d4c…`; Frequency `CDSVPSTS…`; spending wrapper
  `CC4KFQ7S…`.
- Install txs `5907ecbf…`, `589faaad…`, `36791fe4…` (explorer HTTP 200).
- Live verify green (2026-09-16).
- Docs: [smart-account-install.md](smart-account-install.md); FACTS §5.3
  signing hierarchy (Freighter preferred; local-signer fallback labeled).
- Fallback path; cohort-wallet track remains open.
- Reality check: [REALITY-CHECK.md](../evidence/REALITY-CHECK.md) — S3
  invoke-through-account BLOCKED-honest (AuthPayload); not claimed as filmed.

**[BLOCKER]** Freighter interactive signing; Phase 6 demo video per
[demo-script-t2.md](demo-script-t2.md).

---

## Chain / artifact retention (2026-09-16)

| Artifact                                           | Status                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Policy contract `CDSVPSTS…` instance + wasm        | **Alive** on testnet                                                                     |
| Deploy/upload tx hashes (`5ac3320d…`, `35ddaeaa…`) | **Aged out** of Soroban RPC retention; still on Horizon / explorers                      |
| Claim/swap hashes (`acf256a0…`, `2dcff661…`)       | **Aged out** of RPC; committed captures under `examples/live/` are the reproduction path |
| D2.5 install + SA deploy hashes                    | **Fresh** (2026-09-16) — inside explorer; use for video                                  |
| Sample-vault S2 hashes (`e1461011…`, `3d0113ff…`)  | **Alive** on explorer                                                                    |

---

## Gate

- [x] This file complete for D2.1–D2.5 with COMPLETE-verified / BLOCKED-human
- [x] FACTS.md refreshed (Gate 5+)
- [x] RECONCILIATION-T2.md opened
- [x] Phase 5 evidence + form; Phase 6 demo script

Working conclusion: **D2.3 and D2.4 COMPLETE-verified.** D2.1 / D2.2 /
D2.5 code paths COMPLETE-verified with **BLOCKED-human** remaining only for
the human-recording set (MCP reference session, skill demo, Freighter +
demo video).
