import { publicEnv } from '@pcs/config';

/**
 * Admin identity uses Supabase Auth (Technology Architecture §5, §17). Until the
 * project is provisioned, the admin app runs in an inert "not configured" mode
 * rather than crashing, so the foundation builds without secrets.
 */
export function supabaseUrl(): string {
  return publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function supabaseAnonKey(): string {
  return publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
