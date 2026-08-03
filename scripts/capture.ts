/**
 * capture.ts — raw-preservation capture of on-chain transactions.
 *
 * Given one or more transaction hashes and a network, fetch each via Soroban
 * RPC `getTransaction` and dump the COMPLETE raw JSON-RPC result — envelope
 * XDR, result XDR, result meta XDR, events, status, ledger/time, everything
 * the node returns — as pretty JSON into `examples/live/<hash>.json`.
 *
 * NO decoding happens here, deliberately: the captured file is ground truth
 * for later analysis, and any decoding bug in our own code must not be able
 * to contaminate it. Analysis lives elsewhere (docs/FACTS.md records what the
 * raw data was found to contain, with dates).
 *
 * Usage:
 *   npx tsx scripts/capture.ts <txHash> [<txHash> ...] [--network testnet|mainnet|futurenet] [--rpc-url <url>]
 *
 * Defaults: --network testnet, public SDF RPC endpoint for that network.
 * The RPC URL may also come from STELLAR_RPC_URL in the environment or in a
 * repo-root `.env` (gitignored); a --rpc-url flag wins over both. No secret
 * keys are needed — `getTransaction` is public read-only data — and nothing
 * read from `.env` is ever printed.
 */

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

const OUT_DIR = path.join(process.cwd(), 'examples', 'live');

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

interface Args {
  hashes: string[];
  network: Network;
  rpcUrl: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const hashes: string[] = [];
  let network = 'testnet';
  let rpcUrl: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--network') network = argv[++i] ?? '';
    else if (a === '--rpc-url') rpcUrl = argv[++i];
    else if (a.startsWith('--')) fail(`unknown flag: ${a}`);
    else hashes.push(a.toLowerCase());
  }
  if (hashes.length === 0) {
    fail(
      'usage: npx tsx scripts/capture.ts <txHash> [<txHash> ...] [--network testnet|mainnet|futurenet] [--rpc-url <url>]',
    );
  }
  if (!isNetwork(network)) fail(`unknown network "${network}" (testnet|mainnet|futurenet)`);
  for (const h of hashes) {
    if (!/^[0-9a-f]{64}$/.test(h)) {
      fail(`"${h}" is not a transaction hash (expected 64 hex chars = 32 bytes)`);
    }
  }
  return { hashes, network, rpcUrl };
}

function fail(msg: string): never {
  console.error(`capture: ${msg}`);
  process.exit(1);
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
  const { hashes, network, rpcUrl: flagUrl } = parseArgs(process.argv.slice(2));
  const dotenv = await loadDotEnv();
  const rpcUrl =
    flagUrl ?? process.env.STELLAR_RPC_URL ?? dotenv.STELLAR_RPC_URL ?? RPC_URLS[network];

  await mkdir(OUT_DIR, { recursive: true });

  // Context captured once per run: node identity/versions and ledger head, so
  // every capture records exactly which node and protocol produced it.
  const [health, versionInfo, latestLedger] = await Promise.all([
    rpcCall(rpcUrl, 'getHealth', {}),
    rpcCall(rpcUrl, 'getVersionInfo', {}),
    rpcCall(rpcUrl, 'getLatestLedger', {}),
  ]);

  let failures = 0;
  for (const hash of hashes) {
    const response = await rpcCall(rpcUrl, 'getTransaction', {
      hash,
      // Ask for base64 XDR explicitly; raw preservation wants the encoded
      // envelope/result/meta exactly as the node emits them.
      xdrFormat: 'base64',
    });

    const result = (response as { result?: { status?: string } }).result;
    const status = result?.status ?? 'RPC_ERROR';
    const outPath = path.join(OUT_DIR, `${hash}.json`);

    const capture = {
      capturedAt: new Date().toISOString(),
      network,
      rpcUrl,
      method: 'getTransaction',
      request: { hash, xdrFormat: 'base64' },
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
    console.log(`${hash}  status=${status}  -> ${path.relative(process.cwd(), outPath)}`);
    if (status !== 'SUCCESS') {
      failures++;
      if (status === 'NOT_FOUND') {
        console.error(
          `  NOT_FOUND: the node has no record of this hash (wrong network, or outside the node's retention window).`,
        );
      }
    }
  }
  process.exit(failures === 0 ? 0 : 2);
}

await main();
