# MCP reference session

Criterion (D2.1): _The server runs locally and an agent calls each tool end to
end; a reference session is recorded._

## Agent registration

Per FACTS.md Gate 5.1 — Claude Desktop / Claude Code local stdio:

```json
{
  "mcpServers": {
    "policywright": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/absolute/path/to/policywright"
    }
  }
}
```

Or after `npm run build`: `node dist/mcp/server.js`.

Claude Code CLI alternative:

```bash
claude mcp add --transport stdio policywright -- npx tsx src/mcp/server.ts
```

(Run from the repo root, or pass absolute paths.)

## Exact conversation (for the recording)

Use committed captures so the session does not depend on RPC retention.

1. **Human:** "Draft the tightest delegate policy from our recorded Blend claim →
   Soroswap swap (`examples/live/recorded-claim-swap.json`)."
2. **Agent:** `record` with `recordedTx` loaded from that file (or
   `synthesize` with `inputPath` directly).
3. **Agent:** `synthesize` — summarize flows; surface `notes` / `warnings` and
   the `unauditedBanner`.
4. **Agent:** clarifying question on cap / lifetime (see skill).
5. **Human:** "Show what this would deny."
6. **Agent:** `simulate` with `constrainArguments: false`, then `true`.
7. **Agent:** `verify` with emitted `contextRule` +
   `fixtures/verify/on-chain-snapshot-match.json` (or a live snapshot once
   D2.5 lands).
8. **Agent:** Direct install to the **CLI / Freighter human-signed step** —
   never an MCP install tool.

## [BLOCKER] Human recording

A human must record the live agent session (screen + transcript) against this
script and attach it under `evidence/` when the D2.1 criterion is closed.
Automated CI covers stdio tool calls only (`test/mcp-stdio.test.ts`).
