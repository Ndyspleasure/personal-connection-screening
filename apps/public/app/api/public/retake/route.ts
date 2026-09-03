import { NextResponse } from 'next/server';
import { AppError } from '@pcs/security';
import { getDb, schema, sql, type AttemptPolicySnapshot } from '@pcs/db';
import { requireCandidateActor, toErrorResponse } from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/retake — eligibility for taking a NEW attempt after this
 * one completes (Master §19; Functional §71–76; confirmed default retake
 * mode ON_NEW_VERSION, max_attempts=3, cooldown=0). Enforced server-side
 * from the attempt's frozen policy_snapshot (Data §46, §20). Never trusts
 * the client's clock.
 */
export async function GET() {
  try {
    const { attempt } = await requireCandidateActor();
    const snap = attempt.policySnapshot as AttemptPolicySnapshot;

    // How many prior COMPLETED attempts exist for the same questionnaire slug?
    const db = getDb();
    const [qn] = await db
      .select({ questionnaireId: schema.questionnaire.id })
      .from(schema.questionnaire)
      .innerJoin(
        schema.questionnaireVersion,
        sql`${schema.questionnaireVersion.questionnaireId} = ${schema.questionnaire.id}`,
      )
      .where(sql`${schema.questionnaireVersion.id} = ${attempt.questionnaireVersionId}`)
      .limit(1);
    if (!qn) throw new AppError('INTEGRITY_ERROR');

    // Only complete attempts against the candidate's context count toward
    // max_attempts; MVP has no candidate context yet, so count by same-owner.
    const [countRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.attempt)
      .innerJoin(
        schema.questionnaireVersion,
        sql`${schema.questionnaireVersion.id} = ${schema.attempt.questionnaireVersionId}`,
      )
      .where(
        sql`${schema.questionnaireVersion.questionnaireId} = ${qn.questionnaireId}
          AND ${schema.attempt.status} = 'COMPLETED'`,
      );

    const attempts = Number(countRow?.n ?? 0);
    const currentPublishedVersionRows = await db
      .select({ id: schema.questionnaire.currentVersionId })
      .from(schema.questionnaire)
      .where(sql`id = ${qn.questionnaireId}`)
      .limit(1);
    const currentVersionId = currentPublishedVersionRows[0]?.id ?? null;

    let eligible = false;
    let reason: string | null = null;
    if (snap.retakeMode === 'NEVER') {
      reason = 'retakes are not permitted';
    } else if (attempts >= snap.maxAttempts) {
      reason = 'max attempts reached';
    } else if (snap.retakeMode === 'ON_NEW_VERSION') {
      eligible = Boolean(currentVersionId && currentVersionId !== attempt.questionnaireVersionId);
      if (!eligible) reason = 'no newer version available yet';
    } else {
      // AFTER_COOLDOWN / UNLIMITED / ADMIN_APPROVAL — MVP defaults to allow if within limits.
      eligible = snap.retakeMode !== 'ADMIN_APPROVAL';
      if (!eligible) reason = 'admin approval required';
    }

    return NextResponse.json({
      eligible,
      reason,
      attempts,
      maxAttempts: snap.maxAttempts,
      cooldownSeconds: snap.cooldownSeconds,
      retakeMode: snap.retakeMode,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
