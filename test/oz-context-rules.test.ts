/**
 * D1.2: the synthesizer's installable OZ context rules — per-contract rule
 * split, token-transfer rules from the authorization trees, REAL stock-policy
 * install params (ledger-based units), composition-delta notes, and the
 * versioned context-rule.json artifact. All network-free; the live-sequence
 * tests run on the committed recorder output in examples/live/.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contextRuleJson } from '../src/emitter.js';
import { loadRecordedTx } from '../src/sources/recorded.js';
import { secsToLedgers, synthesize } from '../src/synthesizer.js';
import {
  CONTEXT_RULE_SCHEMA_VERSION,
  DEFAULT_SYNTH_CONFIG,
  type OzContextRule,
  type StockSpendingLimitBinding,
} from '../src/types.js';
import { auth, call, contractId, flow, makeTx, token } from './helpers.js';

const NOW = 1_000_000;
const LIVE_RECORDING = fileURLToPath(
  new URL('../examples/live/recorded-claim-swap.json', import.meta.url),
);

function ruleFor(rules: readonly OzContextRule[], contract: string): OzContextRule | undefined {
  return rules.find((r) => r.contextType.contract === contract);
}

function stockBindings(rule: OzContextRule | undefined): StockSpendingLimitBinding[] {
  return (rule?.policies ?? []).filter(
    (p): p is StockSpendingLimitBinding => p.policy === 'stock:spending_limit',
  );
}

describe('secsToLedgers', () => {
  it('converts a day to exactly OZ DAY_IN_LEDGERS', () => {
    expect(secsToLedgers(86_400)).toBe(17_280);
  });

  it.each<[number, number]>([
    [1, 1], // rounds up, never a zero-length window
    [5, 1],
    [6, 2],
    [2_592_000, 518_400], // 30 days
  ])('rounds %is up to %i ledgers', (secs, ledgers) => {
    expect(secsToLedgers(secs)).toBe(ledgers);
  });
});

describe('OZ context rules — per-contract split', () => {
  it('emits one CallContract rule per called contract (rules cannot span contracts)', () => {
    const pool = contractId('pool');
    const router = contractId('router');
    const tx = makeTx({
      calls: [call(pool, 'claim'), call(router, 'swap_exact_tokens_for_tokens')],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spec.ozContextRules).toHaveLength(2);
    expect(ruleFor(spec.ozContextRules, pool)?.observedFns).toEqual(['claim']);
    expect(ruleFor(spec.ozContextRules, router)?.observedFns).toEqual([
      'swap_exact_tokens_for_tokens',
    ]);
    for (const rule of spec.ozContextRules) {
      expect(rule.contextType.type).toBe('CallContract');
    }
  });

  it('merges repeat calls to one contract into one rule with deduped fns', () => {
    const pool = contractId('pool');
    const tx = makeTx({
      calls: [call(pool, 'claim'), call(pool, 'claim'), call(pool, 'withdraw')],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spec.ozContextRules).toHaveLength(1);
    expect(spec.ozContextRules[0]?.observedFns).toEqual(['claim', 'withdraw']);
  });

  it('binds the custom frequency policy with its real param names', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(
      tx,
      { ...DEFAULT_SYNTH_CONFIG, frequencyWindowSecs: 600, frequencyMaxCalls: 3 },
      NOW,
    );
    const [binding] = spec.ozContextRules[0]?.policies ?? [];
    expect(binding?.policy).toBe('custom:FrequencyLimitPolicy');
    expect(binding?.installParams).toEqual({ window_secs: 600, max_calls: 3 });
  });
});

describe('OZ context rules — token-transfer rules and the composed spending limit', () => {
  const subject = contractId('subject');
  const router = contractId('router');
  const blnd = contractId('blnd');
  const pair = contractId('pair');

  /** A swap whose auth tree shows the subject authorizing a direct BLND transfer. */
  function swapTx(overrides: { flows?: readonly ReturnType<typeof flow>[] } = {}) {
    return makeTx({
      subject,
      calls: [
        call(
          router,
          'swap_exact_tokens_for_tokens',
          [],
          [
            auth(
              router,
              'swap_exact_tokens_for_tokens',
              [],
              [auth(blnd, 'transfer', [subject, pair, '1000'])],
            ),
          ],
        ),
      ],
      flows: overrides.flows ?? [flow(token(blnd, 'BLND'), 'out', 1000n)],
    });
  }

  it('emits a CallContract(token) rule for a subject-authorized nested transfer', () => {
    const spec = synthesize(swapTx(), DEFAULT_SYNTH_CONFIG, NOW);

    const tokenRule = ruleFor(spec.ozContextRules, blnd);
    expect(tokenRule).toBeDefined();
    expect(tokenRule?.observedFns).toEqual(['transfer']);
    expect(tokenRule?.name).toBe('pw:xfer:BLND');
  });

  it('composes the spend cap as REAL stock spending_limit install params', () => {
    const spec = synthesize(
      swapTx(),
      { ...DEFAULT_SYNTH_CONFIG, capMultiplier: 1.1, spendWindowSecs: 86_400 },
      NOW,
    );

    const [binding] = stockBindings(ruleFor(spec.ozContextRules, blnd));
    expect(binding?.installParams).toEqual({
      spending_limit: 1100n, // ceil(1000 * 1.1) — i128, smallest unit
      period_ledgers: 17_280, // 86400s at 5s/ledger — u32, LEDGERS not seconds
    });
    expect(binding?.derivedFrom.observedGrossOut).toBe(1000n);
    expect(binding?.paramsSource).toContain('spending_limit.rs:88-94');
  });

  it('caps at GROSS out even when claim-in + swap-out nets to zero', () => {
    const spec = synthesize(
      swapTx({
        flows: [
          flow(token(blnd, 'BLND'), 'in', 1000n),
          flow(token(blnd, 'BLND'), 'out', 1000n),
          flow(token(contractId('usdc'), 'USDC'), 'in', 400n),
        ],
      }),
      { ...DEFAULT_SYNTH_CONFIG, capMultiplier: 1 },
      NOW,
    );

    const [binding] = stockBindings(ruleFor(spec.ozContextRules, blnd));
    expect(binding?.installParams.spending_limit).toBe(1000n);
  });

  it('emits no token rule and no cap for inflow-only assets', () => {
    const usdc = contractId('usdc');
    const tx = makeTx({
      subject,
      calls: [call(router, 'swap')],
      flows: [flow(token(usdc, 'USDC'), 'in', 400n)],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(ruleFor(spec.ozContextRules, usdc)).toBeUndefined();
    expect(spec.ozContextRules.flatMap((r) => stockBindings(r))).toHaveLength(0);
  });

  it('records a DELTA note instead of emitting rejectable params when no direct transfer backs an outflow', () => {
    // Outflow observed, but the auth tree shows no subject-authorized transfer
    // (e.g. the offline fixture, which carries no auth trees at all).
    const tx = makeTx({
      subject,
      calls: [call(router, 'swap')],
      flows: [flow(token(blnd, 'BLND'), 'out', 1000n)],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spec.ozContextRules.flatMap((r) => stockBindings(r))).toHaveLength(0);
    expect(spec.notes.some((n) => n.includes('DELTA') && n.includes('BLND'))).toBe(true);
  });

  it('emits no token rules when the recording has no subject', () => {
    const tx = makeTx({
      subject: null,
      calls: [
        call(
          router,
          'swap',
          [],
          [auth(router, 'swap', [], [auth(blnd, 'transfer', [contractId('other'), pair, '5'])])],
        ),
      ],
      flows: [flow(token(blnd, 'BLND'), 'out', 5n)],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(ruleFor(spec.ozContextRules, blnd)).toBeUndefined();
  });
});

describe('OZ context rules — valid_until as a ledger sequence', () => {
  it('computes validUntilLedger from the recording ledger + lifetime in ledgers', () => {
    const tx = makeTx({ ledger: 1000, calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(tx, { ...DEFAULT_SYNTH_CONFIG, lifetimeSecs: 3600 }, NOW);
    // 3600s at 5s/ledger = 720 ledgers.
    expect(spec.ozContextRules[0]?.validUntilLedger).toBe(1720);
  });

  it('emits null and a compute-at-install note when the recording has no ledger', () => {
    const tx = makeTx({ ledger: null, calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);
    expect(spec.ozContextRules[0]?.validUntilLedger).toBeNull();
    expect(spec.notes.some((n) => n.includes('compute it at install'))).toBe(true);
  });
});

describe('OZ context rules — rule names', () => {
  it('caps every rule name at 20 BYTES, not chars (multibyte symbols)', () => {
    const subject = contractId('subject');
    const router = contractId('router');
    const tkn = contractId('tkn');
    const tx = makeTx({
      subject,
      calls: [
        call(
          router,
          'swap',
          [],
          [auth(router, 'swap', [], [auth(tkn, 'transfer', [subject, contractId('pair'), '1'])])],
        ),
      ],
      flows: [flow(token(tkn, '💰ТОКЕН💰'), 'out', 1n)],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    const encoder = new TextEncoder();
    for (const rule of spec.ozContextRules) {
      expect(encoder.encode(rule.name).length).toBeLessThanOrEqual(20);
    }
  });

  it('disambiguates colliding names deterministically', () => {
    const subject = contractId('subject');
    const router = contractId('router');
    const tknA = contractId('tkna');
    const tknB = contractId('tknb');
    const tx = makeTx({
      subject,
      calls: [
        call(
          router,
          'swap',
          [],
          [
            auth(
              router,
              'swap',
              [],
              [
                auth(tknA, 'transfer', [subject, contractId('pair'), '1']),
                auth(tknB, 'transfer', [subject, contractId('pair'), '2']),
              ],
            ),
          ],
        ),
      ],
      // Two different contracts with the same symbol collide on pw:xfer:TKN.
      flows: [flow(token(tknA, 'TKN'), 'out', 1n), flow(token(tknB, 'TKN'), 'out', 2n)],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    const names = spec.ozContextRules.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('pw:xfer:TKN');
    expect(names).toContain('pw:xfer:TKN~2');
  });
});

describe('context-rule.json artifact', () => {
  it('is versioned, bigint-safe JSON citing the OZ install shape', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    const doc = JSON.parse(contextRuleJson(tx, spec)) as Record<string, unknown>;

    expect(doc['schemaVersion']).toBe(CONTEXT_RULE_SCHEMA_VERSION);
    const target = doc['target'] as Record<string, unknown>;
    expect(target['version']).toBe('v0.7.2');
    expect(target['installEntryPoint']).toContain('add_context_rule');
    expect(Array.isArray(doc['contextRules'])).toBe(true);
    expect(Array.isArray(doc['notes'])).toBe(true);
  });
});

describe('the real recorded sequence (committed, network-free)', () => {
  const tx = loadRecordedTx(LIVE_RECORDING);

  it('loads as a merged multi-transaction sequence', () => {
    expect(tx.source).toBe('rpc');
    const hashes = new Set(tx.calls.map((c) => c.sourceHash));
    expect(hashes.size).toBe(2); // swap tx + harvest tx, each keeping its hash
    expect(tx.subject).toBe('CCW6R5ZKEIJJ75YT54TEHMRUYTP4XQGUI6H63EE3W65H4P4FAUICXP3Q');
  });

  it('synthesizes one rule per called contract plus the authorized-transfer token rule', () => {
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? NOW);

    const contracts = spec.ozContextRules.map((r) => r.contextType.contract);
    expect(contracts).toEqual([
      'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD', // Soroswap router
      'CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357', // harvest wrapper
      'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', // native XLM SAC
    ]);
  });

  it('composes the observed XLM outflow into exact stock spending_limit params', () => {
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? NOW);

    const [binding] = stockBindings(
      ruleFor(spec.ozContextRules, 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),
    );
    expect(binding?.installParams).toEqual({
      spending_limit: 11_000_000n, // ceil(10000000 * 1.1)
      period_ledgers: 17_280,
    });
    expect(binding?.derivedFrom.observedGrossOut).toBe(10_000_000n);
  });

  it('gives the inflow-only USDC no cap and no rule (minimal permission)', () => {
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? NOW);
    expect(
      ruleFor(spec.ozContextRules, 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F'),
    ).toBeUndefined();
  });

  it('emits both source hashes in the artifact for the evidence trail', () => {
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? NOW);
    const doc = JSON.parse(contextRuleJson(tx, spec)) as {
      source: { sourceHashes: string[] };
    };
    expect(doc.source.sourceHashes).toEqual([
      '2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b',
      'acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452',
    ]);
  });
});

/**
 * Field-by-field validation of the COMMITTED live artifact against the OZ
 * v0.7.2 install signature (the D1.2 self-validation, kept as a regression):
 * every constraint checked here mirrors a specific check in the OZ source —
 * cited inline — so drift in the committed file fails CI.
 */
describe('committed examples/live/context-rule.json satisfies the OZ install signature', () => {
  const doc = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../examples/live/context-rule.json', import.meta.url)),
      'utf8',
    ),
  ) as {
    schemaVersion: number;
    contextRules: {
      contextType: { type: string; contract: string };
      name: string;
      validUntilLedger: number | null;
      signers: unknown[];
      policies: { policy: string; installParams: Record<string, unknown> }[];
    }[];
  };

  it('carries the documented schema version', () => {
    expect(doc.schemaVersion).toBe(CONTEXT_RULE_SCHEMA_VERSION);
  });

  it('every rule is CallContract with a valid u32 valid_until and <=20-byte name', () => {
    const encoder = new TextEncoder();
    expect(doc.contextRules.length).toBeGreaterThan(0);
    for (const rule of doc.contextRules) {
      // spending_limit.rs:376-378 — OnlyCallContractAllowed; storage.rs:143-150.
      expect(rule.contextType.type).toBe('CallContract');
      expect(rule.contextType.contract).toMatch(/^C[A-Z2-7]{55}$/);
      // mod.rs:522-530 — MAX_NAME_SIZE is 20 BYTES.
      expect(encoder.encode(rule.name).length).toBeLessThanOrEqual(20);
      // storage.rs — valid_until: Option<u32>, a ledger sequence.
      if (rule.validUntilLedger !== null) {
        expect(Number.isInteger(rule.validUntilLedger)).toBe(true);
        expect(rule.validUntilLedger).toBeGreaterThan(0);
        expect(rule.validUntilLedger).toBeLessThan(2 ** 32);
      }
      // mod.rs:20-21 — every rule needs >=1 signer or policy.
      expect(rule.signers.length + rule.policies.length).toBeGreaterThan(0);
    }
  });

  it('every stock spending_limit binding would pass the install checks', () => {
    const bindings = doc.contextRules
      .flatMap((r) => r.policies)
      .filter((p) => p.policy === 'stock:spending_limit');
    expect(bindings.length).toBeGreaterThan(0);
    for (const binding of bindings) {
      // spending_limit.rs:88-94 — exactly these two fields, nothing else.
      expect(Object.keys(binding.installParams).sort()).toEqual([
        'period_ledgers',
        'spending_limit',
      ]);
      const limit = BigInt(binding.installParams['spending_limit'] as string);
      const period = binding.installParams['period_ledgers'] as number;
      // spending_limit.rs:380-382 — InvalidLimitOrPeriod on limit <= 0 or period == 0.
      expect(limit).toBeGreaterThan(0n);
      // i128 range.
      expect(limit).toBeLessThan(2n ** 127n);
      // u32, nonzero.
      expect(Number.isInteger(period)).toBe(true);
      expect(period).toBeGreaterThan(0);
      expect(period).toBeLessThan(2 ** 32);
    }
  });

  it('binds spending_limit only to rules whose observed function is transfer', () => {
    for (const rule of doc.contextRules) {
      const hasSpendingLimit = rule.policies.some((p) => p.policy === 'stock:spending_limit');
      if (hasSpendingLimit) {
        // spending_limit.rs:222-294 — enforce only meters fn_name == "transfer".
        expect(
          (rule as unknown as { observedFns: string[] }).observedFns.includes('transfer'),
        ).toBe(true);
      }
    }
  });
});
