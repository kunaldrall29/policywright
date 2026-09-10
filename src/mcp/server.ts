/**
 * policywright MCP server (stdio).
 *
 * Tools: record, synthesize, simulate, verify, prepare_install.
 * Start with `npm run mcp`. Wire into Claude Desktop / Cursor via the
 * packaged skill at skills/policywright/SKILL.md.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  toolPrepareInstall,
  toolRecord,
  toolSimulate,
  toolSynthesize,
  toolVerify,
} from './tools.js';

const TOOLS = [
  {
    name: 'record',
    description:
      'Record one or more Soroban transactions (by hash) — or ingest a saved simulateTransaction exchange — into a merged RecordedTx. Prefer this before synthesize.',
    inputSchema: {
      type: 'object',
      properties: {
        hashes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Transaction hashes (64-hex). Multi-step flows pass every hash.',
        },
        network: {
          type: 'string',
          enum: ['testnet', 'mainnet', 'futurenet'],
          description: 'Defaults to testnet.',
        },
        rpcUrl: { type: 'string', description: 'Optional RPC URL override.' },
        account: {
          type: 'string',
          description: 'Subject G…/C… address movements are attributed to.',
        },
        fromSimulation: {
          description: 'Saved simulateTransaction request/response document (alternative to hashes).',
        },
        recordedTx: { description: 'Inline RecordedTx to re-load (skips network).' },
        outputPath: { type: 'string', description: 'Optional path to write the RecordedTx JSON.' },
      },
    },
  },
  {
    name: 'synthesize',
    description:
      'Synthesize the least-privilege OpenZeppelin smart-account authorization (context rules + policies) from a RecordedTx or the baked-in fixture. Returns summary, spec, context-rule JSON, and the illustrative FrequencyLimitPolicy Rust (UNAUDITED banner included).',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Path to a saved RecordedTx JSON.' },
        recordedTx: { description: 'Inline RecordedTx object.' },
        outDir: { type: 'string', description: 'Optional directory to write artefacts into.' },
        lifetimeSecs: { type: 'number' },
        spendWindowSecs: { type: 'number' },
        capMultiplier: { type: 'number' },
        frequencyWindowSecs: { type: 'number' },
        frequencyMaxCalls: { type: 'number' },
        constrainArguments: {
          type: 'boolean',
          description: 'When true, unobserved swap routes deny instead of flag.',
        },
      },
    },
  },
  {
    name: 'simulate',
    description:
      'Dry-run the built-in scenario suite against a synthesized spec. Use constrainArguments=true to show the argument-constraint deny (BLND→XLM style) after showing the flag with it off.',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string' },
        recordedTx: {},
        lifetimeSecs: { type: 'number' },
        spendWindowSecs: { type: 'number' },
        capMultiplier: { type: 'number' },
        frequencyWindowSecs: { type: 'number' },
        frequencyMaxCalls: { type: 'number' },
        constrainArguments: { type: 'boolean' },
      },
    },
  },
  {
    name: 'verify',
    description:
      'Run the dry-run suite and assert every scenario matches its expected decision (same contract as `npm run demo`). Returns ok=false with failures when something drifts.',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string' },
        recordedTx: {},
        constrainArguments: { type: 'boolean' },
        lifetimeSecs: { type: 'number' },
        spendWindowSecs: { type: 'number' },
        capMultiplier: { type: 'number' },
        frequencyWindowSecs: { type: 'number' },
        frequencyMaxCalls: { type: 'number' },
      },
    },
  },
  {
    name: 'prepare_install',
    description:
      'Prepare a Freighter install plan from an emitted context-rule.json: recomputes validUntilLedger from the live ledger head, attaches policy addresses and signers, and reports blockers. Does NOT submit — the human signs in Freighter.',
    inputSchema: {
      type: 'object',
      required: ['smartAccount'],
      properties: {
        smartAccount: {
          type: 'string',
          description: 'C… smart-account contract that will receive add_context_rule.',
        },
        contextRulePath: { type: 'string' },
        contextRule: { description: 'Inline context-rule.json object.' },
        frequencyPolicyAddress: {
          type: 'string',
          description: 'Deployed FrequencyLimitPolicy contract id (fills null addresses).',
        },
        spendingLimitPolicyAddress: {
          type: 'string',
          description: 'Deployed spending_limit wrapper contract id, if used.',
        },
        signers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Signer identifiers to attach at install (G… or policy signers).',
        },
        network: { type: 'string', enum: ['testnet', 'mainnet', 'futurenet'] },
        rpcUrl: { type: 'string' },
        lifetimeSecs: { type: 'number' },
        outputPath: { type: 'string', description: 'Optional path to write the install plan JSON.' },
      },
    },
  },
] as const;

async function main(): Promise<void> {
  const server = new Server(
    { name: 'policywright', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      let result: unknown;
      switch (name) {
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
          result = toolVerify(args);
          break;
        case 'prepare_install':
          result = await toolPrepareInstall(args);
          break;
        default:
          throw new Error(`unknown tool "${name}"`);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: (error as Error).message }],
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
