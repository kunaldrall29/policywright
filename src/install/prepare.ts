/**
 * Prepare an install plan for Freighter (or stellar-cli) from an emitted
 * `context-rule.json`.
 *
 * Recomputes `validUntilLedger` from the **live** ledger head — the recording
 * ledger is always in the past (FACTS.md §2.2). Does not submit anything: the
 * human signs `add_context_rule` in Freighter via `wallet/`.
 */

import { readFileSync } from 'node:fs';
import { rpc } from '@stellar/stellar-sdk';
import { ESTIMATED_SECS_PER_LEDGER, type Network } from '../types.js';

const RPC_URLS: Record<Network, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
  futurenet: 'https://rpc-futurenet.stellar.org',
};

const NETWORK_PASSPHRASES: Record<Network, string> = {
  testnet: 'Test SDF Network ; September 2015',
  mainnet: 'Public Global Stellar Network ; September 2015',
  futurenet: 'Test SDF Future Network ; October 2022',
};

export interface InstallPolicyEntry {
  readonly policy: string;
  readonly address: string | null;
  readonly installParams: Record<string, unknown>;
  readonly paramsSource?: string;
}

export interface InstallRuleInvocation {
  readonly name: string;
  readonly contextType: unknown;
  readonly validUntilLedger: number;
  readonly observedFns: readonly string[];
  readonly signers: readonly string[];
  readonly policies: readonly InstallPolicyEntry[];
  readonly blockers: readonly string[];
}

export interface InstallPlan {
  readonly schemaVersion: 1;
  readonly network: Network;
  readonly smartAccount: string;
  readonly readyToSign: boolean;
  readonly ledger: {
    readonly latestLedger: number;
    readonly lifetimeSecs: number;
    readonly lifetimeLedgers: number;
    readonly estimatedSecsPerLedger: number;
  };
  readonly rules: readonly InstallRuleInvocation[];
  readonly freighter: {
    readonly networkPassphrase: string;
    readonly tip: string;
  };
  readonly notes: readonly string[];
}

export interface PrepareInstallInput {
  readonly contextRule?: unknown;
  readonly contextRulePath?: string;
  readonly smartAccount: string;
  readonly frequencyPolicyAddress?: string;
  readonly spendingLimitPolicyAddress?: string;
  readonly network?: Network;
  readonly rpcUrl?: string;
  readonly lifetimeSecs?: number;
  readonly signers?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadContextRule(input: PrepareInstallInput): Record<string, unknown> {
  if (input.contextRule !== undefined) {
    if (!isRecord(input.contextRule)) {
      throw new Error('contextRule must be an object');
    }
    return input.contextRule;
  }
  if (input.contextRulePath !== undefined) {
    return JSON.parse(readFileSync(input.contextRulePath, 'utf8')) as Record<string, unknown>;
  }
  throw new Error('prepare_install requires contextRule or contextRulePath');
}

function lifetimeSecsOf(doc: Record<string, unknown>, override: number | undefined): number {
  if (override !== undefined) return override;
  const config = doc.config;
  if (isRecord(config) && typeof config.lifetimeSecs === 'number') {
    return config.lifetimeSecs;
  }
  return 30 * 24 * 60 * 60;
}

function mapPolicy(
  raw: Record<string, unknown>,
  frequencyPolicyAddress: string | undefined,
  spendingLimitPolicyAddress: string | undefined,
): InstallPolicyEntry {
  const policy = typeof raw.policy === 'string' ? raw.policy : 'unknown';
  let address: string | null = typeof raw.address === 'string' ? raw.address : null;
  if (address === null) {
    if (/frequency/i.test(policy)) {
      address = frequencyPolicyAddress ?? null;
    } else if (/spending/i.test(policy)) {
      address = spendingLimitPolicyAddress ?? null;
    }
  }
  const installParams = isRecord(raw.installParams)
    ? raw.installParams
    : isRecord(raw.params)
      ? raw.params
      : {};
  return {
    policy,
    address,
    installParams,
    ...(typeof raw.paramsSource === 'string' ? { paramsSource: raw.paramsSource } : {}),
  };
}

/** Build an {@link InstallPlan} from a context-rule document + live ledger head. */
export async function prepareInstall(input: PrepareInstallInput): Promise<InstallPlan> {
  const network: Network = input.network ?? 'testnet';
  const doc = loadContextRule(input);
  const lifetimeSecs = lifetimeSecsOf(doc, input.lifetimeSecs);
  const lifetimeLedgers = Math.max(1, Math.ceil(lifetimeSecs / ESTIMATED_SECS_PER_LEDGER));

  const server = new rpc.Server(input.rpcUrl ?? RPC_URLS[network], { allowHttp: false });
  const latest = await server.getLatestLedger();
  const validUntilLedger = latest.sequence + lifetimeLedgers;
  const signers = input.signers ?? [];

  const notes: string[] = [
    'validUntilLedger was recomputed from the live ledger head; do not use the recording-era value.',
    'Freighter must be on the matching network; the human signs — policywright never auto-deploys.',
    'Stock spending_limit is a free-function module in OZ; a deployed wrapper address is required to install it.',
  ];

  const rawRules = Array.isArray(doc.contextRules) ? doc.contextRules : [];
  const rules: InstallRuleInvocation[] = rawRules.map((rawRule) => {
    if (!isRecord(rawRule)) {
      throw new Error('contextRules entries must be objects');
    }
    const blockers: string[] = [];
    const policiesRaw = Array.isArray(rawRule.policies) ? rawRule.policies : [];
    const policies = policiesRaw.map((p) => {
      if (!isRecord(p)) throw new Error('policy entries must be objects');
      return mapPolicy(p, input.frequencyPolicyAddress, input.spendingLimitPolicyAddress);
    });
    for (const entry of policies) {
      if (entry.address === null) {
        blockers.push(
          `missing address for ${entry.policy} — pass frequencyPolicyAddress or spendingLimitPolicyAddress`,
        );
      }
    }
    if (signers.length === 0) {
      blockers.push(
        'signers array is empty — attach the smart-account signer(s) Freighter will authenticate',
      );
    }
    if (signers.length === 0 && policies.every((p) => p.address === null)) {
      blockers.push('add_context_rule requires at least one signer or one policy address');
    }
    return {
      name: typeof rawRule.name === 'string' ? rawRule.name : 'unnamed',
      contextType: rawRule.contextType ?? null,
      validUntilLedger,
      observedFns: Array.isArray(rawRule.observedFns)
        ? rawRule.observedFns.filter((x): x is string => typeof x === 'string')
        : [],
      signers,
      policies,
      blockers,
    };
  });

  const readyToSign = rules.length > 0 && rules.every((r) => r.blockers.length === 0);

  return {
    schemaVersion: 1,
    network,
    smartAccount: input.smartAccount,
    readyToSign,
    ledger: {
      latestLedger: latest.sequence,
      lifetimeSecs,
      lifetimeLedgers,
      estimatedSecsPerLedger: ESTIMATED_SECS_PER_LEDGER,
    },
    rules,
    freighter: {
      networkPassphrase: NETWORK_PASSPHRASES[network],
      tip: readyToSign
        ? 'Open wallet/index.html, load this plan, confirm the Freighter popup, then submit.'
        : 'Resolve blockers before opening Freighter — a partial sign is worse than no sign.',
    },
    notes,
  };
}
