/**
 * Pure decoders: XDR → domain types. No network access anywhere in this
 * module, so every function here can be tested against the committed raw
 * captures under `examples/live/`.
 *
 * All shapes are the ones ACTUALLY observed on protocol 27 and documented in
 * docs/FACTS.md §3 (verified 2026-08-03 against the committed captures):
 *
 *  - Envelopes are v1 or fee-bump-wrapping-v1; fee-bump occurs in the wild.
 *  - One `InvokeHostFunction` op per tx, host fn `InvokeContract`.
 *  - Authorization entries carry the authorized invocation TREE (a router swap
 *    authorizing a nested token `transfer`), which top-level decoding misses.
 *  - Token-movement events per CAP-67 (SAC) and SEP-41 (plain tokens):
 *      transfer:  topics [transfer, from, to] or [transfer, from, to, sep0011
 *                 asset string]; data i128 or map {amount, to_muxed_id}.
 *      mint:      topics [mint, to, sep0011]; data as transfer. No admin topic.
 *      burn:      topics [burn, from, sep0011]; data i128.
 *      clawback:  topics [clawback, from, sep0011]; data i128.
 *    Both transfer variants coexist in one tx (FACTS §3.3). A 4th topic is
 *    never assumed; data is never assumed to be a bare i128.
 *
 * Anything outside these shapes either throws a typed
 * {@link RecorderError} (DECODE_FAILED, naming the XDR section) or — for
 * events that merely LOOK like movements but do not decode — is surfaced as a
 * warning on the recording. Nothing is silently dropped.
 */

import { Address, StrKey, scValToNative, xdr } from '@stellar/stellar-sdk';
import type {
  AssetFlow,
  CallArg,
  InvocationNode,
  Network,
  RecordedTx,
  RecordedTxSource,
  ScopedCall,
  TokenRef,
} from '../types.js';
import { badInput, decodeFailed } from './errors.js';

/** One transaction's raw material, already parsed to XDR objects. */
export interface DecodedTxInput {
  /** Tx hash (hex), or null for simulated transactions. */
  readonly hash: string | null;
  readonly ledger: number | null;
  /** Ledger close time (Unix seconds), when known. */
  readonly createdAt: number | null;
  /** Order within the ledger, for stable sorting; 0 when unknown. */
  readonly applicationOrder: number;
  readonly envelope: xdr.TransactionEnvelope;
  /** Contract events, one array per operation (may be empty). */
  readonly contractEvents: readonly (readonly xdr.ContractEvent[])[];
}

/** A decoded token movement, not yet attributed to a subject account. */
export interface TokenMovement {
  readonly tokenContractId: string;
  /** Sender, or null for `mint` (value appears from the issuer). */
  readonly from: string | null;
  /** Recipient, or null for `burn`/`clawback` (value leaves circulation). */
  readonly to: string | null;
  readonly amount: bigint;
}

/** A fully decoded single transaction. */
export interface DecodedTx {
  readonly hash: string | null;
  readonly ledger: number | null;
  readonly createdAt: number | null;
  readonly applicationOrder: number;
  /** Envelope source account (G...), or null when not an ed25519 key. */
  readonly sourceAccount: string | null;
  readonly invocations: readonly ScopedCall[];
  readonly movements: readonly TokenMovement[];
  readonly warnings: readonly string[];
}

/** Resolves a token contract id to display metadata. May consult the network. */
export type TokenResolver = (contractId: string) => Promise<TokenRef>;

/** Pull the inner v1 `Transaction` out of any envelope variant (FACTS §3.2). */
export function extractInnerTransaction(envelope: xdr.TransactionEnvelope): xdr.Transaction {
  switch (envelope.switch()) {
    case xdr.EnvelopeType.envelopeTypeTx():
      return envelope.v1().tx();
    case xdr.EnvelopeType.envelopeTypeTxFeeBump():
      // A fee-bump inner tx is always v1; observed in the wild (capture c857…).
      return envelope.feeBump().tx().innerTx().v1().tx();
    case xdr.EnvelopeType.envelopeTypeTxV0():
      throw decodeFailed(
        'TransactionEnvelope',
        'v0 envelope: predates Soroban, carries no contract invocations to record',
      );
    default:
      throw decodeFailed(
        'TransactionEnvelope',
        `unrecognised envelope type ${envelope.switch().name}`,
      );
  }
}

/** Decode the tx source account to a G strkey; null when not ed25519-based. */
export function sourceAccountAddress(tx: xdr.Transaction): string | null {
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

/** Decode one ScVal to a native CallArg, naming the failing section on error. */
function decodeScVal(scv: xdr.ScVal, section: string): CallArg {
  try {
    return scValToNative(scv) as CallArg;
  } catch (cause) {
    throw decodeFailed(section, `scValToNative failed: ${(cause as Error).message}`);
  }
}

/**
 * Decode one authorization-entry invocation tree node. Non-contract nodes
 * (create-contract authorizations) cannot be represented as a call; they are
 * reported through `warnings` rather than silently dropped.
 */
function decodeAuthorizedInvocation(
  inv: xdr.SorobanAuthorizedInvocation,
  warnings: string[],
): InvocationNode | null {
  const fn = inv.function();
  if (fn.switch() !== xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()) {
    warnings.push(
      `authorization tree contains a non-contract-call node (${fn.switch().name}); omitted from the decoded tree`,
    );
    return null;
  }
  const call = fn.contractFn();
  const subInvocations = inv
    .subInvocations()
    .map((sub) => decodeAuthorizedInvocation(sub, warnings))
    .filter((node): node is InvocationNode => node !== null);
  return {
    contract: Address.fromScAddress(call.contractAddress()).toString(),
    fnName: call.functionName().toString('utf8'),
    args: call.args().map((a, i) => decodeScVal(a, `SorobanAuthorizedInvocation.args[${i}]`)),
    subInvocations,
  };
}

/** Decode authorization entries into their invocation trees. */
export function decodeAuthEntries(
  entries: readonly xdr.SorobanAuthorizationEntry[],
  warnings: string[],
): InvocationNode[] {
  return entries
    .map((entry) => decodeAuthorizedInvocation(entry.rootInvocation(), warnings))
    .filter((node): node is InvocationNode => node !== null);
}

/**
 * Extract the scoped contract calls (with their authorization trees) from a
 * transaction's InvokeHostFunction operations.
 */
export function decodeInvocations(
  tx: xdr.Transaction,
  sourceHash: string | null,
  warnings: string[],
): ScopedCall[] {
  const calls: ScopedCall[] = [];
  for (const op of tx.operations()) {
    if (op.body().switch() !== xdr.OperationType.invokeHostFunction()) {
      continue;
    }
    const hostFnOp = op.body().invokeHostFunctionOp();
    const hostFn = hostFnOp.hostFunction();
    if (hostFn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
      // createContract / uploadWasm carry no (contract, fn) call to scope.
      warnings.push(
        `operation carries host function ${hostFn.switch().name}, not a contract invocation; skipped`,
      );
      continue;
    }
    const invoke = hostFn.invokeContract();
    const authorizations = decodeAuthEntries(hostFnOp.auth(), warnings);
    calls.push({
      contract: Address.fromScAddress(invoke.contractAddress()).toString(),
      fnName: invoke.functionName().toString('utf8'),
      args: invoke.args().map((a, i) => decodeScVal(a, `InvokeContractArgs.args[${i}]`)),
      sourceHash,
      authorizations,
    });
  }
  return calls;
}

/** Event kinds that denote a token movement (CAP-67 / SEP-41). */
const MOVEMENT_KINDS = new Set(['transfer', 'mint', 'burn', 'clawback']);

/**
 * True for a SEP-0011 asset-string topic (`"native"`, `"CODE:G..."`). Used to
 * tell the CAP-67 SAC form (asset string in the last topic) apart from an
 * address topic — an asset string is never itself a valid strkey address.
 */
function isSep0011AssetString(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    !StrKey.isValidEd25519PublicKey(value) &&
    !StrKey.isValidContract(value)
  );
}

/** True for a decoded address topic (`G...` / `C...` strkey). */
function isAddressString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value))
  );
}

/**
 * Decode a movement amount: a bare i128, or the CAP-67 muxed-info map
 * `{amount, to_muxed_id}`. Returns null (caller warns) for anything else.
 */
function movementAmount(data: unknown): bigint | null {
  if (typeof data === 'bigint') {
    return data;
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const amount = (data as Record<string, unknown>)['amount'];
    if (typeof amount === 'bigint') {
      return amount;
    }
  }
  return null;
}

/**
 * Decode one contract event into a {@link TokenMovement}, or null when the
 * event is not a token movement at all. Events that carry a movement topic but
 * do not decode to a well-formed movement are reported via `warnings` — they
 * are never silently skipped, because a missed movement corrupts the flow
 * totals downstream.
 */
export function decodeMovementEvent(
  event: xdr.ContractEvent,
  label: string,
  warnings: string[],
): TokenMovement | null {
  if (event.type().name !== 'contract') {
    return null;
  }
  const rawContractId = event.contractId();
  if (rawContractId === null || rawContractId === undefined) {
    return null;
  }
  const tokenContractId = StrKey.encodeContract(rawContractId as unknown as Buffer);

  const v0 = event.body().v0();
  const topics = v0.topics().map((t, i) => decodeScVal(t, `${label}.topics[${i}]`));
  const kind = topics[0];
  if (typeof kind !== 'string' || !MOVEMENT_KINDS.has(kind)) {
    return null; // not a token-movement event (pair sync/swap, fee_collected, …)
  }

  const data = decodeScVal(v0.data(), `${label}.data`);
  const amount = movementAmount(data);
  if (amount === null) {
    warnings.push(
      `${label}: "${kind}" event on ${tokenContractId} has data that is neither i128 nor a CAP-67 {amount, to_muxed_id} map; movement not counted`,
    );
    return null;
  }
  if (amount < 0n) {
    warnings.push(
      `${label}: "${kind}" event on ${tokenContractId} carries a negative amount ${amount}; movement not counted`,
    );
    return null;
  }

  if (kind === 'transfer') {
    // 3 topics (plain SEP-41 token) or 4 (SAC, 4th = SEP-0011 asset string).
    if (
      (topics.length !== 3 && topics.length !== 4) ||
      !isAddressString(topics[1]) ||
      !isAddressString(topics[2])
    ) {
      warnings.push(
        `${label}: "transfer" event on ${tokenContractId} does not match [transfer, from, to(, asset)] (got ${topics.length} topics); movement not counted`,
      );
      return null;
    }
    return { tokenContractId, from: topics[1], to: topics[2], amount };
  }

  // mint / burn / clawback: CAP-67 SAC form is [kind, address, sep0011 string].
  if (topics.length !== 3 || !isAddressString(topics[1]) || !isSep0011AssetString(topics[2])) {
    warnings.push(
      `${label}: "${kind}" event on ${tokenContractId} does not match the CAP-67 [${kind}, address, sep0011-asset] form; movement not counted (non-SAC ${kind} layouts are not assumed)`,
    );
    return null;
  }
  if (kind === 'mint') {
    return { tokenContractId, from: null, to: topics[1], amount };
  }
  return { tokenContractId, from: topics[1], to: null, amount }; // burn | clawback
}

/** Decode every movement across a tx's per-operation contract events. */
export function decodeMovements(
  contractEvents: readonly (readonly xdr.ContractEvent[])[],
  warnings: string[],
): TokenMovement[] {
  const movements: TokenMovement[] = [];
  contractEvents.forEach((opEvents, opIndex) => {
    opEvents.forEach((event, eventIndex) => {
      const movement = decodeMovementEvent(
        event,
        `ContractEvent[op ${opIndex}][${eventIndex}]`,
        warnings,
      );
      if (movement !== null) {
        movements.push(movement);
      }
    });
  });
  return movements;
}

/** Decode one transaction's raw material into a {@link DecodedTx}. */
export function decodeTx(input: DecodedTxInput): DecodedTx {
  const warnings: string[] = [];
  const tx = extractInnerTransaction(input.envelope);
  const sourceAccount = sourceAccountAddress(tx);
  if (sourceAccount === null) {
    warnings.push('transaction source account is not an ed25519 key; source unavailable');
  }
  const invocations = decodeInvocations(tx, input.hash, warnings);
  const movements = decodeMovements(input.contractEvents, warnings);
  return {
    hash: input.hash,
    ledger: input.ledger,
    createdAt: input.createdAt,
    applicationOrder: input.applicationOrder,
    sourceAccount,
    invocations,
    movements,
    warnings,
  };
}

/** Options for assembling a merged {@link RecordedTx} from decoded txs. */
export interface AssembleOptions {
  readonly network: Network;
  readonly source: RecordedTxSource;
  /**
   * Account (`G...` or `C...`) movements are attributed to. When omitted, the
   * first transaction's source account is used and a warning records the
   * assumption (a smart-account flow's economic actor is often NOT the tx
   * source — capture 2dcff6…, FACTS §3.3).
   */
  readonly subject?: string;
  readonly resolveToken: TokenResolver;
}

/**
 * Merge one or more decoded transactions into a single {@link RecordedTx}:
 * calls concatenated in ledger-close-time order (each keeping its source
 * hash), movements attributed to the subject and aggregated per
 * (token, direction) across the whole sequence.
 */
export async function assembleRecording(
  decoded: readonly DecodedTx[],
  options: AssembleOptions,
): Promise<RecordedTx> {
  if (decoded.length === 0) {
    throw badInput('no transactions to assemble into a recording');
  }
  // Ledger close time orders the sequence; applicationOrder breaks ties
  // within a ledger. Unknown times (simulations) keep their input position.
  const ordered = [...decoded].sort(
    (a, b) =>
      (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
      (a.ledger ?? 0) - (b.ledger ?? 0) ||
      a.applicationOrder - b.applicationOrder,
  );
  const first = ordered[0];
  if (first === undefined) {
    throw badInput('no transactions to assemble into a recording');
  }

  const warnings: string[] = [];
  for (const tx of ordered) {
    const context = tx.hash === null ? 'simulation' : `tx ${tx.hash.slice(0, 8)}…`;
    warnings.push(...tx.warnings.map((w) => `${context}: ${w}`));
  }

  let subject: string | null;
  if (options.subject !== undefined) {
    subject = options.subject;
  } else {
    subject = first.sourceAccount;
    if (subject === null) {
      warnings.push(
        'no --account given and the first transaction has no decodable source account; movements cannot be attributed and flows are empty',
      );
    } else {
      warnings.push(
        `no --account given; movements attributed to the first transaction's source account ${subject}. ` +
          'If the economic actor is a smart account (C…), pass --account explicitly.',
      );
    }
  }

  // Attribute movements to the subject, then aggregate per (token, direction)
  // in first-seen order. A self-transfer counts as both gross out and gross in.
  const totals = new Map<
    string,
    { tokenContractId: string; direction: 'in' | 'out'; amount: bigint }
  >();
  const record = (tokenContractId: string, direction: 'in' | 'out', amount: bigint): void => {
    const key = `${tokenContractId}::${direction}`;
    const existing = totals.get(key);
    if (existing === undefined) {
      totals.set(key, { tokenContractId, direction, amount });
    } else {
      existing.amount += amount;
    }
  };
  if (subject !== null) {
    for (const tx of ordered) {
      for (const movement of tx.movements) {
        if (movement.amount === 0n) {
          continue;
        }
        if (movement.from === subject) {
          record(movement.tokenContractId, 'out', movement.amount);
        }
        if (movement.to === subject) {
          record(movement.tokenContractId, 'in', movement.amount);
        }
      }
    }
  }

  // Resolve each distinct token once.
  const tokenIds = [...new Set([...totals.values()].map((t) => t.tokenContractId))];
  const tokens = new Map<string, TokenRef>();
  for (const id of tokenIds) {
    tokens.set(id, await options.resolveToken(id));
  }
  const flows: AssetFlow[] = [...totals.values()].map((t) => {
    const asset = tokens.get(t.tokenContractId);
    if (asset === undefined) {
      // Unreachable: every total's token id was resolved above.
      throw decodeFailed('TokenRef', `internal: token ${t.tokenContractId} was not resolved`);
    }
    if (!asset.resolved) {
      warnings.push(
        `token metadata for ${t.tokenContractId} could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)`,
      );
    }
    return { asset, direction: t.direction, amount: t.amount };
  });

  return {
    hash: first.hash,
    network: options.network,
    source: options.source,
    ledger: first.ledger,
    timestamp: first.createdAt,
    subject,
    calls: ordered.flatMap((tx) => tx.invocations),
    flows,
    warnings,
  };
}

/**
 * Fallback token reference for unresolved metadata: the FULL contract id as
 * the symbol (never a sliced pseudo-symbol) and the Stellar-standard 7
 * decimals, flagged `resolved: false` so output renders it as a fallback.
 */
export function fallbackToken(contractId: string): TokenRef {
  return { contractId, symbol: contractId, decimals: 7, resolved: false };
}

/**
 * Parse one committed raw capture document (`examples/live/<hash>.json`, as
 * written by scripts/capture.ts: the verbatim `getTransaction` JSON-RPC
 * exchange) into a {@link DecodedTxInput}. Network-free; this is what the
 * decoder test-suite feeds on.
 */
export function decodedTxInputFromCapture(doc: unknown): DecodedTxInput {
  if (typeof doc !== 'object' || doc === null) {
    throw badInput('capture document must be a JSON object');
  }
  const response = (doc as Record<string, unknown>)['response'];
  const request = (doc as Record<string, unknown>)['request'];
  const result =
    typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>)['result']
      : undefined;
  if (typeof result !== 'object' || result === null) {
    throw badInput('capture document has no response.result (expected a scripts/capture.ts file)');
  }
  const r = result as Record<string, unknown>;
  if (r['status'] !== 'SUCCESS') {
    throw badInput(`captured transaction status is ${String(r['status'])}, not SUCCESS`);
  }
  const hash =
    typeof r['txHash'] === 'string'
      ? r['txHash']
      : typeof request === 'object' && request !== null
        ? (((request as Record<string, unknown>)['hash'] as string | undefined) ?? null)
        : null;
  if (typeof r['envelopeXdr'] !== 'string') {
    throw badInput('capture result has no envelopeXdr');
  }
  let envelope: xdr.TransactionEnvelope;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(r['envelopeXdr'], 'base64');
  } catch (cause) {
    throw decodeFailed(
      'TransactionEnvelope',
      `base64 XDR did not parse: ${(cause as Error).message}`,
    );
  }
  const events = r['events'];
  const rawContractEvents =
    typeof events === 'object' && events !== null
      ? ((events as Record<string, unknown>)['contractEventsXdr'] ?? [])
      : [];
  if (!Array.isArray(rawContractEvents)) {
    throw badInput('capture result events.contractEventsXdr is not an array');
  }
  const contractEvents = rawContractEvents.map((opEvents, opIndex) => {
    if (!Array.isArray(opEvents)) {
      throw badInput(`capture result events.contractEventsXdr[${opIndex}] is not an array`);
    }
    return opEvents.map((b64, i) => {
      if (typeof b64 !== 'string') {
        throw badInput(`capture result events.contractEventsXdr[${opIndex}][${i}] is not a string`);
      }
      try {
        return xdr.ContractEvent.fromXDR(b64, 'base64');
      } catch (cause) {
        throw decodeFailed(
          `ContractEvent[op ${opIndex}][${i}]`,
          `base64 XDR did not parse: ${(cause as Error).message}`,
        );
      }
    });
  });
  return {
    hash,
    ledger: typeof r['ledger'] === 'number' ? r['ledger'] : null,
    createdAt:
      typeof r['createdAt'] === 'number'
        ? r['createdAt']
        : typeof r['createdAt'] === 'string'
          ? Number(r['createdAt'])
          : null,
    applicationOrder: typeof r['applicationOrder'] === 'number' ? r['applicationOrder'] : 0,
    envelope,
    contractEvents,
  };
}
