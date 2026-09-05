import { NextResponse, type NextRequest } from 'next/server';
import { getServerEnv } from '@pcs/config/server';
import { sessionsAdminService } from '@pcs/domain';
import { accessCodeCreateRequestSchema } from '@pcs/validation';
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

/** GET /api/admin/access-codes — list codes (metadata only; never the code/hash). */
export async function GET() {
  try {
    const actor = await requireAdminActor();
    const codes = await sessionsAdminService.listCodes(db(), actor);
    return NextResponse.json({ codes });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST /api/admin/access-codes — create a code; returns the plaintext ONCE. */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const body = await parseJson(req, accessCodeCreateRequestSchema);
    const created = await sessionsAdminService.createCode(
      db(),
      getServerEnv().VERIFICATION_SECRET,
      actor,
      {
        sessionKindId: body.sessionKindId,
        code: body.code ?? null,
        label: body.label ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxUses: body.maxUses ?? null,
      },
      { correlationId: newCorrelationId() },
    );
    return NextResponse.json({ code: created.code, id: created.id }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
