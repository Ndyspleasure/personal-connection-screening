/**
 * Opaque, non-sequential public references (Data & State Model §5, §113;
 * Threat Model TH-009/TH-039/TH-040). Public references are NEVER database
 * primary keys and never imply authorization on their own.
 */

export const REFERENCE_PREFIXES = {
  session: 'ses',
  attempt: 'att',
  submission: 'sub',
  result: 'res',
  verification: 'ver',
  candidate: 'cnd',
} as const;

export type ReferenceKind = keyof typeof REFERENCE_PREFIXES;
export type ReferencePrefix = (typeof REFERENCE_PREFIXES)[ReferenceKind];

/** Branded string types so a raw string is never mistaken for a public ref. */
export type Branded<T, B extends string> = T & { readonly __brand: B };

export type SessionRef = Branded<string, 'SessionRef'>;
export type AttemptRef = Branded<string, 'AttemptRef'>;
export type SubmissionRef = Branded<string, 'SubmissionRef'>;
export type ResultRef = Branded<string, 'ResultRef'>;
export type VerificationRef = Branded<string, 'VerificationRef'>;
export type CandidateRef = Branded<string, 'CandidateRef'>;
