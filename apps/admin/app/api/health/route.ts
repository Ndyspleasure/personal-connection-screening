import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness probe (Technology Architecture §54). Does not expose internals. */
export function GET() {
  return NextResponse.json({ status: 'ok', app: 'admin', time: new Date().toISOString() });
}
