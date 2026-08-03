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
  ESTIMATED_SECS_PER_LEDGER,
  MAX_POLICIES,
  type ArgumentConstraintPolicy,
  type CallArg,
  type ContextRule,
  type CustomFrequencyLimitBinding,
  type FrequencyLimitPolicy,
  type InvocationNode,
  type OzContextRule,
  type OzPolicyBinding,
  type PolicySpec,
  type RecordedTx,
  type ScopedCall,
  type SmartAccountSpec,
  type SpendingLimitPolicy,
  type StockSpendingLimitBinding,
  type SynthConfig,
  type TokenRef,
} from './types.js';

/** OZ smart accounts cap a context rule name at 20 BYTES (`MAX_NAME_SIZE`). */
const MAX_NAME_SIZE = 20;

/** Citation for the stock spending-limit install shape (see docs/FACTS.md §2.4/2.5). */
const SPENDING_LIMIT_PARAMS_SOURCE =
  'OpenZeppelin/stellar-contracts@v0.7.2 packages/accounts/src/policies/spending_limit.rs:88-94 — SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 }; install guards :367-405 (CallContract-only, positive params, AlreadyInstalled)';

/** Citation for the generated custom policy's install shape. */
const FREQUENCY_PARAMS_SOURCE =
  'policywright-generated FrequencyLimitPolicy (contracts/frequency-limit-policy, emitted by src/rust-policy.ts) — FrequencyLimitParams { window_secs: u64, max_calls: u32 }';

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

/**
 * Truncate a string so its UTF-8 byte length is at most `maxBytes`, dropping
 * whole characters (OZ checks `String.len()`, which is bytes — FACTS §2.3).
 */
function truncateToBytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let out = value;
  while (out.length > 0 && encoder.encode(out).length > maxBytes) {
    out = out.slice(0, -1);
  }
  return out;
}

/** A short, deterministic, <=20-byte rule name derived from the called fns. */
function deriveRuleName(scopedCalls: ContextRule['scopedCalls']): string {
  const verbs = [...new Set(scopedCalls.map((c) => c.fnName.split('_')[0] ?? c.fnName))];
  return truncateToBytes(`pw:${verbs.join('+')}`, MAX_NAME_SIZE);
}

/** Convert a seconds-based window into ledgers, rounding up (never shorter). */
export function secsToLedgers(secs: number): number {
  return Math.ceil(secs / ESTIMATED_SECS_PER_LEDGER);
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
 * Token contracts on which the recording's subject authorized a DIRECT
 * `transfer` (SEP-41 `transfer(from, to, amount)` with `from == subject`),
 * anywhere in the authorization-entry trees. Every `require_auth` call is its
 * own `Context` at `__check_auth` (FACTS §2.5), so each such token needs its
 * own `CallContract` rule — which is exactly where the stock `spending_limit`
 * can meter the outflow.
 */
function collectSubjectTransferContracts(tx: RecordedTx): Set<string> {
  const found = new Set<string>();
  const subject = tx.subject;
  if (subject === null) {
    return found;
  }
  const visit = (node: InvocationNode): void => {
    if (node.fnName === 'transfer' && node.args[0] === subject) {
      found.add(node.contract);
    }
    for (const sub of node.subInvocations) {
      visit(sub);
    }
  };
  for (const call of tx.calls) {
    for (const root of call.authorizations) {
      visit(root);
    }
  }
  return found;
}

/** A unique <=20-byte rule name, disambiguated with a `~N` suffix on collision. */
function uniqueRuleName(base: string, used: Set<string>): string {
  let name = truncateToBytes(base, MAX_NAME_SIZE);
  for (let i = 2; used.has(name); i += 1) {
    const suffix = `~${i}`;
    name = truncateToBytes(base, MAX_NAME_SIZE - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

/** Short token label for rule names and notes. */
function assetLabel(asset: TokenRef): string {
  return asset.resolved ? asset.symbol : asset.contractId.slice(0, 8);
}

/**
 * Derive the installable OZ context rules and the composition-delta notes.
 *
 * One `CallContract` rule per called contract (rules cannot scope multiple
 * contracts or function names — RECONCILIATION row 13), plus one rule per
 * token the subject authorized a direct `transfer` on. Spend caps compose
 * onto the token rules as REAL stock `spending_limit` install params; caps
 * the stock policy cannot express are recorded as deltas instead of being
 * emitted in a shape the real contract would reject.
 */
function deriveOzContextRules(
  tx: RecordedTx,
  config: SynthConfig,
  spendingPolicies: readonly SpendingLimitPolicy[],
): { rules: OzContextRule[]; notes: string[] } {
  const notes: string[] = [];
  const lifetimeLedgers = secsToLedgers(config.lifetimeSecs);
  const validUntilLedger = tx.ledger !== null ? tx.ledger + lifetimeLedgers : null;

  const frequencyBinding: CustomFrequencyLimitBinding = {
    policy: 'custom:FrequencyLimitPolicy',
    address: null,
    installParams: {
      window_secs: config.frequencyWindowSecs,
      max_calls: config.frequencyMaxCalls,
    },
    paramsSource: FREQUENCY_PARAMS_SOURCE,
  };

  // One rule draft per contract, in first-seen order. Called contracts get the
  // frequency policy; token-transfer contracts get the spending limit below.
  const drafts = new Map<string, { fns: string[]; policies: OzPolicyBinding[] }>();
  for (const call of tx.calls) {
    let draft = drafts.get(call.contract);
    if (draft === undefined) {
      draft = { fns: [], policies: [frequencyBinding] };
      drafts.set(call.contract, draft);
    }
    if (!draft.fns.includes(call.fnName)) {
      draft.fns.push(call.fnName);
    }
  }

  const transferContracts = collectSubjectTransferContracts(tx);
  const tokenSymbols = new Map<string, TokenRef>();
  for (const flow of tx.flows) {
    if (!tokenSymbols.has(flow.asset.contractId)) {
      tokenSymbols.set(flow.asset.contractId, flow.asset);
    }
  }

  // Compose each spend cap onto its token's rule where the stock policy can
  // actually fire; record the delta where it cannot.
  const composedAssets = new Set<string>();
  for (const policy of spendingPolicies) {
    const tokenContract = policy.asset.contractId;
    if (!transferContracts.has(tokenContract)) {
      notes.push(
        `DELTA: the ${assetLabel(policy.asset)} spend cap (${policy.cap} per ${policy.windowSecs}s) is not expressible with the stock spending_limit policy — the recording shows no subject-authorized direct transfer of this token, and spending_limit only meters direct transfer calls, panicking NotAllowed on anything else (spending_limit.rs:222-294; RECONCILIATION row 12). The cap stays enforced in the offline dry run; on-chain enforcement of it needs a custom policy.`,
      );
      continue;
    }
    composedAssets.add(tokenContract);
    const binding: StockSpendingLimitBinding = {
      policy: 'stock:spending_limit',
      address: null,
      installParams: {
        spending_limit: policy.cap,
        period_ledgers: secsToLedgers(policy.windowSecs),
      },
      paramsSource: SPENDING_LIMIT_PARAMS_SOURCE,
      derivedFrom: {
        asset: policy.asset,
        observedGrossOut: policy.observedGrossOut,
        spendWindowSecs: policy.windowSecs,
      },
    };
    let draft = drafts.get(tokenContract);
    if (draft === undefined) {
      draft = { fns: [], policies: [] };
      drafts.set(tokenContract, draft);
    }
    if (!draft.fns.includes('transfer')) {
      draft.fns.push('transfer');
    }
    draft.policies.push(binding);
  }

  // A subject-authorized transfer with no derived cap still needs its rule
  // (every require_auth context must match one), and OZ requires >=1 signer
  // or policy per rule — bind the frequency policy so it carries one.
  for (const tokenContract of transferContracts) {
    if (drafts.has(tokenContract)) {
      continue;
    }
    drafts.set(tokenContract, { fns: ['transfer'], policies: [frequencyBinding] });
    notes.push(
      `the subject authorized a direct transfer on ${tokenContract} but no outflow of it was observed; its CallContract rule is still required (each require_auth is its own context at __check_auth — FACTS §2.5) and carries the frequency policy so the rule is not empty.`,
    );
  }

  if (composedAssets.size > 0) {
    notes.push(
      `spend windows are measured in LEDGERS on-chain: ${config.spendWindowSecs}s → ${secsToLedgers(config.spendWindowSecs)} ledgers at an estimated ${ESTIMATED_SECS_PER_LEDGER}s/ledger (spending_limit.rs:88-94; OZ's own DAY_IN_LEDGERS = 17280 = 86400s at this rate).`,
    );
    notes.push(
      `spending_limit is asset-blind: it meters whatever transfer amounts pass through its rule, so the metered token is the rule's CallContract target (one instance per token rule).`,
    );
  }
  notes.push(
    validUntilLedger !== null
      ? `valid_until is a LEDGER SEQUENCE, not a Unix time (storage.rs:282; RECONCILIATION row 15): emitted ${validUntilLedger} = recording ledger ${tx.ledger} + ${lifetimeLedgers} ledgers (${config.lifetimeSecs}s at ${ESTIMATED_SECS_PER_LEDGER}s/ledger). Recompute from the live ledger head at install — the recording ledger is in the past.`
      : `the recording carries no ledger sequence, so valid_until is null here; compute it at install as current ledger + ${lifetimeLedgers} (${config.lifetimeSecs}s at ${ESTIMATED_SECS_PER_LEDGER}s/ledger). valid_until is a ledger sequence, not a Unix time (storage.rs:282).`,
  );
  notes.push(
    `context rules cannot carry function names (matching is contract-level — storage.rs:289-304; RECONCILIATION rows 13-14): observedFns is advisory. Function-level narrowing must live in a policy's enforce; that codegen is Tranche 2 (docs/T2-NOTES.md).`,
  );
  notes.push(
    `emitted rules carry no signers: attach the smart account's signer(s) at install. add_context_rule requires at least one signer or policy per rule (mod.rs:20-21), and stock spending_limit::enforce rejects when no signers authenticated (spending_limit.rs:232-234).`,
  );

  const usedNames = new Set<string>();
  const rules: OzContextRule[] = [];
  for (const [contract, draft] of drafts) {
    const isTokenRule = !tx.calls.some((c) => c.contract === contract);
    const asset = tokenSymbols.get(contract);
    const base =
      isTokenRule && asset !== undefined
        ? `pw:xfer:${assetLabel(asset)}`
        : `pw:${[...new Set(draft.fns.map((f) => f.split('_')[0] ?? f))].join('+')}`;
    rules.push({
      contextType: { type: 'CallContract', contract },
      name: uniqueRuleName(base, usedNames),
      validUntilLedger,
      observedFns: draft.fns,
      policies: draft.policies,
    });
  }
  return { rules, notes };
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
  const spendingPolicies = deriveSpendingPolicies(tx, config);
  const policies: PolicySpec[] = [
    ...spendingPolicies,
    deriveFrequencyPolicy(config),
    // Argument constraints are enforced (count as policies) only when enabled.
    ...(config.constrainArguments ? argumentScopes : []),
  ];

  const { rules: ozContextRules, notes } = deriveOzContextRules(tx, config, spendingPolicies);
  if (argumentScopes.length > 0) {
    notes.push(
      `DELTA: no stock policy can express the observed argument constraints (swap path token set); they are ${config.constrainArguments ? 'enforced' : 'advisory'} in the offline dry run only. Argument-level policy codegen is Tranche 2 (docs/T2-NOTES.md).`,
    );
  }

  const warnings: string[] = [];
  if (policies.length > MAX_POLICIES) {
    warnings.push(
      `synthesised ${policies.length} policies, but OpenZeppelin smart accounts allow at most ${MAX_POLICIES} per context rule; split the flow across multiple rules or relax constraints`,
    );
  }

  return { contextRule, policies, argumentScopes, ozContextRules, notes, warnings, config };
}
