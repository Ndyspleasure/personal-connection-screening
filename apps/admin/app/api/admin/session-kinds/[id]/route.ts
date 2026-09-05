import { NextResponse, type NextRequest } from 'next/server';
import { sessionsAdminService } from '@pcs/domain';
import { sessionKindUpdateRequestSchema } from '@pcs/validation';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  parseJson,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/admin/session-kinds/[id] — light CMS edits to a session card. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const body = await parseJson(req, sessionKindUpdateRequestSchema);
    const updated = await sessionsAdminService.updateKind(db(), actor, id, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    return toErrorResponse(err);
  }
}
