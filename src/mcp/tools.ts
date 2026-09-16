/**
 * MCP tool handlers — thin JSON wrappers around the shared pipeline and
 * on-chain verify library. Transport-free so unit tests can call them directly.
 *
 * Exactly four tools: record, synthesize, simulate, verify.
 * Never install / deploy / prepare_install (CLI-only human-signed step).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  pipelineRecord,
  pipelineSimulate,
  pipelineSynthesize,
  recordedTxToJson,
  type RecordPipelineInput,
  type SynthPipelineInput,
} from '../pipeline.js';
import { badInput } from '../sources/errors.js';
import type { Network, SynthConfig } from '../types.js';
import { verifyAgainstSnapshot } from '../verify/diff.js';
import { MCP_SCHEMA_VERSION, UNAUDITED_BANNER } from './schemas.js';

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw badInput('expected a string');
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw badInput(`${field} must be an array of strings`);
  }
  return value as string[];
}

function asNetwork(value: unknown): Network | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value !== 'testnet' && value !== 'mainnet' && value !== 'futurenet') {
    throw badInput(`network must be testnet|mainnet|futurenet, got ${JSON.stringify(value)}`);
  }
  return value;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw badInput('expected a boolean');
  return value;
}

function asNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badInput(`${field} must be a finite number`);
  }
  return value;
}

function resolveRpcUrl(explicit: string | undefined): string | undefined {
  return explicit ?? process.env['STELLAR_RPC_URL'] ?? undefined;
}

function resolveNetwork(explicit: Network | undefined): Network | undefined {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env['STELLAR_NETWORK'];
  if (fromEnv === 'testnet' || fromEnv === 'mainnet' || fromEnv === 'futurenet') {
    return fromEnv;
  }
  return undefined;
}

function synthConfigFromArgs(args: Record<string, unknown>): Partial<SynthConfig> {
  const lifetimeSecs = asNumber(args['lifetimeSecs'], 'lifetimeSecs');
  const spendWindowSecs = asNumber(args['spendWindowSecs'], 'spendWindowSecs');
  const capMultiplier = asNumber(args['capMultiplier'], 'capMultiplier');
  const frequencyWindowSecs = asNumber(args['frequencyWindowSecs'], 'frequencyWindowSecs');
  const frequencyMaxCalls = asNumber(args['frequencyMaxCalls'], 'frequencyMaxCalls');
  return {
    ...(lifetimeSecs === undefined ? {} : { lifetimeSecs }),
    ...(spendWindowSecs === undefined ? {} : { spendWindowSecs }),
    ...(capMultiplier === undefined ? {} : { capMultiplier }),
    ...(frequencyWindowSecs === undefined ? {} : { frequencyWindowSecs }),
    ...(frequencyMaxCalls === undefined ? {} : { frequencyMaxCalls }),
    ...(args['constrainArguments'] === undefined
      ? {}
      : { constrainArguments: asBool(args['constrainArguments'], false) }),
  };
}

function synthInputFromArgs(args: Record<string, unknown>): SynthPipelineInput {
  const inputPath = asOptionalString(args['inputPath']);
  return {
    ...(inputPath === undefined ? {} : { inputPath }),
    ...(args['recordedTx'] === undefined ? {} : { recordedTx: args['recordedTx'] }),
    config: synthConfigFromArgs(args),
  };
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw badInput(`could not read JSON file ${path}: ${(cause as Error).message}`);
  }
}

/** MCP `record`. */
export async function toolRecord(args: Record<string, unknown>): Promise<unknown> {
  const network = resolveNetwork(asNetwork(args['network']));
  const rpcUrl = resolveRpcUrl(asOptionalString(args['rpcUrl']));
  const account = asOptionalString(args['account']);
  const input: RecordPipelineInput = {
    ...(args['hashes'] === undefined ? {} : { hashes: asStringArray(args['hashes'], 'hashes') }),
    ...(network === undefined ? {} : { network }),
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
    ...(account === undefined ? {} : { account }),
    ...(args['fromSimulation'] === undefined ? {} : { fromSimulation: args['fromSimulation'] }),
    ...(args['recordedTx'] === undefined ? {} : { recordedTx: args['recordedTx'] }),
  };
  const tx = await pipelineRecord(input);
  const json = recordedTxToJson(tx);
  const outputPath = asOptionalString(args['outputPath']);
  if (outputPath !== undefined) {
    const abs = resolve(outputPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${json}\n`);
  }
  return {
    schemaVersion: MCP_SCHEMA_VERSION,
    recordedTx: JSON.parse(json) as unknown,
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

/** MCP `synthesize`. */
export function toolSynthesize(args: Record<string, unknown>): unknown {
  const result = pipelineSynthesize(synthInputFromArgs(args));
  const outDir = asOptionalString(args['outDir']);
  if (outDir !== undefined) {
    const abs = resolve(outDir);
    mkdirSync(abs, { recursive: true });
    writeFileSync(`${abs}/summary.txt`, result.artifacts.summary);
    writeFileSync(`${abs}/spec.json`, `${result.artifacts.specJson}\n`);
    writeFileSync(`${abs}/context-rule.json`, `${result.artifacts.contextRuleJson}\n`);
    writeFileSync(`${abs}/FrequencyLimitPolicy.rs`, result.artifacts.rustPolicy);
  }
  return {
    schemaVersion: MCP_SCHEMA_VERSION,
    summary: result.artifacts.summary,
    spec: JSON.parse(result.artifacts.specJson) as unknown,
    contextRule: JSON.parse(result.artifacts.contextRuleJson) as unknown,
    rustPolicy: result.artifacts.rustPolicy,
    notes: result.spec.notes,
    warnings: result.spec.warnings,
    config: result.config,
    unauditedBanner: UNAUDITED_BANNER,
    ...(outDir === undefined ? {} : { outDir }),
  };
}

/** MCP `simulate`. */
export function toolSimulate(args: Record<string, unknown>): unknown {
  const result = pipelineSimulate(synthInputFromArgs(args));
  return {
    schemaVersion: MCP_SCHEMA_VERSION,
    report: result.report,
    results: result.results,
    constrainArguments: result.config.constrainArguments,
  };
}

/**
 * MCP `verify` — on-chain / fixture snapshot vs emitted context-rule diff.
 * Does NOT run the offline dry-run scenario self-check.
 * When `smartAccount` is set, fetches a live snapshot (requires network + .env).
 */
export async function toolVerify(args: Record<string, unknown>): Promise<unknown> {
  const smartAccount = asOptionalString(args['smartAccount']);
  const snapshotPath = asOptionalString(args['onChainSnapshotPath']);
  let snapshot: unknown =
    args['onChainSnapshot'] !== undefined
      ? args['onChainSnapshot']
      : snapshotPath !== undefined
        ? readJsonFile(snapshotPath)
        : undefined;

  if (snapshot === undefined && smartAccount !== undefined) {
    const { fetchOnChainSnapshot } = await import('../verify/fetch.js');
    const { DEFAULT_FREQUENCY_POLICY } = await import('../cli-env.js');
    const spendingLimitPolicyAddress = asOptionalString(args['spendingLimitPolicyAddress']);
    snapshot = await fetchOnChainSnapshot({
      smartAccount,
      network: resolveNetwork(asNetwork(args['network'])) ?? 'testnet',
      frequencyPolicyAddress:
        asOptionalString(args['frequencyPolicyAddress']) ?? DEFAULT_FREQUENCY_POLICY,
      ...(spendingLimitPolicyAddress !== undefined ? { spendingLimitPolicyAddress } : {}),
    });
  }

  if (snapshot === undefined) {
    throw badInput(
      'verify requires onChainSnapshot, onChainSnapshotPath, or smartAccount (live fetch)',
    );
  }

  let emitted: unknown = args['contextRule'];
  const contextRulePath = asOptionalString(args['contextRulePath']);
  if (emitted === undefined && contextRulePath !== undefined) {
    emitted = readJsonFile(contextRulePath);
  }
  if (emitted === undefined) {
    if (args['recordedTx'] !== undefined || asOptionalString(args['inputPath']) !== undefined) {
      const synth = pipelineSynthesize(synthInputFromArgs(args));
      emitted = JSON.parse(synth.artifacts.contextRuleJson) as unknown;
    }
  }
  if (emitted === undefined) {
    throw badInput(
      'verify requires contextRule / contextRulePath, or recordedTx / inputPath to synthesize first',
    );
  }

  const result = verifyAgainstSnapshot({ emitted, snapshot });
  return {
    schemaVersion: MCP_SCHEMA_VERSION,
    ok: result.ok,
    diffs: result.diffs,
    matchedRules: result.matchedRules,
    expectedRuleCount: result.expectedRuleCount,
    actualRuleCount: result.actualRuleCount,
    ...(smartAccount !== undefined ? { smartAccount, source: 'rpc' } : {}),
  };
}
