import { z } from 'zod';

/**
 * Shared request/response schemas for the public API (Technology Architecture
 * §22, §24, §59, §77). Every mutating endpoint validates against one of these
 * before touching the domain layer. Payload shapes stay tight: no unknown
 * fields become side effects (Threat §77).
 */

/** Stable session-kind slug used across the two-session API. */
export const sessionKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'invalid session key');

/** POST /api/public/session — Start. Idempotent per-cookie via route handler. */
export const startSessionRequestSchema = z
  .object({
    // Which CMS session to start; omitted → the default (open) session.
    sessionKey: sessionKeySchema.optional(),
    // Reserved for future candidate-name capture at the contact gate; unused
    // by the current flow. Kept optional to avoid client rejection when omitted.
    displayName: z.string().min(1).max(200).optional(),
  })
  .strict();
export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

/** POST /api/public/access-code — verify a gated session's code (server-checked). */
export const accessCodeVerifyRequestSchema = z
  .object({
    sessionKey: sessionKeySchema,
    // Raw code as typed/pasted; normalised + hashed server-side, never stored.
    code: z.string().min(1).max(128),
  })
  .strict();
export type AccessCodeVerifyRequest = z.infer<typeof accessCodeVerifyRequestSchema>;

/** PUT /api/public/answer — Save one answer. */
export const saveAnswerRequestSchema = z
  .object({
    questionVersionId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative().nullable(),
    selectedOptionVersionIds: z.array(z.string().uuid()).max(64).optional(),
    textValue: z.string().max(4096).nullable().optional(),
    numericValue: z.number().finite().nullable().optional(),
    booleanValue: z.boolean().nullable().optional(),
  })
  .strict();
export type SaveAnswerRequest = z.infer<typeof saveAnswerRequestSchema>;

/** POST /api/public/submission — Finalize submit. */
export const finalizeSubmissionRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .strict();
export type FinalizeSubmissionRequest = z.infer<typeof finalizeSubmissionRequestSchema>;
