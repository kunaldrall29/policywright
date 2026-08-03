import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_HEADER, renderFrequencyLimitPolicy } from '../src/rust-policy.js';
import { DEFAULT_SYNTH_CONFIG, type FrequencyLimitPolicy } from '../src/types.js';

const freq = (windowSecs: number, maxCalls: number): FrequencyLimitPolicy => ({
  kind: 'frequency-limit',
  windowSecs,
  maxCalls,
});

describe('renderFrequencyLimitPolicy', () => {
  it('is byte-identical to the compiled crate source at the demo defaults', () => {
    const crate = readFileSync(
      new URL('../contracts/frequency-limit-policy/src/lib.rs', import.meta.url),
      'utf8',
    );
    const rendered = renderFrequencyLimitPolicy(
      freq(DEFAULT_SYNTH_CONFIG.frequencyWindowSecs, DEFAULT_SYNTH_CONFIG.frequencyMaxCalls),
    );
    expect(rendered).toBe(crate);
  });

  it('parameterises the synthesized defaults', () => {
    const rendered = renderFrequencyLimitPolicy(freq(600, 3));
    expect(rendered).toContain('pub const DEFAULT_WINDOW_SECS: u64 = 600;');
    expect(rendered).toContain('pub const DEFAULT_MAX_CALLS: u32 = 3;');
    expect(rendered).toContain('at most 3 call(s) per\n//! 600 second(s).');
  });

  it('keeps the unaudited banner verbatim at the top of the output', () => {
    expect(ILLUSTRATIVE_HEADER).toContain('ILLUSTRATIVE / UNAUDITED — NOT DEPLOY-READY');
    expect(ILLUSTRATIVE_HEADER).toContain(
      'Generated contracts are illustrative and unaudited — not for production\n' +
        '//  deployment until the Audit Bank audit.',
    );
    expect(renderFrequencyLimitPolicy(freq(1, 1)).startsWith(ILLUSTRATIVE_HEADER)).toBe(true);
  });

  it('implements the real OZ Policy trait surface (no can_enforce)', () => {
    const rendered = renderFrequencyLimitPolicy(freq(86400, 5));
    expect(rendered).toContain('impl Policy for FrequencyLimitPolicy');
    expect(rendered).toContain('type AccountParams = FrequencyLimitParams;');
    expect(rendered).toContain(
      'fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address)',
    );
    expect(rendered).toContain('AccountContext(Address, u32)');
    // The docs may explain there is no can_enforce hook; the code must not
    // define one.
    expect(rendered).not.toContain('fn can_enforce');
  });
});
