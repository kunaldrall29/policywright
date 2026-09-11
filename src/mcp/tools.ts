/**
 * MCP tool handlers for policywright — JSON wrappers around the shared pipeline
 * and install preparer. Transport-free so unit tests can call them directly.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  prepareInstall,
  type InstallPlan,
  type PrepareInstallInput,
} from '../install/prepare.js';
import {
  pipelineRecord,
  pipelineSimulate,
  pipelineSynthesize,
  pipelineVerify,
  recordedTxToJson,
  type RecordPipelineInput,
  type SynthPipelineInput,
} from '../pipeline.js';
import type { Network, SynthConfig } from '../types.js';

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('expected a string');
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value as string[];
}

function asNetwork(value: unknown): Network | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value !== 'testnet' && value !== 'mainnet' && value !== 'futurenet') {
    throw new Error(`network must be testnet|mainnet|futurenet, got ${String(value)}`);
  }
  return value;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new Error('expected a boolean');
  return value;
}

function asNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function synthConfigFromArgs(args: Record<string, unknown>): Partial<SynthConfig> {
  const lifetimeSecs = asNumber(args.lifetimeSecs, 'lifetimeSecs');
  const spendWindowSecs = asNumber(args.spendWindowSecs, 'spendWindowSecs');
  const capMultiplier = asNumber(args.capMultiplier, 'capMultiplier');
  const frequencyWindowSecs = asNumber(args.frequencyWindowSecs, 'frequencyWindowSecs');
  const frequencyMaxCalls = asNumber(args.frequencyMaxCalls, 'frequencyMaxCalls');
  return {
    ...(lifetimeSecs === undefined ? {} : { lifetimeSecs }),
    ...(spendWindowSecs === undefined ? {} : { spendWindowSecs }),
    ...(capMultiplier === undefined ? {} : { capMultiplier }),
    ...(frequencyWindowSecs === undefined ? {} : { frequencyWindowSecs }),
    ...(frequencyMaxCalls === undefined ? {} : { frequencyMaxCalls }),
    ...(args.constrainArguments === undefined
      ? {}
      : { constrainArguments: asBool(args.constrainArguments, false) }),
  };
}

function synthInputFromArgs(args: Record<string, unknown>): SynthPipelineInput {
  const inputPath = asOptionalString(args.inputPath);
  return {
    ...(inputPath === undefined ? {} : { inputPath }),
    ...(args.recordedTx === undefined ? {} : { recordedTx: args.recordedTx }),
    config: synthConfigFromArgs(args),
  };
}

/** MCP `record`. */
export async function toolRecord(args: Record<string, unknown>): Promise<unknown> {
  const network = asNetwork(args.network);
  const rpcUrl = asOptionalString(args.rpcUrl);
  const account = asOptionalString(args.account);
  const input: RecordPipelineInput = {
    ...(args.hashes === undefined ? {} : { hashes: asStringArray(args.hashes, 'hashes') }),
    ...(network === undefined ? {} : { network }),
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
    ...(account === undefined ? {} : { account }),
    ...(args.fromSimulation === undefined ? {} : { fromSimulation: args.fromSimulation }),
    ...(args.recordedTx === undefined ? {} : { recordedTx: args.recordedTx }),
  };
  const tx = await pipelineRecord(input);
  const json = recordedTxToJson(tx);
  const outputPath = asOptionalString(args.outputPath);
  if (outputPath !== undefined) {
    const abs = resolve(outputPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${json}\n`);
  }
  return { recordedTx: JSON.parse(json), ...(outputPath === undefined ? {} : { outputPath }) };
}

/** MCP `synthesize`. */
export function toolSynthesize(args: Record<string, unknown>): unknown {
  const result = pipelineSynthesize(synthInputFromArgs(args));
  const outDir = asOptionalString(args.outDir);
  if (outDir !== undefined) {
    const abs = resolve(outDir);
    mkdirSync(abs, { recursive: true });
    writeFileSync(`${abs}/summary.txt`, result.artifacts.summary);
    writeFileSync(`${abs}/spec.json`, `${result.artifacts.specJson}\n`);
    writeFileSync(`${abs}/context-rule.json`, `${result.artifacts.contextRuleJson}\n`);
    writeFileSync(`${abs}/FrequencyLimitPolicy.rs`, result.artifacts.rustPolicy);
  }
  return {
    summary: result.artifacts.summary,
    spec: JSON.parse(result.artifacts.specJson),
    contextRule: JSON.parse(result.artifacts.contextRuleJson),
    rustPolicy: result.artifacts.rustPolicy,
    config: result.config,
    ...(outDir === undefined ? {} : { outDir }),
  };
}

/** MCP `simulate`. */
export function toolSimulate(args: Record<string, unknown>): unknown {
  const result = pipelineSimulate(synthInputFromArgs(args));
  return {
    report: result.report,
    results: result.results,
    constrainArguments: result.config.constrainArguments,
  };
}

/** MCP `verify`. */
export function toolVerify(args: Record<string, unknown>): unknown {
  const result = pipelineVerify(synthInputFromArgs(args));
  return {
    ok: result.ok,
    failures: result.failures,
    report: result.report,
    results: result.results,
  };
}

/** MCP `prepare_install`. */
export async function toolPrepareInstall(args: Record<string, unknown>): Promise<InstallPlan> {
  const contextRulePath = asOptionalString(args.contextRulePath);
  const frequencyPolicyAddress = asOptionalString(args.frequencyPolicyAddress);
  const spendingLimitPolicyAddress = asOptionalString(args.spendingLimitPolicyAddress);
  const rpcUrl = asOptionalString(args.rpcUrl);
  const lifetimeSecs = asNumber(args.lifetimeSecs, 'lifetimeSecs');
  const network = asNetwork(args.network) ?? 'testnet';

  const input: PrepareInstallInput = {
    ...(args.contextRule === undefined ? {} : { contextRule: args.contextRule }),
    ...(contextRulePath === undefined ? {} : { contextRulePath }),
    smartAccount: asString(args.smartAccount, 'smartAccount'),
    ...(frequencyPolicyAddress === undefined ? {} : { frequencyPolicyAddress }),
    ...(spendingLimitPolicyAddress === undefined ? {} : { spendingLimitPolicyAddress }),
    network,
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
    ...(lifetimeSecs === undefined ? {} : { lifetimeSecs }),
    signers: args.signers === undefined ? [] : asStringArray(args.signers, 'signers'),
  };

  const plan = await prepareInstall(input);
  const outputPath = asOptionalString(args.outputPath);
  if (outputPath !== undefined) {
    const abs = resolve(outputPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(plan, null, 2)}\n`);
  }
  return plan;
}
