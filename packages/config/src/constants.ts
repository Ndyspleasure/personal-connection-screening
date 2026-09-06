import type { RetakeMode } from '@pcs/types';

/** Public session cookie (Technology Architecture §14; Threat Model §67). */
export const PUBLIC_SESSION_COOKIE = 'pcs_ses';

/** Bytes of entropy for opaque public references and session tokens. */
export const PUBLIC_REF_ENTROPY_BYTES = 16; // 128 bits
export const SESSION_TOKEN_ENTROPY_BYTES = 32; // 256 bits

/**
 * Default policy values baked in as system defaults. These are the *fallback*
 * used when no policy version is configured; a live PolicyVersion always wins
 * and is snapshotted onto each attempt at creation (Data & State Model §20, §46).
 *
 * Values reflect the confirmed product decisions:
 *  - questionnaire timer = ABSOLUTE deadline
 *  - retake = policy-driven, default ON_NEW_VERSION
 *  - max attempts = 3, cooldown = none
 */
export interface PolicyDefaults {
  sessionLifetimeSeconds: number;
  questionnaireTimeLimitSeconds: number | null;
  timerMode: 'absolute';
  allowResume: boolean;
  allowMultiDevice: boolean;
  retakeMode: RetakeMode;
  maxAttempts: number;
  cooldownSeconds: number;
}

export const POLICY_DEFAULTS: PolicyDefaults = {
  sessionLifetimeSeconds: 24 * 60 * 60,
  questionnaireTimeLimitSeconds: 30 * 60,
  timerMode: 'absolute',
  allowResume: true,
  allowMultiDevice: true,
  retakeMode: 'ON_NEW_VERSION',
  maxAttempts: 3,
  cooldownSeconds: 0,
};

/** Rate-limit budgets per logical operation (Threat Model §28, §36). */
export const RATE_LIMITS = {
  start: { limit: 10, windowSeconds: 60 },
  answerSave: { limit: 120, windowSeconds: 60 },
  submit: { limit: 10, windowSeconds: 60 },
  verificationLookup: { limit: 20, windowSeconds: 60 },
  // Access-code entry for gated sessions — tight budget to blunt brute force
  // (Threat §28–29); the server also enforces expiry/usage caps.
  accessCode: { limit: 8, windowSeconds: 60 },
  adminLogin: { limit: 10, windowSeconds: 60 },
} as const;

export type RateLimitOperation = keyof typeof RATE_LIMITS;
