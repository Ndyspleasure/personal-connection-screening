import { NextResponse, type NextRequest } from 'next/server';
import { getDb, inArray, schema, sql } from '@pcs/db';
import { requireCandidateActor, toErrorResponse } from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/questionnaire — the questionnaire structure LOCKED to this
 * attempt (Master §7; Functional §19–21, §34). Never resolves against the
 * current CMS pointer — always from attempt.questionnaire_version_id.
 * Only public fields are projected; internal ids stay opaque.
 */
export async function GET(_req: NextRequest) {
  try {
    const { attempt } = await requireCandidateActor();
    const db = getDb();
    const bindings = await db
      .select({
        position: schema.questionnaireVersionQuestion.position,
        questionVersionId: schema.questionVersion.id,
        type: schema.questionVersion.type,
        text: schema.questionVersion.text,
        description: schema.questionVersion.description,
        required: schema.questionVersion.required,
      })
      .from(schema.questionnaireVersionQuestion)
      .innerJoin(
        schema.questionVersion,
        sql`${schema.questionVersion.id} = ${schema.questionnaireVersionQuestion.questionVersionId}`,
      )
      .where(
        sql`${schema.questionnaireVersionQuestion.questionnaireVersionId} = ${attempt.questionnaireVersionId}`,
      )
      .orderBy(sql`${schema.questionnaireVersionQuestion.position} asc`);

    const questionIds = bindings.map((b) => b.questionVersionId);
    const options =
      questionIds.length === 0
        ? []
        : await db
            .select({
              id: schema.answerOptionVersion.id,
              questionVersionId: schema.answerOptionVersion.questionVersionId,
              value: schema.answerOptionVersion.value,
              label: schema.answerOptionVersion.label,
              position: schema.answerOptionVersion.position,
            })
            .from(schema.answerOptionVersion)
            .where(inArray(schema.answerOptionVersion.questionVersionId, questionIds))
            .orderBy(sql`${schema.answerOptionVersion.position} asc`);

    const byQuestion = new Map<string, { id: string; value: string; label: string }[]>();
    for (const o of options) {
      const list = byQuestion.get(o.questionVersionId) ?? [];
      list.push({ id: o.id, value: o.value, label: o.label });
      byQuestion.set(o.questionVersionId, list);
    }

    return NextResponse.json({
      questions: bindings.map((b) => ({
        position: b.position,
        questionVersionId: b.questionVersionId,
        type: b.type,
        text: b.text,
        description: b.description,
        required: b.required,
        options: byQuestion.get(b.questionVersionId) ?? [],
      })),
      // Current answers so the UI can rehydrate on refresh (Master §10; Func §17).
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
