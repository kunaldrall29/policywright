/**
 * Loads a saved recorder output (`npm run record` writes a serialised
 * {@link RecordedTx} as JSON) back into the typed shape, so the synthesizer
 * can run on a real recorded sequence without touching the network.
 *
 * The recorder serialises bigints as decimal strings and byte arguments as
 * `hex:<...>` strings (see cli.ts `recordedTxToJson`); call arguments are kept
 * verbatim here — flow amounts are the only values revived to bigint, because
 * they are the only ones the synthesizer does arithmetic on.
 */

import { readFileSync } from 'node:fs';
import type {
  AssetFlow,
  CallArg,
  InvocationNode,
  Network,
  RecordedTx,
  RecordedTxSource,
  ScopedCall,
  TokenRef,
} from '../types.js';
import { badInput } from './errors.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw badInput(`expected string at ${path}, got ${typeof value}`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requireString(value, path);
}

function optionalInteger(value: unknown, path: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw badInput(`expected integer at ${path}, got ${typeof value}`);
  }
  return value;
}

function requireNetwork(value: unknown, path: string): Network {
  const s = requireString(value, path);
  if (s !== 'testnet' && s !== 'mainnet' && s !== 'futurenet') {
    throw badInput(`unknown network "${s}" at ${path}`);
  }
  return s;
}

function requireSource(value: unknown, path: string): RecordedTxSource {
  const s = requireString(value, path);
  if (s !== 'fixture' && s !== 'rpc' && s !== 'simulation') {
    throw badInput(`unknown source "${s}" at ${path}`);
  }
  return s;
}

/** JSON values are a structural subset of CallArg; pass them through. */
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
  return value as CallArg;
}

function requireArgs(value: unknown, path: string): CallArg[] {
  if (!Array.isArray(value)) {
    throw badInput(`expected args array at ${path}`);
  }
  return value.map(asCallArg);
}

function requireInvocation(value: unknown, path: string): InvocationNode {
  if (!isRecord(value)) {
    throw badInput(`expected invocation object at ${path}`);
  }
  const subs = value['subInvocations'];
  if (!Array.isArray(subs)) {
    throw badInput(`expected subInvocations array at ${path}.subInvocations`);
  }
  return {
    contract: requireString(value['contract'], `${path}.contract`),
    fnName: requireString(value['fnName'], `${path}.fnName`),
    args: requireArgs(value['args'], `${path}.args`),
    subInvocations: subs.map((s, i) => requireInvocation(s, `${path}.subInvocations[${i}]`)),
  };
}

function requireCall(value: unknown, path: string): ScopedCall {
  if (!isRecord(value)) {
    throw badInput(`expected call object at ${path}`);
  }
  const authorizations = value['authorizations'];
  if (!Array.isArray(authorizations)) {
    throw badInput(`expected authorizations array at ${path}.authorizations`);
  }
  return {
    contract: requireString(value['contract'], `${path}.contract`),
    fnName: requireString(value['fnName'], `${path}.fnName`),
    args: requireArgs(value['args'], `${path}.args`),
    sourceHash: optionalString(value['sourceHash'], `${path}.sourceHash`),
    authorizations: authorizations.map((a, i) =>
      requireInvocation(a, `${path}.authorizations[${i}]`),
    ),
  };
}

function requireTokenRef(value: unknown, path: string): TokenRef {
  if (!isRecord(value)) {
    throw badInput(`expected token object at ${path}`);
  }
  const decimals = value['decimals'];
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw badInput(`expected non-negative integer decimals at ${path}.decimals`);
  }
  if (typeof value['resolved'] !== 'boolean') {
    throw badInput(`expected boolean resolved at ${path}.resolved`);
  }
  return {
    contractId: requireString(value['contractId'], `${path}.contractId`),
    symbol: requireString(value['symbol'], `${path}.symbol`),
    decimals,
    resolved: value['resolved'],
  };
}

function requireFlow(value: unknown, path: string): AssetFlow {
  if (!isRecord(value)) {
    throw badInput(`expected flow object at ${path}`);
  }
  const direction = value['direction'];
  if (direction !== 'in' && direction !== 'out') {
    throw badInput(`expected direction "in"|"out" at ${path}.direction`);
  }
  const amount = requireString(value['amount'], `${path}.amount`);
  if (!/^\d+$/.test(amount)) {
    throw badInput(`amount at ${path}.amount must be a non-negative integer string`);
  }
  return {
    asset: requireTokenRef(value['asset'], `${path}.asset`),
    direction,
    amount: BigInt(amount),
  };
}

/** Parse a saved recorder output (already JSON-parsed) into a {@link RecordedTx}. */
export function parseRecordedJson(doc: unknown): RecordedTx {
  if (!isRecord(doc)) {
    throw badInput('recorded-tx document root must be an object');
  }
  const calls = doc['calls'];
  const flows = doc['flows'];
  const warnings = doc['warnings'];
  if (!Array.isArray(calls)) {
    throw badInput('expected calls array at .calls');
  }
  if (!Array.isArray(flows)) {
    throw badInput('expected flows array at .flows');
  }
  if (!Array.isArray(warnings)) {
    throw badInput('expected warnings array at .warnings');
  }
  return {
    hash: optionalString(doc['hash'], '.hash'),
    network: requireNetwork(doc['network'], '.network'),
    source: requireSource(doc['source'], '.source'),
    ledger: optionalInteger(doc['ledger'], '.ledger'),
    timestamp: optionalInteger(doc['timestamp'], '.timestamp'),
    subject: optionalString(doc['subject'], '.subject'),
    calls: calls.map((c, i) => requireCall(c, `.calls[${i}]`)),
    flows: flows.map((f, i) => requireFlow(f, `.flows[${i}]`)),
    warnings: warnings.map((w, i) => requireString(w, `.warnings[${i}]`)),
  };
}

/** Load and parse a saved recorder output from disk. */
export function loadRecordedTx(path: string): RecordedTx {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw badInput(`could not read recorded tx at ${path}: ${(cause as Error).message}`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (cause) {
    throw badInput(`recorded tx at ${path} is not valid JSON: ${(cause as Error).message}`);
  }
  return parseRecordedJson(doc);
}
