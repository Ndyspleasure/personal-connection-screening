import { NextResponse, type NextRequest } from 'next/server';
import { getServerEnv } from '@pcs/config/server';
import { AppError } from '@pcs/security';
import { accessCodeService, sessionCatalogService, sessionService } from '@pcs/domain';
import { getDb } from '@pcs/db';
import { accessCodeVerifyRequestSchema } from '@pcs/validation';
import {
  checkRateLimit,
  ensureOriginAllowed,
  parseJson,
  recordCandidateEvent,
  requestIp,
  setSessionCookie,
  toErrorResponse,
  tryResumeSession,
} from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/public/access-code — verify a gated session's code (Pendekatan).
 *
 * The code is checked and consumed entirely on the server (never trusted from
 * the client, never stored in plaintext). On success we start the gated
 * session and set the session cookie — so the granted access is proven by the
 * live session and survives a reload. Rate-limited to blunt brute force; the
 * server also enforces expiry and usage caps. Failures return safe typed errors
 * that never reveal which codes exist.
 */
export async function POST(req: NextRequest) {
  try {
    ensureOriginAllowed(req);
    await checkRateLimit('accessCode', `ip:${requestIp(req)}`);
    const body = await parseJson(req, accessCodeVerifyRequestSchema);
    const db = getDb();
    const env = getServerEnv();

    const kind = await sessionCatalogService.resolveByKey(db, body.sessionKey);
    if (!kind.requiresAccessCode) throw new AppError('ACCESS_CODE_INVALID');

    // Already inside this session (e.g. re-opened the modal after entering) —
    // reuse it without consuming another code use.
    const resumed = await tryResumeSession();
    if (resumed?.attempt.status === 'ACTIVE' && resumed.attempt.sessionKindId === kind.id) {
      return NextResponse.json({ ok: true, next: '/session', reused: true });
    }

    // Verify + atomically consume one use (throws a typed AppError on failure).
    await accessCodeService.verifyAndConsume(db, env.VERIFICATION_SECRET, {
      sessionKindId: kind.id,
      code: body.code,
    });

    const trio = await sessionCatalogService.resolvePublishedForKind(db, kind);
    const started = await sessionService.start(db, env.SESSION_SECRET, {
      ...trio,
      sessionKindId: kind.id,
    });
    await setSessionCookie(started.rawSessionToken, started.session.expiresAt);
    await recordCandidateEvent(
      {
        type: 'PUBLIC_CANDIDATE',
        sessionRef: started.session.publicRef,
        attemptId: started.attempt.id,
      },
      {
        action: 'public.access_code.verified',
        entityType: 'attempt',
        entityId: started.attempt.publicRef,
        summary: `access code accepted for "${kind.key}"`,
        metadata: { sessionKey: kind.key },
      },
    );
    return NextResponse.json({ ok: true, next: '/session', reused: false }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
