/**
 * D2.4: compose-first decision-boundary tests.
 *
 * Asserts the synthesizer partition:
 *   - stock-expressible spend caps → composed `stock:spending_limit`, never generated
 *   - frequency-style bounds → generated `custom:FrequencyLimitPolicy`
 *   - mixed recordings → both, correctly partitioned onto the right rules
 *
 * Uses the real live sequence plus focused fixtures.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildScenarios, renderComposeAndGenerateReport, simulateCall } from '../src/simulate.js';
import { loadRecordedTx } from '../src/sources/recorded.js';
import { synthesize } from '../src/synthesizer.js';
import {
  DEFAULT_SYNTH_CONFIG,
  type CustomFrequencyLimitBinding,
  type OzContextRule,
  type StockSpendingLimitBinding,
} from '../src/types.js';
import { auth, call, contractId, flow, makeTx, token } from './helpers.js';

const NOW = 1_000_000;
const LIVE_RECORDING = fileURLToPath(
  new URL('../examples/live/recorded-claim-swap.json', import.meta.url),
);
const LIVE_REPORT = fileURLToPath(
  new URL('../examples/live/simulation-report-compose-and-generate.md', import.meta.url),
);

const NATIVE = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const ROUTER = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD';
const HARVEST = 'CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357';

function ruleFor(rules: readonly OzContextRule[], contract: string): OzContextRule | undefined {
  return rules.find((r) => r.contextType.contract === contract);
}

function stockBindings(rule: OzContextRule | undefined): StockSpendingLimitBinding[] {
  return (rule?.policies ?? []).filter(
    (p): p is StockSpendingLimitBinding => p.policy === 'stock:spending_limit',
  );
}

function frequencyBindings(rule: OzContextRule | undefined): CustomFrequencyLimitBinding[] {
  return (rule?.policies ?? []).filter(
    (p): p is CustomFrequencyLimitBinding => p.policy === 'custom:FrequencyLimitPolicy',
  );
}

function allBindings(rules: readonly OzContextRule[]) {
  return rules.flatMap((r) => r.policies);
}

describe('compose-first boundary — stock-expressible → composed, never generated', () => {
  const subject = contractId('subject');
  const router = contractId('router');
  const blnd = contractId('blnd');
  const pair = contractId('pair');

  /** Subject-authorized direct transfer + observed outflow → stock can express the cap. */
  function expressibleTx() {
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
      flows: [flow(token(blnd, 'BLND'), 'out', 1000n)],
    });
  }

  it('binds the spend cap as stock:spending_limit on the token rule', () => {
    const spec = synthesize(expressibleTx(), DEFAULT_SYNTH_CONFIG, NOW);
    const [binding] = stockBindings(ruleFor(spec.ozContextRules, blnd));
    expect(binding?.policy).toBe('stock:spending_limit');
    expect(binding?.paramsSource).toContain('spending_limit.rs:88-94');
    expect(binding?.installParams.spending_limit).toBe(1100n);
  });

  it('never emits a custom/generated policy for a stock-expressible spend cap', () => {
    const spec = synthesize(expressibleTx(), DEFAULT_SYNTH_CONFIG, NOW);
    const customs = allBindings(spec.ozContextRules).filter(
      (p) => p.policy !== 'stock:spending_limit' && p.policy !== 'custom:FrequencyLimitPolicy',
    );
    expect(customs).toHaveLength(0);
    // No custom spending-shaped policy tag exists in the union — only stock + frequency.
    expect(
      allBindings(spec.ozContextRules).every(
        (p) => p.policy === 'stock:spending_limit' || p.policy === 'custom:FrequencyLimitPolicy',
      ),
    ).toBe(true);
  });

  it('records a DELTA (does not invent a generated spend policy) when stock cannot fire', () => {
    // Outflow without subject-authorized transfer: compose-first refuses to emit
    // rejectable spending_limit params and does not invent a custom spend contract.
    const tx = makeTx({
      subject,
      calls: [call(router, 'swap')],
      flows: [flow(token(blnd, 'BLND'), 'out', 1000n)],
    });
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);

    expect(
      allBindings(spec.ozContextRules).filter((p) => p.policy === 'stock:spending_limit'),
    ).toHaveLength(0);
    expect(spec.notes.some((n) => n.includes('DELTA') && n.includes('BLND'))).toBe(true);
    // Still no generated spend-cap policy — only frequency on the called contract.
    expect(
      allBindings(spec.ozContextRules).every((p) => p.policy === 'custom:FrequencyLimitPolicy'),
    ).toBe(true);
  });
});

describe('compose-first boundary — frequency-style → generated', () => {
  it('always binds FrequencyLimitPolicy as custom (no stock counterpart)', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'claim')] });
    const spec = synthesize(
      tx,
      { ...DEFAULT_SYNTH_CONFIG, frequencyWindowSecs: 600, frequencyMaxCalls: 3 },
      NOW,
    );

    const [binding] = frequencyBindings(spec.ozContextRules[0]);
    expect(binding?.policy).toBe('custom:FrequencyLimitPolicy');
    expect(binding?.installParams).toEqual({ window_secs: 600, max_calls: 3 });
    expect(binding?.paramsSource).toContain('contracts/frequency-limit-policy');
    expect(stockBindings(spec.ozContextRules[0])).toHaveLength(0);
  });

  it('keeps a frequency-limit PolicySpec for the offline dry-run', () => {
    const tx = makeTx({ calls: [call(contractId('pool'), 'harvest')] });
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, NOW);
    const freq = spec.policies.find((p) => p.kind === 'frequency-limit');
    expect(freq).toEqual({
      kind: 'frequency-limit',
      windowSecs: DEFAULT_SYNTH_CONFIG.frequencyWindowSecs,
      maxCalls: DEFAULT_SYNTH_CONFIG.frequencyMaxCalls,
    });
  });
});

describe('compose-first boundary — mixed → both, correctly partitioned', () => {
  const subject = contractId('subject');
  const router = contractId('router');
  const pool = contractId('pool');
  const blnd = contractId('blnd');
  const pair = contractId('pair');

  function mixedTx() {
    return makeTx({
      subject,
      calls: [
        call(pool, 'harvest'),
        call(
          router,
          'swap_exact_tokens_for_tokens',
          [],
          [
            auth(
              router,
              'swap_exact_tokens_for_tokens',
              [],
              [auth(blnd, 'transfer', [subject, pair, '500'])],
            ),
          ],
        ),
      ],
      flows: [flow(token(blnd, 'BLND'), 'out', 500n)],
    });
  }

  it('puts frequency on called-contract rules and spending_limit on the transfer token rule', () => {
    const spec = synthesize(mixedTx(), DEFAULT_SYNTH_CONFIG, NOW);

    const poolRule = ruleFor(spec.ozContextRules, pool);
    const routerRule = ruleFor(spec.ozContextRules, router);
    const tokenRule = ruleFor(spec.ozContextRules, blnd);

    expect(frequencyBindings(poolRule)).toHaveLength(1);
    expect(stockBindings(poolRule)).toHaveLength(0);

    expect(frequencyBindings(routerRule)).toHaveLength(1);
    expect(stockBindings(routerRule)).toHaveLength(0);

    expect(stockBindings(tokenRule)).toHaveLength(1);
    expect(stockBindings(tokenRule)[0]?.installParams.spending_limit).toBe(550n); // 500 * 1.1
    // Token rule is spending-only when it was added for the transfer (not a top-level call).
    expect(frequencyBindings(tokenRule)).toHaveLength(0);
  });
});

describe('compose-first boundary — live recorded sequence', () => {
  const tx = loadRecordedTx(LIVE_RECORDING);
  const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? NOW);

  it('partitions: frequency on router+harvest, spending_limit on native XLM transfer', () => {
    expect(frequencyBindings(ruleFor(spec.ozContextRules, ROUTER))).toHaveLength(1);
    expect(stockBindings(ruleFor(spec.ozContextRules, ROUTER))).toHaveLength(0);

    expect(frequencyBindings(ruleFor(spec.ozContextRules, HARVEST))).toHaveLength(1);
    expect(stockBindings(ruleFor(spec.ozContextRules, HARVEST))).toHaveLength(0);

    const native = ruleFor(spec.ozContextRules, NATIVE);
    expect(stockBindings(native)).toHaveLength(1);
    expect(stockBindings(native)[0]?.installParams).toEqual({
      spending_limit: 11_000_000n,
      period_ledgers: 17_280,
    });
    expect(frequencyBindings(native)).toHaveLength(0);
  });

  it('harness: permit original; deny over-cap (composed); deny repeat-within-window (generated)', () => {
    const scenarios = buildScenarios(spec, tx);
    const results = scenarios.map((s) => simulateCall(spec, s.candidate));
    const byLabel = new Map(results.map((r) => [r.label, r]));

    expect(byLabel.get('replay recorded flow')).toMatchObject({
      decision: 'permit',
      reasonCode: 'permit',
    });
    expect(byLabel.get('over the spend cap')).toMatchObject({
      decision: 'deny',
      reasonCode: 'spending-limit',
    });
    expect(byLabel.get('over the frequency limit')).toMatchObject({
      decision: 'deny',
      reasonCode: 'frequency-limit',
    });
  });

  it('committed compose+generate report matches a fresh harness render', () => {
    const scenarios = buildScenarios(spec, tx);
    const results = scenarios.map((s) => simulateCall(spec, s.candidate));
    const fresh = renderComposeAndGenerateReport(results, 'examples/live/recorded-claim-swap.json');
    const committed = readFileSync(LIVE_REPORT, 'utf8');
    expect(committed).toBe(fresh);
  });
});
