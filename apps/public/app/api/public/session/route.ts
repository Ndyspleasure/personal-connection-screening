import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getServerEnv } from '@pcs/config/server';
import { SESSION_COOKIE_NAME } from '@pcs/security';
import { sessionService } from '@pcs/domain';
import { getDb } from '@pcs/db';
import { startSessionRequestSchema } from '@pcs/validation';
import { resolveCurrentPublished } from '../../../../lib/current-published';
import {
  checkRateLimit,
  ensureOriginAllowed,
  parseJson,
  requestIp,
  requireCandidateActor,
  setSessionCookie,
  toErrorResponse,
} from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/public/session — Start a new attempt.
 *
 * Idempotent per browser: if a valid session cookie already resolves to an
 * ACTIVE attempt, we return that attempt reference instead of creating a
 * second (Master §7, §7.2; Functional §7). If the cookie is expired/revoked
 * we return the appropriate safe error and DO NOT auto-claim a new one.
 */
export async function POST(req: NextRequest) {
  try {
    ensureOriginAllowed(req);
    await checkRateLimit('start', `ip:${requestIp(req)}`);
    await parseJson(req, startSessionRequestSchema);

    // Cookie-first idempotency (Master §7.2). A valid cookie -> return same attempt.
    const jar = await cookies();
    const existing = jar.get(SESSION_COOKIE_NAME)?.value;
    if (existing) {
      try {
        const { attempt, session } = await sessionService.resumeByToken(
          getDb(),
          getServerEnv().SESSION_SECRET,
          existing,
        );
        if (attempt.status === 'ACTIVE') {
          return NextResponse.json({
            sessionRef: session.publicRef,
            attemptRef: attempt.publicRef,
            expiresAt: session.expiresAt.toISOString(),
            questionnaireDeadline: attempt.questionnaireDeadline?.toISOString() ?? null,
            reused: true,
          });
        }
      } catch {
        // Fall through — either invalid/expired/revoked; issue a fresh session below.
      }
    }

    const trio = await resolveCurrentPublished();
    const started = await sessionService.start(getDb(), getServerEnv().SESSION_SECRET, trio);
    await setSessionCookie(started.rawSessionToken, started.session.expiresAt);
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
