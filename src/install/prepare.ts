/**
 * Prepare an install plan from an emitted `context-rule.json`.
 *
 * Recomputes `validUntilLedger` from the **live** ledger head — the recording
 * ledger is always in the past (FACTS.md §2.2). Used by CLI `install` (which
 * then simulates + submits) and by network-free unit tests via injected ledger.
 *
 * Ledger head is fetched via JSON-RPC `getLatestLedger` (not stellar-sdk
 * `rpc.Server`), because current testnet protocol can emit XDR the pinned
 * `@stellar/stellar-sdk` cannot decode (`SorobanCredentialsType` member 2).
 */

import { readFileSync } from 'node:fs';
import { ESTIMATED_SECS_PER_LEDGER, type Network } from '../types.js';
import { networkError } from '../sources/errors.js';
import { buildAddContextRuleArgs, type AddContextRuleArgs } from './args.js';

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
  readonly contextType: { readonly type: 'CallContract'; readonly contract: string } | null;
  readonly validUntilLedger: number;
  readonly observedFns: readonly string[];
  readonly signers: readonly string[];
  readonly policies: readonly InstallPolicyEntry[];
  readonly blockers: readonly string[];
  /** Ready-to-pass stellar-cli args when blockers is empty. */
  readonly callArgs: AddContextRuleArgs | null;
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
  readonly signingHierarchy: {
    readonly preferred: string;
    readonly fallback: string;
  };
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
  /** Injected ledger head for network-free tests. */
  readonly latestLedger?: number;
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
  throw new Error('prepareInstall requires contextRule or contextRulePath');
}

function lifetimeSecsOf(doc: Record<string, unknown>, override: number | undefined): number {
  if (override !== undefined) return override;
  const config = doc['config'];
  if (isRecord(config) && typeof config['lifetimeSecs'] === 'number') {
    return config['lifetimeSecs'];
  }
  const basis = doc['ledgerTimeBasis'];
  if (isRecord(basis) && typeof doc['contextRules'] === 'object') {
    // Default matches DEFAULT_SYNTH_CONFIG.lifetimeSecs (30 days).
  }
  return 30 * 24 * 60 * 60;
}

function mapPolicy(
  raw: Record<string, unknown>,
  frequencyPolicyAddress: string | undefined,
  spendingLimitPolicyAddress: string | undefined,
): InstallPolicyEntry {
  const policy = typeof raw['policy'] === 'string' ? raw['policy'] : 'unknown';
  let address: string | null = typeof raw['address'] === 'string' ? raw['address'] : null;
  if (address === null) {
    if (/frequency/i.test(policy)) {
      address = frequencyPolicyAddress ?? null;
    } else if (/spending/i.test(policy)) {
      address = spendingLimitPolicyAddress ?? null;
    }
  }
  const installParams = isRecord(raw['installParams'])
    ? raw['installParams']
    : isRecord(raw['params'])
      ? raw['params']
      : {};
  return {
    policy,
    address,
    installParams,
    ...(typeof raw['paramsSource'] === 'string' ? { paramsSource: raw['paramsSource'] } : {}),
  };
}

async function resolveLatestLedger(input: PrepareInstallInput, network: Network): Promise<number> {
  if (input.latestLedger !== undefined) {
    return input.latestLedger;
  }
  const url = input.rpcUrl ?? RPC_URLS[network];
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestLedger',
        params: null,
      }),
    });
  } catch (cause) {
    throw networkError(`getLatestLedger fetch failed: ${(cause as Error).message}`);
  }
  if (!response.ok) {
    throw networkError(`getLatestLedger HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    result?: { sequence?: number };
    error?: { message?: string };
  };
  if (body.error !== undefined) {
    throw networkError(`getLatestLedger RPC error: ${body.error.message ?? 'unknown'}`);
  }
  const sequence = body.result?.sequence;
  if (typeof sequence !== 'number' || !Number.isFinite(sequence)) {
    throw networkError(`getLatestLedger missing sequence: ${JSON.stringify(body)}`);
  }
  return sequence;
}

/** Build an {@link InstallPlan} from a context-rule document + live ledger head. */
export async function prepareInstall(input: PrepareInstallInput): Promise<InstallPlan> {
  const network: Network = input.network ?? 'testnet';
  const doc = loadContextRule(input);
  const lifetimeSecs = lifetimeSecsOf(doc, input.lifetimeSecs);
  const lifetimeLedgers = Math.max(1, Math.ceil(lifetimeSecs / ESTIMATED_SECS_PER_LEDGER));
  const latestLedger = await resolveLatestLedger(input, network);
  const validUntilLedger = latestLedger + lifetimeLedgers;
  const signers = input.signers ?? [];

  const notes: string[] = [
    'validUntilLedger was recomputed from the live ledger head; do not use the recording-era value.',
    'Preferred signing: browser Freighter via stellar-wallets-kit signAuthEntry (FACTS.md §5.3).',
    'Fallback (headless): local ed25519 from .env STELLAR_SECRET_KEY — must be labeled in output.',
    'Stock spending_limit needs a deployed wrapper address (--spending-limit-policy).',
  ];

  const rawRules = Array.isArray(doc['contextRules']) ? doc['contextRules'] : [];
  const rules: InstallRuleInvocation[] = rawRules.map((rawRule) => {
    if (!isRecord(rawRule)) {
      throw new Error('contextRules entries must be objects');
    }
    const blockers: string[] = [];
    const policiesRaw = Array.isArray(rawRule['policies']) ? rawRule['policies'] : [];
    const policies = policiesRaw.map((p) => {
      if (!isRecord(p)) throw new Error('policy entries must be objects');
      return mapPolicy(p, input.frequencyPolicyAddress, input.spendingLimitPolicyAddress);
    });
    for (const entry of policies) {
      if (entry.address === null) {
        blockers.push(
          `missing address for ${entry.policy} — pass --frequency-policy or --spending-limit-policy`,
        );
      }
    }
    if (signers.length === 0) {
      blockers.push('signers array is empty — pass --signer <G…> (Delegated smart-account signer)');
    }
    if (signers.length === 0 && policies.every((p) => p.address === null)) {
      blockers.push('add_context_rule requires at least one signer or one policy address');
    }

    let contextType: InstallRuleInvocation['contextType'] = null;
    const ct = rawRule['contextType'];
    if (isRecord(ct) && ct['type'] === 'CallContract' && typeof ct['contract'] === 'string') {
      contextType = { type: 'CallContract', contract: ct['contract'] };
    } else {
      blockers.push('contextType must be CallContract with a contract address');
    }

    const name = typeof rawRule['name'] === 'string' ? rawRule['name'] : 'unnamed';
    if (new TextEncoder().encode(name).length > 20) {
      blockers.push(`rule name exceeds 20 bytes: "${name}"`);
    }

    let callArgs: AddContextRuleArgs | null = null;
    if (
      blockers.length === 0 &&
      contextType !== null &&
      signers[0] !== undefined &&
      policies.every((p) => p.address !== null)
    ) {
      callArgs = buildAddContextRuleArgs({
        contract: contextType.contract,
        name,
        validUntilLedger,
        signerPublicKey: signers[0],
        policies: policies.map((p) => ({
          policy: p.policy,
          address: p.address!,
          installParams: p.installParams,
        })),
      });
    }

    return {
      name,
      contextType,
      validUntilLedger,
      observedFns: Array.isArray(rawRule['observedFns'])
        ? rawRule['observedFns'].filter((x): x is string => typeof x === 'string')
        : [],
      signers,
      policies,
      blockers,
      callArgs,
    };
  });

  const readyToSign = rules.length > 0 && rules.every((r) => r.blockers.length === 0);

  return {
    schemaVersion: 1,
    network,
    smartAccount: input.smartAccount,
    readyToSign,
    ledger: {
      latestLedger,
      lifetimeSecs,
      lifetimeLedgers,
      estimatedSecsPerLedger: ESTIMATED_SECS_PER_LEDGER,
    },
    rules,
    freighter: {
      networkPassphrase: NETWORK_PASSPHRASES[network],
      tip: readyToSign
        ? 'Preferred: Freighter signAuthEntry. Headless fallback: local-signer from .env.'
        : 'Resolve blockers before signing — a partial sign is worse than no sign.',
    },
    notes,
    signingHierarchy: {
      preferred: 'stellar-wallets-kit + Freighter signAuthEntry (browser)',
      fallback: 'local-signer from .env STELLAR_SECRET_KEY (headless / CI) — label output honestly',
    },
  };
}
