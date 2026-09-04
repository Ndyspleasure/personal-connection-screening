import { NextResponse, type NextRequest } from 'next/server';
import { integrityService } from '@pcs/domain';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/integrity/scan — run an integrity scan on demand (owner). */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const summary = await integrityService.runScan(db(), {
      correlationId: newCorrelationId(),
      actorType: 'ADMIN',
      actorId: actor.adminActorId,
    });
    return NextResponse.json(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
}
