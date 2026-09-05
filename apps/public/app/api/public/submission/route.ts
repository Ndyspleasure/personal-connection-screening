import { NextResponse, type NextRequest } from 'next/server';
import { submissionService, toResultPublicView } from '@pcs/domain';
import { getDb } from '@pcs/db';
import { finalizeSubmissionRequestSchema } from '@pcs/validation';
import {
  checkRateLimit,
  ensureOriginAllowed,
  parseJson,
  recordCandidateEvent,
  requireCandidateActor,
  toErrorResponse,
} from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/public/submission — Finalize submit (Master §4.6; Func §46–55;
 * Data §60, §83, §111, §112). Idempotent: repeated calls return the same
 * final record. Fails closed on EXPIRED/REVOKED/COMPLETED_TO_OTHER_ATTEMPT.
 * Never accepts a client-provided score/result (SEC-AC-01).
 */
export async function POST(req: NextRequest) {
  try {
    ensureOriginAllowed(req);
    const { actor } = await requireCandidateActor();
    await checkRateLimit('submit', `ses:${actor.sessionRef}`);
    const body = await parseJson(req, finalizeSubmissionRequestSchema);
    const finalized = await submissionService.finalize(getDb(), actor, {
      idempotencyKey: body.idempotencyKey ?? null,
    });
    if (finalized.wasFirstFinalization) {
      await recordCandidateEvent(actor, {
        action: 'public.submission.finalized',
        entityType: 'result',
        entityId: finalized.result.publicRef,
        summary: `submission finalized (${finalized.result.resultType})`,
      });
    }
    const view = toResultPublicView({
      result: finalized.result,
      verification: finalized.verification,
      contactAvailable: finalized.result.resultType === 'PASS',
    });
    // 201 the first time we finalize; 200 for replays (Data §111 semantics).
    return NextResponse.json(view, { status: finalized.wasFirstFinalization ? 201 : 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
