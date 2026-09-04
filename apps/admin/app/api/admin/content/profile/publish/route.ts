import { NextResponse, type NextRequest } from 'next/server';
import { contentAdminService } from '@pcs/domain';
import {
  db,
  ensureAdminOriginAllowed,
  newCorrelationId,
  requireAdminActor,
  toErrorResponse,
} from '../../../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/content/profile/publish — make the profile the live public
 * one. Publishing display content has no version-fork semantics (unlike the
 * evaluation-affecting entities); it simply flips status to PUBLISHED (Data §6).
 */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const published = await contentAdminService.publishProfile(db(), actor, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json({
      id: published.id,
      slug: published.slug,
      displayName: published.displayName,
      status: published.status,
      publishedAt: published.publishedAt?.toISOString() ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
