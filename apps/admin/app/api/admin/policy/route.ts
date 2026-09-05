import { NextResponse, type NextRequest } from 'next/server';
import { policyAdminService } from '@pcs/domain';
import { policyDraftRequestSchema } from '@pcs/validation';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  parseJson,
  requireAdminActor,
  toErrorResponse,
} from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/policy — current published policy + all versions. */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const state = await policyAdminService.getState(db(), actor);
    return NextResponse.json(state);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST /api/admin/policy — save a new DRAFT policy version. */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const body = await parseJson(req, policyDraftRequestSchema);
    const draft = await policyAdminService.saveDraft(db(), actor, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json(draft, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
