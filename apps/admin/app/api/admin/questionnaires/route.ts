import { NextResponse, type NextRequest } from 'next/server';
import { questionnaireAdminService } from '@pcs/domain';
import { questionnaireCreateRequestSchema } from '@pcs/validation';
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

/** GET /api/admin/questionnaires — list all questionnaires with their versions. */
export async function GET(_req: NextRequest) {
  try {
    const actor = await requireAdminActor();
    const items = await questionnaireAdminService.list(db(), actor);
    return NextResponse.json({ questionnaires: items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST /api/admin/questionnaires — create a questionnaire + its first draft version. */
export async function POST(req: NextRequest) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const body = await parseJson(req, questionnaireCreateRequestSchema);
    const created = await questionnaireAdminService.createQuestionnaire(db(), actor, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json(
      {
        id: created.questionnaire.id,
        slug: created.questionnaire.slug,
        name: created.questionnaire.name,
        draftVersionId: created.draftVersion.id,
        draftVersionNumber: created.draftVersion.versionNumber,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
