import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@pcs/config/server';
import * as schema from './schema/index';

/**
 * Server-only database access (Technology Architecture §10, §21). The browser
 * never touches Postgres; all access flows through the server domain/repository
 * layer using this connection. `prepare: false` keeps it compatible with a
 * transaction pooler (e.g. Supabase/PgBouncer) in serverless (§107–109).
 */
export type Database = PostgresJsDatabase<typeof schema>;

let cached: { db: Database; client: ReturnType<typeof postgres> } | null = null;

export function getDb(): Database {
  if (cached) return cached.db;
  const { DATABASE_URL } = getServerEnv();
  const client = postgres(DATABASE_URL, { max: 10, prepare: false });
  const db = drizzle(client, { schema });
  cached = { db, client };
  return db;
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.client.end();
    cached = null;
  }
}
