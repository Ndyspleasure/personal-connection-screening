import { NextResponse, type NextRequest } from 'next/server';
import { contentAdminService } from '@pcs/domain';
import { profileUpdateRequestSchema } from '@pcs/validation';
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

/** PUT /api/admin/content/profile — create or update the owner profile (draft). */
export async function PUT(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const body = await parseJson(req, profileUpdateRequestSchema);
    const saved = await contentAdminService.saveProfile(db(), actor, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json({
      id: saved.id,
      slug: saved.slug,
      displayName: saved.displayName,
      status: saved.status,
      publishedAt: saved.publishedAt?.toISOString() ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
