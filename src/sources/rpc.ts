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
 *  - Token symbol/decimals are resolved by simulating the token contract's SEP-41
 *    `symbol()` / `decimals()` getters against the same node. If that fails (the
 *    token is not a standard SAC/SEP-41 token, or the node rejects the
 *    simulation), we fall back to a label derived from the contract id and flag
 *    `resolved: false` rather than presenting a guess as fact.
 */

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Networks,
  StrKey,
  TransactionBuilder,
  humanizeEvents,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { AssetFlow, CallArg, Network, RecordedTx, ScopedCall, TokenRef } from '../types.js';

/** Default public RPC endpoints per network. */
const RPC_URLS: Record<Network, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
  futurenet: 'https://rpc-futurenet.stellar.org',
};

/** Network passphrases, needed to build the read-only metadata simulations. */
const NETWORK_PASSPHRASES: Record<Network, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
};

/**
 * A throwaway, all-zero source account for read-only simulations. Simulation
 * does not verify or charge the source, so this account need not exist.
 */
const SIMULATION_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

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
 * Fallback token reference used when on-chain metadata cannot be resolved. The
 * label is derived from the contract id and decimals default to the Stellar
 * standard (7); `resolved: false` marks it as a best-effort guess.
 */
function fallbackToken(contractId: string): TokenRef {
  return {
    contractId,
    symbol: `${contractId.slice(0, 4)}…${contractId.slice(-4)}`,
    decimals: 7,
    resolved: false,
  };
}

/**
 * Simulate a no-argument getter on a contract and return the decoded result.
 * Read-only, so it uses a throwaway source account and never submits anything.
 */
async function simulateGetter(
  server: rpc.Server,
  contractId: string,
  method: string,
  network: Network,
): Promise<unknown> {
  const source = new Account(SIMULATION_SOURCE, '0');
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASES[network],
  })
    .addOperation(new Contract(contractId).call(method))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new RpcError(`simulating ${method}() on ${contractId} failed: ${sim.error}`);
  }
  if (sim.result === undefined) {
    throw new RpcError(`simulating ${method}() on ${contractId} returned no value`);
  }
  return scValToNative(sim.result.retval);
}

/**
 * Resolve a token's symbol/decimals from its SEP-41 metadata via simulation.
 * Falls back (with `resolved: false`) on any failure rather than throwing, so a
 * single non-standard token cannot abort an otherwise valid recording.
 */
async function resolveToken(
  server: rpc.Server,
  contractId: string,
  network: Network,
): Promise<TokenRef> {
  try {
    const [symbol, decimals] = await Promise.all([
      simulateGetter(server, contractId, 'symbol', network),
      simulateGetter(server, contractId, 'decimals', network),
    ]);
    if (typeof symbol === 'string' && typeof decimals === 'number' && Number.isInteger(decimals)) {
      return { contractId, symbol, decimals, resolved: true };
    }
    return fallbackToken(contractId);
  } catch {
    return fallbackToken(contractId);
  }
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

/**
 * Turn transfer events into directional flows relative to the subject account,
 * resolving each distinct token's metadata once (cached) via {@link resolveToken}.
 */
async function deriveFlows(
  server: rpc.Server,
  transfers: readonly TransferEvent[],
  subject: string | null,
  network: Network,
): Promise<AssetFlow[]> {
  const tokenCache = new Map<string, TokenRef>();
  const flows: AssetFlow[] = [];
  for (const t of transfers) {
    if (t.amount === 0n || subject === null) {
      continue;
    }
    let direction: AssetFlow['direction'] | null = null;
    if (t.to === subject) {
      direction = 'in';
    } else if (t.from === subject) {
      direction = 'out';
    }
    if (direction === null) {
      continue; // internal hop (neither leg touches the subject account)
    }
    let asset = tokenCache.get(t.tokenContractId);
    if (asset === undefined) {
      asset = await resolveToken(server, t.tokenContractId, network);
      tokenCache.set(t.tokenContractId, asset);
    }
    flows.push({ asset, direction, amount: t.amount });
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
  const flows = await deriveFlows(
    server,
    extractTransfers(response.events.contractEventsXdr),
    subject,
    network,
  );

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
