# Reality-check S4 — Agent session (MCP tools)

**Status:** `[BLOCKER: human runs + records]`

Criterion: a human agent session using only the four MCP tools
(`record` / `synthesize` / `simulate` / `verify`) produces a reviewed
least-privilege policy from a recorded flow, without the agent installing
on-chain.

## Setup (human)

1. Register the MCP server per [mcp-server.md](mcp-server.md) /
   [mcp-reference-session.md](mcp-reference-session.md).
2. Prefer committed captures / `examples/live/recorded-claim-swap.json` so the
   session does not depend on RPC retention.
3. Do **not** expose `STELLAR_SECRET_KEY` to the agent environment for this
   session (install is out of scope for MCP).

## Prompt script

| Turn | Role  | Prompt / expected behaviour                                                                                                                                                         |
| ---- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Human | “Using only policywright MCP tools, grant the tightest permission to repeat the flow in `examples/live/recorded-claim-swap.json`. Show me the policy before anything is installed.” |
| 2    | Agent | Call `synthesize` with `inputPath` (or `record` with `recordedTx` / hashes). Surface `notes`, `warnings`, and the UNAUDITED banner.                                                 |
| 3    | Agent | Ask at least one clarification (cap multiplier, lifetime, or `--constrain-arguments`).                                                                                              |
| 4    | Human | “Use cap ×1.1, default lifetime, argument constraints off.”                                                                                                                         |
| 5    | Agent | Re-`synthesize` if needed; summarize scope + spend caps in plain language.                                                                                                          |
| 6    | Human | “What would this deny?”                                                                                                                                                             |
| 7    | Agent | Call `simulate` (args off, then optionally on).                                                                                                                                     |
| 8    | Human | “Does this match the fixture on-chain snapshot?”                                                                                                                                    |
| 9    | Agent | Call `verify` with `fixtures/verify/on-chain-snapshot-match.json` (or live `smartAccount` if the human opts in).                                                                    |
| 10   | Human | “Install it on my smart account.”                                                                                                                                                   |
| 11   | Agent | **Refuse MCP install** (no such tool). Point human to CLI / Freighter per [smart-account-install.md](smart-account-install.md).                                                     |

## Rubric (pass / fail)

| Check                   | Pass if                                                       |
| ----------------------- | ------------------------------------------------------------- |
| Tool surface            | Only `record` / `synthesize` / `simulate` / `verify` appear   |
| Clarification           | ≥1 human clarification turn before final policy               |
| UNAUDITED               | Banner or equivalent warning shown                            |
| Simulate-before-install | `simulate` runs before any install discussion concludes       |
| No agent install        | Agent does not claim to install; no invented install MCP tool |
| Artefacts               | Human saves transcript + tool traces under `evidence/`        |

## Evidence to attach (human)

- Agent UI transcript (markdown or export)
- Tool-call log (JSON-RPC or UI trace)
- Path: `evidence/reality-s4-agent-session.<date>.md` (or `.json`)

Until those artefacts exist, S4 remains **BLOCKED-honest**.
