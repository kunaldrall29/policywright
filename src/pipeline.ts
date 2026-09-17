/**
 * Shared record → synthesize → simulate → (scenario) verify pipeline.
 *
 * Used by the CLI and the MCP server so both surfaces stay behaviourally
 * identical. Pure orchestration over the existing modules — no extra policy
 * logic lives here.
 *
 * On-chain / spec verify lives in {@link ./verify/diff.js} (`verifyAgainstSnapshot`).
 * {@link pipelineVerifyScenarios} is the offline dry-run self-check used by
 * `npm run demo` only — never exposed as the MCP `verify` tool (T2-2).
 */

import { emit, type EmittedArtifacts } from './emitter.js';
import { loadFixture } from './sources/fixture.js';
import { loadRecordedTx, parseRecordedJson } from './sources/recorded.js';
import { recordFromHashes, tokenResolverFor } from './sources/rpc.js';
import { ingestSimulation } from './sources/simulation.js';
import { badInput } from './sources/errors.js';
import { buildScenarios, renderReport, simulateCall, type Scenario } from './simulate.js';
import { synthesize } from './synthesizer.js';
import {
  DEFAULT_SYNTH_CONFIG,
  type Network,
  type RecordedTx,
  type SimulationResult,
  type SmartAccountSpec,
  type SynthConfig,
} from './types.js';

/** JSON-serialisation helpers shared by CLI and MCP. */
export function recordedTxToJson(tx: RecordedTx): string {
  return JSON.stringify(
    tx,
    function (this: Record<string, unknown>, key: string, value: unknown) {
      const raw = this[key];
      if (raw instanceof Uint8Array) {
        return `hex:${Buffer.from(raw).toString('hex')}`;
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    },
    2,
  );
}

export interface RecordPipelineInput {
  readonly hashes?: readonly string[];
  readonly network?: Network;
  readonly rpcUrl?: string;
  readonly account?: string;
  /** Saved simulateTransaction exchange (mutually exclusive with hashes). */
  readonly fromSimulation?: unknown;
  /** Inline RecordedTx JSON (skips network). */
  readonly recordedTx?: unknown;
}

/** Record (or load) a {@link RecordedTx}. */
export async function pipelineRecord(input: RecordPipelineInput): Promise<RecordedTx> {
  if (input.recordedTx !== undefined) {
    return parseRecordedJson(input.recordedTx);
  }
  const network: Network = input.network ?? 'testnet';
  if (input.fromSimulation !== undefined) {
    return ingestSimulation(input.fromSimulation, {
      network,
      ...(input.account === undefined ? {} : { account: input.account }),
      resolveToken: tokenResolverFor(network, input.rpcUrl),
    });
  }
  const hashes = input.hashes ?? [];
  if (hashes.length === 0) {
    throw badInput(
      'record requires hashes, fromSimulation, or recordedTx (or call synthesize with the fixture)',
    );
  }
  return recordFromHashes(hashes, {
    network,
    ...(input.rpcUrl === undefined ? {} : { rpcUrl: input.rpcUrl }),
    ...(input.account === undefined ? {} : { account: input.account }),
  });
}

export interface SynthPipelineInput {
  /** Absolute/relative path to a saved RecordedTx JSON. */
  readonly inputPath?: string;
  /** Inline RecordedTx (object or JSON string already parsed). */
  readonly recordedTx?: unknown;
  /** When true (default if nothing else given), use the baked-in fixture. */
  readonly useFixture?: boolean;
  readonly config?: Partial<SynthConfig>;
}

export interface SynthPipelineResult {
  readonly tx: RecordedTx;
  readonly spec: SmartAccountSpec;
  readonly artifacts: EmittedArtifacts;
  readonly config: SynthConfig;
}

function mergeConfig(partial: Partial<SynthConfig> | undefined): SynthConfig {
  return { ...DEFAULT_SYNTH_CONFIG, ...(partial ?? {}) };
}

/** Load a recording and synthesize + emit artefacts. */
export function pipelineSynthesize(input: SynthPipelineInput = {}): SynthPipelineResult {
  const config = mergeConfig(input.config);
  let tx: RecordedTx;
  if (input.recordedTx !== undefined) {
    tx = parseRecordedJson(input.recordedTx);
  } else if (input.inputPath !== undefined) {
    tx = loadRecordedTx(input.inputPath);
  } else {
    tx = loadFixture();
  }
  const spec = synthesize(tx, config, tx.timestamp ?? 0);
  const artifacts = emit(tx, spec);
  return { tx, spec, artifacts, config };
}

export type SimulatePipelineInput = SynthPipelineInput;

export interface SimulatePipelineResult extends SynthPipelineResult {
  readonly scenarios: readonly Scenario[];
  readonly results: readonly SimulationResult[];
  readonly report: string;
}

/** Synthesize then dry-run the built-in scenario suite. */
export function pipelineSimulate(input: SimulatePipelineInput = {}): SimulatePipelineResult {
  const base = pipelineSynthesize(input);
  const scenarios = buildScenarios(base.spec, base.tx);
  const results = scenarios.map((s) => simulateCall(base.spec, s.candidate));
  return { ...base, scenarios, results, report: renderReport(results) };
}

export interface VerifyScenariosResult extends SimulatePipelineResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
}

/**
 * Offline dry-run suite assertion (same contract as `npm run demo`).
 * NOT the MCP/CLI `verify` tool — that diffs on-chain rules vs emitted spec.
 */
export function pipelineVerifyScenarios(input: SimulatePipelineInput = {}): VerifyScenariosResult {
  const simulated = pipelineSimulate(input);
  const failures: string[] = [];
  simulated.scenarios.forEach((scenario, i) => {
    const result = simulated.results[i];
    if (
      result === undefined ||
      result.decision !== scenario.expectedDecision ||
      result.reasonCode !== scenario.expectedReasonCode
    ) {
      failures.push(
        `"${scenario.candidate.label}": expected ${scenario.expectedDecision}/${scenario.expectedReasonCode}, got ${result?.decision}/${result?.reasonCode}`,
      );
    }
  });
  return { ...simulated, ok: failures.length === 0, failures };
}
