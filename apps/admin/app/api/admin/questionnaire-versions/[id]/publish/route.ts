import { NextResponse, type NextRequest } from 'next/server';
import { questionnaireAdminService } from '@pcs/domain';
import { publishWithScoringRequestSchema } from '@pcs/validation';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  parseJson,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/questionnaire-versions/[id]/publish — publish a DRAFT together
 * with its scoring (passing score + per-option points). The server runs the
 * atomic publish pipeline and re-validates structure and scoring integrity.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const body = await parseJson(req, publishWithScoringRequestSchema);
    const published = await questionnaireAdminService.publishWithScoring(db(), actor, id, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json({
      id: published.id,
      versionNumber: published.versionNumber,
      status: published.status,
      scoringVersionId: published.scoringVersionId,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
