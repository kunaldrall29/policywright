/**
 * Recorder tests: every decoder runs against the COMMITTED raw captures under
 * examples/live/ (real testnet transactions, raw-preserved by
 * scripts/capture.ts — see docs/FACTS.md §3), asserting the exact expected
 * RecordedTx. No test here touches the network: token metadata resolution is
 * stubbed, and all XDR comes from the capture files or is built in-memory.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Address, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import {
  assembleRecording,
  decodeMovementEvent,
  decodeTx,
  decodedTxInputFromCapture,
  fallbackToken,
  type TokenResolver,
} from '../src/sources/decode.js';
import { RecorderError } from '../src/sources/errors.js';
import { recordFromHashes, validateAccount, validateHash } from '../src/sources/rpc.js';
import { ingestSimulation } from '../src/sources/simulation.js';
import { loadFixture } from '../src/sources/fixture.js';
import type { RecordedTx, TokenRef } from '../src/types.js';

// ---------------------------------------------------------------------------
// Committed captures (real testnet transactions; see FACTS.md §3.1)
// ---------------------------------------------------------------------------

const CLAIM_HASH = 'acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452';
const SWAP_HASH = '2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b';
const FEEBUMP_HASH = 'c857cacab895d1a88ff07dc56c706c60ea1d074f6a58a35c4352694f917aa09d';

// Addresses observed in the captures (FACTS.md §3.3–3.5).
const ROUTER = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD';
const XLM_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const SWAP_TOKEN = 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F';
const PAIR = 'CDVAIOYHCD4RUSLQNVFI7RIZBFT2JZMJWM4RTOLQZQXL4QAVXU5RFKDB';
const SMART_WALLET = 'CCW6R5ZKEIJJ75YT54TEHMRUYTP4XQGUI6H63EE3W65H4P4FAUICXP3Q';
const SWAP_SOURCE = 'GBMMOZMKOYUKV634RADGFVJ2SWIZTYB5KXUWRL3UETSPSICOFW7NKETO';
const HARVEST_WRAPPER = 'CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357';
const CLAIMER = 'GCH2MMBNWHJZUA3ZI5BTFDTJZQWALDOCRYXCT4S7MSN6RUXXA34E7B5G';
const PERPS_WALLET = 'CB6HZ5DU3VKRXVVPG4DDMPQ3XX45QTIU4IL7BIEBVTNFDJVSD2GWUG7M';
const PERPS_USDC = 'CDA7SDCEQK2R6TTR655VNGEAONMNO3BSSRCFZDFNIJPADSMEKNEWRRBN';
const SIM_SOURCE = 'GABJUTWU2LMN7VYU7Z43GV2OY7HPL5RXXJAQUBYHYLW5KHTRJUVNNJ3Q';

function loadCapture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../examples/live/${name}.json`, import.meta.url), 'utf8'),
  );
}

/** Deterministic offline resolver: metadata derived from the contract id. */
const stubToken = (contractId: string): TokenRef => ({
  contractId,
  symbol: `T:${contractId.slice(1, 5)}`,
  decimals: 7,
  resolved: true,
});
const stubResolver: TokenResolver = (contractId) => Promise.resolve(stubToken(contractId));

// ---------------------------------------------------------------------------
// The real claim → swap sequence, merged (the D1.1 completion criterion)
// ---------------------------------------------------------------------------

describe('claim → swap sequence from committed captures', () => {
  const decodedClaim = decodeTx(decodedTxInputFromCapture(loadCapture(CLAIM_HASH)));
  const decodedSwap = decodeTx(decodedTxInputFromCapture(loadCapture(SWAP_HASH)));

  it('produces the exact expected merged RecordedTx', async () => {
    const recorded = await assembleRecording([decodedClaim, decodedSwap], {
      network: 'testnet',
      source: 'rpc',
      subject: SMART_WALLET,
      resolveToken: stubResolver,
    });

    const expected: RecordedTx = {
      // The swap closed first (ledger 3817770 < 3818886), so it leads the
      // sequence and provides the primary hash/ledger/timestamp.
      hash: SWAP_HASH,
      network: 'testnet',
      source: 'rpc',
      ledger: 3817770,
      timestamp: 1785107316,
      subject: SMART_WALLET,
      calls: [
        {
          contract: ROUTER,
          fnName: 'swap_exact_tokens_for_tokens',
          args: [10000000n, 293170n, [XLM_SAC, SWAP_TOKEN], SMART_WALLET, 1785107613n],
          sourceHash: SWAP_HASH,
          authorizations: [
            {
              contract: ROUTER,
              fnName: 'swap_exact_tokens_for_tokens',
              args: [10000000n, 293170n, [XLM_SAC, SWAP_TOKEN], SMART_WALLET, 1785107613n],
              subInvocations: [
                {
                  contract: XLM_SAC,
                  fnName: 'transfer',
                  args: [SMART_WALLET, PAIR, 10000000n],
                  subInvocations: [],
                },
              ],
            },
            {
              contract: SMART_WALLET,
              fnName: '__check_auth',
              args: [
                Buffer.from(
                  'daf0df5de450c59f2d49042d17eb7a14fa465073a4fc3ae08e0bbfec0cb3485a',
                  'hex',
                ),
              ],
              subInvocations: [],
            },
          ],
        },
        {
          contract: HARVEST_WRAPPER,
          fnName: 'harvest',
          args: [CLAIMER],
          sourceHash: CLAIM_HASH,
          authorizations: [
            { contract: HARVEST_WRAPPER, fnName: 'harvest', args: [CLAIMER], subInvocations: [] },
          ],
        },
      ],
      flows: [
        { asset: stubToken(XLM_SAC), direction: 'out', amount: 10000000n },
        { asset: stubToken(SWAP_TOKEN), direction: 'in', amount: 308600n },
      ],
      warnings: [],
    };

    expect(recorded).toEqual(expected);
  });

  it('orders by ledger close time regardless of input order', async () => {
    const recorded = await assembleRecording([decodedClaim, decodedSwap], {
      network: 'testnet',
      source: 'rpc',
      subject: SMART_WALLET,
      resolveToken: stubResolver,
    });
    const reversed = await assembleRecording([decodedSwap, decodedClaim], {
      network: 'testnet',
      source: 'rpc',
      subject: SMART_WALLET,
      resolveToken: stubResolver,
    });
    expect(reversed).toEqual(recorded);
  });

  it('attributes no flows to the claimer G-account (the claim moved 0 tokens)', async () => {
    const recorded = await assembleRecording([decodedClaim, decodedSwap], {
      network: 'testnet',
      source: 'rpc',
      subject: CLAIMER,
      resolveToken: stubResolver,
    });
    expect(recorded.flows).toEqual([]);
  });

  it('defaults the subject to the first tx source account, with a warning', async () => {
    const recorded = await assembleRecording([decodedSwap], {
      network: 'testnet',
      source: 'rpc',
      resolveToken: stubResolver,
    });
    expect(recorded.subject).toBe(SWAP_SOURCE);
    // The envelope source is NOT the economic actor here (FACTS §3.3): the
    // warning must record the assumption, and no transfer touches the source.
    expect(recorded.warnings.some((w) => w.includes(SWAP_SOURCE))).toBe(true);
    expect(recorded.flows).toEqual([]);
  });

  it('surfaces unresolved token metadata as a warning, never a sliced symbol', async () => {
    const recorded = await assembleRecording([decodedSwap], {
      network: 'testnet',
      source: 'rpc',
      subject: SMART_WALLET,
      resolveToken: (id) => Promise.resolve(fallbackToken(id)),
    });
    for (const flow of recorded.flows) {
      expect(flow.asset.resolved).toBe(false);
      expect(flow.asset.symbol).toBe(flow.asset.contractId); // full id, no slice
    }
    expect(recorded.warnings.some((w) => w.includes('could not be resolved'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fee-bump envelope + burn movement (capture c857…)
// ---------------------------------------------------------------------------

describe('fee-bump capture (c857…)', () => {
  const decoded = decodeTx(decodedTxInputFromCapture(loadCapture(FEEBUMP_HASH)));

  it('decodes the inner v1 transaction of a fee-bump envelope', () => {
    expect(decoded.hash).toBe(FEEBUMP_HASH);
    expect(decoded.invocations).toHaveLength(1);
    expect(decoded.invocations[0]?.fnName).toBe('create_and_try_fill_with_fee');
  });

  it('decodes the nested authorization tree (approve/approve/create_order→transfer)', () => {
    const root = decoded.invocations[0]?.authorizations[0];
    expect(root?.fnName).toBe('create_and_try_fill_with_fee');
    expect(root?.subInvocations.map((s) => s.fnName)).toEqual([
      'approve',
      'approve',
      'create_order',
    ]);
    expect(root?.subInvocations[2]?.subInvocations.map((s) => s.fnName)).toEqual(['transfer']);
  });

  it('counts the SAC burn as an outflow and aggregates it with the transfer', async () => {
    // Raw events: burn 490 (ev[1]) + transfer 1_000_000 (ev[4]), both leaving
    // the perps wallet in USDC — one aggregated outflow of 1_000_490.
    expect(decoded.movements).toEqual([
      { tokenContractId: PERPS_USDC, from: PERPS_WALLET, to: null, amount: 490n },
      {
        tokenContractId: PERPS_USDC,
        from: PERPS_WALLET,
        to: 'CCBD4XHNU2W6FTBZMEQSYPYUTXZNKMYV2HFWGPIWLSEP7GT5HAEI54S3',
        amount: 1000000n,
      },
    ]);
    const recorded = await assembleRecording([decoded], {
      network: 'testnet',
      source: 'rpc',
      subject: PERPS_WALLET,
      resolveToken: stubResolver,
    });
    expect(recorded.flows).toEqual([
      { asset: stubToken(PERPS_USDC), direction: 'out', amount: 1000490n },
    ]);
    expect(recorded.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Movement-event decoding: shapes the captures cannot exercise (CAP-67)
// ---------------------------------------------------------------------------

function makeEvent(contractId: string, topics: xdr.ScVal[], data: xdr.ScVal): xdr.ContractEvent {
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    // The generated typings declare `ContractId` (an Opaque alias) where the
    // runtime accepts the raw 32-byte Buffer; verified by XDR round-trip.
    contractId: StrKey.decodeContract(contractId) as unknown as xdr.ContractId,
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({ topics, data })),
  });
}

const sym = (s: string): xdr.ScVal => nativeToScVal(s, { type: 'symbol' });
const addr = (a: string): xdr.ScVal => new Address(a).toScVal();
const i128 = (n: bigint): xdr.ScVal => nativeToScVal(n, { type: 'i128' });

describe('movement-event decoding (CAP-67 shapes)', () => {
  it('accepts the muxed transfer map data {amount, to_muxed_id}', () => {
    const warnings: string[] = [];
    const event = makeEvent(
      XLM_SAC,
      [
        sym('transfer'),
        addr(SIM_SOURCE),
        addr(SMART_WALLET),
        nativeToScVal('native', { type: 'string' }),
      ],
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: sym('amount'), val: i128(123456n) }),
        new xdr.ScMapEntry({ key: sym('to_muxed_id'), val: nativeToScVal(7n, { type: 'u64' }) }),
      ]),
    );
    expect(decodeMovementEvent(event, 'test', warnings)).toEqual({
      tokenContractId: XLM_SAC,
      from: SIM_SOURCE,
      to: SMART_WALLET,
      amount: 123456n,
    });
    expect(warnings).toEqual([]);
  });

  it('decodes a CAP-67 SAC mint as an inflow to the `to` topic', () => {
    const warnings: string[] = [];
    const event = makeEvent(
      XLM_SAC,
      [sym('mint'), addr(SMART_WALLET), nativeToScVal('native', { type: 'string' })],
      i128(500n),
    );
    expect(decodeMovementEvent(event, 'test', warnings)).toEqual({
      tokenContractId: XLM_SAC,
      from: null,
      to: SMART_WALLET,
      amount: 500n,
    });
    expect(warnings).toEqual([]);
  });

  it('warns (never silently skips) on a movement event with undecodable data', () => {
    const warnings: string[] = [];
    const event = makeEvent(
      XLM_SAC,
      [sym('transfer'), addr(SIM_SOURCE), addr(SMART_WALLET)],
      nativeToScVal('junk', { type: 'string' }),
    );
    expect(decodeMovementEvent(event, 'test', warnings)).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('movement not counted');
  });

  it('warns on a non-SAC mint layout instead of guessing the topic order', () => {
    const warnings: string[] = [];
    // Hypothetical legacy token form [mint, admin, to] — both address topics.
    const event = makeEvent(XLM_SAC, [sym('mint'), addr(SIM_SOURCE), addr(SMART_WALLET)], i128(5n));
    expect(decodeMovementEvent(event, 'test', warnings)).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('CAP-67');
  });

  it('ignores non-movement events entirely (pair sync/swap, fee_collected)', () => {
    const warnings: string[] = [];
    const event = makeEvent(
      PAIR,
      [nativeToScVal('SoroswapPair', { type: 'string' }), sym('sync')],
      xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: sym('new_reserve_0'), val: i128(1n) })]),
    );
    expect(decodeMovementEvent(event, 'test', warnings)).toBeNull();
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Simulated-path ingestion (committed simulateTransaction capture)
// ---------------------------------------------------------------------------

describe('simulation ingestion (committed simulated-soroswap-swap.json)', () => {
  const doc = loadCapture('simulated-soroswap-swap');

  it('normalises the saved simulation into the exact expected RecordedTx', async () => {
    const recorded = await ingestSimulation(doc, {
      network: 'testnet',
      account: SIM_SOURCE,
      resolveToken: stubResolver,
    });

    const expected: RecordedTx = {
      hash: null,
      network: 'testnet',
      source: 'simulation',
      ledger: 3935941, // the simulation's snapshot ledger (latestLedger)
      timestamp: null,
      subject: SIM_SOURCE,
      calls: [
        {
          contract: ROUTER,
          fnName: 'swap_exact_tokens_for_tokens',
          args: [10000000n, 1n, [XLM_SAC, SWAP_TOKEN], SIM_SOURCE, 1785700335n],
          sourceHash: null,
          authorizations: [
            {
              contract: ROUTER,
              fnName: 'swap_exact_tokens_for_tokens',
              args: [10000000n, 1n, [XLM_SAC, SWAP_TOKEN], SIM_SOURCE, 1785700335n],
              subInvocations: [
                {
                  contract: XLM_SAC,
                  fnName: 'transfer',
                  args: [SIM_SOURCE, PAIR, 10000000n],
                  subInvocations: [],
                },
              ],
            },
          ],
        },
      ],
      flows: [
        { asset: stubToken(XLM_SAC), direction: 'out', amount: 10000000n },
        { asset: stubToken(SWAP_TOKEN), direction: 'in', amount: 316046n },
      ],
      warnings: [],
    };

    expect(recorded).toEqual(expected);
  });

  it('rejects a simulation document without an envelope', async () => {
    const result = (doc as { response: { result: unknown } }).response.result;
    await expect(
      ingestSimulation(
        { response: { result } },
        { network: 'testnet', resolveToken: stubResolver },
      ),
    ).rejects.toMatchObject({ name: 'RecorderError', code: 'BAD_INPUT' });
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

describe('error taxonomy', () => {
  it('BAD_INPUT: malformed hash', () => {
    expect(() => validateHash('not-a-hash')).toThrowError(RecorderError);
    try {
      validateHash('abc');
    } catch (error) {
      expect((error as RecorderError).code).toBe('BAD_INPUT');
    }
  });

  it('BAD_INPUT: malformed account', () => {
    try {
      validateAccount('XBADACCOUNT');
      expect.unreachable();
    } catch (error) {
      expect((error as RecorderError).code).toBe('BAD_INPUT');
    }
  });

  it('BAD_INPUT: duplicate hashes (checked before any network access)', async () => {
    await expect(
      recordFromHashes([SWAP_HASH, SWAP_HASH], { network: 'testnet' }),
    ).rejects.toMatchObject({ name: 'RecorderError', code: 'BAD_INPUT' });
  });

  it('BAD_INPUT: capture with a non-SUCCESS status', () => {
    try {
      decodedTxInputFromCapture({ response: { result: { status: 'NOT_FOUND' } } });
      expect.unreachable();
    } catch (error) {
      expect((error as RecorderError).code).toBe('BAD_INPUT');
    }
  });

  it('DECODE_FAILED: envelope that is not valid XDR, naming the section', () => {
    try {
      decodedTxInputFromCapture({
        response: {
          result: { status: 'SUCCESS', txHash: SWAP_HASH, envelopeXdr: 'AAAA-not-xdr' },
        },
      });
      expect.unreachable();
    } catch (error) {
      expect((error as RecorderError).code).toBe('DECODE_FAILED');
      expect((error as RecorderError).section).toBe('TransactionEnvelope');
    }
  });

  it('BAD_INPUT: a saved simulation that itself failed', async () => {
    await expect(
      ingestSimulation(
        { transaction: 'AAAA', result: { latestLedger: 1, error: 'host function failed' } },
        { network: 'testnet', resolveToken: stubResolver },
      ),
    ).rejects.toMatchObject({ name: 'RecorderError', code: 'BAD_INPUT' });
  });
});

// ---------------------------------------------------------------------------
// The deterministic fixture path stays intact
// ---------------------------------------------------------------------------

describe('fixture path (unchanged behaviour)', () => {
  it('loads with the new fields defaulted from the document', () => {
    const tx = loadFixture();
    expect(tx.source).toBe('fixture');
    expect(tx.subject).toBe('CABJN4UUYDTF6C2G3WQJCWLG4KNQS2EVLCORKPWMIMSKYPU3FVNFCBS2');
    expect(tx.warnings).toEqual([]);
    for (const call of tx.calls) {
      expect(call.sourceHash).toBe(tx.hash);
      expect(call.authorizations).toEqual([]);
    }
  });
});
