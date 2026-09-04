import { NextResponse, type NextRequest } from 'next/server';
import { integrityService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/integrity — recent integrity findings, newest first (Func §96). */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const findings = await integrityService.listFindings(db(), actor);
    return NextResponse.json({ findings });
  } catch (err) {
    return toErrorResponse(err);
  }
}
