/**
 * Machine-readable error codes (Technology Architecture §60, Threat Model §72).
 *
 * The public UI maps these to safe, human-readable, CMS-driven copy. Error codes
 * never leak internal object structure, stack traces, or another user's data.
 */
export const ERROR_CODES = [
  // session / auth
  'SESSION_NOT_FOUND',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_COMPLETED',
  'NOT_AUTHORIZED',
  'NOT_FOUND',
  // questionnaire / versioning
  'QUESTION_NOT_IN_VERSION',
  'QUESTIONNAIRE_VERSION_MISMATCH',
  'INVALID_ANSWER',
  'REQUIRED_ANSWER_MISSING',
  // concurrency / submission
  'STALE_STATE',
  'CONFLICT',
  'QUESTIONNAIRE_TIME_LIMIT_EXCEEDED',
  'SUBMISSION_ALREADY_COMPLETED',
  'RETAKE_NOT_ALLOWED',
  // technical (never surfaced as a business FAIL)
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'EVALUATION_ERROR',
  'INTEGRITY_ERROR',
  'RECOVERABLE_ERROR',
  'TEMPORARY_SYSTEM_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status mapping for each error code (safe-by-default). */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  SESSION_NOT_FOUND: 404,
  SESSION_EXPIRED: 410,
  SESSION_REVOKED: 410,
  SESSION_COMPLETED: 409,
  NOT_AUTHORIZED: 403,
  NOT_FOUND: 404,
  QUESTION_NOT_IN_VERSION: 422,
  QUESTIONNAIRE_VERSION_MISMATCH: 409,
  INVALID_ANSWER: 422,
  REQUIRED_ANSWER_MISSING: 422,
  STALE_STATE: 409,
  CONFLICT: 409,
  QUESTIONNAIRE_TIME_LIMIT_EXCEEDED: 410,
  SUBMISSION_ALREADY_COMPLETED: 409,
  RETAKE_NOT_ALLOWED: 403,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  EVALUATION_ERROR: 500,
  INTEGRITY_ERROR: 500,
  RECOVERABLE_ERROR: 503,
  TEMPORARY_SYSTEM_ERROR: 503,
};
