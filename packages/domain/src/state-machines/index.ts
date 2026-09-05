import type { AttemptState, SessionState, SubmissionState } from '@pcs/types';
import { createStateMachine } from './machine';

export * from './machine';

/** Session lifecycle (Data & State Model §26, §53). PASS/FAIL are NOT states. */
export const sessionMachine = createStateMachine<SessionState>('session', {
  NEW: ['ACTIVE'],
  ACTIVE: ['COMPLETED', 'EXPIRED', 'ABANDONED', 'REVOKED'],
  COMPLETED: [],
  EXPIRED: [],
  ABANDONED: [],
  REVOKED: [],
});

/** Attempt lifecycle (Data & State Model §23, §52). */
export const attemptMachine = createStateMachine<AttemptState>('attempt', {
  CREATED: ['ACTIVE', 'EXPIRED', 'ABANDONED', 'REVOKED'],
  ACTIVE: ['SUBMITTING', 'EXPIRED', 'ABANDONED', 'REVOKED'],
  SUBMITTING: ['EVALUATING', 'INTEGRITY_ERROR'],
  EVALUATING: ['COMPLETED', 'EVALUATION_ERROR', 'INTEGRITY_ERROR'],
  COMPLETED: [],
  EXPIRED: [],
  ABANDONED: [],
  REVOKED: [],
  EVALUATION_ERROR: ['EVALUATING'], // explicit, audited retry only
  INTEGRITY_ERROR: [],
});

/** Submission lifecycle (Data & State Model §35, §54). */
export const submissionMachine = createStateMachine<SubmissionState>('submission', {
  DRAFT: ['SUBMITTING'],
  SUBMITTING: ['EVALUATING', 'RECOVERABLE_ERROR', 'INTEGRITY_ERROR'],
  EVALUATING: ['COMPLETED', 'EVALUATION_ERROR', 'INTEGRITY_ERROR'],
  COMPLETED: [],
  RECOVERABLE_ERROR: ['SUBMITTING'],
  EVALUATION_ERROR: ['EVALUATING'],
  INTEGRITY_ERROR: [],
});
