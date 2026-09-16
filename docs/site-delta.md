# Site delta — Phase 3 (docs → current reality)

Map of every page under `site/src/content/docs/` against repository truth as of
2026-09-16 (`cursor/t2-complete-production-93d7` @ `c2fac64`). Vocabulary:

| Verdict | Meaning |
| ------- | ------- |
| **stale** | Page asserts something the repo no longer supports |
| **false** | Page asserts something the repo disproves |
| **missing** | Page (or section) that should exist and does not |
| **ok** | Aligned enough; only minor refresh |
| **replace** | Intended replacement content / action |

Award sentence (verbatim wherever provenance is stated):

> Built in response to the SCF 'OZ accounts policy builder' RFP (Q2 2026), funded in round SCF #44 as the awarded submission 'Record-to-Policy MCP + Agent skill.'

Proof anchors (do not invent beyond these):

| Anchor | Value |
| ------ | ----- |
| Live SA | `CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT` |
| Frequency policy | `CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP` |
| Claim tx | `acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452` |
| Swap tx | `2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b` |
| Install txs | `5907ecbf…`, `589faaad…`, `36791fe4…` (EVIDENCE.md D2.5) |
| Repo docs | `docs/mcp-server.md`, `docs/argument-scope.md`, `docs/compose-vs-generate.md`, `docs/smart-account-install.md`, `docs/skill-demo-script.md` |
| Reports | `examples/live/simulation-report-args-*.md`, `compose-and-generate.md` |
| Human session videos | **[BLOCKER]** — not in repo; Phase 5 evidence |

---

## Page-by-page

### `index.mdx` (Overview)

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status badge | `in-development` | **stale** → `shipped-testnet` |
| Body | Claims “in development”, “no MCP server, Claude skill, or wallet integration” | **false** — MCP (`src/mcp/`), skill (`skills/policywright/`), install CLI (`account:create` / `install` / live `verify`) all exist |
| Provenance | Missing award sentence | **missing** |
| Live example | “Live demos are planned and not yet published” | **stale** — live recording + install SA exist |

**Replace with:** one-paragraph current truth: record→synthesize→simulate→verify agent path + testnet install; award sentence verbatim; proof links to live SA, frequency policy, `examples/live/`, MCP/skill docs. Status **Shipped (testnet)**.

---

### `roadmap.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `in-development` | **stale** → refresh (page tracks plan; badge `shipped` for the tracking page itself, or keep in-development for the plan — prefer **shipped** as the page is the live tracker) |
| T1 row | Target only; body says parts exist | **stale** → **T1 delivered early + approved** with proof links (EVIDENCE D1.x, contracts, CI) |
| T2 row | Lists deliverables as future; body says MCP/skill/wallet “not started” | **false** → per-row status with proof |
| T3 row | Listed with mainnet | **ok** as **Planned** only (target 30 Nov 2026; Audit Bank audit listed). No T3 work beyond listing. |

**T2 replacement rows (actual):**

| Deliverable | Status | Proof |
| ----------- | ------ | ----- |
| MCP server (4 tools) | Shipped (testnet / local stdio) | `src/mcp/`, `docs/mcp-server.md`, `test/mcp-stdio.test.ts` — **[BLOCKER]** human reference session video |
| Claude skill | Shipped (packaged) | `skills/policywright/SKILL.md`, `docs/skill-demo-script.md` — **[BLOCKER]** human demo recording |
| Dry-run + argument scope | Shipped | `docs/argument-scope.md`, `examples/live/simulation-report-args-off.md` / `args-on.md` |
| Compose + generate (storage segregation) | Shipped | `docs/compose-vs-generate.md`, `examples/live/simulation-report-compose-and-generate.md`, `CDSVPSTS…` |
| Wallet / smart-account install | Shipped (testnet) | `docs/smart-account-install.md`, SA `CAXBVHXP…`, EVIDENCE D2.5 |

---

### `architecture.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `shipped` | **ok** (add proof: `docs/architecture.md` + `src/`) |
| Mermaid | Pipeline only (record→synth→emit→simulate) | **stale** — agent layer (MCP + skill) now shipped; install path missing |
| Install / signing | Absent | **missing** |

**Replace Mermaid with:** pipeline + agent layer (`MCP stdio` / `Claude skill` → four tools) + install branch (`CLI install` → Freighter preferred / local-signer fallback labeled → testnet SA). Keep pipeline stages accurate. Add UnauditedBanner near generated-Rust mention.

---

### `changelog.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Content | Stops at T1 / mid-2026; no T2 commits | **stale** |

**Replace:** regenerate from git history — add 2026-09-16 T2 section (D2.3–D2.5, MCP, verify, install) then keep earlier T1/seed history.

---

### `getting-started.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `shipped` | **ok** → prefer `shipped-testnet` where install is mentioned; offline demo stays shipped |
| Live demos line | “planned and not yet published” | **stale** → point at `examples/live/` + install guide |
| Install path | Pipeline only | **missing** link to smart-account install (testnet-only) |
| Unaudited banner | Present | **ok** |
| `mainnet` in `record --network` | Flag documents network enum | **ok** (recorder capability, not a mainnet claim) — keep; do not imply mainnet deploy |

---

### `security.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `in-development` | **stale** → `shipped` for protections that exist; audit remains T3 Planned |
| “No code path in src/ submits on-chain” | True for pipeline; install now under `src/install/` | **stale** — clarify: synthesis pipeline still unsigned; testnet-only install CLI is the deliberate exception (local-signer / Freighter) |
| Unaudited banner | Present | **ok** |
| Audit | T3 Audit Bank | **ok** — keep Planned |

---

### `concepts/context-rules.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `shipped` + proof in body | **ok** — add link to live `examples/live/context-rule.json` as secondary proof |
| Example | Fixture `examples/spec.json` | **ok** (fixture remains valid); optionally note live artifact |

---

### `concepts/policies.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status / content | Accurate for three policy kinds | **ok** — link argument-scope dual reports |

---

### `concepts/least-privilege.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status / content | Accurate deny table | **ok** — dual-mode row already present; link `examples/live/simulation-report-args-*.md` |

---

### `concepts/compose-first.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `shipped` | **ok** |
| Content | Already links compose-vs-generate + live harness | **ok** — minor: ensure UnauditedBanner on generated mention; keep Planned thresholds section |

---

### `reference/cli.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Commands | Missing `verify`, `account:create`, `install`, `mcp` | **stale** |
| Status | `shipped` | **ok** → note testnet-only for install commands |

**Replace:** document new commands with testnet-only callouts; link `docs/smart-account-install.md`.

---

### `reference/mcp-tools.mdx`

| Field | Current | Verdict |
| ----- | ------- | ------- |
| Status | `planned` + stub “Planned — Tranche 2” | **false** |

**Replace:** full MCP reference — four tools, schemas from `src/mcp/schemas.ts`, error codes from `src/mcp/errors.ts`, determinism map (`docs/mcp-determinism.md`), stdio registration, explicit **no install tool by design**. Status **Shipped**. **[BLOCKER]** human reference session.

---

## Missing pages (create)

### `reference/claude-skill.mdx` (new)

Loading per current format (`skills/policywright/SKILL.md`), clarification triggers, guardrails, link `docs/skill-demo-script.md`. Status **Shipped**. **[BLOCKER]** human demo recording.

### `guides/smart-account-install.mdx` (new)

Port/link `docs/smart-account-install.md`. Testnet-only everywhere. Signing hierarchy: Freighter preferred; local-signer fallback labeled. UnauditedBanner. Proof: SA `CAXBVHXP…`. Status **Shipped (testnet)**.

### `guides/argument-scope.mdx` (new)

Both modes; real BLND→XLM flag vs deny; link `examples/live/simulation-report-args-off.md` / `args-on.md` and `docs/argument-scope.md`. Status **Shipped**.

### `use-cases/agent-yield-operations.mdx` (new)

Executed walkthrough: real hashes, real rule, install on `CAXBVHXP…`. Status **Shipped (testnet)**. No invented video — mark **[BLOCKER]** for session recording (Phase 5).

### `use-cases/sep-41-subscription.mdx` (new)

Concept brief — capability shipped (SEP-41 recording / scope), walkthrough **Planned** (T3). Status badge: capability shipped / walkthrough planned (page: `in-development` or dual note).

### `use-cases/bounded-soroswap-delegation.mdx` (new)

Concept brief — swap-path argument scope shipped; full walkthrough **Planned**. Same honesty tiering.

### `use-cases/why-least-privilege.mdx` (new)

Safety framing for agents — ties to least-privilege concept + security. Status **Shipped** (framing page; no on-chain claim beyond existing proofs).

---

## Sitewide / infra

| Item | Action |
| ---- | ------ |
| `StatusBadge.astro` | Add `shipped-testnet` label “Shipped (testnet)”; optional `proofHref` / `proofLabel` so every Shipped badge links proof |
| `astro.config.mjs` sidebar | Add Reference (skill), Guides, Use cases |
| Unaudited banner | On every page showing generated contracts (getting-started, security, architecture, install, MCP synthesize mention, compose-first, agent-yield) |
| Testnet-only | On every install/deploy mention |
| Grep built site | No “coming soon”; “mainnet” only in T3 Planned / recorder network enum / unaudited “MUST NOT mainnet”; “audited” only in negative/Audit Bank future sense |
| Evidence Phase 5 | Do not invent videos — leave BLOCKER notes |

---

## Commit order

1. This map (`docs/site-delta.md`) — commit alone first.
2. Site content + component/sidebar updates — separate commit(s).
3. Build green `(cd site && npm ci && npm run build)`.
