/**
 * Loads the baked-in {@link RecordedTx} fixture.
 *
 * The fixture is a deterministic, offline stand-in for a real recorded
 * transaction (a Blend emissions claim followed by a Soroswap swap into USDC).
 * It drives `npm run demo` and the test suite so neither needs network access.
 *
 * The on-disk JSON stores token amounts as decimal strings (JSON has no bigint);
 * this loader validates the document defensively and reconstructs the strongly
 * typed `RecordedTx`, including `bigint` flow amounts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  AssetFlow,
  CallArg,
  FlowDirection,
  Network,
  RecordedTx,
  ScopedCall,
  TokenRef,
} from '../types.js';

/** Path to the committed fixture, resolved relative to this module. */
const FIXTURE_URL = new URL('../../fixtures/recorded-tx.json', import.meta.url);

/** Raised when the fixture document is malformed. */
export class FixtureError extends Error {
  override readonly name = 'FixtureError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new FixtureError(`expected string at ${path}, got ${typeof value}`);
  }
  return value;
}

function requireNetwork(value: unknown, path: string): Network {
  const s = requireString(value, path);
  if (s !== 'testnet' && s !== 'mainnet' && s !== 'futurenet') {
    throw new FixtureError(`unknown network "${s}" at ${path}`);
  }
  return s;
}

/** Parse a decimal-string amount into a non-negative bigint. */
function requireAmount(value: unknown, path: string): bigint {
  const s = requireString(value, path);
  if (!/^\d+$/.test(s)) {
    throw new FixtureError(`amount at ${path} must be a non-negative integer string, got "${s}"`);
  }
  return BigInt(s);
}

function requireTokenRef(value: unknown, path: string): TokenRef {
  if (!isRecord(value)) {
    throw new FixtureError(`expected token object at ${path}`);
  }
  const decimals = value['decimals'];
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw new FixtureError(`expected non-negative integer decimals at ${path}.decimals`);
  }
  return {
    contractId: requireString(value['contractId'], `${path}.contractId`),
    symbol: requireString(value['symbol'], `${path}.symbol`),
    decimals,
    // Fixture tokens are treated as resolved metadata unless explicitly flagged.
    resolved: value['resolved'] === false ? false : true,
  };
}

/**
 * Coerce a JSON value into a {@link CallArg}. JSON's value set is already a
 * subset of CallArg (string/number/boolean/null/array/object), so this is a
 * structural pass-through that rejects nothing — argument decoding fidelity is
 * the live adapter's concern; the fixture is authored in native form.
 */
function asCallArg(value: unknown): CallArg {
  if (Array.isArray(value)) {
    return value.map(asCallArg);
  }
  if (isRecord(value)) {
    const out: Record<string, CallArg> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = asCallArg(v);
    }
    return out;
  }
  // string | number | boolean | null all satisfy CallArg directly.
  return value as CallArg;
}

function requireCall(value: unknown, path: string): ScopedCall {
  if (!isRecord(value)) {
    throw new FixtureError(`expected call object at ${path}`);
  }
  const args = value['args'];
  if (!Array.isArray(args)) {
    throw new FixtureError(`expected args array at ${path}.args`);
  }
  return {
    contract: requireString(value['contract'], `${path}.contract`),
    fnName: requireString(value['fnName'], `${path}.fnName`),
    args: args.map(asCallArg),
  };
}

function requireFlow(value: unknown, path: string): AssetFlow {
  if (!isRecord(value)) {
    throw new FixtureError(`expected flow object at ${path}`);
  }
  const direction = value['direction'];
  if (direction !== 'in' && direction !== 'out') {
    throw new FixtureError(`expected direction "in"|"out" at ${path}.direction`);
  }
  return {
    asset: requireTokenRef(value['asset'], `${path}.asset`),
    direction: direction as FlowDirection,
    amount: requireAmount(value['amount'], `${path}.amount`),
  };
}

/**
 * Parse a fixture document (already JSON-parsed) into a {@link RecordedTx}.
 * Exposed separately from disk I/O so tests can exercise validation directly.
 */
export function parseRecordedTx(doc: unknown): RecordedTx {
  if (!isRecord(doc)) {
    throw new FixtureError('fixture root must be an object');
  }
  const calls = doc['calls'];
  const flows = doc['flows'];
  if (!Array.isArray(calls)) {
    throw new FixtureError('expected calls array at .calls');
  }
  if (!Array.isArray(flows)) {
    throw new FixtureError('expected flows array at .flows');
  }
  const ledger = doc['ledger'];
  const timestamp = doc['timestamp'];
  return {
    hash: requireString(doc['hash'], '.hash'),
    network: requireNetwork(doc['network'], '.network'),
    source: 'fixture',
    ledger: typeof ledger === 'number' ? ledger : null,
    timestamp: typeof timestamp === 'number' ? timestamp : null,
    calls: calls.map((c, i) => requireCall(c, `.calls[${i}]`)),
    flows: flows.map((f, i) => requireFlow(f, `.flows[${i}]`)),
  };
}

/** Load and parse the committed fixture from disk. */
export function loadFixture(): RecordedTx {
  let raw: string;
  try {
    raw = readFileSync(FIXTURE_URL, 'utf8');
  } catch (cause) {
    throw new FixtureError(
      `could not read fixture at ${fileURLToPath(FIXTURE_URL)}: ${(cause as Error).message}`,
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (cause) {
    throw new FixtureError(`fixture is not valid JSON: ${(cause as Error).message}`);
  }
  return parseRecordedTx(doc);
}
