/**
 * Shared on-chain verify library: diff an emitted `context-rule.json` against
 * an {@link OnChainSnapshot} (fixture or live recon).
 *
 * Used by CLI `verify` and the MCP `verify` tool. This is NOT the offline
 * dry-run scenario self-check (`pipelineVerifyScenarios` / `npm run demo`) —
 * see RECONCILIATION-T2 T2-2.
 */

import { readFileSync } from 'node:fs';
import { CONTEXT_RULE_SCHEMA_VERSION } from '../types.js';
import { badInput } from '../sources/errors.js';
import {
  ON_CHAIN_SNAPSHOT_SCHEMA_VERSION,
  type DiffEntry,
  type OnChainContextRule,
  type OnChainPolicyAttachment,
  type OnChainSnapshot,
  type VerifyDiffResult,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON-stable stringify for install-param comparison (sorted keys). */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
}

function normalizeParamValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeParamValue);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeParamValue(v);
    }
    return out;
  }
  return value;
}

/** Emitted context-rule document (schemaVersion ≥ 1). */
export interface EmittedContextRuleDoc {
  readonly schemaVersion: number;
  readonly contextRules: readonly EmittedRule[];
}

export interface EmittedRule {
  readonly name: string;
  readonly contextType: { readonly type: 'CallContract'; readonly contract: string };
  readonly validUntilLedger: number | null;
  readonly policies: readonly EmittedPolicyBinding[];
}

export interface EmittedPolicyBinding {
  readonly policy: string;
  readonly address: string | null;
  readonly installParams: Readonly<Record<string, unknown>>;
}

/** Parse and validate an emitted context-rule.json document. */
export function parseEmittedContextRule(doc: unknown): EmittedContextRuleDoc {
  if (!isRecord(doc)) {
    throw badInput('context-rule document must be an object');
  }
  const schemaVersion = doc['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw badInput('context-rule.schemaVersion must be an integer');
  }
  if (schemaVersion !== CONTEXT_RULE_SCHEMA_VERSION) {
    throw badInput(
      `unsupported context-rule schemaVersion ${schemaVersion} (expected ${CONTEXT_RULE_SCHEMA_VERSION})`,
    );
  }
  const rulesRaw = doc['contextRules'];
  if (!Array.isArray(rulesRaw)) {
    throw badInput('context-rule.contextRules must be an array');
  }
  const contextRules: EmittedRule[] = rulesRaw.map((rule, i) => {
    if (!isRecord(rule)) {
      throw badInput(`context-rule.contextRules[${i}] must be an object`);
    }
    const name = rule['name'];
    if (typeof name !== 'string' || name.length === 0) {
      throw badInput(`context-rule.contextRules[${i}].name must be a non-empty string`);
    }
    const contextType = rule['contextType'];
    if (!isRecord(contextType) || contextType['type'] !== 'CallContract') {
      throw badInput(
        `context-rule.contextRules[${i}].contextType must be CallContract (Default is never emitted)`,
      );
    }
    const contract = contextType['contract'];
    if (typeof contract !== 'string' || contract.length === 0) {
      throw badInput(`context-rule.contextRules[${i}].contextType.contract must be a string`);
    }
    const validUntilLedger = rule['validUntilLedger'];
    if (
      validUntilLedger !== null &&
      (typeof validUntilLedger !== 'number' || !Number.isInteger(validUntilLedger))
    ) {
      throw badInput(`context-rule.contextRules[${i}].validUntilLedger must be int|null`);
    }
    const policiesRaw = rule['policies'];
    if (!Array.isArray(policiesRaw)) {
      throw badInput(`context-rule.contextRules[${i}].policies must be an array`);
    }
    const policies: EmittedPolicyBinding[] = policiesRaw.map((binding, j) => {
      if (!isRecord(binding)) {
        throw badInput(`context-rule.contextRules[${i}].policies[${j}] must be an object`);
      }
      const policy = binding['policy'];
      if (typeof policy !== 'string') {
        throw badInput(`context-rule.contextRules[${i}].policies[${j}].policy must be a string`);
      }
      const address = binding['address'];
      if (address !== null && typeof address !== 'string') {
        throw badInput(
          `context-rule.contextRules[${i}].policies[${j}].address must be string|null`,
        );
      }
      const installParams = binding['installParams'];
      if (!isRecord(installParams)) {
        throw badInput(
          `context-rule.contextRules[${i}].policies[${j}].installParams must be an object`,
        );
      }
      return {
        policy,
        address,
        installParams: normalizeParamValue(installParams) as Record<string, unknown>,
      };
    });
    return {
      name,
      contextType: { type: 'CallContract', contract },
      validUntilLedger,
      policies,
    };
  });
  return { schemaVersion, contextRules };
}

/** Parse and validate an on-chain snapshot document. */
export function parseOnChainSnapshot(doc: unknown): OnChainSnapshot {
  if (!isRecord(doc)) {
    throw badInput('on-chain snapshot must be an object');
  }
  const schemaVersion = doc['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    throw badInput('on-chain snapshot schemaVersion must be an integer');
  }
  if (schemaVersion !== ON_CHAIN_SNAPSHOT_SCHEMA_VERSION) {
    throw badInput(
      `unsupported on-chain snapshot schemaVersion ${schemaVersion} (expected ${ON_CHAIN_SNAPSHOT_SCHEMA_VERSION})`,
    );
  }
  const smartAccount = doc['smartAccount'];
  if (typeof smartAccount !== 'string' || smartAccount.length === 0) {
    throw badInput('on-chain snapshot smartAccount must be a non-empty string');
  }
  const network = doc['network'];
  if (network !== 'testnet' && network !== 'mainnet' && network !== 'futurenet') {
    throw badInput('on-chain snapshot network must be testnet|mainnet|futurenet');
  }
  const ledger = doc['ledger'];
  if (ledger !== null && (typeof ledger !== 'number' || !Number.isInteger(ledger))) {
    throw badInput('on-chain snapshot ledger must be int|null');
  }
  const source = doc['source'];
  if (source !== 'fixture' && source !== 'rpc') {
    throw badInput('on-chain snapshot source must be fixture|rpc');
  }
  const rulesRaw = doc['contextRules'];
  if (!Array.isArray(rulesRaw)) {
    throw badInput('on-chain snapshot contextRules must be an array');
  }
  const contextRules: OnChainContextRule[] = rulesRaw.map((rule, i) => {
    if (!isRecord(rule)) {
      throw badInput(`on-chain snapshot contextRules[${i}] must be an object`);
    }
    const name = rule['name'];
    if (typeof name !== 'string' || name.length === 0) {
      throw badInput(`on-chain snapshot contextRules[${i}].name must be a non-empty string`);
    }
    const contextType = rule['contextType'];
    if (!isRecord(contextType)) {
      throw badInput(`on-chain snapshot contextRules[${i}].contextType must be an object`);
    }
    const type = contextType['type'];
    let typedContext: OnChainContextRule['contextType'];
    if (type === 'CallContract') {
      const contract = contextType['contract'];
      if (typeof contract !== 'string') {
        throw badInput(
          `on-chain snapshot contextRules[${i}].contextType.contract must be a string`,
        );
      }
      typedContext = { type: 'CallContract', contract };
    } else if (type === 'Default') {
      typedContext = { type: 'Default' };
    } else {
      throw badInput(
        `on-chain snapshot contextRules[${i}].contextType.type must be CallContract|Default`,
      );
    }
    const validUntilLedger = rule['validUntilLedger'];
    if (
      validUntilLedger !== null &&
      (typeof validUntilLedger !== 'number' || !Number.isInteger(validUntilLedger))
    ) {
      throw badInput(`on-chain snapshot contextRules[${i}].validUntilLedger must be int|null`);
    }
    const policiesRaw = rule['policies'];
    if (!Array.isArray(policiesRaw)) {
      throw badInput(`on-chain snapshot contextRules[${i}].policies must be an array`);
    }
    const policies: OnChainPolicyAttachment[] = policiesRaw.map((binding, j) => {
      if (!isRecord(binding)) {
        throw badInput(`on-chain snapshot contextRules[${i}].policies[${j}] must be an object`);
      }
      const address = binding['address'];
      if (typeof address !== 'string' || address.length === 0) {
        throw badInput(
          `on-chain snapshot contextRules[${i}].policies[${j}].address must be a non-empty string`,
        );
      }
      const policy = binding['policy'];
      const installParams = binding['installParams'];
      const out: OnChainPolicyAttachment = {
        address,
        ...(typeof policy === 'string' ? { policy } : {}),
        ...(isRecord(installParams)
          ? { installParams: normalizeParamValue(installParams) as Record<string, unknown> }
          : {}),
      };
      return out;
    });
    const id = rule['id'];
    return {
      ...(typeof id === 'number' && Number.isInteger(id) ? { id } : {}),
      name,
      contextType: typedContext,
      validUntilLedger,
      policies,
    };
  });
  return {
    schemaVersion,
    smartAccount,
    network,
    ledger,
    contextRules,
    source,
  };
}

export function loadEmittedContextRule(path: string): EmittedContextRuleDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw badInput(`could not read context-rule file ${path}: ${(cause as Error).message}`);
  }
  return parseEmittedContextRule(raw);
}

export function loadOnChainSnapshot(path: string): OnChainSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw badInput(`could not read on-chain snapshot file ${path}: ${(cause as Error).message}`);
  }
  return parseOnChainSnapshot(raw);
}

function contractKey(rule: { contextType: { type: string; contract?: string } }): string | null {
  if (rule.contextType.type !== 'CallContract') {
    return null;
  }
  return rule.contextType.contract ?? null;
}

function pushDiff(
  diffs: DiffEntry[],
  path: string,
  expected: unknown,
  actual: unknown,
  message: string,
): void {
  diffs.push({ path, expected, actual, message });
}

function diffPolicies(
  diffs: DiffEntry[],
  path: string,
  expected: readonly EmittedPolicyBinding[],
  actual: readonly OnChainPolicyAttachment[],
): void {
  if (expected.length !== actual.length) {
    pushDiff(
      diffs,
      `${path}.policies.length`,
      expected.length,
      actual.length,
      `policy count mismatch`,
    );
  }
  const used = new Set<number>();
  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i]!;
    let matchIdx = actual.findIndex(
      (a, j) => !used.has(j) && a.policy !== undefined && a.policy === exp.policy,
    );
    if (matchIdx === -1) {
      matchIdx = actual.findIndex((a, j) => !used.has(j) && a.policy === undefined);
    }
    if (matchIdx === -1) {
      pushDiff(
        diffs,
        `${path}.policies[${i}]`,
        exp.policy,
        null,
        `no on-chain policy matching emitted "${exp.policy}"`,
      );
      continue;
    }
    used.add(matchIdx);
    const act = actual[matchIdx]!;
    if (exp.address !== null && exp.address !== act.address) {
      pushDiff(
        diffs,
        `${path}.policies[${i}].address`,
        exp.address,
        act.address,
        `policy address mismatch for ${exp.policy}`,
      );
    }
    if (act.policy !== undefined && act.policy !== exp.policy) {
      pushDiff(
        diffs,
        `${path}.policies[${i}].policy`,
        exp.policy,
        act.policy,
        `policy kind mismatch`,
      );
    }
    if (act.installParams !== undefined) {
      const expParams = stableJson(exp.installParams);
      const actParams = stableJson(normalizeParamValue(act.installParams));
      if (expParams !== actParams) {
        pushDiff(
          diffs,
          `${path}.policies[${i}].installParams`,
          exp.installParams,
          act.installParams,
          `install params mismatch for ${exp.policy}`,
        );
      }
    }
  }
  for (let j = 0; j < actual.length; j += 1) {
    if (!used.has(j)) {
      const act = actual[j]!;
      pushDiff(
        diffs,
        `${path}.policies[extra:${j}]`,
        null,
        act.policy ?? act.address,
        `unexpected on-chain policy not present in emitted spec`,
      );
    }
  }
}

export interface VerifyDiffOptions {
  /**
   * When true, skip validUntilLedger comparison. Live installs recompute
   * validUntil from the ledger head (FACTS.md §2.2); recording-era values in
   * emitted JSON will not match.
   */
  readonly ignoreValidUntil?: boolean;
}

/**
 * Diff emitted context rules + attached policies against an on-chain snapshot.
 * Pass when every emitted CallContract rule is present on-chain with matching
 * policy kinds / install params (and addresses when the emitted doc filled them).
 *
 * On-chain Default rules (OZ constructor) are ignored for matching.
 */
export function diffEmittedVsOnChain(
  emitted: EmittedContextRuleDoc,
  snapshot: OnChainSnapshot,
  options: VerifyDiffOptions = {},
): VerifyDiffResult {
  const diffs: DiffEntry[] = [];
  const remaining = new Map<string, OnChainContextRule>();
  for (const rule of snapshot.contextRules) {
    const key = contractKey(rule);
    if (key === null) {
      // OZ `__constructor` always installs a Default rule; policywright never
      // emits Default. Ignore it for matching (still counted in actualRuleCount).
      continue;
    }
    remaining.set(key, rule);
  }

  let matchedRules = 0;
  for (let i = 0; i < emitted.contextRules.length; i += 1) {
    const exp = emitted.contextRules[i]!;
    const key = exp.contextType.contract;
    const act = remaining.get(key);
    if (act === undefined) {
      pushDiff(
        diffs,
        `contextRules[${i}]`,
        key,
        null,
        `emitted rule "${exp.name}" (CallContract ${key}) not found on-chain`,
      );
      continue;
    }
    remaining.delete(key);
    matchedRules += 1;
    const base = `contextRules[${i}](${exp.name})`;
    if (act.name !== exp.name) {
      pushDiff(diffs, `${base}.name`, exp.name, act.name, `context-rule name mismatch`);
    }
    if (!options.ignoreValidUntil && act.validUntilLedger !== exp.validUntilLedger) {
      pushDiff(
        diffs,
        `${base}.validUntilLedger`,
        exp.validUntilLedger,
        act.validUntilLedger,
        `validUntilLedger mismatch`,
      );
    }
    diffPolicies(diffs, base, exp.policies, act.policies);
  }

  for (const [key, rule] of remaining) {
    pushDiff(
      diffs,
      `onChain.extra(${rule.name})`,
      null,
      key,
      `on-chain rule CallContract(${key}) not present in emitted spec`,
    );
  }

  return {
    ok: diffs.length === 0,
    diffs,
    matchedRules,
    expectedRuleCount: emitted.contextRules.length,
    actualRuleCount: snapshot.contextRules.length,
  };
}

export interface VerifyAgainstSnapshotInput {
  readonly emitted: unknown;
  readonly snapshot: unknown;
  readonly ignoreValidUntil?: boolean;
}

/** Parse both sides and diff. Shared entry point for CLI + MCP. */
export function verifyAgainstSnapshot(input: VerifyAgainstSnapshotInput): VerifyDiffResult {
  const emitted = parseEmittedContextRule(input.emitted);
  const snapshot = parseOnChainSnapshot(input.snapshot);
  return diffEmittedVsOnChain(emitted, snapshot, {
    ignoreValidUntil: input.ignoreValidUntil === true || snapshot.source === 'rpc',
  });
}
