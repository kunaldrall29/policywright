/**
 * Network-free unit tests: emitted context-rule / installParams → stellar-cli
 * add_context_rule call-arg mapping (ScVal map Val encoding).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAddContextRuleArgs,
  buildPoliciesMapArg,
  encodeInstallParamsVal,
  scValSymbolMap,
} from '../src/install/args.js';
import { prepareInstall } from '../src/install/prepare.js';

const LIVE_CONTEXT_RULE = JSON.parse(
  readFileSync('examples/live/context-rule.json', 'utf8'),
) as {
  contextRules: Array<{
    name: string;
    contextType: { type: string; contract: string };
    policies: Array<{
      policy: string;
      address: string | null;
      installParams: Record<string, unknown>;
    }>;
  }>;
};

const SIGNER = 'GAFE247TQEPDPTCE7RIHOEXFD5VEGCJIZGLIHPGAITG2BCZ7ATFY4ZLY';
const FREQ = 'CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP';
const SPEND = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

describe('install/args mapping (network-free)', () => {
  it('sorts ScVal map keys alphabetically (XDR canonical)', () => {
    const encoded = scValSymbolMap({
      window_secs: { u64: 86400 },
      max_calls: { u32: 5 },
    });
    expect(encoded.map.map((e) => e.key.symbol)).toEqual(['max_calls', 'window_secs']);
  });

  it('encodes FrequencyLimitPolicy installParams from the live emitter shape', () => {
    const rule = LIVE_CONTEXT_RULE.contextRules.find((r) => r.name === 'pw:swap');
    expect(rule).toBeDefined();
    const params = rule!.policies[0]!.installParams;
    const val = encodeInstallParamsVal('custom:FrequencyLimitPolicy', params);
    expect(val).toEqual({
      map: [
        { key: { symbol: 'max_calls' }, val: { u32: 5 } },
        { key: { symbol: 'window_secs' }, val: { u64: 86400 } },
      ],
    });
  });

  it('encodes spending_limit installParams preserving string i128', () => {
    const rule = LIVE_CONTEXT_RULE.contextRules.find((r) => r.name === 'pw:xfer:native');
    expect(rule).toBeDefined();
    const params = rule!.policies[0]!.installParams;
    const val = encodeInstallParamsVal('stock:spending_limit', params);
    expect(val.map.find((e) => e.key.symbol === 'spending_limit')?.val).toEqual({
      i128: '11000000',
    });
    expect(val.map.find((e) => e.key.symbol === 'period_ledgers')?.val).toEqual({
      u32: 17280,
    });
    // alphabetical: period_ledgers before spending_limit
    expect(val.map.map((e) => e.key.symbol)).toEqual(['period_ledgers', 'spending_limit']);
  });

  it('builds policies map keyed by C-address for add_context_rule', () => {
    const map = buildPoliciesMapArg([
      {
        policy: 'custom:FrequencyLimitPolicy',
        address: FREQ,
        installParams: { window_secs: 86400, max_calls: 5 },
      },
    ]);
    expect(Object.keys(map)).toEqual([FREQ]);
    expect(map[FREQ]?.map).toHaveLength(2);
  });

  it('builds full add_context_rule args from a live recon rule shape', () => {
    const rule = LIVE_CONTEXT_RULE.contextRules.find((r) => r.name === 'pw:harvest')!;
    const args = buildAddContextRuleArgs({
      contract: rule.contextType.contract,
      name: rule.name,
      validUntilLedger: 5_000_000,
      signerPublicKey: SIGNER,
      policies: [
        {
          policy: rule.policies[0]!.policy,
          address: FREQ,
          installParams: rule.policies[0]!.installParams,
        },
      ],
    });
    expect(JSON.parse(args.contextType)).toEqual({
      CallContract: rule.contextType.contract,
    });
    expect(JSON.parse(args.name)).toBe('pw:harvest');
    expect(args.validUntil).toBe(5_000_000);
    expect(JSON.parse(args.signers)).toEqual([{ Delegated: SIGNER }]);
    const policies = JSON.parse(args.policies) as Record<string, unknown>;
    expect(policies[FREQ]).toBeDefined();
    // Emitter values unmodified inside the Val encoding
    const entries = (policies[FREQ] as { map: { key: { symbol: string }; val: unknown }[] }).map;
    expect(entries.find((e) => e.key.symbol === 'max_calls')?.val).toEqual({ u32: 5 });
    expect(entries.find((e) => e.key.symbol === 'window_secs')?.val).toEqual({ u64: 86400 });
  });
});

describe('prepareInstall mapping (network-free, injected ledger)', () => {
  it('fills policy addresses and builds callArgs for frequency rules', async () => {
    const plan = await prepareInstall({
      contextRule: LIVE_CONTEXT_RULE,
      smartAccount: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      network: 'testnet',
      frequencyPolicyAddress: FREQ,
      spendingLimitPolicyAddress: SPEND,
      signers: [SIGNER],
      latestLedger: 4_700_000,
    });
    expect(plan.ledger.latestLedger).toBe(4_700_000);
    expect(plan.readyToSign).toBe(true);
    expect(plan.rules).toHaveLength(3);
    for (const rule of plan.rules) {
      expect(rule.blockers).toEqual([]);
      expect(rule.callArgs).not.toBeNull();
      expect(rule.validUntilLedger).toBeGreaterThan(4_700_000);
      // Must not reuse the recording-era validUntil from the fixture (4336170)
      expect(rule.validUntilLedger).not.toBe(4336170);
    }
    const swap = plan.rules.find((r) => r.name === 'pw:swap')!;
    expect(swap.policies[0]?.address).toBe(FREQ);
    expect(swap.callArgs?.decoded.policies[FREQ]).toBeDefined();
  });

  it('reports blockers when spending-limit address is missing', async () => {
    const plan = await prepareInstall({
      contextRule: LIVE_CONTEXT_RULE,
      smartAccount: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      network: 'testnet',
      frequencyPolicyAddress: FREQ,
      signers: [SIGNER],
      latestLedger: 4_700_000,
    });
    expect(plan.readyToSign).toBe(false);
    const xfer = plan.rules.find((r) => r.name === 'pw:xfer:native')!;
    expect(xfer.blockers.some((b) => /spending/i.test(b))).toBe(true);
    const swap = plan.rules.find((r) => r.name === 'pw:swap')!;
    expect(swap.callArgs).not.toBeNull();
  });
});
