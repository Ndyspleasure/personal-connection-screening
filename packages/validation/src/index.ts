import { z } from 'zod';

/**
 * Shared request/response validation (Technology Architecture §24, §77).
 * Server validation is authoritative; unknown fields are never trusted. These
 * primitives are extended with per-endpoint schemas in Phase 3–4.
 */
export { z };

/** Opaque public reference format guard (prefix + high-entropy body). */
export const publicRefSchema = z
  .string()
  .min(5)
  .max(128)
  .regex(/^[a-z]{3}_[A-Za-z0-9_-]+$/, 'invalid reference format');

/** Idempotency key for retry-safe critical operations (Data & State Model §60). */
export const idempotencyKeySchema = z.string().min(8).max(200);

/** Optimistic-concurrency revision expected by a client write (Data §57). */
export const revisionSchema = z.number().int().nonnegative();

export type SafeParseResult<T> = { ok: true; data: T } | { ok: false; issues: string[] };

/** Parse untrusted input, returning a flat list of issues (never throws). */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): SafeParseResult<T> {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}

export * from './api';
export * from './admin';
