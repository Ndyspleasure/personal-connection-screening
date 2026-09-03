import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from './authoring';
import { evaluation, result, submission, verification } from '../schema/finalization';

/**
 * Finalization repository — submission / evaluation / result / verification
 * (Data & State Model §33–39, §61, §83–84). Every write here happens inside
 * the SubmissionService.finalize() transaction so partial finalization never
 * becomes visible (Data §84, §112).
 */

export async function insertSubmission(
  exec: DbExecutor,
  input: { publicRef: string; attemptId: string; idempotencyKey?: string | null; status?: string },
) {
  const rows = await exec
    .insert(submission)
    .values({
      publicRef: input.publicRef,
      attemptId: input.attemptId,
      idempotencyKey: input.idempotencyKey ?? null,
      status: input.status ?? 'SUBMITTING',
    })
    .returning();
  return rows[0]!;
}

export async function getSubmissionByIdempotencyKey(
  exec: DbExecutor,
  attemptId: string,
  key: string,
) {
  const rows = await exec
    .select()
    .from(submission)
    .where(and(eq(submission.attemptId, attemptId), eq(submission.idempotencyKey, key)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCompletedSubmissionForAttempt(exec: DbExecutor, attemptId: string) {
  const rows = await exec
    .select()
    .from(submission)
    .where(and(eq(submission.attemptId, attemptId), eq(submission.status, 'COMPLETED')))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSubmissionByRef(exec: DbExecutor, publicRef: string) {
  const rows = await exec
    .select()
    .from(submission)
    .where(eq(submission.publicRef, publicRef))
    .limit(1);
  return rows[0] ?? null;
}

export async function markSubmissionCompleted(exec: DbExecutor, id: string) {
  const rows = await exec
    .update(submission)
    .set({ status: 'COMPLETED', finalizedAt: new Date() })
    .where(and(eq(submission.id, id), eq(submission.status, 'SUBMITTING')))
    .returning({ id: submission.id });
  return rows.length > 0;
}

export async function insertEvaluation(
  exec: DbExecutor,
  input: {
    submissionId: string;
    questionnaireVersionId: string;
    scoringVersionId: string;
    score: number;
    passingScore: number;
    inputSnapshot: unknown;
  },
) {
  const rows = await exec
    .insert(evaluation)
    .values({
      submissionId: input.submissionId,
      questionnaireVersionId: input.questionnaireVersionId,
      scoringVersionId: input.scoringVersionId,
      score: input.score,
      passingScore: input.passingScore,
      inputSnapshot: input.inputSnapshot,
    })
    .returning();
  return rows[0]!;
}

export async function insertResult(
  exec: DbExecutor,
  input: {
    publicRef: string;
    submissionId: string;
    evaluationId: string;
    resultType: 'PASS' | 'FAIL';
    score: number;
  },
) {
  const rows = await exec
    .insert(result)
    .values({
      publicRef: input.publicRef,
      submissionId: input.submissionId,
      evaluationId: input.evaluationId,
      resultType: input.resultType,
      score: input.score,
    })
    .returning();
  return rows[0]!;
}

export async function insertVerification(
  exec: DbExecutor,
  input: { publicRef: string; resultId: string },
) {
  const rows = await exec
    .insert(verification)
    .values({
      publicRef: input.publicRef,
      resultId: input.resultId,
    })
    .returning();
  return rows[0]!;
}

export async function getResultForAttempt(exec: DbExecutor, attemptId: string) {
  const rows = await exec
    .select({
      submission,
      result,
      evaluation,
      verification,
    })
    .from(result)
    .innerJoin(submission, eq(submission.id, result.submissionId))
    .innerJoin(evaluation, eq(evaluation.id, result.evaluationId))
    .leftJoin(verification, eq(verification.resultId, result.id))
    .where(and(eq(submission.attemptId, attemptId), eq(submission.status, 'COMPLETED')))
    .limit(1);
  return rows[0] ?? null;
}

export async function getResultByRef(exec: DbExecutor, publicRef: string) {
  const rows = await exec
    .select({
      submission,
      result,
      evaluation,
      verification,
    })
    .from(result)
    .innerJoin(submission, eq(submission.id, result.submissionId))
    .innerJoin(evaluation, eq(evaluation.id, result.evaluationId))
    .leftJoin(verification, eq(verification.resultId, result.id))
    .where(eq(result.publicRef, publicRef))
    .limit(1);
  return rows[0] ?? null;
}

export async function getVerificationByRef(exec: DbExecutor, publicRef: string) {
  const rows = await exec
    .select({
      result,
      verification,
    })
    .from(verification)
    .innerJoin(result, eq(result.id, verification.resultId))
    .where(eq(verification.publicRef, publicRef))
    .limit(1);
  return rows[0] ?? null;
}
