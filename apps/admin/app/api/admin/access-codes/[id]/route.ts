import { NextResponse, type NextRequest } from 'next/server';
import { sessionsAdminService } from '@pcs/domain';
import { accessCodeUpdateRequestSchema } from '@pcs/validation';
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

/**
 * PATCH /api/admin/access-codes/[id] — activate / disable / revoke a code, or
 * change its expiry / usage cap / label. Every change is audited.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const body = await parseJson(req, accessCodeUpdateRequestSchema);
    await sessionsAdminService.updateCode(
      db(),
      actor,
      id,
      {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.expiresAt !== undefined
          ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }
          : {}),
        ...(body.maxUses !== undefined ? { maxUses: body.maxUses } : {}),
      },
      { correlationId: newCorrelationId() },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
