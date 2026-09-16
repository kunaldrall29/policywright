/**
 * Shapes for on-chain context-rule / policy snapshots used by the shared
 * verify library (CLI + MCP). A snapshot is what a network reader (D2.5) or a
 * committed fixture would produce — never an offline dry-run self-check.
 */

import type { Network } from '../types.js';

/** Version of the on-chain snapshot document. Bump on shape changes. */
export const ON_CHAIN_SNAPSHOT_SCHEMA_VERSION = 1;

/** One policy attached to an on-chain context rule. */
export interface OnChainPolicyAttachment {
  /** Deployed policy contract id (`C…`). */
  readonly address: string;
  /**
   * Optional kind tag matching the emitted binding (`stock:spending_limit`,
   * `custom:FrequencyLimitPolicy`, …). When omitted, only address presence is
   * checked.
   */
  readonly policy?: string;
  /** Decoded install params when known (same field names as the emitter). */
  readonly installParams?: Readonly<Record<string, unknown>>;
}

/** One context rule as observed on a smart account. */
export interface OnChainContextRule {
  /** On-chain rule id when known. */
  readonly id?: number;
  readonly name: string;
  readonly contextType:
    | { readonly type: 'CallContract'; readonly contract: string }
    | { readonly type: 'Default' };
  /** Ledger sequence; null when the rule has no expiry. */
  readonly validUntilLedger: number | null;
  readonly policies: readonly OnChainPolicyAttachment[];
}

/**
 * Network-free (fixture) or live recon of a smart account's context rules +
 * attached policies. MCP/CLI `verify` diffs this against an emitted
 * `context-rule.json`.
 */
export interface OnChainSnapshot {
  readonly schemaVersion: number;
  readonly smartAccount: string;
  readonly network: Network;
  /** Ledger at which the snapshot was taken, when known. */
  readonly ledger: number | null;
  readonly contextRules: readonly OnChainContextRule[];
  readonly source: 'fixture' | 'rpc';
}

/** One structural mismatch between emitted spec and on-chain snapshot. */
export interface DiffEntry {
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message: string;
}

/** Result of {@link import('./diff.js').diffEmittedVsOnChain}. */
export interface VerifyDiffResult {
  readonly ok: boolean;
  readonly diffs: readonly DiffEntry[];
  readonly matchedRules: number;
  readonly expectedRuleCount: number;
  readonly actualRuleCount: number;
}
