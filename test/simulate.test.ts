import { describe, expect, it } from 'vitest';
import {
  buildScenarios,
  FACTS_BLND,
  FACTS_XLM_NATIVE,
  renderReport,
  simulateCall,
} from '../src/simulate.js';
import { loadRecordedTx } from '../src/sources/recorded.js';
import { synthesize } from '../src/synthesizer.js';
import {
  DEFAULT_SYNTH_CONFIG,
  type CandidateCall,
  type SimulationResult,
  type SmartAccountSpec,
} from '../src/types.js';
import { call, contractId, flow, makeTx, token } from './helpers.js';

const NOW = 1_000_000;
const ROUTER = contractId('router');
const BLND = token(contractId('blnd'), 'BLND');

/** A spec scoped to a single swap call with a BLND cap of 1100 and freq max 5. */
function buildSpec(): SmartAccountSpec {
  const tx = makeTx({
    calls: [call(ROUTER, 'swap_exact_tokens_for_tokens')],
    flows: [flow(BLND, 'out', 1000n)],
  });
  return synthesize(tx, { ...DEFAULT_SYNTH_CONFIG, capMultiplier: 1.1 }, NOW);
}

function candidate(partial: Partial<CandidateCall> = {}): CandidateCall {
  return {
    label: 'candidate',
    contract: ROUTER,
    fnName: 'swap_exact_tokens_for_tokens',
    args: [],
    outflows: [],
    timestamp: NOW + 60,
    priorCallTimestamps: [],
    ...partial,
  };
}

describe('simulateCall', () => {
  const spec = buildSpec();

  it('permits the recorded flow (in scope, under caps, valid)', () => {
    const result = simulateCall(spec, candidate({ outflows: [flow(BLND, 'out', 1000n)] }));
    expect(result.decision).toBe('permit');
    expect(result.reasonCode).toBe('permit');
  });

  it('denies an outflow over the spend cap', () => {
    const result = simulateCall(spec, candidate({ outflows: [flow(BLND, 'out', 5000n)] }));
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('spending-limit');
  });

  it('denies a call to an unscoped function', () => {
    const result = simulateCall(spec, candidate({ fnName: 'set_admin' }));
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('scope');
  });

  it('denies a call to an unscoped contract', () => {
    const result = simulateCall(spec, candidate({ contract: contractId('other') }));
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('scope');
  });

  it('denies a call after the rule expires (lifetime)', () => {
    const result = simulateCall(spec, candidate({ timestamp: spec.contextRule.validUntil + 1 }));
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('lifetime');
  });

  it('denies a call that exceeds the frequency limit', () => {
    const prior = Array.from({ length: 5 }, (_, i) => NOW - (i + 1));
    const result = simulateCall(spec, candidate({ timestamp: NOW, priorCallTimestamps: prior }));
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('frequency-limit');
  });

  it('ignores prior calls that fall outside the frequency window', () => {
    const window = spec.config.frequencyWindowSecs;
    // Five prior calls, all older than the window -> they should not count.
    const prior = Array.from({ length: 5 }, (_, i) => NOW - window - (i + 1));
    const result = simulateCall(spec, candidate({ timestamp: NOW, priorCallTimestamps: prior }));
    expect(result.decision).toBe('permit');
  });

  it('does not cap an outflow of an asset that has no spend policy', () => {
    const usdc = token(contractId('usdc'), 'USDC');
    const result = simulateCall(spec, candidate({ outflows: [flow(usdc, 'out', 10n ** 18n)] }));
    expect(result.decision).toBe('permit');
  });
});

describe('buildScenarios', () => {
  const spec = buildSpec();
  const tx = makeTx({
    calls: [call(ROUTER, 'swap_exact_tokens_for_tokens')],
    flows: [flow(BLND, 'out', 1000n)],
  });

  it('produces scenarios that each behave as expected', () => {
    const scenarios = buildScenarios(spec, tx);
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
    for (const scenario of scenarios) {
      const result = simulateCall(spec, scenario.candidate);
      expect(result.decision).toBe(scenario.expectedDecision);
      expect(result.reasonCode).toBe(scenario.expectedReasonCode);
    }
  });

  it('throws when the context rule has no scoped calls', () => {
    const emptySpec: SmartAccountSpec = {
      ...spec,
      contextRule: { ...spec.contextRule, scopedCalls: [] },
    };
    expect(() => buildScenarios(emptySpec, tx)).toThrow();
  });
});

describe('simulateCall — argument scopes', () => {
  const USDC = token(contractId('usdc'), 'USDC');
  const XLM = contractId('xlm');
  const swapTx = makeTx({
    calls: [
      call(ROUTER, 'swap_exact_tokens_for_tokens', [
        1000n,
        900n,
        [BLND.contractId, USDC.contractId],
        ROUTER,
        9_999n,
      ]),
    ],
    flows: [flow(BLND, 'out', 1000n)],
  });

  function specWith(constrainArguments: boolean): SmartAccountSpec {
    return synthesize(swapTx, { ...DEFAULT_SYNTH_CONFIG, constrainArguments }, NOW);
  }

  const observedPath = [BLND.contractId, USDC.contractId];
  const unobservedPath = [BLND.contractId, XLM];
  const blndXlmPath = [FACTS_BLND, FACTS_XLM_NATIVE];

  it('denies an unobserved route when constrainArguments is enabled', () => {
    const result = simulateCall(
      specWith(true),
      candidate({ args: [1000n, 900n, unobservedPath, ROUTER, 9_999n] }),
    );
    expect(result.decision).toBe('deny');
    expect(result.reasonCode).toBe('argument-constraint');
  });

  it('flags (does not deny) an unobserved route when constrainArguments is disabled', () => {
    const result = simulateCall(
      specWith(false),
      candidate({ args: [1000n, 900n, unobservedPath, ROUTER, 9_999n] }),
    );
    expect(result.decision).toBe('flag');
    expect(result.reasonCode).toBe('argument-constraint');
  });

  it('permits the observed route in both modes', () => {
    for (const enforce of [true, false]) {
      const result = simulateCall(
        specWith(enforce),
        candidate({ args: [1000n, 900n, observedPath, ROUTER, 9_999n] }),
      );
      expect(result.decision).toBe('permit');
    }
  });

  it('criterion BLND→XLM: flags when off, denies when on, and names the path constraint', () => {
    const off = simulateCall(
      specWith(false),
      candidate({ args: [1000n, 900n, blndXlmPath, ROUTER, 9_999n] }),
    );
    expect(off.decision).toBe('flag');
    expect(off.reasonCode).toBe('argument-constraint');
    expect(off.reason).toContain('path');
    expect(off.reason).toContain(FACTS_BLND);
    expect(off.reason).toMatch(/not enforced \(constrainArguments is off\)/);

    const on = simulateCall(
      specWith(true),
      candidate({ args: [1000n, 900n, blndXlmPath, ROUTER, 9_999n] }),
    );
    expect(on.decision).toBe('deny');
    expect(on.reasonCode).toBe('argument-constraint');
    expect(on.reason).toContain('path');
    expect(on.reason).toContain(FACTS_BLND);
    expect(on.reason).toMatch(/routes through unobserved token/);
    expect(on.reason).not.toMatch(/constrainArguments is off/);
  });
});

describe('buildScenarios — BLND→XLM criterion', () => {
  const USDC = token(contractId('usdc'), 'USDC');
  const swapTx = makeTx({
    calls: [
      call(ROUTER, 'swap_exact_tokens_for_tokens', [
        1000n,
        900n,
        [BLND.contractId, USDC.contractId],
        ROUTER,
        9_999n,
      ]),
    ],
    flows: [flow(BLND, 'out', 1000n)],
  });

  it('includes a labeled BLND→XLM scenario with real FACTS contract IDs', () => {
    for (const enforce of [false, true]) {
      const spec = synthesize(
        swapTx,
        { ...DEFAULT_SYNTH_CONFIG, constrainArguments: enforce },
        NOW,
      );
      const scenarios = buildScenarios(spec, swapTx);
      const criterion = scenarios.find((s) => s.candidate.label === 'BLND→XLM (unobserved route)');
      expect(criterion).toBeDefined();
      expect(criterion?.expectedDecision).toBe(enforce ? 'deny' : 'flag');
      expect(criterion?.expectedReasonCode).toBe('argument-constraint');
      const pathArg = criterion?.candidate.args.find((a) => Array.isArray(a));
      expect(pathArg).toEqual([FACTS_BLND, FACTS_XLM_NATIVE]);
      const result = simulateCall(spec, criterion!.candidate);
      expect(result.decision).toBe(criterion!.expectedDecision);
    }
  });
});

describe('argument scope on the live claim→swap recording', () => {
  const LIVE = 'examples/live/recorded-claim-swap.json';
  const LIVE_XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
  const LIVE_USDC = 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F';

  it('derives path allow-set from the real XLM(native)→USDC swap', () => {
    const tx = loadRecordedTx(LIVE);
    const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, tx.timestamp ?? 0);
    expect(spec.argumentScopes).toHaveLength(1);
    const [scope] = spec.argumentScopes;
    expect(scope?.argName).toBe('path');
    expect(scope?.argIndex).toBe(2);
    expect(scope?.allowedTokens).toEqual([LIVE_XLM, LIVE_USDC]);
    expect(scope?.allowedTokens).not.toContain(FACTS_BLND);
  });

  it('dry-run: original permits; BLND→XLM flags off / denies on', () => {
    const tx = loadRecordedTx(LIVE);
    for (const enforce of [false, true]) {
      const spec = synthesize(
        tx,
        { ...DEFAULT_SYNTH_CONFIG, constrainArguments: enforce },
        tx.timestamp ?? 0,
      );
      const scenarios = buildScenarios(spec, tx);
      const replay = scenarios.find((s) => s.candidate.label === 'replay recorded flow');
      const criterion = scenarios.find((s) => s.candidate.label === 'BLND→XLM (unobserved route)');
      expect(replay).toBeDefined();
      expect(criterion).toBeDefined();
      expect(simulateCall(spec, replay!.candidate).decision).toBe('permit');
      const result = simulateCall(spec, criterion!.candidate);
      expect(result.decision).toBe(enforce ? 'deny' : 'flag');
      expect(result.reasonCode).toBe('argument-constraint');
      expect(result.reason).toContain(FACTS_BLND);
    }
  });
});

describe('renderReport', () => {
  it('renders a Markdown table with an icon per decision', () => {
    const results: SimulationResult[] = [
      { label: 'ok', decision: 'permit', reasonCode: 'permit', reason: 'fine' },
      { label: 'bad', decision: 'deny', reasonCode: 'scope', reason: 'out of scope' },
      { label: 'odd', decision: 'flag', reasonCode: 'argument-constraint', reason: 'unseen route' },
    ];
    const report = renderReport(results);
    expect(report).toContain('| Scenario | Decision | Reason |');
    expect(report).toContain('✅ permit');
    expect(report).toContain('⛔ deny');
    expect(report).toContain('⚠️ flag');
    expect(report).toContain('out of scope');
  });

  it('renders deny-reason text for argument constraints and optional meta', () => {
    const results: SimulationResult[] = [
      {
        label: 'BLND→XLM (unobserved route)',
        decision: 'deny',
        reasonCode: 'argument-constraint',
        reason: `swap_exact_tokens_for_tokens path routes through unobserved token(s) ${FACTS_BLND}`,
      },
    ];
    const report = renderReport(results, {
      source: 'examples/live/recorded-claim-swap.json',
      constrainArguments: true,
    });
    expect(report).toContain('examples/live/recorded-claim-swap.json');
    expect(report).toContain('constrainArguments: **on**');
    expect(report).toContain('⛔ deny (argument-constraint)');
    expect(report).toContain(FACTS_BLND);
    expect(report).toContain('path routes through unobserved token');
  });
});
