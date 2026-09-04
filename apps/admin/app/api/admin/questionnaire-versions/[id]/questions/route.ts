import { NextResponse, type NextRequest } from 'next/server';
import { questionnaireAdminService } from '@pcs/domain';
import { questionAddRequestSchema } from '@pcs/validation';
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

/** POST /api/admin/questionnaire-versions/[id]/questions — append a question to a DRAFT. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    ensureAdminOriginAllowed(req);
    const actor = await requireAdminActor();
    const { id } = await params;
    const body = await parseJson(req, questionAddRequestSchema);
    const created = await questionnaireAdminService.addQuestion(db(), actor, id, body, {
      correlationId: newCorrelationId(),
    });
    return NextResponse.json(
      { questionVersionId: created.questionVersionId, optionVersionIds: created.optionVersionIds },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
