/**
 * Shared helpers for testnet-only CLI commands that shell out to stellar-cli
 * with the gitignored `.env` identity (never printed).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { badInput, networkError } from './sources/errors.js';

export const DEFAULT_FREQUENCY_POLICY = 'CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP';

export const TESTNET_EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';
export const TESTNET_EXPLORER_CONTRACT = 'https://stellar.expert/explorer/testnet/contract/';

/** Load `.env` key/value pairs without printing secrets. */
export function loadDotEnv(cwd: string = process.cwd()): Record<string, string> {
  const path = resolve(cwd, '.env');
  if (!existsSync(path)) {
    throw badInput('.env not found — create it with STELLAR_SECRET_KEY (testnet only)');
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

export interface TestnetIdentity {
  readonly secretKey: string;
  readonly publicKey: string;
  readonly network: 'testnet';
}

/** Resolve the funded testnet identity; refuses any non-testnet network. */
export function requireTestnetIdentity(
  networkFlag: string | undefined,
  cwd?: string,
): TestnetIdentity {
  const env = loadDotEnv(cwd);
  const network = networkFlag ?? env['STELLAR_NETWORK'] ?? 'testnet';
  if (network !== 'testnet') {
    throw badInput(`account:create / install are TESTNET ONLY (refusing network=${network})`);
  }
  const secretKey = env['STELLAR_SECRET_KEY'];
  const publicKey = env['STELLAR_PUBLIC_KEY'];
  if (secretKey === undefined || secretKey.length === 0) {
    throw badInput('STELLAR_SECRET_KEY missing from .env');
  }
  if (publicKey === undefined || publicKey.length === 0) {
    throw badInput('STELLAR_PUBLIC_KEY missing from .env');
  }
  return { secretKey, publicKey, network: 'testnet' };
}

export interface StellarCliResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  /** Last 64-hex tx hash scraped from stellar.expert links on stderr, if any. */
  readonly txHash: string | null;
  /** Last C… address scraped from stdout/stderr, if any. */
  readonly contractId: string | null;
}

const TX_RE = /explorer\/testnet\/tx\/([0-9a-f]{64})/gi;
const CONTRACT_RE = /\b(C[A-Z0-9]{55})\b/g;

export function scrapeTxHash(text: string): string | null {
  let last: string | null = null;
  for (const m of text.matchAll(TX_RE)) {
    last = m[1] ?? null;
  }
  return last;
}

export function scrapeContractId(text: string): string | null {
  let last: string | null = null;
  for (const m of text.matchAll(CONTRACT_RE)) {
    last = m[1] ?? null;
  }
  return last;
}

/**
 * Run `stellar` with STELLAR_ACCOUNT set to the secret (stellar-cli accepts a
 * raw secret). Never logs the secret. Clears STELLAR_RPC_URL so `--network`
 * wins (FACTS.md §1.6).
 */
export function runStellarCli(
  args: readonly string[],
  secretKey: string,
  options?: { readonly cwd?: string; readonly env?: Record<string, string> },
): StellarCliResult {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    PATH: `${process.env['HOME']}/.local/bin:${process.env['HOME']}/.cargo/bin:${process.env['PATH'] ?? ''}`,
    STELLAR_ACCOUNT: secretKey,
    ...(options?.env ?? {}),
  };
  delete env['STELLAR_RPC_URL'];
  delete env['STELLAR_NETWORK'];
  delete env['STELLAR_NETWORK_PASSPHRASE'];
  // Avoid accidental secret leakage via child argv dump in errors — we never
  // put the secret in args, only in STELLAR_ACCOUNT.
  const result = spawnSync('stellar', args, {
    cwd: options?.cwd ?? process.cwd(),
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    throw networkError(`stellar CLI failed to start: ${result.error.message}`);
  }
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  return {
    ok: result.status === 0,
    stdout,
    stderr,
    status: result.status,
    txHash: scrapeTxHash(combined),
    contractId: scrapeContractId(stdout) ?? scrapeContractId(stderr),
  };
}
