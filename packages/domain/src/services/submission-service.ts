import {
  getAttemptById,
  getResultByRef,
  getResultForAttempt,
  getSubmissionByIdempotencyKey,
  getVerificationByRef,
  insertEvaluation,
  insertResult,
  insertSubmission,
  listAnswersForAttempt,
  listScoringRules,
  markSubmissionCompleted,
  insertVerification,
  schema,
  sql,
  type Attempt,
  type Database,
  type Evaluation,
  type Result,
  type Submission,
  type Verification,
} from '@pcs/db';
import { AppError, generatePublicRef } from '@pcs/security';
import type { ResultPublicView, VerificationPublicView } from '@pcs/types';
import type { Actor, CandidateActor } from '../authz';
import { assertAdmin } from './errors';
import {
  assertConsistentOutcome,
  buildOptionScores,
  evaluate,
  type EvaluationAnswer,
} from '../evaluation/engine';

/**
 * SubmissionService — the atomic finalize + evaluate + result + verification.
 *
 * Traceability — this is the heart of the whole system:
 *   - Master §4.6, §11–20, §33 (state), §35 (idempotency)
 *   - Functional §46–55 (submit validation and idempotency), §60 (evaluation
 *     error stays technical, never becomes FAIL), §62 (result copy), §64
 *     (result URL opaque)
 *   - Data & State Model §33 (submission), §34 (one final), §37 (snapshot),
 *     §60 (idempotency), §83 (finalize tx), §84 (evaluation tx), §111
 *     (double-submit), §112 (timeout recovery)
 *   - Threat Model TH-003 (replay), TH-013–TH-017 (fake score), TH-024–TH-026
 *     (dup / stale), TH-029 (two workers)
 *   - Acceptance: SUB-05/06, SEC-AC-09/10 (double submit -> one final)
 *
 * `finalize` implements the guarantees in ONE database transaction:
 *   1. SELECT ... FOR UPDATE on the attempt row.
 *   2. Enforce attempt state + deadline (fail closed on EXPIRED/COMPLETED/…)
 *   3. Enforce completeness: every REQUIRED bound question has an answer.
 *   4. Enforce belongs-to on every answer (Data §63).
 *   5. Insert submission (SUBMITTING) — the ONE-final-submission invariant
 *      (partial unique index) means a concurrent second finalize can only
 *      insert SUBMITTING (fine) and the actual race resolves at step 6.
 *   6. Run the pure evaluation engine using ONLY the attempt's locked scoring
 *      version — never a client-provided score (INV-D10; AC SEC-AC-01).
 *   7. Insert evaluation + result + verification.
 *   8. CAS transition attempt to COMPLETED; markSubmissionCompleted (the
 *      partial unique index on (attempt_id) WHERE status = COMPLETED means
 *      only one row can reach COMPLETED per attempt, DB-guaranteed).
 *
 * Retry safety: if the caller repeats the same idempotency_key, we return the
 * existing final record instead of finalizing again. If a submit request is
 * repeated without a key AND the attempt is already COMPLETED, we still return
 * the existing final record — never invent a new one (Data §111, §112).
 */

export interface FinalizeInput {
  idempotencyKey?: string | null;
  now?: Date;
}

export interface FinalizeOutput {
  attempt: Attempt;
  submission: Submission;
  evaluation: Evaluation;
  result: Result;
  verification: Verification;
  /** true if this call is the one that finalized; false = returning existing. */
  wasFirstFinalization: boolean;
}

/**
 * Public projection helpers. Live here rather than @pcs/security so consumers
 * only need @pcs/domain to build a public response (Tech §38–40, §70).
 */
export function toResultPublicView(input: {
  result: Result;
  verification: Verification | null;
  contactAvailable: boolean;
}): ResultPublicView {
  return {
    resultRef: input.result.publicRef,
    result: input.result.resultType as ResultPublicView['result'],
    completedAt: input.result.createdAt.toISOString(),
    verificationRef: input.verification?.publicRef ?? null,
    contactAvailable: input.contactAvailable,
  };
}

export function toVerificationPublicView(input: {
  verification: Verification;
  result: Result;
  questionnaireVersionLabel: string;
}): VerificationPublicView {
  return {
    verificationRef: input.verification.publicRef,
    status: input.verification.status as VerificationPublicView['status'],
    result: input.result.resultType as VerificationPublicView['result'],
    completedAt: input.result.createdAt.toISOString(),
    questionnaireVersionLabel: input.questionnaireVersionLabel,
  };
}

async function fetchExistingFinalization(
  db: Database,
  attemptId: string,
): Promise<FinalizeOutput | null> {
  const found = await getResultForAttempt(db, attemptId);
  if (!found) return null;
  const attempt = await getAttemptById(db, attemptId);
  if (!attempt) throw new AppError('INTEGRITY_ERROR', 'result without attempt');
  if (!found.verification) throw new AppError('INTEGRITY_ERROR', 'result without verification');
  return {
    attempt,
    submission: found.submission,
    evaluation: found.evaluation,
    result: found.result,
    verification: found.verification,
    wasFirstFinalization: false,
  };
}

async function loadRequiredBindings(db: Database, questionnaireVersionId: string) {
  const rows = await db
    .select({
      questionVersionId: schema.questionnaireVersionQuestion.questionVersionId,
      required: schema.questionVersion.required,
    })
    .from(schema.questionnaireVersionQuestion)
    .innerJoin(
      schema.questionVersion,
      sql`${schema.questionVersion.id} = ${schema.questionnaireVersionQuestion.questionVersionId}`,
    )
    .where(
      sql`${schema.questionnaireVersionQuestion.questionnaireVersionId} = ${questionnaireVersionId}`,
    );
  return rows;
}

export const submissionService = {
  async finalize(
    db: Database,
    actor: CandidateActor,
    input: FinalizeInput = {},
  ): Promise<FinalizeOutput> {
    const now = input.now ?? new Date();

    // Idempotency short-circuit BEFORE opening a finalize tx (Data §60, §111).
    if (input.idempotencyKey) {
      const prior = await getSubmissionByIdempotencyKey(db, actor.attemptId, input.idempotencyKey);
      if (prior && prior.status === 'COMPLETED') {
        const existing = await fetchExistingFinalization(db, actor.attemptId);
        if (!existing) throw new AppError('INTEGRITY_ERROR');
        return existing;
      }
    }
    // Retry / refresh after network drop: attempt already COMPLETED.
    const alreadyFinal = await fetchExistingFinalization(db, actor.attemptId);
    if (alreadyFinal) return alreadyFinal;

    return db.transaction(async (tx) => {
      const attempt = await getAttemptById(tx, actor.attemptId, /* forUpdate */ true);
      if (!attempt) throw new AppError('SESSION_NOT_FOUND');
      if (attempt.status === 'COMPLETED') {
        // Somebody else finished between our earlier check and FOR UPDATE.
        // Fall through to fetch and return.
        const found = await fetchExistingFinalization(db, actor.attemptId);
        if (!found) throw new AppError('INTEGRITY_ERROR');
        return found;
      }
      if (attempt.status === 'EXPIRED') throw new AppError('SESSION_EXPIRED');
      if (attempt.status === 'REVOKED') throw new AppError('SESSION_REVOKED');
      if (attempt.status !== 'ACTIVE') {
        throw new AppError('CONFLICT', `cannot submit from status ${attempt.status}`);
      }
      if (
        attempt.questionnaireDeadline &&
        attempt.questionnaireDeadline.getTime() <= now.getTime()
      ) {
        throw new AppError('QUESTIONNAIRE_TIME_LIMIT_EXCEEDED');
      }

      // Completeness (Data §67, INV-D05).
      const requiredBindings = await loadRequiredBindings(tx, attempt.questionnaireVersionId);
      const answers = await listAnswersForAttempt(tx, attempt.id);
      const answerByQv = new Map(answers.map((a) => [a.questionVersionId, a]));
      for (const b of requiredBindings) {
        if (b.required && !answerByQv.has(b.questionVersionId)) {
          throw new AppError('REQUIRED_ANSWER_MISSING');
        }
      }

      // Belongs-to (Data §63): every answer must correspond to a binding.
      const bindingIds = new Set(requiredBindings.map((b) => b.questionVersionId));
      for (const a of answers) {
        if (!bindingIds.has(a.questionVersionId)) {
          throw new AppError(
            'INTEGRITY_ERROR',
            'answer references question not in questionnaire version',
          );
        }
      }

      const submissionRow = await insertSubmission(tx, {
        publicRef: generatePublicRef('submission'),
        attemptId: attempt.id,
        idempotencyKey: input.idempotencyKey ?? null,
        status: 'SUBMITTING',
      });

      // Evaluate — trusted server data only.
      const rules = await listScoringRules(tx, attempt.scoringVersionId);
      const evalAnswers: EvaluationAnswer[] = answers.map((a) => ({
        questionVersionId: a.questionVersionId,
        selectedOptionVersionIds: (a.selectedOptionVersionIds as string[]) ?? [],
      }));
      const scoringVersionRow = (
        await tx
          .select()
          .from(schema.scoringVersion)
          .where(sql`id = ${attempt.scoringVersionId}`)
          .limit(1)
      )[0];
      if (!scoringVersionRow) throw new AppError('INTEGRITY_ERROR', 'scoring version missing');

      let evaluated: { score: number; passingScore: number; result: 'PASS' | 'FAIL' };
      try {
        evaluated = evaluate(evalAnswers, {
          scoringVersionId: scoringVersionRow.id,
          passingScore: scoringVersionRow.passingScore,
          passingRule: scoringVersionRow.passingRule as 'gte',
          formulaType: scoringVersionRow.formulaType as 'weighted_sum',
          optionScores: buildOptionScores(
            rules.map((r) => ({
              optionVersionId: r.optionVersionId,
              points: r.points,
              weight: r.weight,
            })),
          ),
        });
      } catch (err) {
        // Evaluation errors are TECHNICAL; never become FAIL (Master §17, AC-15).
        throw err instanceof AppError ? err : new AppError('EVALUATION_ERROR');
      }

      // Request-time integrity invariant at the persistence boundary (Data §100,
      // §113; INT-01): refuse to write an impossible PASS/FAIL vs score outcome.
      assertConsistentOutcome(evaluated);

      const inputSnapshot = {
        answers: evalAnswers,
        scoringRules: rules.map((r) => ({
          optionVersionId: r.optionVersionId,
          points: r.points,
          weight: r.weight,
        })),
        passingScore: scoringVersionRow.passingScore,
        passingRule: scoringVersionRow.passingRule,
        formulaType: scoringVersionRow.formulaType,
      };

      const evaluationRow = await insertEvaluation(tx, {
        submissionId: submissionRow.id,
        questionnaireVersionId: attempt.questionnaireVersionId,
        scoringVersionId: attempt.scoringVersionId,
        score: evaluated.score,
        passingScore: evaluated.passingScore,
        inputSnapshot,
      });

      const resultRow = await insertResult(tx, {
        publicRef: generatePublicRef('result'),
        submissionId: submissionRow.id,
        evaluationId: evaluationRow.id,
        resultType: evaluated.result,
        score: evaluated.score,
      });

      const verificationRow = await insertVerification(tx, {
        publicRef: generatePublicRef('verification'),
        resultId: resultRow.id,
      });

      const wonCompleted = await markSubmissionCompleted(tx, submissionRow.id);
      if (!wonCompleted) throw new AppError('CONFLICT', 'lost the finalization race');

      // Move attempt to COMPLETED (Master §4.6, Data §33).
      await tx
        .update(schema.attempt)
        .set({ status: 'COMPLETED', completedAt: sql`now()` })
        .where(sql`id = ${attempt.id} AND status = 'ACTIVE'`);

      const finalAttempt = (await getAttemptById(tx, attempt.id))!;
      return {
        attempt: finalAttempt,
        submission: { ...submissionRow, status: 'COMPLETED', finalizedAt: new Date() },
        evaluation: evaluationRow,
        result: resultRow,
        verification: verificationRow,
        wasFirstFinalization: true,
      };
    });
  },

  async getResultByRef(db: Database, publicRef: string) {
    return getResultByRef(db, publicRef);
  },

  async getVerificationByRef(db: Database, publicRef: string) {
    return getVerificationByRef(db, publicRef);
  },

  async getForActor(db: Database, actor: CandidateActor) {
    return getResultForAttempt(db, actor.attemptId);
  },

  /** Admin: revoke a verification (Func §115). Modeled but no MVP UI. */
  async revokeVerification(db: Database, actor: Actor, publicRef: string) {
    assertAdmin(actor);
    const found = await getVerificationByRef(db, publicRef);
    if (!found) throw new AppError('NOT_FOUND');
    const rows = await db
      .update(schema.verification)
      .set({ status: 'REVOKED', revokedAt: new Date() })
      .where(sql`public_ref = ${publicRef} AND status = 'VALID'`)
      .returning();
    if (rows.length === 0) throw new AppError('CONFLICT');
    return rows[0]!;
  },
};
