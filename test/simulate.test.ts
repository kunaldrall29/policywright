import { describe, expect, it } from 'vitest';
import { buildScenarios, renderReport, simulateCall } from '../src/simulate.js';
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
});
