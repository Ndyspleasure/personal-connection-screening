/**
 * Explicit public projections (Technology Architecture §38–40, §70).
 *
 * These DTOs are the ONLY shapes returned to a public browser. They deliberately
 * omit answers, IP, security metadata, audit, and internal IDs so schema
 * evolution can never accidentally over-expose data (Threat Model §42, §71).
 */
import type { ResultType, VerificationStatus } from './states';

/** Public verification projection (confirmed: PASS/FAIL + date + version label). */
export interface VerificationPublicView {
  verificationRef: string;
  status: VerificationStatus;
  result: ResultType;
  completedAt: string; // ISO 8601, server time
  questionnaireVersionLabel: string;
}

/** Public result projection (numeric score deliberately NOT included). */
export interface ResultPublicView {
  resultRef: string;
  result: ResultType;
  completedAt: string;
  verificationRef: string | null;
  /** Whether policy permits the contact/chat gate for this result. */
  contactAvailable: boolean;
}

/** Safe error envelope returned to clients (no internal detail). */
export interface PublicErrorBody {
  error: {
    code: string;
    message: string;
  };
}
