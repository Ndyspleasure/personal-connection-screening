import { NextResponse, type NextRequest } from 'next/server';
import { contentAdminService } from '@pcs/domain';
import { sectionUpdateRequestSchema } from '@pcs/validation';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  parseJson,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/content/sections/[id] — update one section under an optimistic
 * `expectedVersion` guard; a stale version returns 409 CONFLICT (Threat TH-037).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const body = await parseJson(req, sectionUpdateRequestSchema);
    const updated = await contentAdminService.updateSection(
      db(),
      actor,
      { id, ...body },
      { correlationId: newCorrelationId() },
    );
    return NextResponse.json({
      id: updated.id,
      sectionType: updated.sectionType,
      title: updated.title,
      subtitle: updated.subtitle,
      body: updated.body,
      displayOrder: updated.displayOrder,
      visibility: updated.visibility,
      contentVersion: updated.contentVersion,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** DELETE /api/admin/content/sections/[id] — remove one section. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    await contentAdminService.deleteSection(
      db(),
      actor,
      { id },
      {
        correlationId: newCorrelationId(),
      },
    );
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
