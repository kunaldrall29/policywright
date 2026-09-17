/**
 * Map an emitted `context-rule.json` policy binding's `installParams` into the
 * stellar-cli / Soroban `Val` JSON encoding expected by `add_context_rule`'s
 * `Map<Address, Val>`.
 *
 * Values are taken **verbatim** from the emitter — only the wire encoding
 * (ScVal map with alphabetically ordered symbol keys) is applied. Hand-crafted
 * param values are forbidden; if encoding fails, fix the emitter shape.
 */

import { badInput } from '../sources/errors.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One ScVal map entry `{ key: {symbol}, val: {typed} }`. */
export interface ScValMapEntry {
  readonly key: { readonly symbol: string };
  readonly val: Readonly<Record<string, unknown>>;
}

/** Build a typed ScVal map with keys sorted alphabetically (XDR canonical). */
export function scValSymbolMap(entries: Readonly<Record<string, Record<string, unknown>>>): {
  readonly map: readonly ScValMapEntry[];
} {
  const keys = Object.keys(entries).sort((a, b) => a.localeCompare(b));
  return {
    map: keys.map((symbol) => ({
      key: { symbol },
      val: entries[symbol]!,
    })),
  };
}

/**
 * Encode FrequencyLimitParams / SpendingLimitAccountParams installParams as a
 * `Val` suitable for stellar-cli `--policies`.
 */
export function encodeInstallParamsVal(
  policy: string,
  installParams: Readonly<Record<string, unknown>>,
): { readonly map: readonly ScValMapEntry[] } {
  if (/frequency/i.test(policy) || policy === 'custom:FrequencyLimitPolicy') {
    const windowSecs = installParams['window_secs'];
    const maxCalls = installParams['max_calls'];
    if (typeof windowSecs !== 'number' && typeof windowSecs !== 'string') {
      throw badInput(`FrequencyLimitPolicy installParams.window_secs missing/invalid`);
    }
    if (typeof maxCalls !== 'number' && typeof maxCalls !== 'string') {
      throw badInput(`FrequencyLimitPolicy installParams.max_calls missing/invalid`);
    }
    const windowNum = typeof windowSecs === 'number' ? windowSecs : Number(windowSecs);
    const maxNum = typeof maxCalls === 'number' ? maxCalls : Number(maxCalls);
    if (!Number.isFinite(windowNum) || !Number.isFinite(maxNum)) {
      throw badInput('FrequencyLimitPolicy installParams must be finite numbers');
    }
    return scValSymbolMap({
      max_calls: { u32: maxNum },
      window_secs: { u64: windowNum },
    });
  }
  if (/spending/i.test(policy) || policy === 'stock:spending_limit') {
    const spendingLimit = installParams['spending_limit'];
    const periodLedgers = installParams['period_ledgers'];
    if (spendingLimit === undefined || periodLedgers === undefined) {
      throw badInput('spending_limit installParams require spending_limit + period_ledgers');
    }
    const periodNum = typeof periodLedgers === 'number' ? periodLedgers : Number(periodLedgers);
    if (!Number.isFinite(periodNum)) {
      throw badInput('spending_limit installParams.period_ledgers must be a number');
    }
    let spendingStr: string;
    if (typeof spendingLimit === 'string') {
      spendingStr = spendingLimit;
    } else if (typeof spendingLimit === 'number' || typeof spendingLimit === 'bigint') {
      spendingStr = spendingLimit.toString();
    } else {
      throw badInput('spending_limit installParams.spending_limit must be string|number');
    }
    return scValSymbolMap({
      period_ledgers: { u32: periodNum },
      spending_limit: { i128: spendingStr },
    });
  }
  throw badInput(`cannot encode installParams for unknown policy kind "${policy}"`);
}

export interface BuildPoliciesMapInput {
  readonly policy: string;
  readonly address: string;
  readonly installParams: Readonly<Record<string, unknown>>;
}

/**
 * Build the `--policies` JSON object: `{ "<policy C…>": <ScVal map Val>, … }`.
 * Emitter `installParams` values are preserved exactly.
 */
export function buildPoliciesMapArg(
  bindings: readonly BuildPoliciesMapInput[],
): Record<string, { readonly map: readonly ScValMapEntry[] }> {
  const out: Record<string, { readonly map: readonly ScValMapEntry[] }> = {};
  for (const b of bindings) {
    if (typeof b.address !== 'string' || !b.address.startsWith('C')) {
      throw badInput(`policy address must be a C… contract id, got ${JSON.stringify(b.address)}`);
    }
    if (!isRecord(b.installParams)) {
      throw badInput('installParams must be an object');
    }
    out[b.address] = encodeInstallParamsVal(b.policy, b.installParams);
  }
  return out;
}

/** stellar-cli `--context_type` for a CallContract rule. */
export function buildContextTypeArg(contract: string): string {
  if (!contract.startsWith('C')) {
    throw badInput(`CallContract address must be C…, got ${contract}`);
  }
  return JSON.stringify({ CallContract: contract });
}

/** stellar-cli `--name` (JSON string literal, ≤20 bytes on-chain). */
export function buildNameArg(name: string): string {
  if (name.length === 0) {
    throw badInput('context rule name must be non-empty');
  }
  if (new TextEncoder().encode(name).length > 20) {
    throw badInput(`context rule name exceeds 20 bytes: "${name}"`);
  }
  return JSON.stringify(name);
}

/** stellar-cli `--signers` with a single Delegated G-address. */
export function buildDelegatedSignersArg(publicKey: string): string {
  if (!publicKey.startsWith('G')) {
    throw badInput(`Delegated signer must be a G… address, got ${publicKey}`);
  }
  return JSON.stringify([{ Delegated: publicKey }]);
}

/** Full `add_context_rule` argv (after `--`) for stellar contract invoke. */
export interface AddContextRuleArgs {
  readonly contextType: string;
  readonly name: string;
  readonly validUntil: number;
  readonly signers: string;
  readonly policies: string;
  /** Structured form for tests / logging (same values as CLI strings). */
  readonly decoded: {
    readonly contextType: { readonly CallContract: string };
    readonly name: string;
    readonly validUntil: number;
    readonly signers: readonly { readonly Delegated: string }[];
    readonly policies: Record<string, { readonly map: readonly ScValMapEntry[] }>;
  };
}

export function buildAddContextRuleArgs(input: {
  readonly contract: string;
  readonly name: string;
  readonly validUntilLedger: number;
  readonly signerPublicKey: string;
  readonly policies: readonly BuildPoliciesMapInput[];
}): AddContextRuleArgs {
  const policiesObj = buildPoliciesMapArg(input.policies);
  return {
    contextType: buildContextTypeArg(input.contract),
    name: buildNameArg(input.name),
    validUntil: input.validUntilLedger,
    signers: buildDelegatedSignersArg(input.signerPublicKey),
    policies: JSON.stringify(policiesObj),
    decoded: {
      contextType: { CallContract: input.contract },
      name: input.name,
      validUntil: input.validUntilLedger,
      signers: [{ Delegated: input.signerPublicKey }],
      policies: policiesObj,
    },
  };
}
