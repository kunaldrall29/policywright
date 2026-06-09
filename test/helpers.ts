/** Shared builders for constructing RecordedTx values in tests. */

import type { AssetFlow, RecordedTx, ScopedCall, TokenRef } from '../src/types.js';

/** A well-formed (length-correct) illustrative contract id for tests. */
export function contractId(seed: string): string {
  return `C${seed.toUpperCase().padEnd(55, 'A').slice(0, 55)}`;
}

export function token(id: string, symbol = 'TKN', decimals = 7): TokenRef {
  return { contractId: id, symbol, decimals, resolved: true };
}

export function flow(
  asset: TokenRef,
  direction: AssetFlow['direction'],
  amount: bigint,
): AssetFlow {
  return { asset, direction, amount };
}

export function call(contract: string, fnName: string, args: ScopedCall['args'] = []): ScopedCall {
  return { contract, fnName, args };
}

export function makeTx(partial: Partial<RecordedTx> = {}): RecordedTx {
  return {
    hash: 'a'.repeat(64),
    network: 'testnet',
    source: 'fixture',
    ledger: 1,
    timestamp: 1000,
    calls: [],
    flows: [],
    ...partial,
  };
}
