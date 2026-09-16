# Tranche 2 state audit

Produced 2026-09-16 against `main` @ `26b4582` (pre-T2-completion work) and
the partial remote branch `origin/cursor/t2-mcp-skill-freighter-34ef` (not
merged). Status vocabulary:

| Status            | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| COMPLETE-verified | Criterion met and re-checked this session               |
| EXISTS-unverified | Code/docs present; not yet re-proven this session       |
| PARTIAL           | Some pieces exist; criterion not literally reproducible |
| MISSING           | Not in tree on the working branch                       |

External ground truth refreshed in [FACTS.md](FACTS.md) (Gate 5+, 2026-09-16).
Assumption deltas for T2: [RECONCILIATION-T2.md](RECONCILIATION-T2.md).

---

## D2.1 — MCP server

**Criterion:** "The server runs locally and an agent calls each tool end to
end; a reference session is recorded."

| Judgment | PARTIAL → target COMPLETE-verified |
| -------- | ---------------------------------- |

**On `main`:** MISSING. No `src/mcp/`, no `@modelcontextprotocol/sdk`, no
`npm run mcp`. Site page `site/src/content/docs/reference/mcp-tools.mdx`
describes planned tools only.

**On remote T2 branch:** EXISTS-unverified but **non-compliant**:

- Exposes five tools including `prepare_install` — violates the permanent
  code-first rule (MCP = exactly `record` / `synthesize` / `simulate` /
  `verify`; never install/deploy).
- `verify` reimplements the offline demo self-check, not on-chain
  rule/policy diff against the emitted spec.
- Tests call handlers directly; no stdio spawn of the server.
- No versioned I/O schemas, no determinism map, no
  `docs/mcp-reference-session.md`.

**Verification needed (when brought to compliance):**

1. Spawn stdio server; call all four tools against committed fixtures.
2. Schema-validate inputs/outputs; assert error-code mapping.
3. Confirm tool list length === 4 and no install/deploy tool.
4. [BLOCKER] Human records the reference agent session per
   `docs/mcp-reference-session.md`.

---

## D2.2 — Claude skill

**Criterion:** "Skill packaged; a demo shows 'grant permission to do X from
this transaction' producing a reviewed policy."

| Judgment | PARTIAL → target COMPLETE-verified |
| -------- | ---------------------------------- |

**On `main`:** MISSING.

**On remote T2 branch:** EXISTS-unverified —

- `skills/policywright/SKILL.md` matches current Anthropic format
  (`name` + `description` frontmatter; verified 2026-09-16 against
  platform.claude.com / agentskills.io — FACTS Gate 5).
- Instructs calling `prepare_install` (must be rewritten to CLI-only install).
- Clarification triggers present but incomplete vs the approved list
  (lifetime, multi-asset, argument constraints on/off, synthesize warnings).
- No `docs/skill-demo-script.md` with expected tool calls per turn.

**Verification needed:** package validates; dry walkthrough hits four tools +
cap clarification; [BLOCKER] human records the skill demo conversation.

---

## D2.3 — Dry-run harness + argument-level scope

**Criterion:** "The harness outputs a permit/deny/flag report for a generated
policy including an argument-constrained case (BLND→XLM denied when enabled);
tests green."

| Judgment | PARTIAL |
| -------- | ------- |

**Evidence for PARTIAL:**

- Core exists on `main` (landed early): `--constrain-arguments` default OFF
  ([src/types.ts](../src/types.ts) `DEFAULT_SYNTH_CONFIG`), derivation in
  [src/synthesizer.ts](../src/synthesizer.ts) `findPathArg` /
  `deriveArgumentScopes`, dual flag/deny paths in
  [src/simulate.ts](../src/simulate.ts), tests in
  `test/synthesizer.test.ts` + `test/simulate.test.ts`.
- Committed report [examples/simulation-report.md](../examples/simulation-report.md)
  is **flag-mode only** (fixture, not the real claim→swap sequence).
- BLND→XLM case exists in unit tests (`test/simulate.test.ts`) but **no
  committed dual reports** against `examples/live/recorded-claim-swap.json`
  showing disabled→PERMITTED+flag / enabled→DENIED.

**Verification needed:** generate + commit both reports from the real sequence;
document derivation rules + limits; criterion sentence literally reproducible
from documented commands; CI green.

---

## D2.4 — Net-new policy codegen with storage segregation

**Criterion:** "Generates both a composed-policy configuration and a net-new
stateful policy contract; both compile and pass simulation."

| Judgment | COMPLETE-verified |
| -------- | ----------------- |

**Evidence:**

- Composed stock `spending_limit` on live artifact
  [examples/live/context-rule.json](../examples/live/context-rule.json)
  (`pw:xfer:native`, OZ citation in `paramsSource`).
- Generated `FrequencyLimitPolicy` crate compiles/tests
  ([contracts/frequency-limit-policy](../contracts/frequency-limit-policy));
  storage keyed by `(smart_account, context_rule_id)`; emitter
  byte-equality locked in `test/rust-policy.test.ts`.
- Dual-harness report on the live sequence:
  [examples/live/simulation-report-compose-and-generate.md](../examples/live/simulation-report-compose-and-generate.md)
  (permit original; deny over-cap = composed; deny repeat-within-window =
  generated).
- Decision-boundary tests:
  [test/compose-boundary.test.ts](../test/compose-boundary.test.ts).
- Docs: [docs/compose-vs-generate.md](compose-vs-generate.md) (+ site
  [concepts/compose-first.mdx](../site/src/content/docs/concepts/compose-first.mdx)).
- On-chain wasm hash still present (re-verified 2026-09-16 — FACTS §5 /
  Gate 3): contract `CDSVPSTS…`, wasm
  `42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed`.

---

## D2.5 — Wallet integration (own OZ smart account)

**Criterion:** "A testnet smart account with an installed generated policy;
end-to-end demo recorded."

| Judgment | MISSING (remote branch PARTIAL / non-spec) |
| -------- | ------------------------------------------ |

**On `main`:** no `account:create`, `install`, or on-chain `verify`.

**On remote T2 branch:** Freighter prepare + `wallet/` UI + demo C-address
notes — but:

- No `account:create` that deploys + initializes OZ smart account and
  auto-appends evidence.
- Install path prepares a plan; does not consume emitter output unmodified
  into simulate-first submit with documented signing hierarchy.
- No library `verify` that diffs on-chain rules vs emitted spec (shared by
  CLI + MCP).
- Demo addresses in `evidence/demo-addresses.md` need live re-check.

**Verification needed:** fresh testnet `account:create` → `install` →
`verify` green; explorer-visible rule+policies; auth entries signed
client-side per FACTS hierarchy; [BLOCKER] interactive Freighter approval;
demo recording is Phase 6.

---

## Chain / artifact retention (2026-09-16)

| Artifact                                           | Status                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Policy contract `CDSVPSTS…` instance + wasm        | **Alive** on testnet (getLedgerEntries)                                                  |
| Deploy/upload tx hashes (`5ac3320d…`, `35ddaeaa…`) | **Aged out** of Soroban RPC retention; still on Horizon / explorers                      |
| Claim/swap hashes (`acf256a0…`, `2dcff661…`)       | **Aged out** of RPC; committed captures under `examples/live/` are the reproduction path |
| Fresh same-day hashes for video                    | **Needed** (Phase 6 recording notes)                                                     |

---

## Gate (Phase 0)

- [x] This file complete for D2.1–D2.5
- [x] FACTS.md refreshed for MCP SDK, skill format, wallets-kit, OZ call
      shapes, chain retention (see Gate 5+ entries dated 2026-09-16)
- [x] RECONCILIATION-T2.md opened for T2 assumption tracking

Working conclusion: **D2.4 is COMPLETE-verified** on this branch (composed
`spending_limit` + generated `FrequencyLimitPolicy`, dual harness report,
boundary tests, docs). D2.3 dual live argument-scope reports are also on
tree. D2.1/D2.2/D2.5 still need build-or-correct under the four-tool MCP
invariant.
