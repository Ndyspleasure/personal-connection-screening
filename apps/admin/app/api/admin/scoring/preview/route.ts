import { NextResponse, type NextRequest } from 'next/server';
import { scoringAdminService } from '@pcs/domain';
import { previewScoreRequestSchema } from '@pcs/validation';
import {
  ensureAdminOriginAllowed,
  parseJson,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/scoring/preview — test-evaluation (Functional §88). Runs the
 * real evaluation engine over proposed rules + sample answers and returns the
 * score/result. Persists nothing.
 */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const body = await parseJson(req, previewScoreRequestSchema);
    const outcome = scoringAdminService.previewEvaluation(actor, body);
    return NextResponse.json(outcome);
  } catch (err) {
    return toErrorResponse(err);
  }
}
