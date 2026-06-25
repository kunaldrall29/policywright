/**
 * Synthesizer: turn a {@link RecordedTx} into a least-privilege
 * {@link SmartAccountSpec} — an OpenZeppelin smart-account context rule plus the
 * minimal set of policies that permits exactly the observed flow.
 *
 * The design mirrors OZ's Stellar smart-account model: a context rule fixes the
 * scope (which contract/function calls are authorised) and a small set of
 * policies bound to it enforce quantitative limits (spend caps, call frequency,
 * and — when enabled — argument constraints). OZ caps a rule at
 * {@link MAX_POLICIES} policies, which we surface as a warning.
 */

import {
  MAX_POLICIES,
  type ArgumentConstraintPolicy,
  type CallArg,
  type ContextRule,
  type FrequencyLimitPolicy,
  type PolicySpec,
  type RecordedTx,
  type ScopedCall,
  type SmartAccountSpec,
  type SpendingLimitPolicy,
  type SynthConfig,
  type TokenRef,
} from './types.js';

/** OZ smart accounts cap a context rule name at 20 characters. */
const MAX_NAME_SIZE = 20;

/** Raised when synthesis input or configuration is invalid. */
export class SynthError extends Error {
  override readonly name = 'SynthError';
}

/** Validate a {@link SynthConfig}, throwing {@link SynthError} on bad values. */
export function validateConfig(config: SynthConfig): void {
  const positiveInts: [keyof SynthConfig, number][] = [
    ['lifetimeSecs', config.lifetimeSecs],
    ['spendWindowSecs', config.spendWindowSecs],
    ['frequencyWindowSecs', config.frequencyWindowSecs],
    ['frequencyMaxCalls', config.frequencyMaxCalls],
  ];
  for (const [name, value] of positiveInts) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new SynthError(`${name} must be a positive integer, got ${value}`);
    }
  }
  if (!Number.isFinite(config.capMultiplier) || config.capMultiplier <= 0) {
    throw new SynthError(`capMultiplier must be a positive number, got ${config.capMultiplier}`);
  }
}

/**
 * Multiply a bigint amount by a fractional multiplier, rounding up so the cap is
 * never below the observed outflow. Uses a fixed 1e6 denominator for precision.
 */
function scaleCeil(amount: bigint, multiplier: number): bigint {
  const DENOM = 1_000_000n;
  const numerator = BigInt(Math.round(multiplier * 1_000_000));
  const product = amount * numerator;
  return (product + DENOM - 1n) / DENOM;
}

/** Distinct (contract, fn) pairs, in first-seen order, for the rule scope. */
function deriveScope(tx: RecordedTx): ContextRule['scopedCalls'] {
  const seen = new Set<string>();
  const scoped: { contract: string; fnName: string }[] = [];
  for (const call of tx.calls) {
    const key = `${call.contract}::${call.fnName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    scoped.push({ contract: call.contract, fnName: call.fnName });
  }
  return scoped;
}

/** A short, deterministic, <=20-char rule name derived from the called fns. */
function deriveRuleName(scopedCalls: ContextRule['scopedCalls']): string {
  const verbs = [...new Set(scopedCalls.map((c) => c.fnName.split('_')[0] ?? c.fnName))];
  const name = `pw:${verbs.join('+')}`;
  return name.length <= MAX_NAME_SIZE ? name : name.slice(0, MAX_NAME_SIZE);
}

/**
 * Spend caps from GROSS outflow per asset.
 *
 * The cap is bound to gross out, not net: an asset that is received and then
 * sent within the same flow (e.g. BLND claimed then swapped) nets to ~zero, but
 * the account still moved the gross amount out, so that is what must be capped.
 * Assets that only ever flow in (e.g. USDC received from the swap) move nothing
 * out and therefore get no spend cap — the minimal-permission case.
 */
function deriveSpendingPolicies(tx: RecordedTx, config: SynthConfig): SpendingLimitPolicy[] {
  // Sum gross outflow per asset, keeping the first TokenRef seen for the asset.
  const grossOut = new Map<string, bigint>();
  const assetRef = new Map<string, TokenRef>();
  for (const flow of tx.flows) {
    const id = flow.asset.contractId;
    if (!assetRef.has(id)) {
      assetRef.set(id, flow.asset);
    }
    if (flow.direction === 'out') {
      grossOut.set(id, (grossOut.get(id) ?? 0n) + flow.amount);
    }
  }

  const policies: SpendingLimitPolicy[] = [];
  for (const [id, observedGrossOut] of grossOut) {
    if (observedGrossOut <= 0n) {
      continue; // inflow-only assets need no cap
    }
    const asset = assetRef.get(id);
    if (asset === undefined) {
      // Unreachable: every grossOut key was populated from a flow with a ref.
      throw new SynthError(`internal: missing token reference for ${id}`);
    }
    policies.push({
      kind: 'spending-limit',
      asset,
      cap: scaleCeil(observedGrossOut, config.capMultiplier),
      windowSecs: config.spendWindowSecs,
      observedGrossOut,
    });
  }
  return policies;
}

/** True when an argument is an array whose every element is a string (addresses). */
function isAddressVec(arg: CallArg): arg is readonly string[] {
  return Array.isArray(arg) && arg.length > 0 && arg.every((e) => typeof e === 'string');
}

/** The index + values of a swap call's `path` argument, if present. */
function findPathArg(call: ScopedCall): { argIndex: number; tokens: readonly string[] } | null {
  // We only constrain swap routes; "start with swap path" per the design.
  if (!call.fnName.includes('swap')) {
    return null;
  }
  const argIndex = call.args.findIndex(isAddressVec);
  if (argIndex === -1) {
    return null;
  }
  return { argIndex, tokens: call.args[argIndex] as readonly string[] };
}

/**
 * Derive argument-constraint observations from the recording. Currently this
 * pins the set of token addresses a swap `path` may touch to those observed, so
 * a candidate routing through an unobserved token can be flagged or denied.
 *
 * These are always returned (as observations); the caller decides whether to
 * enforce them based on {@link SynthConfig.constrainArguments}.
 */
function deriveArgumentScopes(tx: RecordedTx): ArgumentConstraintPolicy[] {
  const byKey = new Map<string, { policy: ArgumentConstraintPolicy; tokens: Set<string> }>();
  for (const call of tx.calls) {
    const path = findPathArg(call);
    if (path === null) {
      continue;
    }
    const key = `${call.contract}::${call.fnName}::${path.argIndex}`;
    let entry = byKey.get(key);
    if (entry === undefined) {
      entry = {
        tokens: new Set<string>(),
        policy: {
          kind: 'argument-constraint',
          contract: call.contract,
          fnName: call.fnName,
          argIndex: path.argIndex,
          argName: 'path',
          allowedTokens: [],
        },
      };
      byKey.set(key, entry);
    }
    for (const token of path.tokens) {
      entry.tokens.add(token);
    }
  }
  return [...byKey.values()].map((e) => ({ ...e.policy, allowedTokens: [...e.tokens] }));
}

/** The frequency-limit policy is always emitted from config. */
function deriveFrequencyPolicy(config: SynthConfig): FrequencyLimitPolicy {
  return {
    kind: 'frequency-limit',
    windowSecs: config.frequencyWindowSecs,
    maxCalls: config.frequencyMaxCalls,
  };
}

/**
 * Synthesize a least-privilege smart-account spec for a recorded transaction.
 *
 * @param tx     the normalised recording to authorise
 * @param config synthesis knobs (validated here)
 * @param now    Unix seconds used as the base for the rule lifetime
 */
export function synthesize(tx: RecordedTx, config: SynthConfig, now: number): SmartAccountSpec {
  validateConfig(config);
  if (!Number.isInteger(now) || now < 0) {
    throw new SynthError(`now must be a non-negative Unix timestamp, got ${now}`);
  }
  if (tx.calls.length === 0) {
    throw new SynthError('recorded transaction has no contract calls to authorise');
  }

  const scopedCalls = deriveScope(tx);
  const contextRule: ContextRule = {
    name: deriveRuleName(scopedCalls),
    scopedCalls,
    validUntil: now + config.lifetimeSecs,
  };

  const argumentScopes = deriveArgumentScopes(tx);
  const policies: PolicySpec[] = [
    ...deriveSpendingPolicies(tx, config),
    deriveFrequencyPolicy(config),
    // Argument constraints are enforced (count as policies) only when enabled.
    ...(config.constrainArguments ? argumentScopes : []),
  ];

  const warnings: string[] = [];
  if (policies.length > MAX_POLICIES) {
    warnings.push(
      `synthesised ${policies.length} policies, but OpenZeppelin smart accounts allow at most ${MAX_POLICIES} per context rule; split the flow across multiple rules or relax constraints`,
    );
  }

  return { contextRule, policies, argumentScopes, warnings, config };
}
