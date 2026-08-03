/**
 * capture-simulation.ts — raw-preservation capture of a `simulateTransaction`
 * exchange, the simulated-path counterpart of capture.ts.
 *
 * Given a base64 transaction envelope (the transaction need not be signed —
 * simulation ignores signatures), POST it to Soroban RPC `simulateTransaction`
 * and dump the COMPLETE JSON-RPC exchange — request (with the envelope) and
 * verbatim response — plus node context, into a JSON file. NO decoding
 * happens here, deliberately (see capture.ts). The written file is exactly
 * the shape `npm run record -- --from-simulation <file>` ingests.
 *
 * Usage:
 *   npx tsx scripts/capture-simulation.ts <envelopeB64 | @file-with-envelopeB64>
 *       [--network testnet|mainnet|futurenet] [--rpc-url <url>] [--out <path>]
 *
 * Defaults: --network testnet, public SDF RPC endpoint,
 * --out examples/live/simulated-<sha256(envelope) first 12 hex>.json.
 * No secret keys are needed; nothing read from .env is ever printed.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RPC_URLS = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
  futurenet: 'https://rpc-futurenet.stellar.org',
} as const;

type Network = keyof typeof RPC_URLS;

function isNetwork(n: string): n is Network {
  return n in RPC_URLS;
}

/** Minimal .env loader (KEY=VALUE lines, # comments). No new dependencies. */
async function loadDotEnv(): Promise<Record<string, string>> {
  const file = path.join(process.cwd(), '.env');
  if (!existsSync(file)) return {};
  const vars: Record<string, string> = {};
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    const key = m?.[1];
    const value = m?.[2];
    if (key !== undefined && value !== undefined && !line.trimStart().startsWith('#')) {
      vars[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return vars;
}

function fail(msg: string): never {
  console.error(`capture-simulation: ${msg}`);
  process.exit(1);
}

interface Args {
  envelope: string;
  network: Network;
  rpcUrl: string | undefined;
  out: string | undefined;
}

async function parseArgs(argv: string[]): Promise<Args> {
  let envelopeArg: string | undefined;
  let network = 'testnet';
  let rpcUrl: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--network') network = argv[++i] ?? '';
    else if (a === '--rpc-url') rpcUrl = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a.startsWith('--')) fail(`unknown flag: ${a}`);
    else if (envelopeArg === undefined) envelopeArg = a;
    else fail('exactly one envelope argument expected');
  }
  if (envelopeArg === undefined) {
    fail(
      'usage: npx tsx scripts/capture-simulation.ts <envelopeB64 | @file> ' +
        '[--network testnet|mainnet|futurenet] [--rpc-url <url>] [--out <path>]',
    );
  }
  if (!isNetwork(network)) fail(`unknown network "${network}" (testnet|mainnet|futurenet)`);
  const envelope = envelopeArg.startsWith('@')
    ? (await readFile(envelopeArg.slice(1), 'utf8')).trim()
    : envelopeArg;
  if (!/^[A-Za-z0-9+/=]+$/.test(envelope)) {
    fail('envelope is not base64 (pass the XDR envelope base64, or @file containing it)');
  }
  return { envelope, network, rpcUrl, out };
}

/** One raw JSON-RPC call. Returns the full parsed response body, untouched. */
async function rpcCall(url: string, method: string, params: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) fail(`RPC HTTP ${res.status} from ${url}`);
  const body: unknown = await res.json();
  return body;
}

async function main(): Promise<void> {
  const { envelope, network, rpcUrl: flagUrl, out } = await parseArgs(process.argv.slice(2));
  const dotenv = await loadDotEnv();
  const rpcUrl =
    flagUrl ?? process.env.STELLAR_RPC_URL ?? dotenv.STELLAR_RPC_URL ?? RPC_URLS[network];

  const digest = createHash('sha256').update(envelope).digest('hex').slice(0, 12);
  const outPath = out ?? path.join(process.cwd(), 'examples', 'live', `simulated-${digest}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });

  const [health, versionInfo, latestLedger] = await Promise.all([
    rpcCall(rpcUrl, 'getHealth', {}),
    rpcCall(rpcUrl, 'getVersionInfo', {}),
    rpcCall(rpcUrl, 'getLatestLedger', {}),
  ]);

  const params = { transaction: envelope, xdrFormat: 'base64' };
  const response = await rpcCall(rpcUrl, 'simulateTransaction', params);
  const result = (response as { result?: { error?: string } }).result;

  const capture = {
    capturedAt: new Date().toISOString(),
    network,
    rpcUrl,
    method: 'simulateTransaction',
    request: { params },
    /** Full JSON-RPC response body, verbatim. No fields removed or renamed. */
    response,
    /** Node context at capture time, verbatim. */
    nodeContext: {
      getHealth: health,
      getVersionInfo: versionInfo,
      getLatestLedger: latestLedger,
    },
  };

  await writeFile(outPath, JSON.stringify(capture, null, 2) + '\n', 'utf8');
  const status = result === undefined ? 'RPC_ERROR' : result.error ? 'SIMULATION_ERROR' : 'OK';
  console.log(`simulateTransaction  status=${status}  -> ${path.relative(process.cwd(), outPath)}`);
  if (status !== 'OK') {
    if (result?.error) console.error(`  error: ${result.error}`);
    process.exit(2);
  }
}

await main();
