import { desc, eq } from 'drizzle-orm';
import { questionnaire, questionnaireVersion } from '../schema/questionnaire';
import { attempt, session } from '../schema/execution';
import { result, submission, verification } from '../schema/finalization';
import type { DbExecutor } from './authoring';

/**
 * Read-only monitor queries for the admin surface (Functional §92–93, §97).
 * Projections only — no candidate answers or internals leak here beyond what an
 * owner is entitled to see operationally.
 */

export async function listRecentSubmissions(exec: DbExecutor, limit = 100) {
  return exec
    .select({
      submissionRef: submission.publicRef,
      submissionStatus: submission.status,
      finalizedAt: submission.finalizedAt,
      submittedAt: submission.submittedAt,
      resultRef: result.publicRef,
      resultType: result.resultType,
      verificationRef: verification.publicRef,
      verificationStatus: verification.status,
      questionnaireSlug: questionnaire.slug,
      questionnaireVersionNumber: questionnaireVersion.versionNumber,
    })
    .from(submission)
    .leftJoin(result, eq(result.submissionId, submission.id))
    .leftJoin(verification, eq(verification.resultId, result.id))
    .innerJoin(attempt, eq(attempt.id, submission.attemptId))
    .innerJoin(questionnaireVersion, eq(questionnaireVersion.id, attempt.questionnaireVersionId))
    .innerJoin(questionnaire, eq(questionnaire.id, questionnaireVersion.questionnaireId))
    .where(eq(submission.status, 'COMPLETED'))
    .orderBy(desc(submission.submittedAt))
    .limit(Math.min(limit, 500));
}

export async function listRecentSessions(exec: DbExecutor, limit = 100) {
  return exec
    .select({
      sessionRef: session.publicRef,
      sessionStatus: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      attemptRef: attempt.publicRef,
      attemptStatus: attempt.status,
      completedAt: attempt.completedAt,
    })
    .from(session)
    .innerJoin(attempt, eq(attempt.id, session.attemptId))
    .orderBy(desc(session.createdAt))
    .limit(Math.min(limit, 500));
}
