/**
 * Live RPC adapter: fetch a transaction by hash from a Soroban RPC node and
 * normalise it into a {@link RecordedTx}.
 *
 * This is the optional, on-demand counterpart to the offline fixture. The demo
 * and test suite never call it; `npm run record <hash>` does.
 *
 * Decoding assumptions (Soroban / Protocol 23, @stellar/stellar-sdk v15):
 *  - The transaction is a v1 (or fee-bump-wrapping-v1) envelope. v0 envelopes
 *    predate Soroban and carry no `InvokeHostFunction` operations.
 *  - Contract calls come from `InvokeHostFunction` operations whose host
 *    function is `InvokeContract`; we read the `InvokeContractArgs`
 *    (contract address, function name, args) and decode args with
 *    `scValToNative`.
 *  - Token movements are derived from SEP-41 / Stellar-Asset-Contract `transfer`
 *    contract events: `topics = [Symbol("transfer"), from: Address, to: Address,
 *    ...]`, `data = i128 amount`. We attribute a flow to the smart account when
 *    it is the event's `from` (out) or `to` (in).
 *  - The "subject" smart account is the transaction's source account. A future
 *    revision could accept it explicitly for contract-account (C...) subjects.
 */

import { Address, StrKey, humanizeEvents, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { AssetFlow, CallArg, Network, RecordedTx, ScopedCall, TokenRef } from '../types.js';

/** Default public RPC endpoints per network. */
const RPC_URLS: Record<Network, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
  futurenet: 'https://rpc-futurenet.stellar.org',
};

/** Raised for any failure fetching or decoding a live transaction. */
export class RpcError extends Error {
  override readonly name = 'RpcError';
}

export interface RecordOptions {
  readonly network: Network;
  /** Override the RPC endpoint (defaults to the network's public node). */
  readonly rpcUrl?: string;
}

/** A `transfer` contract event, narrowed and decoded. */
interface TransferEvent {
  readonly tokenContractId: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly amount: bigint;
}

/**
 * Best-effort token reference. The initial adapter does not resolve on-chain
 * metadata; it falls back to a label derived from the contract id and the
 * Stellar-default 7 decimals, flagging `resolved: false` so callers can say so.
 */
function fallbackToken(contractId: string): TokenRef {
  return {
    contractId,
    symbol: `${contractId.slice(0, 4)}…${contractId.slice(-4)}`,
    decimals: 7,
    resolved: false,
  };
}

/** Decode the source account of a v1 transaction to a strkey, when ed25519. */
function sourceAccountAddress(tx: xdr.Transaction): string | null {
  const muxed = tx.sourceAccount();
  switch (muxed.switch()) {
    case xdr.CryptoKeyType.keyTypeEd25519():
      return StrKey.encodeEd25519PublicKey(Buffer.from(muxed.ed25519()));
    case xdr.CryptoKeyType.keyTypeMuxedEd25519():
      return StrKey.encodeEd25519PublicKey(Buffer.from(muxed.med25519().ed25519()));
    default:
      return null;
  }
}

/** Pull the v1 `Transaction` body out of any envelope variant. */
function extractV1Transaction(envelope: xdr.TransactionEnvelope): xdr.Transaction {
  switch (envelope.switch()) {
    case xdr.EnvelopeType.envelopeTypeTx():
      return envelope.v1().tx();
    case xdr.EnvelopeType.envelopeTypeTxFeeBump():
      return envelope.feeBump().tx().innerTx().v1().tx();
    case xdr.EnvelopeType.envelopeTypeTxV0():
      throw new RpcError(
        'transaction uses a v0 envelope, which predates Soroban and has no contract calls to record',
      );
    default:
      throw new RpcError('unrecognised transaction envelope type');
  }
}

/** Extract scoped contract calls from a transaction's InvokeHostFunction ops. */
function extractCalls(tx: xdr.Transaction): ScopedCall[] {
  const calls: ScopedCall[] = [];
  for (const op of tx.operations()) {
    if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) {
      continue;
    }
    const hostFn = op.body().invokeHostFunctionOp().hostFunction();
    if (hostFn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
      // createContract / uploadWasm host functions carry no (contract, fn) call.
      continue;
    }
    const invoke = hostFn.invokeContract();
    const fnNameRaw = invoke.functionName();
    calls.push({
      contract: Address.fromScAddress(invoke.contractAddress()).toString(),
      fnName: typeof fnNameRaw === 'string' ? fnNameRaw : fnNameRaw.toString('utf8'),
      args: invoke.args().map((scv) => scValToNative(scv) as CallArg),
    });
  }
  return calls;
}

/** Narrow humanized contract events down to decoded `transfer` events. */
function extractTransfers(contractEventsXdr: xdr.ContractEvent[][]): TransferEvent[] {
  const transfers: TransferEvent[] = [];
  for (const event of humanizeEvents(contractEventsXdr.flat())) {
    if (event.type !== 'contract' || event.contractId === undefined) {
      continue;
    }
    // humanizeEvents types topics/data as `any`; treat them as unknown and narrow.
    const topics = event.topics as unknown[];
    if (topics[0] !== 'transfer') {
      continue;
    }
    const from = topics[1];
    const to = topics[2];
    const rawAmount = event.data as unknown;
    let amount: bigint;
    try {
      amount =
        typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount as string | number | boolean);
    } catch {
      // A transfer event with a non-integer payload is malformed; skip it
      // rather than aborting the whole recording.
      continue;
    }
    transfers.push({
      tokenContractId: event.contractId,
      from: typeof from === 'string' ? from : null,
      to: typeof to === 'string' ? to : null,
      amount: amount < 0n ? -amount : amount,
    });
  }
  return transfers;
}

/** Turn transfer events into directional flows relative to the subject account. */
function deriveFlows(transfers: readonly TransferEvent[], subject: string | null): AssetFlow[] {
  const flows: AssetFlow[] = [];
  for (const t of transfers) {
    if (t.amount === 0n) {
      continue;
    }
    let direction: AssetFlow['direction'] | null = null;
    if (subject !== null && t.to === subject) {
      direction = 'in';
    } else if (subject !== null && t.from === subject) {
      direction = 'out';
    }
    if (direction === null) {
      continue; // internal hop (neither leg touches the subject account)
    }
    flows.push({ asset: fallbackToken(t.tokenContractId), direction, amount: t.amount });
  }
  return flows;
}

/**
 * Fetch and normalise a transaction by hash. Throws {@link RpcError} with an
 * actionable message on any failure (not found / failed / decode error).
 */
export async function recordFromHash(hash: string, options: RecordOptions): Promise<RecordedTx> {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    throw new RpcError(`"${hash}" is not a 64-character hex transaction hash`);
  }
  const { network } = options;
  const url = options.rpcUrl ?? RPC_URLS[network];
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') });

  let response: rpc.Api.GetTransactionResponse;
  try {
    response = await server.getTransaction(hash);
  } catch (cause) {
    throw new RpcError(
      `RPC request to ${url} failed: ${(cause as Error).message}. Check the endpoint and network.`,
    );
  }

  if (response.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new RpcError(
      `transaction ${hash} not found on ${network}. It may be outside the RPC retention window or on a different network.`,
    );
  }
  if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new RpcError(
      `transaction ${hash} failed on-chain; there is no successful flow to record`,
    );
  }

  const tx = extractV1Transaction(response.envelopeXdr);
  const subject = sourceAccountAddress(tx);
  const calls = extractCalls(tx);
  if (calls.length === 0) {
    throw new RpcError(
      `transaction ${hash} contains no InvokeContract operations; nothing to synthesize`,
    );
  }
  const flows = deriveFlows(extractTransfers(response.events.contractEventsXdr), subject);

  return {
    hash,
    network,
    source: 'rpc',
    ledger: response.ledger,
    timestamp: response.createdAt,
    calls,
    flows,
  };
}
