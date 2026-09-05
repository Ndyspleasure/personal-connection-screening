import { z } from 'zod';

/**
 * Server-only environment. Never import from client components.
 * Secrets here bypass RLS / sign tokens and must stay server-side
 * (Technology Architecture §20, §46–47; Threat Model §36; INV-S10).
 */
if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
  throw new Error('@pcs/config/server must not be imported in browser code');
}

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const serverEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SESSION_SECRET: z.string().min(16).optional().default('dev-session-secret-change-me-000'),
  VERIFICATION_SECRET: z.string().min(16).optional().default('dev-verify-secret-change-me-0000'),
  UPSTASH_REDIS_REST_URL: z.string().optional().default(''),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(''),
  CRON_SECRET: z.string().optional().default(''),
  // Email of the very first OWNER, self-provisioned on first sign-in when the
  // admin_actor allow-list is still empty. Later admins are added via the CMS.
  ADMIN_BOOTSTRAP_EMAIL: z.string().optional().default(''),
  PUBLIC_ALLOWED_ORIGINS: z.array(z.string()).default([]),
  ADMIN_ALLOWED_ORIGINS: z.array(z.string()).default([]),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Lazily parse + validate server env on first use (not at import time). */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse({
    APP_ENV: process.env.APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/pcs',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    VERIFICATION_SECRET: process.env.VERIFICATION_SECRET,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_BOOTSTRAP_EMAIL,
    PUBLIC_ALLOWED_ORIGINS: csv(process.env.PUBLIC_ALLOWED_ORIGINS),
    ADMIN_ALLOWED_ORIGINS: csv(process.env.ADMIN_ALLOWED_ORIGINS),
  });
  if (!parsed.success) {
    // Never echo values; only which keys failed.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid server environment configuration: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export const rateLimitingEnabled = (): boolean => {
  const env = getServerEnv();
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
};
