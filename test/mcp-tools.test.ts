import { describe, expect, it } from 'vitest';
import { toolSimulate, toolSynthesize, toolVerify } from '../src/mcp/tools.js';

describe('MCP tool handlers (offline)', () => {
  it('synthesize returns context-rule + UNAUDITED rust from the fixture', () => {
    const result = toolSynthesize({}) as {
      summary: string;
      contextRule: { contextRules: unknown[] };
      rustPolicy: string;
    };
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.contextRule.contextRules.length).toBeGreaterThan(0);
    expect(result.rustPolicy).toMatch(/UNAUDITED|ILLUSTRATIVE/);
  });

  it('simulate flags unobserved routes when constrainArguments is off', () => {
    const result = toolSimulate({ constrainArguments: false }) as {
      results: { label: string; decision: string }[];
    };
    const route = result.results.find((r) => /unobserved/i.test(r.label));
    expect(route?.decision).toBe('flag');
  });

  it('simulate denies unobserved routes when constrainArguments is on', () => {
    const result = toolSimulate({ constrainArguments: true }) as {
      results: { label: string; decision: string }[];
    };
    const route = result.results.find((r) => /unobserved/i.test(r.label));
    expect(route?.decision).toBe('deny');
  });

  it('verify passes against the fixture', () => {
    const result = toolVerify({}) as { ok: boolean; failures: string[] };
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });
});
