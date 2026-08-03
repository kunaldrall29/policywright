/**
 * policywright command-line entry point.
 *
 *   demo                 run the end-to-end demo and self-check (see demo.ts)
 *   synth                synthesize a spec from the baked-in fixture and print it
 *   simulate             run the dry-run scenarios against the fixture's spec
 *   record <hash...>     fetch a transaction sequence by hash (or ingest a saved
 *                        simulation with --from-simulation) and print the merged
 *                        RecordedTx
 *
 * synth and simulate accept SynthConfig overrides as flags (see USAGE); any
 * flag left out keeps its documented default from DEFAULT_SYNTH_CONFIG.
 */

import { readFileSync } from 'node:fs';
import { emit } from './emitter.js';
import { runDemo } from './demo.js';
import { loadFixture } from './sources/fixture.js';
import { loadRecordedTx } from './sources/recorded.js';
import { recordFromHashes, tokenResolverFor } from './sources/rpc.js';
import { ingestSimulation } from './sources/simulation.js';
import { badInput } from './sources/errors.js';
import { buildScenarios, renderReport, simulateCall } from './simulate.js';
import { synthesize } from './synthesizer.js';
import { DEFAULT_SYNTH_CONFIG, type Network, type RecordedTx, type SynthConfig } from './types.js';

const D = DEFAULT_SYNTH_CONFIG;

const USAGE = `policywright — synthesize a least-privilege smart-account authorization

Usage:
  npm run demo                          end-to-end demo + dry-run self-check
  npm run cli -- synth     [synth-flags] synthesize from the baked-in fixture
  npm run cli -- simulate  [synth-flags] dry-run scenarios against the spec
  npm run record -- <txHash> [<txHash> ...] [record-flags]
  npm run record -- --from-simulation <file.json> [record-flags]

Record flags:
  --network <n>            testnet|mainnet|futurenet (testnet)
  --rpc-url <url>          override the network's public RPC endpoint
  --account <G...|C...>    account movements are attributed to; without it the
                           first transaction's source account is assumed (a
                           warning records the assumption — smart-account flows
                           usually act through a C... address, not the source)
  --from-simulation <file> ingest a saved simulateTransaction exchange instead
                           of fetching hashes (source: "simulation")

A multi-step flow (e.g. Blend claim then Soroswap swap) is several hashes —
Soroban allows one InvokeHostFunction per transaction. Passing every hash
merges them into ONE RecordedTx ordered by ledger close time.

Synthesis flags (defaults in parentheses):
  --input <recorded.json>    synthesize from a saved record output instead of
                             the baked-in fixture (e.g. examples/live/recorded-claim-swap.json)
  --lifetime <secs>          context-rule lifetime (${D.lifetimeSecs})
  --spend-window <secs>      spend-cap rolling window (${D.spendWindowSecs})
  --cap-multiplier <number>  cap = observed gross out * this (${D.capMultiplier})
  --frequency-window <secs>  frequency rolling window (${D.frequencyWindowSecs})
  --frequency-max <count>    max calls per frequency window (${D.frequencyMaxCalls})
  --constrain-arguments      enforce swap-path token set (default off: flag only)

Networks default to testnet.`;

/** Minimal `--key value` / `--key=value` flag parser. */
function parseFlags(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined || !arg.startsWith('--')) {
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(arg.slice(2), next);
        i += 1;
      } else {
        flags.set(arg.slice(2), 'true');
      }
    }
  }
  return flags;
}

/** Parse a flag as a finite number, throwing a clear error otherwise. */
function numberFlag(flags: Map<string, string>, key: string, fallback: number): number {
  const raw = flags.get(key);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a number, got "${raw}"`);
  }
  return value;
}

/** A boolean flag is true when present unless explicitly set to "false". */
function boolFlag(flags: Map<string, string>, key: string, fallback: boolean): boolean {
  const raw = flags.get(key);
  if (raw === undefined) {
    return fallback;
  }
  return raw !== 'false';
}

/** Build a SynthConfig from flags, overriding documented defaults. */
function parseSynthConfig(flags: Map<string, string>): SynthConfig {
  return {
    lifetimeSecs: numberFlag(flags, 'lifetime', D.lifetimeSecs),
    spendWindowSecs: numberFlag(flags, 'spend-window', D.spendWindowSecs),
    capMultiplier: numberFlag(flags, 'cap-multiplier', D.capMultiplier),
    frequencyWindowSecs: numberFlag(flags, 'frequency-window', D.frequencyWindowSecs),
    frequencyMaxCalls: numberFlag(flags, 'frequency-max', D.frequencyMaxCalls),
    constrainArguments: boolFlag(flags, 'constrain-arguments', D.constrainArguments),
  };
}

function parseNetwork(value: string | undefined): Network {
  if (value === undefined) {
    return 'testnet';
  }
  if (value !== 'testnet' && value !== 'mainnet' && value !== 'futurenet') {
    throw new Error(`unknown network "${value}" (expected testnet, mainnet, or futurenet)`);
  }
  return value;
}

/**
 * Serialise a RecordedTx to JSON: bigints as decimal strings, byte arguments
 * as `hex:<...>` strings (JSON.stringify would otherwise explode a Uint8Array
 * into an index-keyed object).
 */
function recordedTxToJson(tx: RecordedTx): string {
  return JSON.stringify(
    tx,
    // Must be a `function` (not arrow) to reach `this[key]`: JSON.stringify
    // applies Buffer.prototype.toJSON BEFORE the replacer sees the value, so
    // byte arguments must be intercepted on the holder object.
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

function cmdSynth(config: SynthConfig, inputPath: string | undefined): void {
  const tx = inputPath === undefined ? loadFixture() : loadRecordedTx(inputPath);
  const spec = synthesize(tx, config, tx.timestamp ?? 0);
  const artifacts = emit(tx, spec);
  process.stdout.write(artifacts.summary);
  process.stdout.write('\n--- spec.json ---\n');
  process.stdout.write(`${artifacts.specJson}\n`);
  process.stdout.write('\n--- context-rule.json ---\n');
  process.stdout.write(`${artifacts.contextRuleJson}\n`);
}

function cmdSimulate(config: SynthConfig): void {
  const tx = loadFixture();
  const spec = synthesize(tx, config, tx.timestamp ?? 0);
  const results = buildScenarios(spec, tx).map((s) => simulateCall(spec, s.candidate));
  process.stdout.write(`${renderReport(results)}\n`);
}

/** Positional (non-flag) arguments, skipping each flag's value token. */
function positionalArgs(rest: readonly string[]): string[] {
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith('--')) {
      // `--flag value` consumes the next token; `--flag=value` does not.
      const next = rest[i + 1];
      if (!arg.includes('=') && next !== undefined && !next.startsWith('--')) {
        i += 1;
      }
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

async function cmdRecord(rest: readonly string[]): Promise<void> {
  const flags = parseFlags(rest);
  const hashes = positionalArgs(rest);
  const network = parseNetwork(flags.get('network'));
  const rpcUrl = flags.get('rpc-url');
  const account = flags.get('account');
  const simulationFile = flags.get('from-simulation');

  let tx: RecordedTx;
  if (simulationFile !== undefined) {
    if (hashes.length > 0) {
      throw badInput('--from-simulation cannot be combined with transaction hashes');
    }
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(simulationFile, 'utf8'));
    } catch (cause) {
      throw badInput(
        `could not read simulation file ${simulationFile}: ${(cause as Error).message}`,
      );
    }
    tx = await ingestSimulation(doc, {
      network,
      ...(account === undefined ? {} : { account }),
      resolveToken: tokenResolverFor(network, rpcUrl),
    });
  } else {
    if (hashes.length === 0) {
      throw badInput(
        'record requires at least one transaction hash (or --from-simulation <file>): ' +
          'npm run record -- <txHash> [<txHash> ...]',
      );
    }
    tx = await recordFromHashes(hashes, {
      network,
      ...(rpcUrl === undefined ? {} : { rpcUrl }),
      ...(account === undefined ? {} : { account }),
    });
  }
  process.stdout.write(`${recordedTxToJson(tx)}\n`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'demo':
      runDemo();
      return;
    case 'synth': {
      const flags = parseFlags(rest);
      cmdSynth(parseSynthConfig(flags), flags.get('input'));
      return;
    }
    case 'simulate':
      cmdSimulate(parseSynthConfig(parseFlags(rest)));
      return;
    case 'record':
      await cmdRecord(rest);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(`${USAGE}\n`);
      return;
    default:
      throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
