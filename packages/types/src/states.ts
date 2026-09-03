/**
 * Explicit state and enum definitions (Data & State Model §23–26, §35, §52–55).
 *
 * States are explicit; terminal states are final for the normal user flow.
 * PASS/FAIL are business results, NOT session/attempt states.
 */

export const SESSION_STATES = [
  'NEW',
  'ACTIVE',
  'COMPLETED',
  'EXPIRED',
  'ABANDONED',
  'REVOKED',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const ATTEMPT_STATES = [
  'CREATED',
  'ACTIVE',
  'SUBMITTING',
  'EVALUATING',
  'COMPLETED',
  'EXPIRED',
  'ABANDONED',
  'REVOKED',
  'EVALUATION_ERROR',
  'INTEGRITY_ERROR',
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const SUBMISSION_STATES = [
  'DRAFT',
  'SUBMITTING',
  'EVALUATING',
  'COMPLETED',
  'RECOVERABLE_ERROR',
  'EVALUATION_ERROR',
  'INTEGRITY_ERROR',
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

/** Business result. Only ever set when evaluation is valid and consistent. */
export const RESULT_TYPES = ['PASS', 'FAIL'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

/** Lifecycle of any evaluation-affecting versioned entity. */
export const VERSION_STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** Supported MVP question types (confirmed product decision). */
export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'boolean',
  'text',
  'numeric',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Retake policy modes (Master Spec §19). */
export const RETAKE_MODES = [
  'NEVER',
  'ON_NEW_VERSION',
  'AFTER_COOLDOWN',
  'ADMIN_APPROVAL',
  'UNLIMITED',
] as const;
export type RetakeMode = (typeof RETAKE_MODES)[number];

export const VERIFICATION_STATUSES = ['VALID', 'REVOKED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
