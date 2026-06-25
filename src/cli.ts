/**
 * policywright command-line entry point.
 *
 *   demo                 run the end-to-end demo and self-check (see demo.ts)
 *   synth                synthesize a spec from the baked-in fixture and print it
 *   simulate             run the dry-run scenarios against the fixture's spec
 *   record <hash>        fetch a live transaction by hash and print the recording
 *
 * synth and simulate accept SynthConfig overrides as flags (see USAGE); any
 * flag left out keeps its documented default from DEFAULT_SYNTH_CONFIG.
 */

import { emit } from './emitter.js';
import { runDemo } from './demo.js';
import { loadFixture } from './sources/fixture.js';
import { recordFromHash } from './sources/rpc.js';
import { buildScenarios, renderReport, simulateCall } from './simulate.js';
import { synthesize } from './synthesizer.js';
import { DEFAULT_SYNTH_CONFIG, type Network, type RecordedTx, type SynthConfig } from './types.js';

const D = DEFAULT_SYNTH_CONFIG;

const USAGE = `policywright — synthesize a least-privilege smart-account authorization

Usage:
  npm run demo                          end-to-end demo + dry-run self-check
  npm run cli -- synth     [synth-flags] synthesize from the baked-in fixture
  npm run cli -- simulate  [synth-flags] dry-run scenarios against the spec
  npm run record -- <txHash> [--network testnet|mainnet|futurenet]

Synthesis flags (defaults in parentheses):
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

/** Serialise a RecordedTx to JSON with bigints rendered as decimal strings. */
function recordedTxToJson(tx: RecordedTx): string {
  return JSON.stringify(
    tx,
    (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );
}

function cmdSynth(config: SynthConfig): void {
  const tx = loadFixture();
  const spec = synthesize(tx, config, tx.timestamp ?? 0);
  const artifacts = emit(tx, spec);
  process.stdout.write(artifacts.summary);
  process.stdout.write('\n--- spec.json ---\n');
  process.stdout.write(`${artifacts.specJson}\n`);
}

function cmdSimulate(config: SynthConfig): void {
  const tx = loadFixture();
  const spec = synthesize(tx, config, tx.timestamp ?? 0);
  const results = buildScenarios(spec, tx).map((s) => simulateCall(spec, s.candidate));
  process.stdout.write(`${renderReport(results)}\n`);
}

async function cmdRecord(rest: readonly string[]): Promise<void> {
  const positional = rest.filter((a) => !a.startsWith('--'));
  const hash = positional[0];
  if (hash === undefined) {
    throw new Error('record requires a transaction hash: npm run record -- <txHash>');
  }
  const flags = parseFlags(rest);
  const network = parseNetwork(flags.get('network'));
  const rpcUrl = flags.get('rpc-url');
  const tx = await recordFromHash(hash, rpcUrl !== undefined ? { network, rpcUrl } : { network });
  process.stdout.write(`${recordedTxToJson(tx)}\n`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'demo':
      runDemo();
      return;
    case 'synth':
      cmdSynth(parseSynthConfig(parseFlags(rest)));
      return;
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
