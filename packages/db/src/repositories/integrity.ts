import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { attempt } from '../schema/execution';
import { evaluation, result, submission, verification } from '../schema/finalization';
import { integrityFinding, type IntegrityFindingRecord } from '../schema/governance';
import type { DbExecutor } from './authoring';

/**
 * Integrity detection queries (Data §100–105, §113; Func §98). Each returns the
 * offending rows for one class of impossible/inconsistent state. They only READ
 * — the IntegrityService records findings; it never repairs (INT-02).
 */

/** PASS with a score below the passing threshold (Data §113 canonical example). */
export async function findPassBelowPassing(exec: DbExecutor) {
  return exec
    .select({
      resultId: result.id,
      resultRef: result.publicRef,
      score: result.score,
      passingScore: evaluation.passingScore,
    })
    .from(result)
    .innerJoin(evaluation, eq(evaluation.id, result.evaluationId))
    .where(and(eq(result.resultType, 'PASS'), sql`${result.score} < ${evaluation.passingScore}`));
}

/** FAIL despite a score at or above the passing threshold. */
export async function findFailAtOrAbovePassing(exec: DbExecutor) {
  return exec
    .select({
      resultId: result.id,
      resultRef: result.publicRef,
      score: result.score,
      passingScore: evaluation.passingScore,
    })
    .from(result)
    .innerJoin(evaluation, eq(evaluation.id, result.evaluationId))
    .where(and(eq(result.resultType, 'FAIL'), sql`${result.score} >= ${evaluation.passingScore}`));
}

/** A result whose stored score disagrees with its evaluation's score. */
export async function findResultScoreMismatch(exec: DbExecutor) {
  return exec
    .select({
      resultId: result.id,
      resultRef: result.publicRef,
      resultScore: result.score,
      evaluationScore: evaluation.score,
    })
    .from(result)
    .innerJoin(evaluation, eq(evaluation.id, result.evaluationId))
    .where(sql`${result.score} <> ${evaluation.score}`);
}

/** A result with no verification row (Data §39 orphan). */
export async function findResultsWithoutVerification(exec: DbExecutor) {
  return exec
    .select({ resultId: result.id, resultRef: result.publicRef })
    .from(result)
    .leftJoin(verification, eq(verification.resultId, result.id))
    .where(isNull(verification.id));
}

/** More than one COMPLETED submission for the same attempt (INV-D06 violation). */
export async function findDuplicateFinalSubmissions(exec: DbExecutor) {
  return exec
    .select({ attemptId: submission.attemptId, count: sql<number>`count(*)::int` })
    .from(submission)
    .where(eq(submission.status, 'COMPLETED'))
    .groupBy(submission.attemptId)
    .having(sql`count(*) > 1`);
}

/** An evaluation whose questionnaire version disagrees with its attempt (Data §63). */
export async function findVersionMismatches(exec: DbExecutor) {
  return exec
    .select({
      evaluationId: evaluation.id,
      evaluationQuestionnaireVersionId: evaluation.questionnaireVersionId,
      attemptQuestionnaireVersionId: attempt.questionnaireVersionId,
    })
    .from(evaluation)
    .innerJoin(submission, eq(submission.id, evaluation.submissionId))
    .innerJoin(attempt, eq(attempt.id, submission.attemptId))
    .where(sql`${evaluation.questionnaireVersionId} <> ${attempt.questionnaireVersionId}`);
}

/** A COMPLETED attempt with no COMPLETED submission + result (Data §35–38). */
export async function findCompletedAttemptsWithoutResult(exec: DbExecutor) {
  return exec
    .select({ attemptId: attempt.id, attemptRef: attempt.publicRef })
    .from(attempt)
    .leftJoin(
      submission,
      and(eq(submission.attemptId, attempt.id), eq(submission.status, 'COMPLETED')),
    )
    .leftJoin(result, eq(result.submissionId, submission.id))
    .where(and(eq(attempt.status, 'COMPLETED'), isNull(result.id)));
}

export interface IntegrityFindingInput {
  scanId: string;
  kind: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: Record<string, unknown>;
}

export async function insertIntegrityFindings(
  exec: DbExecutor,
  findings: IntegrityFindingInput[],
): Promise<void> {
  if (findings.length === 0) return;
  await exec.insert(integrityFinding).values(
    findings.map((f) => ({
      scanId: f.scanId,
      kind: f.kind,
      entityType: f.entityType ?? null,
      entityId: f.entityId ?? null,
      detail: f.detail ?? {},
    })),
  );
}

export async function listIntegrityFindings(
  exec: DbExecutor,
  opts: { limit?: number } = {},
): Promise<IntegrityFindingRecord[]> {
  return exec
    .select()
    .from(integrityFinding)
    .orderBy(desc(integrityFinding.detectedAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}
