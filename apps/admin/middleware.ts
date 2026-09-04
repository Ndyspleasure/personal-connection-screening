import type { NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // `api/cron` authenticates via CRON_SECRET, not a Supabase session, so it must
  // bypass the auth-redirect middleware (it has no user cookie).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|api/cron).*)'],
};
