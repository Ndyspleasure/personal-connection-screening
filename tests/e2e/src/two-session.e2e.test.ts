import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb, insertSessionKind, type Database } from '@pcs/db';
import { sessionsAdminService, type AdminActor } from '@pcs/domain';
import { SESSION_COOKIE_NAME } from '@pcs/security';
import {
  HttpClient,
  MIGRATIONS_DIR,
  recreateDatabase,
  startPublicServer,
  withDatabase,
  type RunningServer,
} from './harness';
import { seedPublishedScreening } from './seed';

/**
 * Two-session E2E — the picker catalog + the gated (Pendekatan) access-code
 * flow, driven over real HTTP against the built app. Hermetic: its own database
 * and port. The code is verified with the SAME VERIFICATION_SECRET the harness
 * boots the server with, so the server can validate what this process created.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const E2E_DB_NAME = process.env.E2E_TWO_DB_NAME ?? 'pcs_e2e_two';
const E2E_DB_URL = withDatabase(BASE_DB_URL, E2E_DB_NAME);
const PORT = Number(process.env.E2E_TWO_PORT ?? 3998);
process.env.DATABASE_URL = E2E_DB_URL;

// Must match startPublicServer()'s env in harness.ts.
const VERIFY_SECRET = 'e2e-verify-secret-please-change-1';
const ADMIN: AdminActor = { type: 'ADMIN', adminActorId: 'e2e-two-admin', role: 'OWNER' };
const CTX = { correlationId: '00000000-0000-0000-0000-000000000000' };
const hasDb = process.env.SKIP_E2E !== '1' && Boolean(BASE_DB_URL);

interface SessionCatalogItem {
  key: string;
  name: string;
  requiresAccessCode: boolean;
  state: string;
}

describe.runIf(hasDb)('two-session catalog + access code (e2e)', () => {
  let server: RunningServer;
  let db: Database;
  let validCode: string;

  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, E2E_DB_NAME);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Two published screenings → two sessions (open + gated).
    const open = await seedPublishedScreening(db, 70);
    const gated = await seedPublishedScreening(db, 70);
    await insertSessionKind(db, {
      key: 'perkenalan-teman',
      name: 'Perkenalan Teman',
      description: 'Start getting to know each other.',
      displayOrder: 1,
      requiresAccessCode: false,
      questionnaireId: open.questionnaireId,
    });
    const pendekatan = await insertSessionKind(db, {
      key: 'pendekatan',
      name: 'Pendekatan',
      description: 'An exclusive session — you’ll need an access code.',
      displayOrder: 2,
      requiresAccessCode: true,
      questionnaireId: gated.questionnaireId,
    });
    const created = await sessionsAdminService.createCode(
      db,
      VERIFY_SECRET,
      ADMIN,
      { sessionKindId: pendekatan.id, maxUses: 5 },
      CTX,
    );
    validCode = created.code;

    server = await startPublicServer({ port: PORT, databaseUrl: E2E_DB_URL });
  });

  afterAll(async () => {
    if (server) await server.stop();
    await closeDb();
  });

  it('lists both sessions and never leaks the code or its hash', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const { status, json } = await client.get<{ sessions: SessionCatalogItem[] }>(
      '/api/public/sessions',
    );
    expect(status).toBe(200);
    const sessions = json?.sessions ?? [];
    expect(sessions.length).toBe(2);
    const open = sessions.find((s) => s.key === 'perkenalan-teman');
    const gated = sessions.find((s) => s.key === 'pendekatan');
    expect(open?.requiresAccessCode).toBe(false);
    expect(gated?.requiresAccessCode).toBe(true);

    const raw = JSON.stringify(json);
    expect(raw).not.toContain('codeHash');
    expect(raw).not.toContain(validCode);
  });

  it('opens the open session directly (no code)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const start = await client.post<{ reused: boolean; attemptRef: string }>(
      '/api/public/session',
      {
        body: { sessionKey: 'perkenalan-teman' },
      },
    );
    expect(start.status).toBe(201);
    expect(start.json?.reused).toBe(false);
    expect(client.hasCookie(SESSION_COOKIE_NAME)).toBe(true);
    const state = await client.get<{ status: string }>('/api/public/session');
    expect(state.json?.status).toBe('ACTIVE');
  });

  it('refuses to start the gated session without a granted code (403 ACCESS_REQUIRED)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const res = await client.post<{ error: { code: string } }>('/api/public/session', {
      body: { sessionKey: 'pendekatan' },
    });
    expect(res.status).toBe(403);
    expect(res.json?.error.code).toBe('ACCESS_REQUIRED');
  });

  it('rejects a wrong access code and accepts the valid one (then the session is live)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);

    const bad = await client.post<{ error: { code: string } }>('/api/public/access-code', {
      body: { sessionKey: 'pendekatan', code: 'WRONG-CODE' },
    });
    expect(bad.status).toBe(403);
    expect(bad.json?.error.code).toBe('ACCESS_CODE_INVALID');
    expect(client.hasCookie(SESSION_COOKIE_NAME)).toBe(false);

    const ok = await client.post<{ ok: boolean; next: string }>('/api/public/access-code', {
      body: { sessionKey: 'pendekatan', code: validCode },
    });
    expect(ok.status).toBe(201);
    expect(ok.json?.ok).toBe(true);
    expect(ok.json?.next).toBe('/session');
    expect(client.hasCookie(SESSION_COOKIE_NAME)).toBe(true);

    const state = await client.get<{ status: string }>('/api/public/session');
    expect(state.json?.status).toBe('ACTIVE');
  });
});
