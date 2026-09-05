import { NextResponse, type NextRequest } from 'next/server';
import { contentAdminService } from '@pcs/domain';
import { sectionCreateRequestSchema } from '@pcs/validation';
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

/** POST /api/admin/content/sections — add a content section (Functional §80). */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const body = await parseJson(req, sectionCreateRequestSchema);
    const created = await contentAdminService.createSection(db(), actor, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json(
      {
        id: created.id,
        sectionType: created.sectionType,
        title: created.title,
        subtitle: created.subtitle,
        body: created.body,
        displayOrder: created.displayOrder,
        visibility: created.visibility,
        contentVersion: created.contentVersion,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
