/**
 * Live on-chain snapshot fetch: `get_context_rules_count` + `get_context_rule`
 * via stellar-cli simulate/invoke, then optional policy param enrichment.
 */

import {
  DEFAULT_FREQUENCY_POLICY,
  loadDotEnv,
  runStellarCli,
  scrapeContractId,
} from '../cli-env.js';
import { badInput, networkError } from '../sources/errors.js';
import type { Network } from '../types.js';
import {
  ON_CHAIN_SNAPSHOT_SCHEMA_VERSION,
  type OnChainContextRule,
  type OnChainPolicyAttachment,
  type OnChainSnapshot,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface FetchOnChainSnapshotInput {
  readonly smartAccount: string;
  readonly network?: Network;
  readonly rpcUrl?: string;
  /** Secret for stellar-cli source account (read-only sims still need a key). */
  readonly sourceSecret?: string;
  readonly frequencyPolicyAddress?: string;
  readonly spendingLimitPolicyAddress?: string;
  readonly cwd?: string;
}

function invokeJson(
  smartAccount: string,
  network: Network,
  secret: string,
  fnArgs: readonly string[],
  cwd: string,
): unknown {
  const result = runStellarCli(
    [
      'contract',
      'invoke',
      '--id',
      smartAccount,
      '--network',
      network,
      '--',
      ...fnArgs,
    ],
    secret,
    { cwd },
  );
  if (!result.ok) {
    throw networkError(
      `invoke ${fnArgs[0]} failed: ${result.stderr.replaceAll(secret, '<SECRET>')}`,
    );
  }
  const lines = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('ℹ️') && !l.startsWith('📅'));
  // Last non-info line is typically the JSON/result.
  const payload = lines[lines.length - 1];
  if (payload === undefined) {
    throw networkError(`empty result from ${fnArgs[0]}`);
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    // Bare numbers (e.g. count)
    if (/^\d+$/.test(payload)) return Number(payload);
    throw networkError(`could not parse ${fnArgs[0]} result: ${payload}`);
  }
}

function parseContextType(
  raw: unknown,
): OnChainContextRule['contextType'] {
  if (raw === 'Default') {
    return { type: 'Default' };
  }
  if (isRecord(raw) && typeof raw['CallContract'] === 'string') {
    return { type: 'CallContract', contract: raw['CallContract'] };
  }
  if (isRecord(raw) && raw['type'] === 'Default') {
    return { type: 'Default' };
  }
  if (
    isRecord(raw) &&
    raw['type'] === 'CallContract' &&
    typeof raw['contract'] === 'string'
  ) {
    return { type: 'CallContract', contract: raw['contract'] };
  }
  throw badInput(`unrecognized on-chain context_type: ${JSON.stringify(raw)}`);
}

function classifyPolicy(
  address: string,
  frequencyPolicyAddress: string,
  spendingLimitPolicyAddress: string | undefined,
): string | undefined {
  if (address === frequencyPolicyAddress) return 'custom:FrequencyLimitPolicy';
  if (
    spendingLimitPolicyAddress !== undefined &&
    address === spendingLimitPolicyAddress
  ) {
    return 'stock:spending_limit';
  }
  return undefined;
}

function fetchFrequencyParams(
  policyAddress: string,
  contextRuleId: number,
  smartAccount: string,
  network: Network,
  secret: string,
  cwd: string,
): Record<string, unknown> | undefined {
  try {
    const raw = invokeJson(
      policyAddress,
      network,
      secret,
      [
        'get_frequency_limit_data',
        '--context_rule_id',
        String(contextRuleId),
        '--smart_account',
        smartAccount,
      ],
      cwd,
    );
    if (!isRecord(raw)) return undefined;
    const windowSecs = raw['window_secs'];
    const maxCalls = raw['max_calls'];
    return {
      window_secs:
        typeof windowSecs === 'string' ? Number(windowSecs) : windowSecs,
      max_calls: maxCalls,
    };
  } catch {
    return undefined;
  }
}

function fetchSpendingParams(
  policyAddress: string,
  contextRuleId: number,
  smartAccount: string,
  network: Network,
  secret: string,
  cwd: string,
): Record<string, unknown> | undefined {
  try {
    const raw = invokeJson(
      policyAddress,
      network,
      secret,
      [
        'get_spending_limit_data',
        '--context_rule_id',
        String(contextRuleId),
        '--smart_account',
        smartAccount,
      ],
      cwd,
    );
    if (!isRecord(raw)) return undefined;
    const spendingLimit = raw['spending_limit'];
    const periodLedgers = raw['period_ledgers'];
    return {
      spending_limit:
        typeof spendingLimit === 'number' || typeof spendingLimit === 'bigint'
          ? String(spendingLimit)
          : spendingLimit,
      period_ledgers: periodLedgers,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch an {@link OnChainSnapshot} for a smart account via RPC/stellar-cli.
 */
export function fetchOnChainSnapshot(
  input: FetchOnChainSnapshotInput,
): Promise<OnChainSnapshot> {
  const network: Network = input.network ?? 'testnet';
  const cwd = input.cwd ?? process.cwd();
  let secret = input.sourceSecret;
  if (secret === undefined) {
    const env = loadDotEnv(cwd);
    secret = env['STELLAR_SECRET_KEY'];
  }
  if (secret === undefined || secret.length === 0) {
    throw badInput('fetchOnChainSnapshot requires sourceSecret or .env STELLAR_SECRET_KEY');
  }
  if (!input.smartAccount.startsWith('C')) {
    throw badInput('--smart-account must be a C… address');
  }

  const frequencyPolicyAddress =
    input.frequencyPolicyAddress ?? DEFAULT_FREQUENCY_POLICY;
  const spendingLimitPolicyAddress = input.spendingLimitPolicyAddress;

  const countRaw = invokeJson(
    input.smartAccount,
    network,
    secret,
    ['get_context_rules_count'],
    cwd,
  );
  const count = typeof countRaw === 'number' ? countRaw : Number(countRaw);
  if (!Number.isFinite(count) || count < 0) {
    throw networkError(`bad get_context_rules_count: ${JSON.stringify(countRaw)}`);
  }

  const contextRules: OnChainContextRule[] = [];
  for (let id = 0; id < count; id += 1) {
    const raw = invokeJson(
      input.smartAccount,
      network,
      secret,
      ['get_context_rule', '--context_rule_id', String(id)],
      cwd,
    );
    if (!isRecord(raw)) {
      throw networkError(`get_context_rule(${id}) returned non-object`);
    }
    const name = typeof raw['name'] === 'string' ? raw['name'] : `rule-${id}`;
    const contextType = parseContextType(raw['context_type'] ?? raw['contextType']);
    const validUntil =
      raw['valid_until'] === null || raw['valid_until'] === undefined
        ? null
        : typeof raw['valid_until'] === 'number'
          ? raw['valid_until']
          : Number(raw['valid_until']);
    const policiesRaw = Array.isArray(raw['policies']) ? raw['policies'] : [];
    const policies: OnChainPolicyAttachment[] = [];
    for (const p of policiesRaw) {
      const address =
        typeof p === 'string'
          ? p
          : isRecord(p) && typeof p['address'] === 'string'
            ? p['address']
            : scrapeContractId(JSON.stringify(p));
      if (address === null || !address.startsWith('C')) {
        continue;
      }
      const kind = classifyPolicy(
        address,
        frequencyPolicyAddress,
        spendingLimitPolicyAddress,
      );
      let installParams: Record<string, unknown> | undefined;
      if (kind === 'custom:FrequencyLimitPolicy') {
        installParams = fetchFrequencyParams(
          address,
          id,
          input.smartAccount,
          network,
          secret,
          cwd,
        );
      } else if (kind === 'stock:spending_limit') {
        installParams = fetchSpendingParams(
          address,
          id,
          input.smartAccount,
          network,
          secret,
          cwd,
        );
      }
      policies.push({
        address,
        ...(kind !== undefined ? { policy: kind } : {}),
        ...(installParams !== undefined ? { installParams } : {}),
      });
    }
    contextRules.push({
      id: typeof raw['id'] === 'number' ? raw['id'] : id,
      name,
      contextType,
      validUntilLedger: validUntil !== null && Number.isFinite(validUntil) ? validUntil : null,
      policies,
    });
  }

  return Promise.resolve({
    schemaVersion: ON_CHAIN_SNAPSHOT_SCHEMA_VERSION,
    smartAccount: input.smartAccount,
    network,
    ledger: null,
    contextRules,
    source: 'rpc',
  });
}
