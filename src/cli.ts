/**
 * policywright command-line entry point.
 *
 *   demo                 run the end-to-end demo and self-check (see demo.ts)
 *   synth                synthesize a spec from the baked-in fixture and print it
 *   simulate             run the dry-run scenarios against the fixture's spec
 *   record <hash>        fetch a live transaction by hash and print the recording
 *
 * Synthesis configuration flags are added in a later change; today synth and
 * simulate use the documented defaults.
 */

import { emit } from './emitter.js';
import { runDemo } from './demo.js';
import { loadFixture } from './sources/fixture.js';
import { recordFromHash } from './sources/rpc.js';
import { buildScenarios, renderReport, simulateCall } from './simulate.js';
import { synthesize } from './synthesizer.js';
import { DEFAULT_SYNTH_CONFIG, type Network, type RecordedTx } from './types.js';

const USAGE = `policywright — synthesize a least-privilege smart-account authorization

Usage:
  npm run demo                          end-to-end demo + dry-run self-check
  npm run cli -- synth                  synthesize from the baked-in fixture
  npm run cli -- simulate               dry-run scenarios against the spec
  npm run record -- <txHash> [--network testnet|mainnet|futurenet]

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
  return JSON.stringify(tx, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
}

function cmdSynth(): void {
  const tx = loadFixture();
  const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? 0);
  const artifacts = emit(tx, spec);
  process.stdout.write(artifacts.summary);
  process.stdout.write('\n--- spec.json ---\n');
  process.stdout.write(`${artifacts.specJson}\n`);
}

function cmdSimulate(): void {
  const tx = loadFixture();
  const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? 0);
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
  const tx = await recordFromHash(
    hash,
    rpcUrl !== undefined ? { network, rpcUrl } : { network },
  );
  process.stdout.write(`${recordedTxToJson(tx)}\n`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'demo':
      runDemo();
      return;
    case 'synth':
      cmdSynth();
      return;
    case 'simulate':
      cmdSimulate();
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
