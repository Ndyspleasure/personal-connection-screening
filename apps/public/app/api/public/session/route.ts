import { NextResponse, type NextRequest } from 'next/server';
import { getServerEnv } from '@pcs/config/server';
import { AppError } from '@pcs/security';
import { sessionCatalogService, sessionService } from '@pcs/domain';
import { getDb, type SessionKind } from '@pcs/db';
import { startSessionRequestSchema } from '@pcs/validation';
import { resolveCurrentPublished } from '../../../../lib/current-published';
import {
  checkRateLimit,
  ensureOriginAllowed,
  parseJson,
  recordCandidateEvent,
  requestIp,
  requireCandidateActor,
  setSessionCookie,
  toErrorResponse,
  tryResumeSession,
} from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/public/session — Start a new attempt for a chosen session.
 *
 * `sessionKey` selects the CMS session (Two-Session phase); omitted → the
 * default open session (lowest-ordered ACTIVE, non-gated). If no session kinds
 * are configured yet, we fall back to the single current published screening so
 * the flow keeps working during rollout.
 *
 * Idempotent per browser AND per session kind: a valid cookie that already
 * resolves to an ACTIVE attempt of the SAME kind returns that attempt; choosing
 * a different session starts fresh (Master §7, §7.2). Gated sessions cannot be
 * started here — they go through POST /api/public/access-code.
 */
export async function POST(req: NextRequest) {
  try {
    ensureOriginAllowed(req);
    await checkRateLimit('start', `ip:${requestIp(req)}`);
    const body = await parseJson(req, startSessionRequestSchema);
    const db = getDb();

    // Resolve the requested session kind (or the default open one, if any).
    let kind: SessionKind | null = null;
    if (body.sessionKey) {
      kind = await sessionCatalogService.resolveByKey(db, body.sessionKey);
    } else {
      const kinds = await sessionCatalogService.listActive(db);
      kind = kinds.find((k) => !k.requiresAccessCode) ?? null;
    }

    // Kind-aware cookie idempotency: reuse an ACTIVE attempt only if it belongs
    // to the same kind (matching legacy null-kind attempts on the fallback path).
    const resumed = await tryResumeSession();
    if (resumed && resumed.attempt.status === 'ACTIVE') {
      const sameKind = kind
        ? resumed.attempt.sessionKindId === kind.id
        : resumed.attempt.sessionKindId == null;
      if (sameKind) {
        return NextResponse.json({
          sessionRef: resumed.session.publicRef,
          attemptRef: resumed.attempt.publicRef,
          expiresAt: resumed.session.expiresAt.toISOString(),
          questionnaireDeadline: resumed.attempt.questionnaireDeadline?.toISOString() ?? null,
          reused: true,
        });
      }
    }

    // Gated sessions must be opened via the access-code endpoint.
    if (kind?.requiresAccessCode) throw new AppError('ACCESS_REQUIRED');

    const trio = kind
      ? await sessionCatalogService.resolvePublishedForKind(db, kind)
      : await resolveCurrentPublished(db);

    const started = await sessionService.start(db, getServerEnv().SESSION_SECRET, {
      ...trio,
      sessionKindId: kind?.id ?? null,
    });
    await setSessionCookie(started.rawSessionToken, started.session.expiresAt);
    await recordCandidateEvent(
      {
        type: 'PUBLIC_CANDIDATE',
        sessionRef: started.session.publicRef,
        attemptId: started.attempt.id,
      },
      {
        action: 'public.session.started',
        entityType: 'attempt',
        entityId: started.attempt.publicRef,
        summary: `candidate started a new attempt${kind ? ` (${kind.key})` : ''}`,
        metadata: kind ? { sessionKey: kind.key } : {},
      },
    );
    return NextResponse.json(
      {
        sessionRef: started.session.publicRef,
        attemptRef: started.attempt.publicRef,
        expiresAt: started.session.expiresAt.toISOString(),
        questionnaireDeadline: started.attempt.questionnaireDeadline?.toISOString() ?? null,
        reused: false,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** GET /api/public/session — Resume / describe the current session state. */
export async function GET(_req: NextRequest) {
  try {
    const { attempt, session } = await requireCandidateActor();
    return NextResponse.json({
      sessionRef: session.publicRef,
      attemptRef: attempt.publicRef,
      status: attempt.status,
      expiresAt: session.expiresAt.toISOString(),
      questionnaireDeadline: attempt.questionnaireDeadline?.toISOString() ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
