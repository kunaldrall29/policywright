/**
 * Emitter: render a {@link SmartAccountSpec} into the artefacts a reviewer
 * installs or inspects:
 *  - a machine-readable JSON spec (bigints serialised as decimal strings);
 *  - a human-readable summary;
 *  - the illustrative custom Rust policy (see {@link renderFrequencyLimitPolicy}).
 */

import { renderFrequencyLimitPolicy } from './rust-policy.js';
import type { PolicySpec, RecordedTx, SmartAccountSpec, TokenRef } from './types.js';

/** Format a smallest-unit amount as a human decimal string for the token. */
export function formatAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString();
  }
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  const body = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${body}` : body;
}

/** A short, stable label for a token (symbol, noting unresolved metadata). */
function tokenLabel(asset: TokenRef): string {
  return asset.resolved ? asset.symbol : `${asset.symbol} (unresolved)`;
}

/** JSON-safe view of a policy (bigints become decimal strings). */
function serialisePolicy(policy: PolicySpec): Record<string, unknown> {
  switch (policy.kind) {
    case 'spending-limit':
      return {
        kind: policy.kind,
        asset: policy.asset,
        cap: policy.cap.toString(),
        windowSecs: policy.windowSecs,
        observedGrossOut: policy.observedGrossOut.toString(),
      };
    case 'frequency-limit':
      return { kind: policy.kind, windowSecs: policy.windowSecs, maxCalls: policy.maxCalls };
    case 'argument-constraint':
      return {
        kind: policy.kind,
        contract: policy.contract,
        fnName: policy.fnName,
        argIndex: policy.argIndex,
        argName: policy.argName,
        allowedTokens: policy.allowedTokens,
      };
  }
}

/** Render the spec as pretty-printed, bigint-safe JSON. */
export function specToJson(spec: SmartAccountSpec): string {
  return JSON.stringify(
    {
      contextRule: spec.contextRule,
      policies: spec.policies.map(serialisePolicy),
      argumentScopes: spec.argumentScopes.map(serialisePolicy),
      argumentScopesEnforced: spec.config.constrainArguments,
      warnings: spec.warnings,
      config: spec.config,
    },
    null,
    2,
  );
}

/** One human-readable line describing a policy. */
function describePolicy(policy: PolicySpec): string {
  switch (policy.kind) {
    case 'spending-limit': {
      const cap = formatAmount(policy.cap, policy.asset.decimals);
      const gross = formatAmount(policy.observedGrossOut, policy.asset.decimals);
      return `spending-limit: ${tokenLabel(policy.asset)} <= ${cap} per ${policy.windowSecs}s (observed gross out ${gross})`;
    }
    case 'frequency-limit':
      return `frequency-limit: <= ${policy.maxCalls} call(s) per ${policy.windowSecs}s`;
    case 'argument-constraint':
      return `argument-constraint: ${policy.fnName} arg[${policy.argIndex}] (${policy.argName}) restricted to ${policy.allowedTokens.length} observed token(s)`;
  }
}

/** Render a human-readable summary of the recording and synthesised spec. */
export function renderSummary(tx: RecordedTx, spec: SmartAccountSpec): string {
  const lines: string[] = [];
  lines.push('policywright — synthesized smart-account authorization');
  lines.push('='.repeat(54));
  lines.push('');
  lines.push(`Source tx : ${tx.hash}`);
  lines.push(`Network   : ${tx.network} (recorded from ${tx.source})`);
  lines.push('');
  lines.push('Observed flow');
  lines.push('-------------');
  for (const call of tx.calls) {
    lines.push(`  call ${call.fnName} @ ${call.contract}`);
  }
  for (const flow of tx.flows) {
    const amt = formatAmount(flow.amount, flow.asset.decimals);
    lines.push(`  ${flow.direction === 'in' ? 'in ' : 'out'}  ${amt} ${tokenLabel(flow.asset)}`);
  }
  lines.push('');
  lines.push('Context rule');
  lines.push('------------');
  lines.push(`  name        : ${spec.contextRule.name}`);
  lines.push(`  valid until : ${spec.contextRule.validUntil} (unix)`);
  lines.push('  scope       :');
  for (const s of spec.contextRule.scopedCalls) {
    lines.push(`    - ${s.fnName} @ ${s.contract}`);
  }
  lines.push('');
  lines.push(`Policies (${spec.policies.length})`);
  lines.push('--------');
  for (const policy of spec.policies) {
    lines.push(`  - ${describePolicy(policy)}`);
  }
  if (spec.argumentScopes.length > 0) {
    const mode = spec.config.constrainArguments ? 'ENFORCED (deny)' : 'advisory (flag only)';
    lines.push('');
    lines.push(`Argument scopes — ${mode}`);
    lines.push('--------------');
    for (const scope of spec.argumentScopes) {
      lines.push(`  - ${describePolicy(scope)}`);
    }
  }
  if (spec.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings');
    lines.push('--------');
    for (const w of spec.warnings) {
      lines.push(`  ! ${w}`);
    }
  }
  lines.push('');
  lines.push('Note: the generated FrequencyLimitPolicy Rust is ILLUSTRATIVE and');
  lines.push('UNAUDITED — a starting point, not deploy-ready code.');
  lines.push('');
  return lines.join('\n');
}

/** All emitted artefacts for a spec. */
export interface EmittedArtifacts {
  readonly specJson: string;
  readonly summary: string;
  readonly rustPolicy: string;
}

/** Render every artefact for a recording + spec in one call. */
export function emit(tx: RecordedTx, spec: SmartAccountSpec): EmittedArtifacts {
  const frequency = spec.policies.find((p) => p.kind === 'frequency-limit');
  if (frequency === undefined) {
    // The synthesizer always emits a frequency policy; guard defensively so a
    // future change can't silently drop the Rust artefact.
    throw new Error('spec has no frequency-limit policy to render as Rust');
  }
  return {
    specJson: specToJson(spec),
    summary: renderSummary(tx, spec),
    rustPolicy: renderFrequencyLimitPolicy(frequency),
  };
}
