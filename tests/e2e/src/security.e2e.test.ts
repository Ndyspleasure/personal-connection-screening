import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb, type Database } from '@pcs/db';
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
 * Security E2E suite (Phase 7; Brief §48; Sec §76–77). Drives the booted public
 * app through the attack scenarios that must fail closed: fake result payloads,
 * IDOR across candidates, replay, enumeration, safe verification projection, and
 * rate limiting. Complements the happy-path public-journey suite.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const E2E_DB_NAME = process.env.E2E_SEC_DB_NAME ?? 'pcs_e2e_sec';
const E2E_DB_URL = withDatabase(BASE_DB_URL, E2E_DB_NAME);
const PORT = Number(process.env.E2E_SEC_PORT ?? 3998);
process.env.DATABASE_URL = E2E_DB_URL;
const hasDb = process.env.SKIP_E2E !== '1' && Boolean(BASE_DB_URL);

interface QuestionView {
  questionVersionId: string;
  type: string;
  options: { id: string; value: string; label: string }[];
}
interface ResultView {
  resultRef: string;
  result: 'PASS' | 'FAIL';
  verificationRef: string | null;
}
interface ErrorBody {
  error: { code: string; message: string };
}

function answerBody(q: QuestionView): Record<string, unknown> {
  if (q.type === 'text') return { textValue: 'e2e' };
  if (q.type === 'numeric') return { numericValue: 1 };
  return { selectedOptionVersionIds: [q.options[0]!.id] };
}

/** Run a full candidate journey on a fresh client; returns its final refs. */
async function completeJourney(
  server: RunningServer,
): Promise<{ client: HttpClient; result: ResultView }> {
  const client = new HttpClient(server.baseUrl, server.origin);
  const start = await client.post('/api/public/session', { body: {} });
  expect(start.status).toBe(201);
  const qn = await client.get<{ questions: QuestionView[] }>('/api/public/questionnaire');
  for (const q of qn.json?.questions ?? []) {
    await client.put('/api/public/answer', {
      body: { questionVersionId: q.questionVersionId, expectedRevision: null, ...answerBody(q) },
    });
  }
  const submit = await client.post<ResultView>('/api/public/submission', { body: {} });
  expect(submit.status).toBe(201);
  return { client, result: submit.json! };
}

describe.runIf(hasDb)('public security boundaries (e2e)', () => {
  let server: RunningServer;
  let db: Database;

  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, E2E_DB_NAME);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    await seedPublishedScreening(db, 70);
    server = await startPublicServer({ port: PORT, databaseUrl: E2E_DB_URL });
  });
  afterAll(async () => {
    if (server) await server.stop();
    await closeDb();
  });

  it('IDOR: one candidate cannot read another candidate’s result by ref (TH-009)', async () => {
    const a = await completeJourney(server);
    const b = await completeJourney(server);
    expect(a.result.resultRef).not.toBe(b.result.resultRef);

    // B, authenticated as itself, asks for A's result ref -> uniform 404.
    const attempt = await b.client.get<ErrorBody>(`/api/public/result/${a.result.resultRef}`);
    expect(attempt.status).toBe(404);
    expect(attempt.json?.error.code).toBe('NOT_FOUND');

    // ...and cannot open A's contact gate either.
    const contact = await b.client.get<ErrorBody>(`/api/public/contact/${a.result.resultRef}`);
    expect(contact.status).toBe(404);
  });

  it('replay: a client-supplied idempotency key returns the SAME final record (no dup)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    await client.post('/api/public/session', { body: {} });
    const qn = await client.get<{ questions: QuestionView[] }>('/api/public/questionnaire');
    for (const q of qn.json?.questions ?? []) {
      await client.put('/api/public/answer', {
        body: { questionVersionId: q.questionVersionId, expectedRevision: null, ...answerBody(q) },
      });
    }
    const first = await client.post<ResultView>('/api/public/submission', {
      body: { idempotencyKey: 'attacker-key-123' },
    });
    const replay = await client.post<ResultView>('/api/public/submission', {
      body: { idempotencyKey: 'attacker-key-123' },
    });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.json?.resultRef).toBe(first.json?.resultRef);
  });

  it('fake score payload is rejected by the strict schema (SEC-AC-01)', async () => {
    const { client, result } = await completeJourney(server);
    // The attempt is already COMPLETED; even a well-formed forged answer body
    // carrying a score is rejected on shape, never honored.
    const forged = await client.put<ErrorBody>('/api/public/answer', {
      body: { questionVersionId: result.resultRef, expectedRevision: 0, score: 999 },
    });
    expect(forged.status).toBe(400);
    expect(forged.json?.error.code).toBe('VALIDATION_ERROR');
  });

  it('verification is a safe public projection: no score, no answers (Sec §42; TH-008)', async () => {
    const { result } = await completeJourney(server);
    const verifyClient = new HttpClient(server.baseUrl, server.origin); // public, no cookie
    const verify = await verifyClient.get<Record<string, unknown>>(
      `/api/public/verify/${result.verificationRef}`,
    );
    expect(verify.status).toBe(200);
    const body = verify.json!;
    expect(body.result).toBe('PASS');
    expect(body.status).toBe('VALID');
    // The projection must NOT leak the numeric score or any answers.
    expect('score' in body).toBe(false);
    expect('answers' in body).toBe(false);
    const raw = JSON.stringify(body).toLowerCase();
    expect(raw).not.toContain('"score"');
  });

  it('enumeration: an unknown verification ref does not confirm existence (uniform 404)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const res = await client.get<ErrorBody>('/api/public/verify/VER-deadbeefdeadbeefdeadbeef');
    expect(res.status).toBe(404);
    expect(res.json?.error.code).toBe('NOT_FOUND');
  });

  it('rate limiting throttles a burst of session starts (Threat §28)', async () => {
    // start limit is 10/60s per ip; a burst well past that must see a 429.
    const client = new HttpClient(server.baseUrl, server.origin);
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await client.post('/api/public/session', { body: {} });
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
  });
});
