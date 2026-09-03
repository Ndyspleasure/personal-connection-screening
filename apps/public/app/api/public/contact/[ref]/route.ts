import { NextResponse } from 'next/server';
import { submissionService } from '@pcs/domain';
import { AppError } from '@pcs/security';
import { getDb } from '@pcs/db';
import { requireCandidateActor, toErrorResponse } from '../../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/contact/[ref] — the contact gate (Master §30; Func §69).
 * Opens only if the referenced result is the caller's OWN result AND the
 * result is PASS. Content of the contact channel itself is CMS-driven and
 * will land alongside the CMS in Phase 5; MVP returns a boolean + placeholder.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const { actor } = await requireCandidateActor();
    const found = await submissionService.getResultByRef(getDb(), ref);
    if (!found) throw new AppError('NOT_FOUND');
    if (found.submission.attemptId !== actor.attemptId) throw new AppError('NOT_FOUND');
    if (found.result.resultType !== 'PASS') throw new AppError('NOT_AUTHORIZED');
    return NextResponse.json({
      available: true,
      // Placeholder — the CMS-driven channel details land with Phase 5.
      channel: null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
