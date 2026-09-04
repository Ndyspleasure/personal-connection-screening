import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Hermetic-database helper for service integration tests that touch a SINGLETON
 * row (e.g. the single `profile`). Such tests would otherwise race with other
 * suites sharing the same database, so they run against a dedicated database of
 * their own — created, migrated, and thrown away per run. Same approach as the
 * public-journey E2E harness.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(HERE, '../../../../db/drizzle');

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Drop + recreate a dedicated database via the `postgres` maintenance database. */
export async function recreateDatabase(baseUrl: string, database: string): Promise<void> {
  const admin = postgres(withDatabase(baseUrl, 'postgres'), { max: 1, prepare: false });
  try {
    await admin`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${database} AND pid <> pg_backend_pid()
    `;
    await admin`DROP DATABASE IF EXISTS ${admin(database)}`;
    await admin`CREATE DATABASE ${admin(database)}`;
  } finally {
    await admin.end({ timeout: 5 });
  }
}
