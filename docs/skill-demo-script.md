# Skill demo script (D2.2)

Criterion: _Skill packaged; a demo shows "grant permission to do X from this
transaction" producing a reviewed policy._

## Setup

- MCP server registered (see [mcp-reference-session.md](mcp-reference-session.md)).
- Skill loaded from `skills/policywright/` or `.claude/skills/policywright`.
- Use committed captures (no RPC required for this walkthrough).

## Criterion conversation + expected tool calls

| Turn | Speaker | Utterance (approx.)                                                                                                      | Expected tool call(s)                                                                                                                                                          |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Human   | "Grant the tightest permission to repeat our Blend claim → Soroswap swap from `examples/live/recorded-claim-swap.json`." | —                                                                                                                                                                              |
| 2    | Agent   | Loads recording, synthesizes.                                                                                            | `record` `{ recordedTx \| inputPath }` **or** `synthesize` `{ inputPath: "examples/live/recorded-claim-swap.json" }`                                                           |
| 3    | Agent   | Surfaces notes/warnings + UNAUDITED; **asks** about spend cap and lifetime.                                              | (no tool — clarification)                                                                                                                                                      |
| 4    | Human   | "Cap at observed × 1.1; keep the default 30-day lifetime; leave argument constraints off for now."                       | —                                                                                                                                                                              |
| 5    | Agent   | Re-synthesize if config changed; present plain-language rule.                                                            | `synthesize` with `capMultiplier: 1.1` (if not already)                                                                                                                        |
| 6    | Human   | "Show me what this would deny."                                                                                          | —                                                                                                                                                                              |
| 7    | Agent   | Dry-run with args off, then on.                                                                                          | `simulate` `{ …, constrainArguments: false }` then `simulate` `{ …, constrainArguments: true }`                                                                                |
| 8    | Agent   | Reconcile against fixture snapshot (stand-in for on-chain).                                                              | `verify` `{ contextRule: <emitted>, onChainSnapshotPath: "fixtures/verify/on-chain-snapshot-match.json" }` — or synthesize-from-recording mode if using the fixture match path |
| 9    | Human   | "Install it on my testnet smart account."                                                                                | —                                                                                                                                                                              |
| 10   | Agent   | **No MCP install tool.** Directs human to CLI / Freighter signing.                                                       | (none — prose only)                                                                                                                                                            |

## Pass criteria for the recording

- All four MCP tools appear at least once (`record` optional if synthesize used a path).
- At least one clarification turn (cap / lifetime / args).
- UNAUDITED banner shown.
- `simulate` run before any install discussion.
- Install refused as an agent action; human pointed to CLI/wallet.

## Recorded skill demo conversation (2026-09-17)

Scripted conversation + real MCP tool I/O matching the turn table above:

- [evidence/sessions/skill-demo-conversation-2026-09-17.md](../evidence/sessions/skill-demo-conversation-2026-09-17.md)

Pass criteria checked in that artefact: four tools, clarification turn,
UNAUDITED banner, `simulate` before install talk, install refused as an agent
action (CLI / Freighter pointed instead).

Optional polish: a human agent-UI screen capture of the same script remains
nice-to-have for the submission video.
