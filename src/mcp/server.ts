#!/usr/bin/env node
/**
 * policywright MCP server (stdio).
 *
 * Tools (exactly four): record, synthesize, simulate, verify.
 * Installation / deploy is a separate human-signed CLI step — never exposed here.
 *
 * Start: `npm run mcp`
 * Registration: see docs/mcp-reference-session.md and FACTS.md Gate 5.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toMcpError } from './errors.js';
import { MCP_SCHEMA_VERSION, TOOL_INPUT_SCHEMAS } from './schemas.js';
import { toolRecord, toolSimulate, toolSynthesize, toolVerify } from './tools.js';

const TOOL_DESCRIPTIONS = {
  record:
    'Record one or more Soroban transactions (by hash) — or ingest a saved ' +
    'simulateTransaction exchange / inline RecordedTx — into a merged RecordedTx. ' +
    'Prefer this before synthesize. Deterministic per (hashes, chain state); uses ' +
    'RPC from config/env (STELLAR_RPC_URL / --rpcUrl), never hardcoded secrets. ' +
    'This server never signs.',
  synthesize:
    'Synthesize the least-privilege OpenZeppelin smart-account authorization ' +
    '(context rules + policies) from a RecordedTx or the baked-in fixture. ' +
    'Returns summary, spec, context-rule JSON, notes, warnings, and generated ' +
    'FrequencyLimitPolicy Rust. Pure given the recording + SynthConfig. ' +
    'Always surface `notes`/`warnings` and the `unauditedBanner` field to the user. ' +
    'Ask before widening caps or changing lifetime / argument constraints.',
  simulate:
    'Dry-run the built-in scenario suite against a synthesized spec (permit / deny / flag). ' +
    'Pure given the recording + SynthConfig. Use constrainArguments=true to show the ' +
    'argument-constraint deny (e.g. BLND→XLM) after showing the flag with it off. ' +
    'Always dry-run before concluding a policy is safe to install.',
  verify:
    'Diff emitted context-rule.json (+ attached policy install params) against an ' +
    'on-chain smart-account snapshot (fixture path or live smartAccount fetch). ' +
    'This is the on-chain/spec reconciliation — NOT the offline dry-run self-check. ' +
    'Pass onChainSnapshotPath pointing at fixtures/verify/*.json for network-free verification. ' +
    'Optional smartAccount triggers a live get_context_rule* fetch (requires network + .env).',
} as const;

const TOOL_NAMES = ['record', 'synthesize', 'simulate', 'verify'] as const;
type ToolName = (typeof TOOL_NAMES)[number];

const TOOLS = TOOL_NAMES.map((name) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  inputSchema: TOOL_INPUT_SCHEMAS[name],
}));

async function main(): Promise<void> {
  const server = new Server(
    { name: 'policywright', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'policywright exposes exactly four tools: record, synthesize, simulate, verify. ' +
        'Never install or deploy via MCP — direct the human to the CLI signing step. ' +
        'Always dry-run (simulate) before concluding. Always show the UNAUDITED banner on generated Rust. ' +
        'Never invent transaction hashes or amounts.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args: Record<string, unknown> = { ...(request.params.arguments ?? {}) };
    try {
      if (!(TOOL_NAMES as readonly string[]).includes(name)) {
        throw new Error(
          `unknown tool "${name}" — policywright exposes exactly: ${TOOL_NAMES.join(', ')}`,
        );
      }
      const toolName = name as ToolName;
      let result: unknown;
      switch (toolName) {
        case 'record':
          result = await toolRecord(args);
          break;
        case 'synthesize':
          result = toolSynthesize(args);
          break;
        case 'simulate':
          result = toolSimulate(args);
          break;
        case 'verify':
          result = await toolVerify(args);
          break;
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      const body = toMcpError(error, MCP_SCHEMA_VERSION);
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(`policywright mcp: ${(error as Error).message}\n`);
  process.exit(1);
});
