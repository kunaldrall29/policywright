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

## Recorded reference session (2026-09-17)

Stdio agent session exercising all four tools end-to-end against same-day
sample-vault hashes:

- [evidence/sessions/mcp-reference-session-latest.md](../evidence/sessions/mcp-reference-session-latest.md)
- Timestamped copy:
  [evidence/sessions/mcp-reference-session-2026-09-17T02-46-20-369Z.md](../evidence/sessions/mcp-reference-session-2026-09-17T02-46-20-369Z.md)

Recorder: `npx tsx scripts/mcp-reference-session.ts` (spawns `src/mcp/server.ts`
over stdio). CI still covers the same four tools via `test/mcp-stdio.test.ts`.

Optional polish: a human Claude Desktop / Claude Code screen capture of this
same script remains nice-to-have for the submission video, not a code gap.
