import { ERROR_HTTP_STATUS, type ErrorCode, type PublicErrorBody } from '@pcs/types';

/**
 * Domain error carrying a machine-readable code. The optional `cause` retains
 * internal detail for server logs but is NEVER serialized to a client
 * (Threat Model §72; Functional Spec §100–101).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

/** Generic, non-leaky public messages. The UI may override with CMS copy. */
const PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  SESSION_NOT_FOUND: 'This session is unavailable.',
  SESSION_EXPIRED: 'This session has expired.',
  SESSION_REVOKED: 'This session is no longer available.',
  SESSION_COMPLETED: 'This attempt is already complete.',
  NOT_AUTHORIZED: 'This resource is unavailable.',
  NOT_FOUND: 'This resource is unavailable.',
  QUESTION_NOT_IN_VERSION: 'That answer could not be accepted.',
  QUESTIONNAIRE_VERSION_MISMATCH: 'This session was updated. Please refresh.',
  INVALID_ANSWER: 'That answer could not be accepted.',
  REQUIRED_ANSWER_MISSING: 'Please answer all required questions.',
  STALE_STATE: 'This session changed elsewhere. Refreshing your latest progress.',
  CONFLICT: 'This session changed elsewhere. Please refresh.',
  QUESTIONNAIRE_TIME_LIMIT_EXCEEDED: 'The time limit for this questionnaire has passed.',
  SUBMISSION_ALREADY_COMPLETED: 'This attempt is already complete.',
  RETAKE_NOT_ALLOWED: 'A new attempt is not available right now.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again shortly.',
  VALIDATION_ERROR: 'Some information was invalid.',
  EVALUATION_ERROR: 'We could not finish processing. Please try again shortly.',
  INTEGRITY_ERROR: 'We hit an unexpected problem. Please try again shortly.',
  RECOVERABLE_ERROR: 'We could not finish that. Please try again shortly.',
  TEMPORARY_SYSTEM_ERROR: 'Something went wrong. Please try again shortly.',
};

export interface PublicError {
  status: number;
  body: PublicErrorBody;
}

/** Map any thrown value to a safe public error. Unknowns become a generic 5xx. */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof AppError) {
    return {
      status: ERROR_HTTP_STATUS[err.code],
      body: { error: { code: err.code, message: PUBLIC_MESSAGES[err.code] } },
    };
  }
  return {
    status: ERROR_HTTP_STATUS.TEMPORARY_SYSTEM_ERROR,
    body: {
      error: {
        code: 'TEMPORARY_SYSTEM_ERROR',
        message: PUBLIC_MESSAGES.TEMPORARY_SYSTEM_ERROR,
      },
    },
  };
}
