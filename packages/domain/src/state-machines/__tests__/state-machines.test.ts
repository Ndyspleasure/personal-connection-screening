import { describe, expect, it } from 'vitest';
import { AppError } from '@pcs/security';
import { attemptMachine, sessionMachine, submissionMachine } from '../index';

describe('session state machine', () => {
  it('allows NEW -> ACTIVE and ACTIVE -> COMPLETED', () => {
    expect(sessionMachine.canTransition('NEW', 'ACTIVE')).toBe(true);
    expect(sessionMachine.canTransition('ACTIVE', 'COMPLETED')).toBe(true);
  });
  it('forbids resurrecting terminal states (COMPLETED/EXPIRED/REVOKED -> ACTIVE)', () => {
    expect(sessionMachine.canTransition('COMPLETED', 'ACTIVE')).toBe(false);
    expect(sessionMachine.canTransition('EXPIRED', 'COMPLETED')).toBe(false);
    expect(sessionMachine.canTransition('REVOKED', 'ACTIVE')).toBe(false);
  });
  it('assertTransition throws AppError(CONFLICT) on illegal transitions', () => {
    expect(() => sessionMachine.assertTransition('COMPLETED', 'ACTIVE')).toThrow(AppError);
    try {
      sessionMachine.assertTransition('COMPLETED', 'ACTIVE');
    } catch (e) {
      expect((e as AppError).code).toBe('CONFLICT');
    }
  });
  it('marks terminal states as terminal', () => {
    expect(sessionMachine.isTerminal('COMPLETED')).toBe(true);
    expect(sessionMachine.isTerminal('ACTIVE')).toBe(false);
  });
});

describe('attempt state machine', () => {
  it('follows the finalize path CREATED->ACTIVE->SUBMITTING->EVALUATING->COMPLETED', () => {
    expect(attemptMachine.canTransition('CREATED', 'ACTIVE')).toBe(true);
    expect(attemptMachine.canTransition('ACTIVE', 'SUBMITTING')).toBe(true);
    expect(attemptMachine.canTransition('SUBMITTING', 'EVALUATING')).toBe(true);
    expect(attemptMachine.canTransition('EVALUATING', 'COMPLETED')).toBe(true);
  });
  it('keeps technical errors separate from COMPLETED (never a business FAIL)', () => {
    expect(attemptMachine.canTransition('EVALUATING', 'EVALUATION_ERROR')).toBe(true);
    expect(attemptMachine.canTransition('EVALUATION_ERROR', 'COMPLETED')).toBe(false);
    expect(attemptMachine.canTransition('EVALUATION_ERROR', 'EVALUATING')).toBe(true); // audited retry
  });
});

describe('submission state machine', () => {
  it('allows a recoverable error to retry but never revives COMPLETED', () => {
    expect(submissionMachine.canTransition('SUBMITTING', 'RECOVERABLE_ERROR')).toBe(true);
    expect(submissionMachine.canTransition('RECOVERABLE_ERROR', 'SUBMITTING')).toBe(true);
    expect(submissionMachine.isTerminal('COMPLETED')).toBe(true);
  });
});
