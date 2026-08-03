/**
 * Live RPC adapter: fetch a transaction SEQUENCE by hash from a Soroban RPC
 * node and normalise it into one merged {@link RecordedTx}.
 *
 * Soroban permits a single `InvokeHostFunction` operation per transaction
 * (FACTS.md §3.2, confirmed against all committed captures), so a multi-step
 * flow — e.g. a Blend claim followed by a Soroswap swap — is several hashes.
 * `recordFromHashes` fetches each, decodes it against the protocol-27 shapes
 * documented in FACTS.md §3 (see decode.ts), and merges them ordered by
 * ledger close time.
 *
 * The subject account movements are attributed to should be passed explicitly
 * (`--account`): the economic actor of a smart-account flow is often a C…
 * contract address, NOT the envelope source account (capture 2dcff6…: both
 * transfer legs name the smart wallet `CCW6R5ZK…` while the tx source
 * `GBMMOZMK…` appears in no transfer at all). Defaulting to the source
 * account is supported but recorded as a warning on the output.
 *
 * Token symbol/decimals are resolved by simulating the token's SEP-41
 * `symbol()` / `decimals()` getters against the same node. On failure the
 * token falls back to its FULL contract id as the symbol (never a sliced
 * pseudo-symbol) with `resolved: false`, and the recording carries a warning.
 *
 * All failures throw a typed {@link RecorderError} — see errors.ts for the
 * taxonomy. There are no silent catches.
 */

import {
  Account,
  BASE_FEE,
  Contract,
  Networks,
  StrKey,
  TransactionBuilder,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import type { Network, RecordedTx, TokenRef } from '../types.js';
import {
  assembleRecording,
  decodeTx,
  fallbackToken,
  type DecodedTx,
  type TokenResolver,
} from './decode.js';
import { badInput, networkError, txNotFound } from './errors.js';

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

export interface RecordOptions {
  readonly network: Network;
  /** Override the RPC endpoint (defaults to the network's public node). */
  readonly rpcUrl?: string;
  /** Account (`G...` or `C...`) movements are attributed to. */
  readonly account?: string;
}

/** Validate a subject account string (`G...` or `C...`), or throw BAD_INPUT. */
export function validateAccount(account: string): string {
  if (!StrKey.isValidEd25519PublicKey(account) && !StrKey.isValidContract(account)) {
    throw badInput(
      `"${account}" is not a valid account: expected an ed25519 public key (G...) or a contract address (C...)`,
    );
  }
  return account;
}

/** Validate a 64-hex transaction hash, or throw BAD_INPUT. */
export function validateHash(hash: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    throw badInput(`"${hash}" is not a 64-character hex transaction hash`);
  }
  return hash.toLowerCase();
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
    throw networkError(`simulating ${method}() on ${contractId} failed: ${sim.error}`);
  }
  if (sim.result === undefined) {
    throw networkError(`simulating ${method}() on ${contractId} returned no value`);
  }
  return scValToNative(sim.result.retval);
}

/**
 * Build a {@link TokenResolver} that reads SEP-41 metadata via simulation,
 * falling back (explicitly, `resolved: false`) on any failure so one
 * non-standard token cannot abort an otherwise valid recording. The fallback
 * is surfaced as a warning by the assembler — the catch here is not silent.
 */
export function liveTokenResolver(server: rpc.Server, network: Network): TokenResolver {
  return async (contractId: string): Promise<TokenRef> => {
    try {
      const [symbol, decimals] = await Promise.all([
        simulateGetter(server, contractId, 'symbol', network),
        simulateGetter(server, contractId, 'decimals', network),
      ]);
      if (
        typeof symbol === 'string' &&
        typeof decimals === 'number' &&
        Number.isInteger(decimals)
      ) {
        return { contractId, symbol, decimals, resolved: true };
      }
      return fallbackToken(contractId);
    } catch {
      // Deliberate fallback, not a silent catch: `resolved: false` plus the
      // assembler's warning surface it in the recording output.
      return fallbackToken(contractId);
    }
  };
}

/**
 * Convenience: a live token resolver for a network without hand-building the
 * server first (used by the CLI's simulation-ingestion path, which needs
 * metadata resolution but fetches no transactions).
 */
export function tokenResolverFor(network: Network, rpcUrl?: string): TokenResolver {
  const url = rpcUrl ?? RPC_URLS[network];
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') });
  return liveTokenResolver(server, network);
}

/** Fetch one hash and decode it, mapping RPC states onto the error taxonomy. */
async function fetchAndDecode(
  server: rpc.Server,
  url: string,
  hash: string,
  network: Network,
): Promise<DecodedTx> {
  let response: rpc.Api.GetTransactionResponse;
  try {
    response = await server.getTransaction(hash);
  } catch (cause) {
    throw networkError(
      `RPC request to ${url} failed: ${(cause as Error).message}. Check the endpoint and network.`,
    );
  }

  if (response.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    const oldest = new Date(response.oldestLedgerCloseTime * 1000).toISOString();
    throw txNotFound(
      `transaction ${hash} not found on ${network}. Public RPC nodes only retain recent history ` +
        `(this node: ledgers ${response.oldestLedger}–${response.latestLedger}, oldest closed ${oldest}, ` +
        `about 7 days); older transactions must be recorded from a saved capture or an archival node. ` +
        `Also check the hash is on the right network.`,
    );
  }
  if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw badInput(
      `transaction ${hash} failed on-chain (ledger ${response.ledger}); there is no successful flow to record`,
    );
  }

  // RPC 27.1.1 returns createdAt as a JSON *string* and sdk 15.1.0 passes it
  // through verbatim despite typing it `number` (FACTS §3.2) — normalise.
  const createdAt = Number(response.createdAt);
  return decodeTx({
    hash,
    ledger: response.ledger,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
    applicationOrder: response.applicationOrder,
    envelope: response.envelopeXdr,
    contractEvents: response.events.contractEventsXdr,
  });
}

/**
 * Fetch and normalise a transaction sequence by hash. Order of the resulting
 * calls follows ledger close time, not argument order. Throws
 * {@link RecorderError} with an actionable message on any failure.
 */
export async function recordFromHashes(
  hashes: readonly string[],
  options: RecordOptions,
): Promise<RecordedTx> {
  if (hashes.length === 0) {
    throw badInput('record requires at least one transaction hash');
  }
  const normalised = hashes.map(validateHash);
  const distinct = new Set(normalised);
  if (distinct.size !== normalised.length) {
    throw badInput('duplicate transaction hashes given; each hash records once');
  }
  const subject = options.account === undefined ? undefined : validateAccount(options.account);

  const { network } = options;
  const url = options.rpcUrl ?? RPC_URLS[network];
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') });

  const decoded: DecodedTx[] = [];
  for (const hash of normalised) {
    decoded.push(await fetchAndDecode(server, url, hash, network));
  }

  const totalCalls = decoded.reduce((n, tx) => n + tx.invocations.length, 0);
  if (totalCalls === 0) {
    throw badInput(
      'the given transaction(s) contain no InvokeContract operations; nothing to record',
    );
  }

  return assembleRecording(decoded, {
    network,
    source: 'rpc',
    ...(subject === undefined ? {} : { subject }),
    resolveToken: liveTokenResolver(server, network),
  });
}
