import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '../../../lib/supabase/config';
import { createClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
