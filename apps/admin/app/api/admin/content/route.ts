import { NextResponse, type NextRequest } from 'next/server';
import { contentAdminService } from '@pcs/domain';
import { db, requireAdminActor, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content — the full editable content snapshot (profile + all
 * sections, including hidden ones), OWNER-only (Functional §80). This is the
 * authoring view; the public projection lives in the public app.
 */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const content = await contentAdminService.getEditable(db(), actor);
    return NextResponse.json({
      profile: content.profile
        ? {
            id: content.profile.id,
            slug: content.profile.slug,
            displayName: content.profile.displayName,
            status: content.profile.status,
            publishedAt: content.profile.publishedAt?.toISOString() ?? null,
          }
        : null,
      sections: content.sections.map((s) => ({
        id: s.id,
        sectionType: s.sectionType,
        title: s.title,
        subtitle: s.subtitle,
        body: s.body,
        displayOrder: s.displayOrder,
        visibility: s.visibility,
        contentVersion: s.contentVersion,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
