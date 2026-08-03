/**
 * Typed error taxonomy for the recording layer.
 *
 * Every failure the recorder can hit maps to one of four codes so callers (and
 * humans reading CLI output) can tell apart "you typed it wrong", "the node is
 * unreachable", "the tx is gone", and "we met bytes we do not understand":
 *
 *  - `BAD_INPUT`      — the caller's arguments or input file are invalid.
 *  - `TX_NOT_FOUND`   — the node has no record of the hash (most often the
 *                       RPC retention window; public nodes keep ~7 days).
 *  - `NETWORK`        — the RPC endpoint could not be reached or errored.
 *  - `DECODE_FAILED`  — fetched data did not match the shapes documented in
 *                       docs/FACTS.md; `section` names the failing XDR part.
 *
 * There are deliberately no silent catches anywhere in the recorder: anything
 * that cannot be decoded either throws one of these or is surfaced as a
 * warning on the resulting RecordedTx.
 */

/** Machine-readable failure category. */
export type RecorderErrorCode = 'BAD_INPUT' | 'TX_NOT_FOUND' | 'NETWORK' | 'DECODE_FAILED';

/** Raised for any failure ingesting or decoding a recording source. */
export class RecorderError extends Error {
  override readonly name = 'RecorderError';
  readonly code: RecorderErrorCode;
  /** For DECODE_FAILED: the XDR section that failed (e.g. `TransactionEnvelope`). */
  readonly section: string | undefined;

  constructor(code: RecorderErrorCode, message: string, section?: string) {
    super(section === undefined ? `[${code}] ${message}` : `[${code}] (${section}) ${message}`);
    this.code = code;
    this.section = section;
  }
}

/** Shorthand constructors, so call sites read as the taxonomy. */
export const badInput = (message: string): RecorderError => new RecorderError('BAD_INPUT', message);
export const txNotFound = (message: string): RecorderError =>
  new RecorderError('TX_NOT_FOUND', message);
export const networkError = (message: string): RecorderError =>
  new RecorderError('NETWORK', message);
export const decodeFailed = (section: string, message: string): RecorderError =>
  new RecorderError('DECODE_FAILED', message, section);
