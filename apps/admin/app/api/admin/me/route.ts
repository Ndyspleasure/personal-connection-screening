import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/me — the resolved, authorized admin actor (no PII beyond role). */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    return NextResponse.json({ adminActorId: actor.adminActorId, role: actor.role });
  } catch (err) {
    return toErrorResponse(err);
  }
}
