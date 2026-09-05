import { NextResponse, type NextRequest } from 'next/server';
import { questionnaireAdminService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/questionnaire-versions/[id] — full authoring detail of a version. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminActor();
    const { id } = await params;
    const detail = await questionnaireAdminService.getVersionDetail(db(), actor, id);
    return NextResponse.json(detail);
  } catch (err) {
    return toErrorResponse(err);
  }
}
