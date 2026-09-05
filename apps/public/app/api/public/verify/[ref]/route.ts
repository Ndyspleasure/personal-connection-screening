import { NextResponse, type NextRequest } from 'next/server';
import { submissionService, toVerificationPublicView } from '@pcs/domain';
import { AppError } from '@pcs/security';
import { getDb, schema, sql } from '@pcs/db';
import { checkRateLimit, requestIp, toErrorResponse } from '../../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/verify/[ref] — the PUBLIC verification projection
 * (Master §29, §20.1; Functional §67; Confirmed decision: shows PASS/FAIL +
 * completion date + version label). Rate-limited to defeat enumeration
 * (Threat TH-040). No answers, no IP, no internals.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await checkRateLimit('verificationLookup', `ip:${requestIp(req)}`);
    const { ref } = await params;
    const found = await submissionService.getVerificationByRef(getDb(), ref);
    if (!found) throw new AppError('NOT_FOUND');

    // Resolve a friendly version label for the historical projection.
    const [qv] = await getDb()
      .select({
        version: schema.questionnaireVersion.versionNumber,
        slug: schema.questionnaire.slug,
      })
      .from(schema.questionnaireVersion)
      .innerJoin(
        schema.questionnaire,
        sql`${schema.questionnaire.id} = ${schema.questionnaireVersion.questionnaireId}`,
      )
      .innerJoin(
        schema.submission,
        sql`${schema.submission.attemptId} IN (
          SELECT id FROM attempt WHERE questionnaire_version_id = ${schema.questionnaireVersion.id}
        )`,
      )
      .innerJoin(schema.result, sql`${schema.result.submissionId} = ${schema.submission.id}`)
      .where(sql`${schema.result.id} = ${found.result.id}`)
      .limit(1);
    const label = qv ? `${qv.slug} v${qv.version}` : '';

    return NextResponse.json(
      toVerificationPublicView({
        verification: found.verification,
        result: found.result,
        questionnaireVersionLabel: label,
      }),
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
