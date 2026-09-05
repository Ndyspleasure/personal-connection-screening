import { NextResponse, type NextRequest } from 'next/server';
import { adminMonitorService } from '@pcs/domain';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sessions/[ref]/revoke — revoke a candidate session (Functional
 * §97; Threat TH-004). Terminal: the session and its attempt move to REVOKED,
 * blocking any further progress or submission. Audited.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { ref } = await params;
    await adminMonitorService.revokeSession(db(), actor, ref, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json({ revoked: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
