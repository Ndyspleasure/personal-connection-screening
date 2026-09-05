import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from './authoring';
import { answer } from '../schema/execution';

/**
 * Answer repository (Data & State Model §29–32, §57–58, §82).
 *
 * All mutations require the caller to hold a SELECT ... FOR UPDATE lock on
 * the row (or the parent attempt) so decide-then-write is serializable
 * against concurrent tabs. The service composes these primitives.
 */

export interface InsertAnswerInput {
  attemptId: string;
  questionVersionId: string;
  selectedOptionVersionIds?: string[];
  textValue?: string | null;
  numericValue?: number | null;
  booleanValue?: boolean | null;
}

export interface UpdateAnswerInput {
  answerId: string;
  expectedRevision: number;
  selectedOptionVersionIds?: string[];
  textValue?: string | null;
  numericValue?: number | null;
  booleanValue?: boolean | null;
}

export async function insertAnswer(exec: DbExecutor, input: InsertAnswerInput) {
  const rows = await exec
    .insert(answer)
    .values({
      attemptId: input.attemptId,
      questionVersionId: input.questionVersionId,
      revision: 0,
      selectedOptionVersionIds: input.selectedOptionVersionIds ?? [],
      textValue: input.textValue ?? null,
      numericValue: input.numericValue ?? null,
      booleanValue: input.booleanValue ?? null,
    })
    .returning();
  return rows[0]!;
}

/**
 * CAS update — only succeeds if the row's current revision matches expected.
 * Returns the new revision on success, or null if the CAS lost.
 */
export async function updateAnswerWithRevision(
  exec: DbExecutor,
  input: UpdateAnswerInput,
): Promise<number | null> {
  const rows = await exec
    .update(answer)
    .set({
      revision: sql`${answer.revision} + 1`,
      selectedOptionVersionIds: input.selectedOptionVersionIds ?? [],
      textValue: input.textValue ?? null,
      numericValue: input.numericValue ?? null,
      booleanValue: input.booleanValue ?? null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(answer.id, input.answerId), eq(answer.revision, input.expectedRevision)))
    .returning({ revision: answer.revision });
  return rows[0]?.revision ?? null;
}

export async function getAnswerForQuestion(
  exec: DbExecutor,
  attemptId: string,
  questionVersionId: string,
) {
  const rows = await exec
    .select()
    .from(answer)
    .where(and(eq(answer.attemptId, attemptId), eq(answer.questionVersionId, questionVersionId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAnswersForAttempt(exec: DbExecutor, attemptId: string) {
  return exec.select().from(answer).where(eq(answer.attemptId, attemptId));
}
