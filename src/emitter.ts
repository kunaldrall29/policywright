/**
 * Emitter: render a {@link SmartAccountSpec} into the artefacts a reviewer
 * installs or inspects:
 *  - a machine-readable JSON spec (bigints serialised as decimal strings);
 *  - a human-readable summary;
 *  - the illustrative custom Rust policy (see {@link renderFrequencyLimitPolicy}).
 */

import { renderFrequencyLimitPolicy } from './rust-policy.js';
import {
  CONTEXT_RULE_SCHEMA_VERSION,
  ESTIMATED_SECS_PER_LEDGER,
  OZ_TARGET,
  type OzPolicyBinding,
  type PolicySpec,
  type RecordedTx,
  type SmartAccountSpec,
  type TokenRef,
} from './types.js';

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

/** JSON-safe view of an OZ policy binding (bigints become decimal strings). */
function serialiseBinding(binding: OzPolicyBinding): Record<string, unknown> {
  switch (binding.policy) {
    case 'stock:spending_limit':
      return {
        policy: binding.policy,
        address: binding.address,
        installParams: {
          spending_limit: binding.installParams.spending_limit.toString(),
          period_ledgers: binding.installParams.period_ledgers,
        },
        paramsSource: binding.paramsSource,
        derivedFrom: {
          asset: binding.derivedFrom.asset,
          observedGrossOut: binding.derivedFrom.observedGrossOut.toString(),
          spendWindowSecs: binding.derivedFrom.spendWindowSecs,
        },
      };
    case 'custom:FrequencyLimitPolicy':
      return {
        policy: binding.policy,
        address: binding.address,
        installParams: binding.installParams,
        paramsSource: binding.paramsSource,
      };
  }
}

/**
 * Render the installable OZ context rules as versioned, bigint-safe JSON —
 * the `context-rule.json` artifact (schema: docs/context-rule-schema.md).
 * JSON has no comments, so each binding's OZ file:line citation travels in
 * its `paramsSource` field.
 */
export function contextRuleJson(tx: RecordedTx, spec: SmartAccountSpec): string {
  const sourceHashes = [
    ...new Set(spec.ozContextRules.length > 0 ? tx.calls.map((c) => c.sourceHash) : []),
  ].filter((h): h is string => h !== null);
  return JSON.stringify(
    {
      schemaVersion: CONTEXT_RULE_SCHEMA_VERSION,
      generatedBy: 'policywright',
      target: OZ_TARGET,
      source: {
        network: tx.network,
        recordedFrom: tx.source,
        subject: tx.subject,
        ledger: tx.ledger,
        sourceHashes,
      },
      ledgerTimeBasis: {
        estimatedSecsPerLedger: ESTIMATED_SECS_PER_LEDGER,
        note: 'every *_ledgers and validUntilLedger value was converted from configured seconds at this estimated rate; recompute validUntilLedger from the live ledger head at install',
      },
      contextRules: spec.ozContextRules.map((rule) => ({
        contextType: rule.contextType,
        name: rule.name,
        validUntilLedger: rule.validUntilLedger,
        signers: [],
        observedFns: rule.observedFns,
        policies: rule.policies.map(serialiseBinding),
      })),
      notes: spec.notes,
      config: spec.config,
    },
    null,
    2,
  );
}

/** One human-readable line describing an OZ policy binding. */
function describeBinding(binding: OzPolicyBinding): string {
  switch (binding.policy) {
    case 'stock:spending_limit':
      return `stock:spending_limit { spending_limit: ${binding.installParams.spending_limit}, period_ledgers: ${binding.installParams.period_ledgers} } (caps ${tokenLabel(binding.derivedFrom.asset)} transfers)`;
    case 'custom:FrequencyLimitPolicy':
      return `custom:FrequencyLimitPolicy { window_secs: ${binding.installParams.window_secs}, max_calls: ${binding.installParams.max_calls} }`;
  }
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
  lines.push(`Source tx : ${tx.hash ?? '(simulation — no on-chain transaction)'}`);
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
  if (spec.ozContextRules.length > 0) {
    lines.push('');
    lines.push(
      `Installable OZ context rules (${spec.ozContextRules.length}) — see context-rule.json`,
    );
    lines.push('----------------------------');
    for (const rule of spec.ozContextRules) {
      lines.push(`  ${rule.name}  CallContract(${rule.contextType.contract})`);
      lines.push(
        `    valid until ledger ${rule.validUntilLedger ?? '(compute at install)'}; observed fns: ${rule.observedFns.join(', ')}`,
      );
      for (const binding of rule.policies) {
        lines.push(`    - ${describeBinding(binding)}`);
      }
    }
    lines.push('');
    lines.push(
      `  ${spec.notes.length} composition note(s) in context-rule.json (unit conversions,`,
    );
    lines.push('  deltas the stock policies cannot express).');
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
  readonly contextRuleJson: string;
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
    contextRuleJson: contextRuleJson(tx, spec),
    summary: renderSummary(tx, spec),
    rustPolicy: renderFrequencyLimitPolicy(frequency),
  };
}
