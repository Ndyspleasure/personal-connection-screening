import {
  getAnswerForQuestion,
  getAttemptById,
  insertAnswer,
  listAnswersForAttempt,
  schema,
  sql,
  updateAnswerWithRevision,
  type Answer,
  type Database,
} from '@pcs/db';
import { AppError } from '@pcs/security';
import type { CandidateActor } from '../authz';

/**
 * AnswerService — validated, revision-checked, idempotent autosave.
 *
 * Traceability:
 *   - Master §4.4/§10 (progress persistence, local vs server state)
 *   - Functional §24–33, §44 (autosave, back nav, concurrency)
 *   - Data & State Model §29–32, §57–58, §67–69, §82 (transaction boundary)
 *   - Threat Model TH-013–TH-017 (payload manipulation), TH-026 (stale writes),
 *     TH-027 (two-tab conflicts)
 *
 * On every save the service revalidates from server state:
 *   - the actor's session/attempt is still ACTIVE
 *   - the questionnaire deadline has not passed (Data §28)
 *   - the incoming question_version_id BELONGS to attempt.questionnaire_version
 *     via the questionnaire_version_question binding (Data §67; INV-D05)
 *   - the incoming answer payload matches question_version.type
 *   - all selected option_version_ids BELONG to that question_version
 *
 * The write itself is a decide-then-write inside one transaction:
 *   - lock the attempt row (SELECT FOR UPDATE) so status/deadline reads are
 *     coherent with the pending write and two racing tabs serialize
 *   - if no answer row exists for (attempt, question_version): INSERT
 *   - if a row exists: UPDATE guarded by the caller's expected_revision
 *   - CAS loss -> STALE_STATE (Threat TH-026/TH-027; Func §33)
 */

export interface SaveAnswerInput {
  questionVersionId: string;
  expectedRevision: number | null;
  selectedOptionVersionIds?: string[];
  textValue?: string | null;
  numericValue?: number | null;
  booleanValue?: boolean | null;
  now?: Date;
}

export interface SavedAnswer {
  answer: Answer;
  revision: number;
}

async function loadQuestionVersion(db: Database, questionVersionId: string) {
  const rows = await db
    .select()
    .from(schema.questionVersion)
    .where(sql`id = ${questionVersionId}`)
    .limit(1);
  return rows[0] ?? null;
}

async function loadBinding(
  db: Database,
  questionnaireVersionId: string,
  questionVersionId: string,
) {
  const rows = await db
    .select()
    .from(schema.questionnaireVersionQuestion)
    .where(
      sql`questionnaire_version_id = ${questionnaireVersionId}
        AND question_version_id = ${questionVersionId}`,
    )
    .limit(1);
  return rows[0] ?? null;
}

async function loadValidOptions(db: Database, questionVersionId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.answerOptionVersion.id })
    .from(schema.answerOptionVersion)
    .where(sql`question_version_id = ${questionVersionId}`);
  return new Set(rows.map((r) => r.id));
}

function assertAnswerShape(
  type: string,
  input: SaveAnswerInput,
  validOptionIds: Set<string>,
): void {
  const selected = input.selectedOptionVersionIds ?? [];
  const hasText =
    input.textValue !== undefined && input.textValue !== null && input.textValue !== '';
  const hasNumeric = input.numericValue !== undefined && input.numericValue !== null;
  const hasBoolean = input.booleanValue !== undefined && input.booleanValue !== null;

  const requireOptions = (min: number, max: number) => {
    if (selected.length < min || selected.length > max) {
      throw new AppError(
        'INVALID_ANSWER',
        `expected ${min}..${max} options, got ${selected.length}`,
      );
    }
    for (const id of selected) {
      if (!validOptionIds.has(id)) {
        throw new AppError('QUESTION_NOT_IN_VERSION', `option ${id} does not belong to question`);
      }
    }
  };

  switch (type) {
    case 'single_choice':
    case 'boolean':
      requireOptions(1, 1);
      if (hasText || hasNumeric || hasBoolean) {
        throw new AppError('INVALID_ANSWER', 'unexpected value fields for choice question');
      }
      break;
    case 'multiple_choice':
      requireOptions(1, validOptionIds.size);
      if (hasText || hasNumeric || hasBoolean) {
        throw new AppError('INVALID_ANSWER', 'unexpected value fields for choice question');
      }
      break;
    case 'text':
      if (!hasText) throw new AppError('INVALID_ANSWER', 'text answer required');
      if (selected.length > 0 || hasNumeric || hasBoolean) {
        throw new AppError('INVALID_ANSWER', 'unexpected value fields for text question');
      }
      break;
    case 'numeric':
      if (!hasNumeric) throw new AppError('INVALID_ANSWER', 'numeric answer required');
      if (!Number.isFinite(input.numericValue!)) {
        throw new AppError('INVALID_ANSWER', 'numeric answer must be finite');
      }
      if (selected.length > 0 || hasText || hasBoolean) {
        throw new AppError('INVALID_ANSWER', 'unexpected value fields for numeric question');
      }
      break;
    default:
      throw new AppError('INVALID_ANSWER', `unsupported question type ${type}`);
  }
}

export const answerService = {
  async save(db: Database, actor: CandidateActor, input: SaveAnswerInput): Promise<SavedAnswer> {
    // Load once outside the tx for cheap validation; the tx re-verifies attempt state.
    const qv = await loadQuestionVersion(db, input.questionVersionId);
    if (!qv) throw new AppError('QUESTION_NOT_IN_VERSION');

    const attempt = await getAttemptById(db, actor.attemptId);
    if (!attempt) throw new AppError('SESSION_NOT_FOUND');
    if (attempt.status !== 'ACTIVE') {
      if (attempt.status === 'EXPIRED') throw new AppError('SESSION_EXPIRED');
      if (attempt.status === 'REVOKED') throw new AppError('SESSION_REVOKED');
      if (attempt.status === 'COMPLETED') throw new AppError('SESSION_COMPLETED');
      throw new AppError('CONFLICT', `attempt not ACTIVE (status=${attempt.status})`);
    }

    // Belongs-to check: the question version must be a member of this attempt's
    // questionnaire version (INV-D05; Threat TH-015/016).
    const binding = await loadBinding(db, attempt.questionnaireVersionId, input.questionVersionId);
    if (!binding) throw new AppError('QUESTION_NOT_IN_VERSION');

    const validOptions = await loadValidOptions(db, qv.id);
    assertAnswerShape(qv.type, input, validOptions);

    const now = input.now ?? new Date();
    if (attempt.questionnaireDeadline && attempt.questionnaireDeadline.getTime() <= now.getTime()) {
      throw new AppError('QUESTIONNAIRE_TIME_LIMIT_EXCEEDED');
    }

    // Decide-then-write, serialized on the attempt row.
    return db.transaction(async (tx) => {
      const lockedAttempt = await getAttemptById(tx, actor.attemptId, /* forUpdate */ true);
      if (!lockedAttempt || lockedAttempt.status !== 'ACTIVE') {
        throw new AppError('CONFLICT', 'attempt no longer active');
      }
      const existing = await getAnswerForQuestion(tx, actor.attemptId, input.questionVersionId);

      if (!existing) {
        if (input.expectedRevision !== null && input.expectedRevision !== 0) {
          throw new AppError('STALE_STATE', 'no answer exists at revision 0');
        }
        const inserted = await insertAnswer(tx, {
          attemptId: actor.attemptId,
          questionVersionId: input.questionVersionId,
          selectedOptionVersionIds: input.selectedOptionVersionIds,
          textValue: input.textValue,
          numericValue: input.numericValue,
          booleanValue: input.booleanValue,
        });
        return { answer: inserted, revision: inserted.revision };
      }

      if (input.expectedRevision === null || input.expectedRevision !== existing.revision) {
        throw new AppError('STALE_STATE', 'answer revision mismatch');
      }
      const newRevision = await updateAnswerWithRevision(tx, {
        answerId: existing.id,
        expectedRevision: input.expectedRevision,
        selectedOptionVersionIds: input.selectedOptionVersionIds,
        textValue: input.textValue,
        numericValue: input.numericValue,
        booleanValue: input.booleanValue,
      });
      if (newRevision === null) {
        throw new AppError('STALE_STATE', 'answer revision mismatch');
      }
      // Re-read to return the durable row.
      const row = (await getAnswerForQuestion(tx, actor.attemptId, input.questionVersionId))!;
      return { answer: row, revision: newRevision };
    });
  },

  async listForActor(db: Database, actor: CandidateActor) {
    return listAnswersForAttempt(db, actor.attemptId);
  },
};
