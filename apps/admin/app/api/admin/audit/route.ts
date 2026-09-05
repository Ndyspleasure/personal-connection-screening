import { NextResponse, type NextRequest } from 'next/server';
import { adminMonitorService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/audit — the append-only audit trail, newest first (Functional §95). */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const events = await adminMonitorService.listAudit(db(), actor);
    return NextResponse.json({ events });
  } catch (err) {
    return toErrorResponse(err);
  }
}
