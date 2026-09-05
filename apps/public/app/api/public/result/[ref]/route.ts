import { NextResponse } from 'next/server';
import { submissionService, toResultPublicView } from '@pcs/domain';
import { AppError } from '@pcs/security';
import { getDb } from '@pcs/db';
import { requireCandidateActor, toErrorResponse } from '../../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/result/[ref] — the candidate's own result (Func §64, §65).
 * The opaque public reference is NOT authorization — we cross-check that the
 * result belongs to the caller's attempt (Threat TH-009, INV-SD01).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const { actor } = await requireCandidateActor();
    const found = await submissionService.getResultByRef(getDb(), ref);
    if (!found) throw new AppError('NOT_FOUND');
    if (found.submission.attemptId !== actor.attemptId) {
      // Uniform: don't reveal that the ref points at another candidate.
      throw new AppError('NOT_FOUND');
    }
    return NextResponse.json(
      toResultPublicView({
        result: found.result,
        verification: found.verification,
        contactAvailable: found.result.resultType === 'PASS',
      }),
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
