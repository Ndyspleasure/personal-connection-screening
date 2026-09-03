import { NextResponse, type NextRequest } from 'next/server';
import { answerService } from '@pcs/domain';
import { getDb } from '@pcs/db';
import { saveAnswerRequestSchema } from '@pcs/validation';
import {
  checkRateLimit,
  ensureOriginAllowed,
  parseJson,
  requireCandidateActor,
  toErrorResponse,
} from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/public/answer — validated, revision-guarded autosave (Func §29;
 * Data §57–58; INV-D05). Server revalidates from server state on every call:
 * ownership, deadline, belongs-to, type, options. Fake payloads (score,
 * result) are ignored because they are simply not in the request schema.
 */
export async function PUT(req: NextRequest) {
  try {
    ensureOriginAllowed(req);
    const { actor } = await requireCandidateActor();
    await checkRateLimit('answerSave', `ses:${actor.sessionRef}`);
    const body = await parseJson(req, saveAnswerRequestSchema);
    const saved = await answerService.save(getDb(), actor, body);
    return NextResponse.json({
      questionVersionId: saved.answer.questionVersionId,
      revision: saved.revision,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
