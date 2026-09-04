import { NextResponse, type NextRequest } from 'next/server';
import { policyAdminService } from '@pcs/domain';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/policy/[versionId]/publish — make a DRAFT policy the live one. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { versionId } = await params;
    const published = await policyAdminService.publish(db(), actor, versionId, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json(published);
  } catch (err) {
    return toErrorResponse(err);
  }
}
