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

/** POST /api/admin/questionnaires/[id]/versions — start a new DRAFT version. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const draft = await questionnaireAdminService.createDraftVersion(
      db(),
      actor,
      { questionnaireId: id },
      { correlationId: newCorrelationId() },
    );
    return NextResponse.json(
      { id: draft.id, versionNumber: draft.versionNumber, status: draft.status },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
