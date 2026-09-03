import { z } from 'zod';

/**
 * Public environment — the ONLY config exposed to the browser bundle.
 * Must contain no secrets (Technology Architecture §46–47; Threat Model §36).
 */
const publicEnvSchema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().or(z.literal('')),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const publicEnv: PublicEnv = publicEnvSchema.parse({
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export const isProduction = publicEnv.APP_ENV === 'production';
