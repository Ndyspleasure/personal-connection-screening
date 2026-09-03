import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config';

/**
 * Refresh the admin session and enforce authentication on every non-public route
 * (Technology Architecture §17, §72). Middleware is a first gate only —
 * per-service authorization still applies (§71). When Supabase is not yet
 * configured, the app runs in inert bootstrap mode.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginRoute = path === '/login';

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
  return response;
}
