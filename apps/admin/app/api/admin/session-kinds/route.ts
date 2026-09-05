import { NextResponse } from 'next/server';
import { sessionsAdminService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/session-kinds — list every session kind (for code management). */
export async function GET() {
  try {
    const actor = await requireAdminActor();
    const kinds = await sessionsAdminService.listKinds(db(), actor);
    return NextResponse.json({
      kinds: kinds.map((k) => ({
        id: k.id,
        key: k.key,
        name: k.name,
        description: k.description,
        tagline: k.tagline,
        requiresAccessCode: k.requiresAccessCode,
        displayOrder: k.displayOrder,
        status: k.status,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
