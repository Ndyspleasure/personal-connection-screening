import { AppError } from './errors';

/**
 * Structured server-side logging (Technology Architecture §55–56; Security §47,
 * §53). Emits a single-line JSON record to stderr with a correlation id and
 * automatic redaction of sensitive keys — never a token, secret, or cookie.
 * Client-facing errors stay safe via `toPublicError`; this is the operator's
 * view, and it is where unexpected (non-AppError) errors surface with a stack.
 */

const SENSITIVE_KEY = /token|secret|cookie|authorization|password|fingerprint|session_?token/i;

/** Deep-copy a value, masking any property whose key looks sensitive. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(val);
    }
    return out;
  }
  return value;
}

export interface LogContext {
  correlationId?: string;
  route?: string;
  [key: string]: unknown;
}

/**
 * Log a server-side error as structured JSON. AppErrors are expected control
 * flow and logged compactly by code; anything else is UNEXPECTED and includes a
 * stack for debugging. The message is for operators only — it is never returned
 * to the client (that goes through `toPublicError`).
 */
export function logServerError(err: unknown, ctx: LogContext = {}): void {
  const isApp = err instanceof AppError;
  const record: Record<string, unknown> = {
    level: 'error',
    ts: new Date().toISOString(),
    code: isApp ? err.code : 'UNEXPECTED',
    message: err instanceof Error ? err.message : String(err),
    ...(redact(ctx) as Record<string, unknown>),
  };
  if (!isApp && err instanceof Error && err.stack) record.stack = err.stack;
  console.error(JSON.stringify(record));
}
