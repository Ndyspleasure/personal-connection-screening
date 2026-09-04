import { NextResponse, type NextRequest } from 'next/server';
import { getServerEnv } from '@pcs/config/server';
import { integrityService } from '@pcs/domain';
import { db, newCorrelationId, toErrorResponse } from '../../../../lib/admin-route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/integrity-scan — the scheduled integrity scan (Tech §63–64,
 * §131). Secured by CRON_SECRET: Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`. Fails closed when the secret is unset or mismatched — this is
 * the only unauthenticated-by-user entry point, so the guard is strict.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = getServerEnv().CRON_SECRET;
    const provided =
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
      req.headers.get('x-cron-secret') ??
      '';
    if (!secret || provided !== secret) {
      return NextResponse.json({ error: { code: 'NOT_AUTHORIZED' } }, { status: 401 });
    }
    const summary = await integrityService.runScan(db(), {
      correlationId: newCorrelationId(),
      actorType: 'SYSTEM',
      actorId: null,
    });
    return NextResponse.json(summary);
  } catch (err) {
    return toErrorResponse(err);
  }
}
