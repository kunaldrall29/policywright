/**
 * Versioned JSON Schema (draft-07 style) for MCP tool inputs/outputs.
 * `schemaVersion` mirrors {@link CONTEXT_RULE_SCHEMA_VERSION}.
 */

import { CONTEXT_RULE_SCHEMA_VERSION } from '../types.js';
import { ON_CHAIN_SNAPSHOT_SCHEMA_VERSION } from '../verify/types.js';

/** Shared MCP I/O schema version (tied to context-rule schema). */
export const MCP_SCHEMA_VERSION = CONTEXT_RULE_SCHEMA_VERSION;

const NETWORK_ENUM = ['testnet', 'mainnet', 'futurenet'] as const;

const synthConfigProperties = {
  lifetimeSecs: { type: 'number', description: 'Context-rule lifetime in seconds.' },
  spendWindowSecs: { type: 'number', description: 'Spend-cap rolling window in seconds.' },
  capMultiplier: {
    type: 'number',
    description: 'Cap = observed gross outflow × this multiplier.',
  },
  frequencyWindowSecs: { type: 'number', description: 'Frequency-limit window in seconds.' },
  frequencyMaxCalls: { type: 'number', description: 'Max calls per frequency window.' },
  constrainArguments: {
    type: 'boolean',
    description:
      'When true, unobserved swap-path tokens DENY; when false (default), they FLAG only.',
  },
} as const;

/** Tool input schemas (JSON Schema objects for MCP list_tools). */
export const TOOL_INPUT_SCHEMAS = {
  record: {
    type: 'object',
    properties: {
      schemaVersion: {
        type: 'integer',
        const: MCP_SCHEMA_VERSION,
        description: `Input schema version (currently ${MCP_SCHEMA_VERSION}).`,
      },
      hashes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Transaction hashes (64-hex). Multi-step flows pass every hash.',
      },
      network: {
        type: 'string',
        enum: [...NETWORK_ENUM],
        description: 'Defaults to STELLAR_NETWORK / testnet. Never hardcodes secrets.',
      },
      rpcUrl: {
        type: 'string',
        description: 'Optional RPC URL override (or STELLAR_RPC_URL env).',
      },
      account: {
        type: 'string',
        description: 'Subject G…/C… address movements are attributed to.',
      },
      fromSimulation: {
        description:
          'Saved simulateTransaction request/response document (alternative to hashes).',
      },
      recordedTx: {
        description: 'Inline RecordedTx to re-load (skips network — for tests/fixtures).',
      },
      outputPath: { type: 'string', description: 'Optional path to write the RecordedTx JSON.' },
    },
  },
  synthesize: {
    type: 'object',
    properties: {
      schemaVersion: {
        type: 'integer',
        const: MCP_SCHEMA_VERSION,
        description: `Input schema version (currently ${MCP_SCHEMA_VERSION}).`,
      },
      inputPath: { type: 'string', description: 'Path to a saved RecordedTx JSON.' },
      recordedTx: { description: 'Inline RecordedTx object (network-free).' },
      outDir: { type: 'string', description: 'Optional directory to write artefacts into.' },
      ...synthConfigProperties,
    },
  },
  simulate: {
    type: 'object',
    properties: {
      schemaVersion: {
        type: 'integer',
        const: MCP_SCHEMA_VERSION,
        description: `Input schema version (currently ${MCP_SCHEMA_VERSION}).`,
      },
      inputPath: { type: 'string' },
      recordedTx: { description: 'Inline RecordedTx object (network-free).' },
      ...synthConfigProperties,
    },
  },
  verify: {
    type: 'object',
    description:
      'Diff emitted context-rule.json (+ policies) against an on-chain snapshot. ' +
      'NOT the offline dry-run self-check. Provide onChainSnapshot (or path) and either ' +
      'contextRule / contextRulePath, or a recording to synthesize first.',
    properties: {
      schemaVersion: {
        type: 'integer',
        const: MCP_SCHEMA_VERSION,
        description: `Input schema version (currently ${MCP_SCHEMA_VERSION}).`,
      },
      contextRule: {
        description: `Emitted context-rule.json object (schemaVersion ${CONTEXT_RULE_SCHEMA_VERSION}).`,
      },
      contextRulePath: { type: 'string', description: 'Path to emitted context-rule.json.' },
      onChainSnapshot: {
        description: `On-chain snapshot object (schemaVersion ${ON_CHAIN_SNAPSHOT_SCHEMA_VERSION}). Use committed fixtures for network-free tests.`,
      },
      onChainSnapshotPath: {
        type: 'string',
        description: 'Path to an on-chain snapshot JSON fixture.',
      },
      inputPath: {
        type: 'string',
        description: 'If no contextRule given: synthesize from this RecordedTx path first.',
      },
      recordedTx: {
        description: 'If no contextRule given: synthesize from this inline RecordedTx first.',
      },
      ...synthConfigProperties,
    },
  },
} as const;

/** Documented output shapes (agents / tests assert against these fields). */
export const TOOL_OUTPUT_FIELDS = {
  record: ['schemaVersion', 'recordedTx'] as const,
  synthesize: [
    'schemaVersion',
    'summary',
    'spec',
    'contextRule',
    'rustPolicy',
    'notes',
    'warnings',
    'config',
    'unauditedBanner',
  ] as const,
  simulate: ['schemaVersion', 'report', 'results', 'constrainArguments'] as const,
  verify: [
    'schemaVersion',
    'ok',
    'diffs',
    'matchedRules',
    'expectedRuleCount',
    'actualRuleCount',
  ] as const,
} as const;

/** UNAUDITED banner string carried on synthesize outputs that include generated code. */
export const UNAUDITED_BANNER =
  'ILLUSTRATIVE / UNAUDITED — NOT DEPLOY-READY. Generated FrequencyLimitPolicy Rust is a starting point until the Tranche 3 Audit Bank audit.';
