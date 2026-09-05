import { NextResponse, type NextRequest } from 'next/server';
import { sessionCatalogService, toSessionKindView } from '@pcs/domain';
import { getDb } from '@pcs/db';
import { toErrorResponse, tryResumeSession } from '../../../../lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/sessions — the server-authoritative session catalog.
 *
 * Lists ACTIVE session kinds (nothing about a session is hardcoded in the
 * frontend — the app renders whatever the server returns) plus this browser's
 * per-session state derived from its cookie, so the picker can reflect an
 * already-active or completed session (Data §26; phase spec "Status Sesi").
 */
export async function GET(_req: NextRequest) {
  try {
    const db = getDb();
    const [kinds, resumed] = await Promise.all([
      sessionCatalogService.listActive(db),
      tryResumeSession(),
    ]);
    const activeKindId =
      resumed?.attempt.status === 'ACTIVE' ? resumed.attempt.sessionKindId : null;
    const completedKindId =
      resumed?.attempt.status === 'COMPLETED' ? resumed.attempt.sessionKindId : null;

    const sessions = kinds.map((k) => ({
      ...toSessionKindView(k),
      state:
        k.id === activeKindId ? 'active' : k.id === completedKindId ? 'completed' : 'available',
    }));
    return NextResponse.json({ sessions });
  } catch (err) {
    return toErrorResponse(err);
  }
}
