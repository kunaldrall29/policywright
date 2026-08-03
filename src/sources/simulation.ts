/**
 * Simulated-path ingestion: normalise a SAVED `simulateTransaction` exchange
 * (a JSON file) through the same decode pipeline as a live transaction,
 * producing a {@link RecordedTx} with `source: "simulation"`.
 *
 * Accepted file shape — a JSON object that contains BOTH:
 *
 *  1. the simulated transaction's envelope XDR (base64), at one of:
 *       `request.params.transaction`, `request.transaction`,
 *       `transaction`, or `envelopeXdr`;
 *  2. the raw `simulateTransaction` RESULT object (the JSON-RPC `result`
 *     field: `{ latestLedger, transactionData?, events?, results?, ... }`),
 *     at `response.result`, `result`, or the document root.
 *
 * `scripts/capture-simulation.ts` writes exactly this shape. The envelope is
 * required because a simulation result alone does not carry the invoked
 * function and its arguments.
 *
 * What each part contributes:
 *  - envelope         → the invocation (contract, function, decoded args) and
 *                       the source account;
 *  - `results[].auth` → the authorization-entry tree the simulation recorded
 *                       (an unsigned envelope usually carries none itself);
 *  - `events`         → base64 `DiagnosticEvent`s; those inside the successful
 *                       contract call wrap the contract events token movements
 *                       are decoded from (same decoder as the live path).
 *
 * A simulation never touched the chain, so the resulting RecordedTx has
 * `hash: null` and its calls carry `sourceHash: null`; `ledger` is the
 * simulation's snapshot ledger (`latestLedger`) and `timestamp` is null.
 */

import { xdr } from '@stellar/stellar-sdk';
import type { Network, RecordedTx } from '../types.js';
import {
  assembleRecording,
  decodeAuthEntries,
  decodeInvocations,
  decodeMovementEvent,
  extractInnerTransaction,
  sourceAccountAddress,
  type TokenMovement,
  type TokenResolver,
} from './decode.js';
import { badInput, decodeFailed } from './errors.js';

/** Options for {@link ingestSimulation}. */
export interface SimulationIngestOptions {
  readonly network: Network;
  /** Account (`G...` or `C...`) movements are attributed to. */
  readonly account?: string;
  readonly resolveToken: TokenResolver;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Locate the envelope XDR base64 in the accepted document spots. */
function findEnvelopeB64(doc: Record<string, unknown>): string {
  const request = doc['request'];
  const candidates: unknown[] = [
    isRecord(request) && isRecord(request['params']) ? request['params']['transaction'] : undefined,
    isRecord(request) ? request['transaction'] : undefined,
    doc['transaction'],
    doc['envelopeXdr'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  throw badInput(
    'simulation file has no transaction envelope. Save the simulateTransaction exchange with the ' +
      'base64 envelope at request.params.transaction (scripts/capture-simulation.ts does this), or ' +
      'add it under a top-level "transaction" or "envelopeXdr" key — the result alone does not say ' +
      'what was invoked.',
  );
}

/** Locate the simulateTransaction result object in the accepted spots. */
function findSimulationResult(doc: Record<string, unknown>): Record<string, unknown> {
  const response = doc['response'];
  const candidates: unknown[] = [
    isRecord(response) ? response['result'] : undefined,
    doc['result'],
    doc,
  ];
  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      ('latestLedger' in candidate ||
        'results' in candidate ||
        'transactionData' in candidate ||
        'error' in candidate)
    ) {
      return candidate;
    }
  }
  throw badInput(
    'simulation file has no simulateTransaction result (expected { latestLedger, results, events, ... } ' +
      'at response.result, result, or the document root)',
  );
}

/**
 * Ingest a parsed simulation document (see module doc for the accepted shape)
 * into a {@link RecordedTx} with `source: "simulation"`.
 */
export async function ingestSimulation(
  doc: unknown,
  options: SimulationIngestOptions,
): Promise<RecordedTx> {
  if (!isRecord(doc)) {
    throw badInput('simulation file must contain a JSON object');
  }
  const result = findSimulationResult(doc);
  const error = result['error'];
  if (typeof error === 'string' && error.length > 0) {
    throw badInput(
      `the saved simulation failed ("${error}"); there is no successful flow to record`,
    );
  }

  const envelopeB64 = findEnvelopeB64(doc); // throws BAD_INPUT when absent
  let envelope: xdr.TransactionEnvelope;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(envelopeB64, 'base64');
  } catch (cause) {
    throw decodeFailed(
      'TransactionEnvelope',
      `simulation file envelope did not parse as base64 XDR: ${(cause as Error).message}`,
    );
  }

  const warnings: string[] = [];
  const tx = extractInnerTransaction(envelope);
  const sourceAccount = sourceAccountAddress(tx);
  if (sourceAccount === null) {
    warnings.push('simulated transaction source account is not an ed25519 key; source unavailable');
  }
  const invocations = decodeInvocations(tx, null, warnings);
  if (invocations.length === 0) {
    throw badInput(
      'the simulated transaction contains no InvokeContract operation; nothing to record',
    );
  }

  // The unsigned envelope usually carries no authorization entries; the
  // simulation discovers them and returns them in results[].auth. Only one
  // InvokeHostFunction op exists per tx, so they belong to the invocation.
  const results = result['results'];
  if (Array.isArray(results)) {
    const authB64: string[] = [];
    results.forEach((entry, i) => {
      if (!isRecord(entry)) {
        throw badInput(`simulation results[${i}] is not an object`);
      }
      const auth = entry['auth'];
      if (auth === undefined) {
        return;
      }
      if (!Array.isArray(auth)) {
        throw badInput(`simulation results[${i}].auth is not an array`);
      }
      auth.forEach((a, j) => {
        if (typeof a !== 'string') {
          throw badInput(`simulation results[${i}].auth[${j}] is not a base64 string`);
        }
        authB64.push(a);
      });
    });
    const first = invocations[0];
    if (authB64.length > 0 && first !== undefined && first.authorizations.length === 0) {
      const entries = authB64.map((b64, i) => {
        try {
          return xdr.SorobanAuthorizationEntry.fromXDR(b64, 'base64');
        } catch (cause) {
          throw decodeFailed(
            `SorobanAuthorizationEntry[${i}]`,
            `simulation auth entry did not parse as base64 XDR: ${(cause as Error).message}`,
          );
        }
      });
      invocations[0] = { ...first, authorizations: decodeAuthEntries(entries, warnings) };
    }
  }

  // Movements come from the diagnostic events of the successful contract call.
  const movements: TokenMovement[] = [];
  const events = result['events'];
  if (events !== undefined) {
    if (!Array.isArray(events)) {
      throw badInput('simulation events is not an array of base64 DiagnosticEvent strings');
    }
    events.forEach((b64, i) => {
      if (typeof b64 !== 'string') {
        throw badInput(`simulation events[${i}] is not a base64 string`);
      }
      let diagnostic: xdr.DiagnosticEvent;
      try {
        diagnostic = xdr.DiagnosticEvent.fromXDR(b64, 'base64');
      } catch (cause) {
        throw decodeFailed(
          `DiagnosticEvent[${i}]`,
          `simulation event did not parse as base64 XDR: ${(cause as Error).message}`,
        );
      }
      if (!diagnostic.inSuccessfulContractCall()) {
        return;
      }
      const movement = decodeMovementEvent(diagnostic.event(), `DiagnosticEvent[${i}]`, warnings);
      if (movement !== null) {
        movements.push(movement);
      }
    });
  }

  const latestLedger = result['latestLedger'];
  return assembleRecording(
    [
      {
        hash: null,
        ledger: typeof latestLedger === 'number' ? latestLedger : null,
        createdAt: null,
        applicationOrder: 0,
        sourceAccount,
        invocations,
        movements,
        warnings,
      },
    ],
    {
      network: options.network,
      source: 'simulation',
      ...(options.account === undefined ? {} : { subject: options.account }),
      resolveToken: options.resolveToken,
    },
  );
}
