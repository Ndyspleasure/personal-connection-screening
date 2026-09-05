import { NextResponse, type NextRequest } from 'next/server';
import { adminMonitorService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/sessions — recent candidate sessions + attempt status (Functional §97). */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const sessions = await adminMonitorService.listSessions(db(), actor);
    return NextResponse.json({ sessions });
  } catch (err) {
    return toErrorResponse(err);
  }
}
