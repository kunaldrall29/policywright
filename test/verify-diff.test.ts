/**
 * Network-free unit tests for the shared on-chain verify / diff library.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RecorderError } from '../src/sources/errors.js';
import {
  diffEmittedVsOnChain,
  parseEmittedContextRule,
  parseOnChainSnapshot,
  verifyAgainstSnapshot,
} from '../src/verify/diff.js';

const LIVE_CONTEXT_RULE = 'examples/live/context-rule.json';
const MATCH_SNAPSHOT = 'fixtures/verify/on-chain-snapshot-match.json';
const MISMATCH_SNAPSHOT = 'fixtures/verify/on-chain-snapshot-mismatch.json';
const FIXTURE_CONTEXT_RULE = 'examples/context-rule.json';
const FIXTURE_MATCH = 'fixtures/verify/on-chain-snapshot-fixture-match.json';

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('verify/diff (on-chain vs emitted)', () => {
  it('passes when the fixture snapshot matches the live emitted context-rule', () => {
    const result = verifyAgainstSnapshot({
      emitted: loadJson(LIVE_CONTEXT_RULE),
      snapshot: loadJson(MATCH_SNAPSHOT),
    });
    expect(result.ok).toBe(true);
    expect(result.diffs).toEqual([]);
    expect(result.matchedRules).toBe(3);
    expect(result.expectedRuleCount).toBe(3);
    expect(result.actualRuleCount).toBe(3);
  });

  it('fails with a spending_limit installParams diff on the mismatch fixture', () => {
    const result = verifyAgainstSnapshot({
      emitted: loadJson(LIVE_CONTEXT_RULE),
      snapshot: loadJson(MISMATCH_SNAPSHOT),
    });
    expect(result.ok).toBe(false);
    expect(result.diffs.length).toBeGreaterThan(0);
    const paramsDiff = result.diffs.find((d) => d.path.includes('installParams'));
    expect(paramsDiff).toBeDefined();
    expect(paramsDiff?.message).toMatch(/install params mismatch/i);
  });

  it('passes for the offline fixture context-rule + matching snapshot', () => {
    const emitted = parseEmittedContextRule(loadJson(FIXTURE_CONTEXT_RULE));
    const snapshot = parseOnChainSnapshot(loadJson(FIXTURE_MATCH));
    const result = diffEmittedVsOnChain(emitted, snapshot);
    expect(result.ok).toBe(true);
    expect(result.matchedRules).toBe(emitted.contextRules.length);
  });

  it('rejects unsupported schema versions with BAD_INPUT', () => {
    expect(() => parseEmittedContextRule({ schemaVersion: 999, contextRules: [] })).toThrow(
      RecorderError,
    );
    expect(() =>
      parseOnChainSnapshot({
        schemaVersion: 999,
        smartAccount: 'C' + 'A'.repeat(55),
        network: 'testnet',
        ledger: 1,
        contextRules: [],
        source: 'fixture',
      }),
    ).toThrow(RecorderError);
  });

  it('reports a missing on-chain rule when a contract is absent', () => {
    const emitted = parseEmittedContextRule(loadJson(FIXTURE_CONTEXT_RULE));
    const snapshot = parseOnChainSnapshot({
      schemaVersion: 1,
      smartAccount: 'CABJN4UUYDTF6C2G3WQJCWLG4KNQS2EVLCORKPWMIMSKYPU3FVNFCBS2',
      network: 'testnet',
      ledger: 1,
      contextRules: [],
      source: 'fixture',
    });
    const result = diffEmittedVsOnChain(emitted, snapshot);
    expect(result.ok).toBe(false);
    expect(result.diffs.some((d) => /not found on-chain/.test(d.message))).toBe(true);
  });
});
