/**
 * Machine-readable MCP error envelope mapped from the recorder taxonomy
 * ({@link ../sources/errors.js}) plus verify / internal codes.
 */

import { RecorderError, type RecorderErrorCode } from '../sources/errors.js';

/** Codes agents can branch on. Extends the recorder taxonomy. */
export type McpErrorCode = RecorderErrorCode | 'VERIFY_MISMATCH' | 'INTERNAL';

export interface McpErrorBody {
  readonly schemaVersion: number;
  readonly ok: false;
  readonly code: McpErrorCode;
  readonly message: string;
  readonly section?: string;
}

export class McpToolError extends Error {
  override readonly name = 'McpToolError';
  readonly code: McpErrorCode;
  readonly section: string | undefined;

  constructor(code: McpErrorCode, message: string, section?: string) {
    super(message);
    this.code = code;
    this.section = section;
  }
}

/** Map any thrown value into a stable MCP error body. */
export function toMcpError(error: unknown, schemaVersion: number): McpErrorBody {
  if (error instanceof McpToolError) {
    return {
      schemaVersion,
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.section === undefined ? {} : { section: error.section }),
    };
  }
  if (error instanceof RecorderError) {
    return {
      schemaVersion,
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.section === undefined ? {} : { section: error.section }),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/must be|requires|expected|unknown network|unsupported/i.test(message)) {
    return { schemaVersion, ok: false, code: 'BAD_INPUT', message };
  }
  return { schemaVersion, ok: false, code: 'INTERNAL', message };
}
