import {
  casTransitionAttempt,
  casTransitionSession,
  getAttemptById,
  getAttemptByRef,
  getSessionByFingerprint,
  getSessionByRef,
  insertAttempt,
  insertSession,
  touchSession,
  type Attempt,
  type AttemptPolicySnapshot,
  type Database,
  type PolicyVersion,
  type QuestionnaireVersion,
  type ScoringVersion,
  type Session,
} from '@pcs/db';
import { AppError, fingerprintToken, generatePublicRef, generateSessionToken } from '@pcs/security';
import { snapshotPolicyVersion } from './policy-service';

/**
 * SessionService — start, resume, expire, revoke, complete.
 *
 * Traceability:
 *   - Master Spec §5, §7 (session/start), §33 (transitions)
 *   - Functional §6, §7, §12–17, §113–115
 *   - Data & State Model §21–28, §33, §46 (version lock), §81 (start tx)
 *   - Threat Model TH-001/002/006 (token opacity, no fixation), TH-004
 *     (server-side revocation), TH-020/TH-030 (terminal states)
 *
 * `start` is the atomic boundary: create attempt (with version-lock snapshot)
 * and session in one DB transaction, then return the raw session token to be
 * placed in the HttpOnly/Secure cookie (only the fingerprint persists).
 */

export interface StartInput {
  questionnaireVersion: QuestionnaireVersion;
  scoringVersion: ScoringVersion;
  policyVersion: PolicyVersion;
  candidateContextId?: string | null;
  now?: Date;
}

export interface StartOutput {
  attempt: Attempt;
  session: Session;
  /**
   * Raw session token — SENSITIVE. The service NEVER logs or persists this.
   * The caller is responsible for placing it in the HttpOnly/Secure cookie
   * and discarding it thereafter (Tech §12–14; Threat TH-002).
   */
  rawSessionToken: string;
}

function computeQuestionnaireDeadline(
  startedAt: Date,
  timeLimitSeconds: number | null,
): Date | null {
  if (!timeLimitSeconds || timeLimitSeconds <= 0) return null;
  return new Date(startedAt.getTime() + timeLimitSeconds * 1000);
}

export const sessionService = {
  /**
   * Start a new attempt + session. Called by /api/public/session on Start.
   *
   * Requires the caller (route handler) to have already resolved:
   *   - the current PUBLISHED questionnaire version
   *   - its locked scoring version
   *   - the current PUBLISHED policy version
   *
   * The service:
   *   1. Validates all three are PUBLISHED (never DRAFT — historical integrity).
   *   2. Freezes the policy values into the attempt row (Data §20, §46, INV-D07).
   *   3. Computes the absolute questionnaire deadline server-side (Data §28).
   *   4. Issues a fresh opaque token; stores only its fingerprint (Tech §13).
   *   5. Persists (attempt + session) atomically.
   */
  async start(db: Database, tokenSecret: string, input: StartInput): Promise<StartOutput> {
    if (input.questionnaireVersion.status !== 'PUBLISHED') {
      throw new AppError('CONFLICT', 'questionnaire version is not published');
    }
    if (input.scoringVersion.status !== 'PUBLISHED') {
      throw new AppError('CONFLICT', 'scoring version is not published');
    }
    if (input.policyVersion.status !== 'PUBLISHED') {
      throw new AppError('CONFLICT', 'policy version is not published');
    }
    if (input.questionnaireVersion.scoringVersionId !== input.scoringVersion.id) {
      throw new AppError(
        'INTEGRITY_ERROR',
        'questionnaire version references a different scoring version',
      );
    }

    const now = input.now ?? new Date();
    const policySnapshot: AttemptPolicySnapshot = snapshotPolicyVersion(input.policyVersion);
    const questionnaireDeadline = computeQuestionnaireDeadline(
      now,
      policySnapshot.questionnaireTimeLimitSeconds,
    );
    const expiresAt = new Date(now.getTime() + policySnapshot.sessionLifetimeSeconds * 1000);

    const rawSessionToken = generateSessionToken();
    const fingerprint = fingerprintToken(rawSessionToken, tokenSecret);

    return db.transaction(async (tx) => {
      const attempt = await insertAttempt(tx, {
        publicRef: generatePublicRef('attempt'),
        candidateContextId: input.candidateContextId ?? null,
        questionnaireVersionId: input.questionnaireVersion.id,
        scoringVersionId: input.scoringVersion.id,
        policyVersionId: input.policyVersion.id,
        policySnapshot,
        questionnaireDeadline,
        status: 'ACTIVE',
      });
      const session = await insertSession(tx, {
        publicRef: generatePublicRef('session'),
        attemptId: attempt.id,
        tokenFingerprint: fingerprint,
        expiresAt,
      });
      return { attempt, session, rawSessionToken };
    });
  },

  /**
   * Resume a session by its raw token. Verifies:
   *   - fingerprint match (server-side lookup — cookie carries no truth)
   *   - session is still ACTIVE (not COMPLETED/EXPIRED/ABANDONED/REVOKED)
   *   - `expires_at` has not passed at request time (Data §65; Tech §111)
   * Auto-transitions to EXPIRED and returns SESSION_EXPIRED if the clock has
   * moved past `expires_at`, so no read is silently "still active" (Threat TH-003).
   * Only server-owned state is authoritative (Master §2.1; Sec INV-SD02).
   */
  async resumeByToken(
    db: Database,
    tokenSecret: string,
    rawToken: string,
    now: Date = new Date(),
  ): Promise<{ session: Session; attempt: Attempt }> {
    const fingerprint = fingerprintToken(rawToken, tokenSecret);

    // Phase 1: read-and-classify.
    const classification = await db.transaction(async (tx) => {
      const session = await getSessionByFingerprint(tx, fingerprint);
      if (!session) return { kind: 'not_found' as const };
      if (session.status === 'REVOKED') return { kind: 'revoked' as const };
      if (session.status === 'ABANDONED') return { kind: 'not_found' as const };
      if (session.status === 'COMPLETED') {
        const attempt = await getAttemptById(tx, session.attemptId);
        if (!attempt) return { kind: 'integrity' as const };
        return { kind: 'ok' as const, session, attempt };
      }
      if (session.status !== 'ACTIVE') return { kind: 'not_found' as const };
      if (session.expiresAt.getTime() <= now.getTime()) {
        return { kind: 'expired' as const, session };
      }
      await touchSession(tx, session.id);
      const attempt = await getAttemptById(tx, session.attemptId);
      if (!attempt) return { kind: 'integrity' as const };
      return { kind: 'ok' as const, session, attempt };
    });

    switch (classification.kind) {
      case 'ok':
        return { session: classification.session, attempt: classification.attempt };
      case 'not_found':
        throw new AppError('SESSION_NOT_FOUND');
      case 'revoked':
        throw new AppError('SESSION_REVOKED');
      case 'integrity':
        throw new AppError('INTEGRITY_ERROR', 'session references missing attempt');
      case 'expired': {
        // Phase 2: commit the auto-expiry transition in its OWN transaction so
        // the state change persists even though we're about to throw
        // SESSION_EXPIRED. Concurrent readers see EXPIRED after this commits.
        const s = classification.session;
        await db.transaction(async (tx) => {
          await casTransitionSession(tx, { id: s.id, from: ['ACTIVE'], to: 'EXPIRED' });
          await casTransitionAttempt(tx, {
            id: s.attemptId,
            from: ['ACTIVE', 'CREATED'],
            to: 'EXPIRED',
          });
        });
        throw new AppError('SESSION_EXPIRED');
      }
    }
  },

  /** Admin: mark a session (and its attempt) REVOKED. Sec §33, Func §114. */
  async revoke(db: Database, sessionRef: string): Promise<void> {
    await db.transaction(async (tx) => {
      const session = await getSessionByRef(tx, sessionRef);
      if (!session) throw new AppError('NOT_FOUND');
      const now = new Date();
      const wonSession = await casTransitionSession(tx, {
        id: session.id,
        from: ['NEW', 'ACTIVE'],
        to: 'REVOKED',
        revokedAt: now,
      });
      if (!wonSession) throw new AppError('CONFLICT', 'session already terminal');
      await casTransitionAttempt(tx, {
        id: session.attemptId,
        from: ['CREATED', 'ACTIVE', 'SUBMITTING', 'EVALUATING'],
        to: 'REVOKED',
      });
    });
  },

  /** Look up an attempt by its opaque public reference (Data §5). */
  async getAttemptByRef(db: Database, publicRef: string) {
    return getAttemptByRef(db, publicRef);
  },
};
