import { NextResponse, type NextRequest } from 'next/server';
import { questionnaireAdminService } from '@pcs/domain';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/questionnaire-versions/[id]/archive — retire a PUBLISHED version. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const archived = await questionnaireAdminService.archive(db(), actor, id, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json({
      id: archived.id,
      versionNumber: archived.versionNumber,
      status: archived.status,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
