# Tranche 2 — SCF form (paste-ready)

Every link, hash, and version below was **fetched / re-run on 2026-09-16**.
No placeholders. Paste into the SCF tranche form; adjust only if a live
value changes the morning of submit.

---

## Project name

**policywright**

## Award provenance (verbatim)

Built in response to the SCF 'OZ accounts policy builder' RFP (Q2 2026), funded in round SCF #44 as the awarded submission 'Record-to-Policy MCP + Agent skill.'

Public award page (HTTP 200, 2026-09-16):
https://communityfund.stellar.org/project/policywright-j8x

- SCF round: **SCF #44**
- Submission title: **Record-to-Policy MCP + Agent skill**
- Award: **$55.0K Build Award**; status **Build phase, Awarded**

## Repository

https://github.com/kunaldrall29/policywright

(Working branch for this submission pack: `cursor/t2-complete-production-93d7`.)

## Documentation site

https://policywright.lemmalabs.space

**Deploy note (2026-09-16):** live site still serves pre–Phase-3 content
(`Last-Modified: Thu, 10 Sep 2026`; Overview still reads “in development” /
“no MCP…”). Repo `site/` already has the Phase-3 rewrite
(`shipped-testnet`, award sentence, T2 rows). Redeploy before reviewers open
the public docs.

### Docs redeploy checklist (Vercel)

1. Push / merge the branch that contains updated `site/src/content/docs/`.
2. In the Vercel project for this repo, set **Root Directory** to `site`
   (auto-detect Astro). Root `vercel.json` is ignored when Root Directory is
   `site`.
3. Confirm domain **policywright.lemmalabs.space** under Settings → Domains.
4. DNS (if not already): `CNAME policywright → cname.vercel-dns.com.`
5. After deploy, hard-refresh Overview + Roadmap — expect `shipped-testnet`
   badge, award sentence, and T2 “Shipped” rows (not “not started”).

Canonical checklist also in [README.md](../README.md#deploying-to-policywrightlemmalabsspace-vercel).

---

## Deliverable checklist D2.1–D2.5

### D2.1 — MCP server

**Criterion:** The server runs locally and an agent calls each tool end to end; a reference session is recorded.

| Proof             | Link / command                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server            | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/src/mcp/server.ts                                                                                                                                                                                                                                      |
| Start             | `npm run mcp`                                                                                                                                                                                                                                                                                                                               |
| Tools (exactly 4) | `record`, `synthesize`, `simulate`, `verify` — no install                                                                                                                                                                                                                                                                                   |
| Stdio tests       | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/test/mcp-stdio.test.ts (`npm test` → 8 MCP tests green)                                                                                                                                                                                                |
| Docs              | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/mcp-server.md · https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/mcp-determinism.md · https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/mcp-reference-session.md |
| Evidence section  | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/evidence/EVIDENCE.md                                                                                                                                                                                                                                   |

**Status:** Shipped (code + CI). **BLOCKER:** human reference session recording.

### D2.2 — Claude skill

**Criterion:** Skill packaged; a demo shows "grant permission to do X from this transaction" producing a reviewed policy.

| Proof       | Link                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Skill       | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/skills/policywright/SKILL.md |
| Demo script | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/skill-demo-script.md    |

**Status:** Packaged. **BLOCKER:** human skill demo conversation recording.

### D2.3 — Dry-run + argument-level scope

**Criterion:** The harness outputs a permit/deny/flag report for a generated policy including an argument-constrained case (BLND→XLM denied when enabled); tests green.

| Proof           | Link / command                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Args off (flag) | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/examples/live/simulation-report-args-off.md |
| Args on (deny)  | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/examples/live/simulation-report-args-on.md  |
| Docs            | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/argument-scope.md                      |
| Reproduce       | `npx tsx src/cli.ts simulate --input examples/live/recorded-claim-swap.json`                                                     |
|                 | `npx tsx src/cli.ts simulate --input examples/live/recorded-claim-swap.json --constrain-arguments`                               |
| Tests           | `npm test` — **126** Vitest tests green (2026-09-16)                                                                             |

**Status:** COMPLETE-verified.

### D2.4 — Compose + generate

**Criterion:** Generates both a composed-policy configuration and a net-new stateful policy contract; both compile and pass simulation.

| Proof                         | Link                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Composed `context-rule.json`  | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/examples/live/context-rule.json                         |
| Generated crate               | https://github.com/kunaldrall29/policywright/tree/cursor/t2-complete-production-93d7/contracts/frequency-limit-policy                        |
| Dual harness report           | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/examples/live/simulation-report-compose-and-generate.md |
| Boundary tests                | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/test/compose-boundary.test.ts                           |
| Docs                          | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/compose-vs-generate.md                             |
| On-chain FrequencyLimitPolicy | https://stellar.expert/explorer/testnet/contract/CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP                                    |
| Wasm hash                     | `42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed`                                                                           |
| Verify                        | `(cd contracts && cargo test --locked)` · `npm test`                                                                                         |

**Status:** COMPLETE-verified.

### D2.5 — Wallet / smart-account install

**Criterion:** A testnet smart account with an installed generated policy; end-to-end demo recorded.

**Honest path:** local-signer fallback shipped; Freighter preferred (FACTS §5.3); cohort-wallet track remains open.

| Artefact                 | Value (explorer HTTP 200, 2026-09-16)                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Smart account            | https://stellar.expert/explorer/testnet/contract/CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT                                                                |
| Deploy SA tx             | https://stellar.expert/explorer/testnet/tx/8beb1d4cb94b40a318326c0b056509177ff7c4de33caf7ac28c2ed01c652ac32                                                              |
| FrequencyLimitPolicy     | https://stellar.expert/explorer/testnet/contract/CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP                                                                |
| Spending-limit wrapper   | https://stellar.expert/explorer/testnet/contract/CC4KFQ7SIFVW45FDZ6NSKB4NETCE25CDLXIWK2GTQRT52KZUQESVTFTM                                                                |
| Install `pw:swap`        | https://stellar.expert/explorer/testnet/tx/5907ecbf76be7738fc1468dbfb4023a4833fe63a011dbe73b85268ce9b6fe8da                                                              |
| Install `pw:harvest`     | https://stellar.expert/explorer/testnet/tx/589faaad0a4ff19fed88b5fe9714f21d930b4b541b9b24469d34868bb54b30aa                                                              |
| Install `pw:xfer:native` | https://stellar.expert/explorer/testnet/tx/36791fe400463f32654ed8b003c7d7c776e5fe9775bc3631ff835e1a41a44654                                                              |
| Live verify              | `npm run cli -- verify --smart-account CAXBVHXP4QCWFNWW223JC6DAZHRXDUS5NDRSZMFSEYKCX4C3C5U4ERXT --context-rule examples/live/context-rule.json` → **green** (2026-09-16) |
| Install docs             | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/smart-account-install.md                                                       |
| Reality check            | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/evidence/REALITY-CHECK.md                                                           |

**Status:** Install + live verify green (local-signer). **BLOCKER:** Freighter interactive signing (preferred path) + Phase 6 demo video recording.

### Generality (bonus / reality-check S2)

Novel sample-vault deposit→withdraw (no Blend/Soroswap assumptions):
https://github.com/kunaldrall29/policywright/tree/cursor/t2-complete-production-93d7/examples/sample-vault

- Deposit tx: https://stellar.expert/explorer/testnet/tx/e14610110c2cd5f760455664c66e96cb1cfc9093f81c21353eff0a4976f623b0
- Withdraw tx: https://stellar.expert/explorer/testnet/tx/3d0113ff3cf56773f8064f100d14c9e3d785e19c4a0d588bb4ea5ba6ceda2322

---

## BLOCKERS (exactly the human-recording set)

1. **D2.1** — Human runs + records the MCP reference agent session ([docs/mcp-reference-session.md](../docs/mcp-reference-session.md)).
2. **D2.2** — Human runs + records the Claude skill demo conversation ([docs/skill-demo-script.md](../docs/skill-demo-script.md)).
3. **D2.5 / Phase 6** — Freighter interactive signing for the preferred wallet path; end-to-end demo video per [docs/demo-script-t2.md](../docs/demo-script-t2.md).

(S3 chain invoke-through-account enforcement is honestly BLOCKED for AuthPayload reasons — disclosed in REALITY-CHECK.md / T3-NOTES.md — and is **not** claimed as a T2 recording deliverable.)

---

## Versions (verified 2026-09-16)

| Component                                                 | Version                                                 |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Node (engines / this session)                             | `>=22` / **v22.14.0**                                   |
| npm                                                       | **10.9.7**                                              |
| policywright                                              | **0.1.0**                                               |
| `@modelcontextprotocol/sdk`                               | **1.30.0** (package.json + lockfile)                    |
| `@stellar/stellar-sdk`                                    | **15.1.0** (exact pin)                                  |
| `stellar-accounts` (crates.io / workspace)                | **=0.7.2**                                              |
| `soroban-sdk`                                             | **=26.1.0**                                             |
| OpenZeppelin stellar-contracts tag                        | **v0.7.2** (`a9c42169000638da937577f592ebf61a7a3c94ca`) |
| `@creit.tech/stellar-wallets-kit` (Freighter path target) | **2.6.0** (latest npm, FACTS Gate 5.3)                  |
| stellar-cli (install / wasm)                              | **27.1.0**                                              |
| Rust toolchain (contracts)                                | **1.97.1** (`contracts/rust-toolchain.toml`)            |
| Vitest suite                                              | **126** tests green                                     |

---

## Demo / evidence pack

| Item            | Link                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Evidence master | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/evidence/EVIDENCE.md      |
| Reality check   | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/evidence/REALITY-CHECK.md |
| T2 demo script  | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/demo-script-t2.md    |
| T2 state audit  | https://github.com/kunaldrall29/policywright/blob/cursor/t2-complete-production-93d7/docs/t2-state-audit.md    |

---

## Support Needed

Please introduce an **OpenZeppelin accounts-package technical contact** for a
Tranche 3 reviewer relationship: validation of generated `Policy` trait usage
against `stellar-accounts` 0.7.x+, compose-first guidance on stock vs custom
policies, and a named point of contact ahead of the SCF Audit Bank / mainnet
walkthroughs.
