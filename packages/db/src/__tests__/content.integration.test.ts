import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../client';
import { profile } from '../schema/content';

/**
 * DB integration test (Technology Architecture §58). Runs only when DATABASE_URL
 * is set and migrations have been applied; skipped otherwise so `pnpm test`
 * stays hermetic. CI provides an ephemeral Postgres + `db:migrate`.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)('content repository (integration)', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('connects and round-trips a profile row', async () => {
    const db = getDb();
    const slug = `test-${Date.now()}`;
    await db.insert(profile).values({ slug, displayName: 'Test Owner', status: 'PUBLISHED' });
    const rows = await db
      .select()
      .from(profile)
      .where(sql`slug = ${slug}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe('Test Owner');
    await db.delete(profile).where(sql`slug = ${slug}`);
  });
});
