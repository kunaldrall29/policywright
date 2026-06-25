/**
 * Dry-run harness: evaluate a candidate call against a synthesised
 * {@link SmartAccountSpec} and report whether the spec would permit, deny, or
 * flag it — before anything is installed on-chain.
 *
 * Checks run in a fixed order; the first one that fails produces the decision:
 *   1. scope            — is the (contract, fn) pair authorised by the rule?
 *   2. lifetime         — is the call within the rule's validity window?
 *   3. spending-limit   — does any outflow exceed its asset's cap?
 *   4. frequency-limit  — would this call exceed the rolling call cap?
 * If every check passes, the call is permitted.
 */

import { formatAmount } from './emitter.js';
import type {
  ArgumentConstraintPolicy,
  CallArg,
  CandidateCall,
  RecordedTx,
  SimulationResult,
  SmartAccountSpec,
  SpendingLimitPolicy,
} from './types.js';

/** A named dry-run scenario plus the decision it is expected to produce. */
export interface Scenario {
  readonly candidate: CandidateCall;
  readonly expectedDecision: SimulationResult['decision'];
  readonly expectedReasonCode: string;
}

function isScoped(spec: SmartAccountSpec, contract: string, fnName: string): boolean {
  return spec.contextRule.scopedCalls.some((s) => s.contract === contract && s.fnName === fnName);
}

function spendPolicyFor(
  spec: SmartAccountSpec,
  contractId: string,
): SpendingLimitPolicy | undefined {
  return spec.policies.find(
    (p): p is SpendingLimitPolicy =>
      p.kind === 'spending-limit' && p.asset.contractId === contractId,
  );
}

/**
 * Return the candidate's argument tokens that fall outside an argument scope's
 * allow-set, or null when the candidate has no array argument at that index to
 * evaluate.
 */
function disallowedArgTokens(
  candidate: CandidateCall,
  scope: ArgumentConstraintPolicy,
): string[] | null {
  const arg: CallArg | undefined = candidate.args[scope.argIndex];
  if (!Array.isArray(arg)) {
    return null;
  }
  const allowed = new Set(scope.allowedTokens);
  const disallowed = arg.filter((t): t is string => typeof t === 'string' && !allowed.has(t));
  return disallowed.length > 0 ? disallowed : null;
}

/** Count prior in-scope calls that fall within the trailing frequency window. */
function callsInWindow(candidate: CandidateCall, windowSecs: number): number {
  const windowStart = candidate.timestamp - windowSecs;
  return candidate.priorCallTimestamps.filter((ts) => ts > windowStart && ts <= candidate.timestamp)
    .length;
}

/** Evaluate one candidate call against the spec. */
export function simulateCall(spec: SmartAccountSpec, candidate: CandidateCall): SimulationResult {
  // 1. Scope.
  if (!isScoped(spec, candidate.contract, candidate.fnName)) {
    return {
      label: candidate.label,
      decision: 'deny',
      reasonCode: 'scope',
      reason: `${candidate.fnName} @ ${candidate.contract} is outside the context rule's scope`,
    };
  }

  // 2. Lifetime.
  if (candidate.timestamp > spec.contextRule.validUntil) {
    return {
      label: candidate.label,
      decision: 'deny',
      reasonCode: 'lifetime',
      reason: `call at ${candidate.timestamp} is after the rule expires at ${spec.contextRule.validUntil}`,
    };
  }

  // 3. Enforced argument constraints (deny routing through unobserved tokens).
  for (const policy of spec.policies) {
    if (policy.kind !== 'argument-constraint') {
      continue;
    }
    const bad = disallowedArgTokens(candidate, policy);
    if (bad !== null) {
      return {
        label: candidate.label,
        decision: 'deny',
        reasonCode: 'argument-constraint',
        reason: `${policy.fnName} ${policy.argName} routes through unobserved token(s) ${bad.join(', ')}`,
      };
    }
  }

  // 4. Spending limits (per outflow asset that has a cap).
  for (const outflow of candidate.outflows) {
    if (outflow.direction !== 'out') {
      continue;
    }
    const policy = spendPolicyFor(spec, outflow.asset.contractId);
    if (policy !== undefined && outflow.amount > policy.cap) {
      const sent = formatAmount(outflow.amount, policy.asset.decimals);
      const cap = formatAmount(policy.cap, policy.asset.decimals);
      return {
        label: candidate.label,
        decision: 'deny',
        reasonCode: 'spending-limit',
        reason: `outflow of ${sent} ${policy.asset.symbol} exceeds the ${cap} cap per ${policy.windowSecs}s`,
      };
    }
  }

  // 5. Frequency limit.
  const frequency = spec.policies.find((p) => p.kind === 'frequency-limit');
  if (frequency !== undefined) {
    const prior = callsInWindow(candidate, frequency.windowSecs);
    if (prior + 1 > frequency.maxCalls) {
      return {
        label: candidate.label,
        decision: 'deny',
        reasonCode: 'frequency-limit',
        reason: `this would be call ${prior + 1} within ${frequency.windowSecs}s, over the cap of ${frequency.maxCalls}`,
      };
    }
  }

  // 6. Advisory argument constraints (flag, not deny) when not enforced.
  const argEnforced = spec.policies.some((p) => p.kind === 'argument-constraint');
  if (!argEnforced) {
    for (const scope of spec.argumentScopes) {
      const bad = disallowedArgTokens(candidate, scope);
      if (bad !== null) {
        return {
          label: candidate.label,
          decision: 'flag',
          reasonCode: 'argument-constraint',
          reason: `${scope.fnName} ${scope.argName} routes through unobserved token(s) ${bad.join(', ')}; not enforced (constrainArguments is off)`,
        };
      }
    }
  }

  return {
    label: candidate.label,
    decision: 'permit',
    reasonCode: 'permit',
    reason: 'within scope, lifetime, argument, spend cap, and frequency limits',
  };
}

/**
 * Build the standard dry-run scenarios for a spec + recording. Each is derived
 * generically from the spec so the set stays consistent with whatever was
 * synthesised. Returns the recorded ("original") permit case plus one deny case
 * per enforced check.
 */
export function buildScenarios(spec: SmartAccountSpec, tx: RecordedTx): Scenario[] {
  const base = spec.contextRule.validUntil - spec.config.lifetimeSecs;
  const scoped = spec.contextRule.scopedCalls;
  const spendCall = scoped[scoped.length - 1];
  if (spendCall === undefined) {
    throw new Error('cannot build scenarios: context rule has no scoped calls');
  }
  const spendPolicy = spec.policies.find(
    (p): p is SpendingLimitPolicy => p.kind === 'spending-limit',
  );

  const scenarios: Scenario[] = [];

  // permit: replay the recorded outflow exactly.
  const recordedOutflows = tx.flows.filter((f) => f.direction === 'out');
  scenarios.push({
    candidate: {
      label: 'replay recorded flow',
      contract: spendCall.contract,
      fnName: spendCall.fnName,
      args: [],
      outflows: recordedOutflows,
      timestamp: base + 60,
      priorCallTimestamps: [],
    },
    expectedDecision: 'permit',
    expectedReasonCode: 'permit',
  });

  // deny over-cap: send one unit more than the cap of the first capped asset.
  if (spendPolicy !== undefined) {
    scenarios.push({
      candidate: {
        label: 'over the spend cap',
        contract: spendCall.contract,
        fnName: spendCall.fnName,
        args: [],
        outflows: [{ asset: spendPolicy.asset, direction: 'out', amount: spendPolicy.cap + 1n }],
        timestamp: base + 60,
        priorCallTimestamps: [],
      },
      expectedDecision: 'deny',
      expectedReasonCode: 'spending-limit',
    });
  }

  // deny unseen fn: an unscoped function on a scoped contract.
  scenarios.push({
    candidate: {
      label: 'call to an unseen function',
      contract: spendCall.contract,
      fnName: 'set_admin',
      args: [],
      outflows: [],
      timestamp: base + 60,
      priorCallTimestamps: [],
    },
    expectedDecision: 'deny',
    expectedReasonCode: 'scope',
  });

  // deny expired: a call after the rule's validity window.
  scenarios.push({
    candidate: {
      label: 'call after rule expiry',
      contract: spendCall.contract,
      fnName: spendCall.fnName,
      args: [],
      outflows: [],
      timestamp: spec.contextRule.validUntil + 1,
      priorCallTimestamps: [],
    },
    expectedDecision: 'deny',
    expectedReasonCode: 'lifetime',
  });

  // deny frequency: enough prior calls in-window that this one tips over.
  const frequency = spec.policies.find((p) => p.kind === 'frequency-limit');
  if (frequency !== undefined) {
    const prior = Array.from({ length: frequency.maxCalls }, (_, i) => base - (i + 1));
    scenarios.push({
      candidate: {
        label: 'over the frequency limit',
        contract: spendCall.contract,
        fnName: spendCall.fnName,
        args: [],
        outflows: [],
        timestamp: base,
        priorCallTimestamps: prior,
      },
      expectedDecision: 'deny',
      expectedReasonCode: 'frequency-limit',
    });
  }

  // argument scope: a swap routing through an unobserved token. Denied when
  // constrainArguments is enabled, flagged (advisory) when it is not.
  const argScope = spec.argumentScopes[0];
  if (argScope !== undefined) {
    const unobservedToken = `C${'Z'.repeat(55)}`;
    const allowed = argScope.allowedTokens[0] ?? unobservedToken;
    const args: CallArg[] = Array.from({ length: argScope.argIndex }, () => null);
    args.push([allowed, unobservedToken]);
    scenarios.push({
      candidate: {
        label: 'route through an unobserved token',
        contract: argScope.contract,
        fnName: argScope.fnName,
        args,
        outflows: [],
        timestamp: base + 60,
        priorCallTimestamps: [],
      },
      expectedDecision: spec.config.constrainArguments ? 'deny' : 'flag',
      expectedReasonCode: 'argument-constraint',
    });
  }

  return scenarios;
}

/** Render dry-run results as a Markdown report. */
export function renderReport(results: readonly SimulationResult[]): string {
  const icon = (d: SimulationResult['decision']): string =>
    d === 'permit' ? '✅' : d === 'flag' ? '⚠️' : '⛔';
  const lines: string[] = [];
  lines.push('# policywright dry-run report');
  lines.push('');
  lines.push('| Scenario | Decision | Reason |');
  lines.push('| --- | --- | --- |');
  for (const r of results) {
    lines.push(
      `| ${r.label} | ${icon(r.decision)} ${r.decision} (${r.reasonCode}) | ${r.reason} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
