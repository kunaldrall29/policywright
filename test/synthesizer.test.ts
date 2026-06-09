import { describe, expect, it } from 'vitest';
import { loadFixture } from '../src/sources/fixture.js';
import { SynthError, synthesize, validateConfig } from '../src/synthesizer.js';
import { DEFAULT_SYNTH_CONFIG, type SpendingLimitPolicy, type SynthConfig } from '../src/types.js';
import { call, contractId, flow, makeTx, token } from './helpers.js';

const NOW = 1_000_000;

function spendPolicies(policies: readonly { kind: string }[]): SpendingLimitPolicy[] {
  return policies.filter((p): p is SpendingLimitPolicy => p.kind === 'spending-limit');
}

describe('synthesize — scope binding', () => {
  it('binds the exact (contract, fn) pairs observed', () => {
    const pool = contractId('pool');
    const router = contractId('router');
    const tx = makeTx({
      calls: [call(pool, 'claim'), call(router, 'swap_exact_tokens_for_tokens')],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spec.contextRule.scopedCalls).toEqual([
      { contract: pool, fnName: 'claim' },
      { contract: router, fnName: 'swap_exact_tokens_for_tokens' },
    ]);
  });

  it('deduplicates repeated (contract, fn) pairs', () => {
    const pool = contractId('pool');
    const tx = makeTx({ calls: [call(pool, 'claim'), call(pool, 'claim')] });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spec.contextRule.scopedCalls).toEqual([{ contract: pool, fnName: 'claim' }]);
  });

  it('sets validUntil to now + lifetime', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(tx, { ...DEFAULT_SYNTH_CONFIG, lifetimeSecs: 3600 }, NOW);
    expect(spec.contextRule.validUntil).toBe(NOW + 3600);
  });
});

describe('synthesize — spending caps', () => {
  it('caps gross outflow at gross * multiplier (rounded up)', () => {
    const blnd = token(contractId('blnd'), 'BLND');
    const tx = makeTx({
      calls: [call(contractId('router'), 'swap')],
      flows: [flow(blnd, 'out', 1000n)],
    });
    const spec = synthesize(tx, { ...DEFAULT_SYNTH_CONFIG, capMultiplier: 1.1 }, NOW);
    const [policy] = spendPolicies(spec.policies);

    expect(policy?.cap).toBe(1100n);
    expect(policy?.observedGrossOut).toBe(1000n);
    expect(policy?.asset.symbol).toBe('BLND');
  });

  it('rounds the cap up so it is never below the observed outflow', () => {
    const blnd = token(contractId('blnd'), 'BLND');
    // 1 * 1.5 -> 1.5, must round up to >= 2 (never below observed).
    const tx = makeTx({
      calls: [call(contractId('router'), 'swap')],
      flows: [flow(blnd, 'out', 1n)],
    });
    const spec = synthesize(tx, { ...DEFAULT_SYNTH_CONFIG, capMultiplier: 1.5 }, NOW);
    const [policy] = spendPolicies(spec.policies);
    expect(policy?.cap).toBe(2n); // ceil(1 * 1.5)
    expect(policy?.cap).toBeGreaterThanOrEqual(policy?.observedGrossOut ?? 0n);
  });

  it('emits no cap for inflow-only assets (minimal permission)', () => {
    const usdc = token(contractId('usdc'), 'USDC');
    const tx = makeTx({
      calls: [call(contractId('router'), 'swap')],
      flows: [flow(usdc, 'in', 5000n)],
    });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spendPolicies(spec.policies)).toHaveLength(0);
  });

  it('caps on GROSS out even when in/out net to zero (gross-vs-net regression)', () => {
    const blnd = token(contractId('blnd'), 'BLND');
    const usdc = token(contractId('usdc'), 'USDC');
    // Claim BLND in, swap the same BLND out (nets to 0), receive USDC.
    const tx = makeTx({
      calls: [call(contractId('pool'), 'claim'), call(contractId('router'), 'swap')],
      flows: [flow(blnd, 'in', 12345n), flow(blnd, 'out', 12345n), flow(usdc, 'in', 4938n)],
    });

    const spec = synthesize(tx, { ...DEFAULT_SYNTH_CONFIG, capMultiplier: 1 }, NOW);
    const policies = spendPolicies(spec.policies);

    // BLND gets a cap on its gross out; USDC (inflow-only) does not.
    expect(policies).toHaveLength(1);
    expect(policies[0]?.asset.symbol).toBe('BLND');
    expect(policies[0]?.observedGrossOut).toBe(12345n);
    expect(policies[0]?.cap).toBe(12345n);
  });
});

describe('synthesize — frequency and warnings', () => {
  it('always emits a frequency-limit policy from config', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(
      tx,
      { ...DEFAULT_SYNTH_CONFIG, frequencyWindowSecs: 600, frequencyMaxCalls: 3 },
      NOW,
    );
    const freq = spec.policies.find((p) => p.kind === 'frequency-limit');
    expect(freq).toEqual({ kind: 'frequency-limit', windowSecs: 600, maxCalls: 3 });
  });

  it('warns when the policy count exceeds the OZ max (5)', () => {
    // Six distinct outflow assets -> 6 spend policies + 1 frequency = 7 > 5.
    const flows = Array.from({ length: 6 }, (_, i) =>
      flow(token(contractId(`asset${i}`), `A${i}`), 'out', 100n),
    );
    const tx = makeTx({ calls: [call(contractId('router'), 'swap')], flows });

    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(spec.policies.length).toBeGreaterThan(5);
    expect(spec.warnings.some((w) => w.includes('at most 5'))).toBe(true);
  });

  it('does not warn at or below the policy cap', () => {
    const tx = makeTx({
      calls: [call(contractId('router'), 'swap')],
      flows: [flow(token(contractId('blnd'), 'BLND'), 'out', 1n)],
    });
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);
    expect(spec.policies.length).toBeLessThanOrEqual(5);
    expect(spec.warnings).toHaveLength(0);
  });
});

describe('synthesize — validation', () => {
  it('rejects an empty recording', () => {
    expect(() => synthesize(makeTx(), DEFAULT_SYNTH_CONFIG, NOW)).toThrow(SynthError);
  });

  it('rejects a non-integer now', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'claim')] });
    expect(() => synthesize(tx, DEFAULT_SYNTH_CONFIG, 1.5)).toThrow(SynthError);
  });

  it.each<[string, Partial<SynthConfig>]>([
    ['lifetimeSecs <= 0', { lifetimeSecs: 0 }],
    ['fractional spendWindowSecs', { spendWindowSecs: 1.5 }],
    ['frequencyMaxCalls <= 0', { frequencyMaxCalls: 0 }],
    ['capMultiplier <= 0', { capMultiplier: 0 }],
    ['non-finite capMultiplier', { capMultiplier: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_label, override) => {
    expect(() => validateConfig({ ...DEFAULT_SYNTH_CONFIG, ...override })).toThrow(SynthError);
  });
});

describe('synthesize — integration with the bundled fixture', () => {
  it('produces the expected scope and BLND-only spend cap', () => {
    const tx = loadFixture();
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? NOW);

    expect(spec.contextRule.scopedCalls.map((s) => s.fnName)).toEqual([
      'claim',
      'swap_exact_tokens_for_tokens',
    ]);
    const policies = spendPolicies(spec.policies);
    expect(policies).toHaveLength(1);
    expect(policies[0]?.asset.symbol).toBe('BLND');
  });
});
