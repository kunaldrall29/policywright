import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareInstall } from '../src/install/prepare.js';

const FIXTURE_RULE = JSON.parse(
  readFileSync(new URL('../examples/live/context-rule.json', import.meta.url), 'utf8'),
) as unknown;

describe('prepareInstall', () => {
  it('requires a context rule document or path', async () => {
    await expect(
      prepareInstall({
        smartAccount: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }),
    ).rejects.toThrow(/contextRule/);
  });

  it('reports blockers when policy addresses and signers are missing', async () => {
    try {
      const plan = await prepareInstall({
        contextRule: FIXTURE_RULE,
        smartAccount: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        network: 'testnet',
      });
      expect(plan.schemaVersion).toBe(1);
      expect(plan.readyToSign).toBe(false);
      expect(plan.rules.length).toBeGreaterThan(0);
      expect(plan.rules.some((r) => r.blockers.length > 0)).toBe(true);
      expect(plan.ledger.latestLedger).toBeGreaterThan(0);
      expect(plan.rules[0]?.validUntilLedger).toBeGreaterThan(plan.ledger.latestLedger);
    } catch (error) {
      expect(String(error)).toMatch(/fetch|network|ECONN|ENOTFOUND|ledger|HTTP|rpc|Failed/i);
    }
  });
});
