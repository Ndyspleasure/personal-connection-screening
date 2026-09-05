import { NextResponse, type NextRequest } from 'next/server';
import { adminMonitorService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/submissions — recent completed submissions (Functional §92–93). */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const submissions = await adminMonitorService.listSubmissions(db(), actor);
    return NextResponse.json({ submissions });
  } catch (err) {
    return toErrorResponse(err);
  }
}
