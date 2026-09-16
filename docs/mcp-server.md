# MCP server

policywright speaks **stdio MCP** with **exactly four tools**: `record`,
`synthesize`, `simulate`, `verify`.

There is **no** `install`, `deploy`, or `prepare_install` MCP tool — by design.
Installation is a separate human-signed CLI / wallet step (see the skill and
CLI docs). Agents must never claim they installed a rule.

## Start

```bash
npm run mcp
# → tsx src/mcp/server.ts  (stdio)
```

Registration for Claude Desktop / Claude Code is documented in
[mcp-reference-session.md](mcp-reference-session.md) and FACTS.md Gate 5.

RPC endpoint and network come from tool args or env (`STELLAR_RPC_URL`,
`STELLAR_NETWORK`) — never hardcoded secrets. The server **never signs**.

## Tools

| Tool | Role | Determinism |
| ---- | ---- | ----------- |
| `record` | Hashes / simulation / inline RecordedTx → merged recording | Deterministic per (input, chain state) |
| `synthesize` | Recording → context rules + policies + generated Rust | **Pure** given recording + SynthConfig |
| `simulate` | Dry-run permit/deny/flag scenarios | **Pure** given recording + SynthConfig |
| `verify` | Diff emitted `context-rule.json` vs on-chain (or fixture) snapshot | Deterministic per (emitted spec, chain state / snapshot) |

`verify` is **on-chain / spec reconciliation**, not the offline dry-run
self-check (`npm run demo` / `pipelineVerifyScenarios`). See
[RECONCILIATION-T2.md](RECONCILIATION-T2.md) T2-2 and
[mcp-determinism.md](mcp-determinism.md).

Outputs that include generated code carry an `unauditedBanner` field. Errors
use machine-readable codes from the recorder taxonomy (`BAD_INPUT`,
`TX_NOT_FOUND`, `NETWORK`, `DECODE_FAILED`) plus `INTERNAL`.

## Offline tests

`npm test` spawns the server over stdio and calls all four tools against
committed fixtures under `fixtures/` and `fixtures/verify/` — no network.
