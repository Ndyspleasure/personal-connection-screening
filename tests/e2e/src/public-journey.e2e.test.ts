import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb, type Database } from '@pcs/db';
import { SESSION_COOKIE_NAME } from '@pcs/security';
import {
  HttpClient,
  MIGRATIONS_DIR,
  recreateDatabase,
  startPublicServer,
  withDatabase,
  type RunningServer,
} from './harness';
import { seedPublishedScreening, type SeededScreening } from './seed';

/**
 * Public-journey E2E (Phase 4 capstone).
 *
 * Everything below the domain layer already has integration coverage; this
 * exercises the untested HTTP edge — the real Next route handlers, opaque
 * session cookie, Origin/CSRF gate, Zod parsing, and safe error mapping —
 * by booting the built public app and driving it over the wire exactly like a
 * browser would. It is hermetic: it creates and migrates its own database so
 * the seeded screening is the one `resolveCurrentPublished()` resolves.
 *
 * The suite only runs when a Postgres is reachable (DATABASE_URL / default);
 * in that case it manages a dedicated `pcs_e2e` database of its own.
 */
const BASE_DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/pcs';
const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'pcs_e2e';
const E2E_DB_URL = withDatabase(BASE_DB_URL, E2E_DB_NAME);
const PORT = Number(process.env.E2E_PORT ?? 3999);

// The seed + migrate run in THIS process, so point it at the dedicated db too.
// getDb() is lazy, so setting it before the first getDb() call is sufficient.
process.env.DATABASE_URL = E2E_DB_URL;

const hasDb = process.env.SKIP_E2E !== '1' && Boolean(BASE_DB_URL);

interface SessionStart {
  sessionRef: string;
  attemptRef: string;
  expiresAt: string;
  questionnaireDeadline: string | null;
  reused: boolean;
}
interface SessionState {
  sessionRef: string;
  attemptRef: string;
  status: string;
  expiresAt: string;
  questionnaireDeadline: string | null;
}
interface QuestionOption {
  id: string;
  value: string;
  label: string;
}
interface QuestionView {
  position: number;
  questionVersionId: string;
  type: string;
  text: string;
  description: string | null;
  required: boolean;
  options: QuestionOption[];
}
interface QuestionnaireView {
  questions: QuestionView[];
}
interface AnswerSaved {
  questionVersionId: string;
  revision: number;
}
interface ResultView {
  resultRef: string;
  result: 'PASS' | 'FAIL';
  completedAt: string;
  verificationRef: string | null;
  contactAvailable: boolean;
}
interface VerificationView {
  verificationRef: string;
  status: string;
  result: 'PASS' | 'FAIL';
  completedAt: string;
  questionnaireVersionLabel: string;
}
interface RetakeView {
  eligible: boolean;
  reason: string | null;
  attempts: number;
  maxAttempts: number;
  cooldownSeconds: number;
  retakeMode: string;
}
interface ContactView {
  available: boolean;
  channel: unknown;
}
interface ErrorBody {
  error: { code: string; message: string };
}

/** Pick a valid answer payload for any MVP question type. */
function answerPayloadFor(q: QuestionView): Record<string, unknown> {
  switch (q.type) {
    case 'boolean':
    case 'single_choice':
    case 'multiple_choice':
      return { selectedOptionVersionIds: [q.options[0]!.id] };
    case 'text':
      return { textValue: 'e2e' };
    case 'numeric':
      return { numericValue: 1 };
    default:
      throw new Error(`unsupported question type in E2E seed: ${q.type}`);
  }
}

describe.runIf(hasDb)('public candidate journey (e2e)', () => {
  let server: RunningServer;
  let db: Database;
  let seeded: SeededScreening;

  beforeAll(async () => {
    await recreateDatabase(BASE_DB_URL, E2E_DB_NAME);
    db = getDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    seeded = await seedPublishedScreening(db, 70);
    server = await startPublicServer({ port: PORT, databaseUrl: E2E_DB_URL });
  });

  afterAll(async () => {
    if (server) await server.stop();
    await closeDb();
  });

  it('health probe is green', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const { status, json } = await client.get<{ status: string; app: string }>('/api/health');
    expect(status).toBe(200);
    expect(json?.status).toBe('ok');
    expect(json?.app).toBe('public');
  });

  it('drives start -> answer -> submit -> verify to a server-computed PASS', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);

    // 1) Start: sets an opaque HttpOnly session cookie and locks the attempt.
    const start = await client.post<SessionStart>('/api/public/session', { body: {} });
    expect(start.status).toBe(201);
    expect(start.json?.reused).toBe(false);
    expect(start.json?.sessionRef).toBeTruthy();
    expect(start.json?.attemptRef).toBeTruthy();
    expect(client.hasCookie(SESSION_COOKIE_NAME)).toBe(true);
    const attemptRef = start.json!.attemptRef;

    // 2) Resume via the cookie only.
    const resumed = await client.get<SessionState>('/api/public/session');
    expect(resumed.status).toBe(200);
    expect(resumed.json?.status).toBe('ACTIVE');
    expect(resumed.json?.attemptRef).toBe(attemptRef);

    // 3) The questionnaire is projected from the attempt's LOCKED version.
    const qn = await client.get<QuestionnaireView>('/api/public/questionnaire');
    expect(qn.status).toBe(200);
    const questions = qn.json?.questions ?? [];
    expect(questions.length).toBe(2);
    for (const q of questions) {
      expect(q.questionVersionId).toBeTruthy();
      expect(q.options.length).toBeGreaterThanOrEqual(1);
    }

    // 4) Autosave each required answer (first save uses a null expected revision).
    for (const q of questions) {
      const saved = await client.put<AnswerSaved>('/api/public/answer', {
        body: {
          questionVersionId: q.questionVersionId,
          expectedRevision: null,
          ...answerPayloadFor(q),
        },
      });
      expect(saved.status).toBe(200);
      expect(saved.json?.revision).toBe(0);
    }

    // 5) A stale re-save (still claiming "no prior revision") is rejected 409.
    const stale = await client.put<ErrorBody>('/api/public/answer', {
      body: {
        questionVersionId: questions[0]!.questionVersionId,
        expectedRevision: null,
        ...answerPayloadFor(questions[0]!),
      },
    });
    expect(stale.status).toBe(409);
    expect(stale.json?.error.code).toBe('STALE_STATE');

    // 6) A forged extra field (e.g. a client-supplied score) is refused by the
    //    strict schema — the client can never inject the outcome (SEC-AC-01).
    const forged = await client.put<ErrorBody>('/api/public/answer', {
      body: {
        questionVersionId: questions[0]!.questionVersionId,
        expectedRevision: 0,
        ...answerPayloadFor(questions[0]!),
        score: 999,
      },
    });
    expect(forged.status).toBe(400);
    expect(forged.json?.error.code).toBe('VALIDATION_ERROR');

    // 7) Finalize: the server scores it (both "yes" => 80 >= 70 => PASS).
    const submit = await client.post<ResultView>('/api/public/submission', { body: {} });
    expect(submit.status).toBe(201);
    expect(submit.json?.result).toBe('PASS');
    expect(submit.json?.resultRef).toBeTruthy();
    expect(submit.json?.verificationRef).toBeTruthy();
    expect(submit.json?.contactAvailable).toBe(true);
    const resultRef = submit.json!.resultRef;
    const verificationRef = submit.json!.verificationRef!;

    // 8) Idempotent replay (refresh / retry) returns the SAME durable record.
    const replay = await client.post<ResultView>('/api/public/submission', { body: {} });
    expect(replay.status).toBe(200);
    expect(replay.json?.resultRef).toBe(resultRef);
    expect(replay.json?.verificationRef).toBe(verificationRef);
    expect(replay.json?.result).toBe('PASS');

    // 9) The candidate can read their own result by opaque ref.
    const result = await client.get<ResultView>(`/api/public/result/${resultRef}`);
    expect(result.status).toBe(200);
    expect(result.json?.result).toBe('PASS');
    expect(result.json?.resultRef).toBe(resultRef);

    // 10) Public verification: PASS + version label, no answers/internals.
    const verifyClient = new HttpClient(server.baseUrl, server.origin); // no cookie needed
    const verify = await verifyClient.get<VerificationView>(
      `/api/public/verify/${verificationRef}`,
    );
    expect(verify.status).toBe(200);
    expect(verify.json?.status).toBe('VALID');
    expect(verify.json?.result).toBe('PASS');
    expect(verify.json?.questionnaireVersionLabel).toContain(seeded.slug);

    // 11) Retake eligibility is enforced server-side from the frozen policy.
    const retake = await client.get<RetakeView>('/api/public/retake');
    expect(retake.status).toBe(200);
    expect(retake.json?.eligible).toBe(false); // no newer version published
    expect(retake.json?.attempts).toBeGreaterThanOrEqual(1);
    expect(retake.json?.maxAttempts).toBeGreaterThan(0);

    // 12) The contact gate opens only for a PASS that belongs to the caller.
    const contact = await client.get<ContactView>(`/api/public/contact/${resultRef}`);
    expect(contact.status).toBe(200);
    expect(contact.json?.available).toBe(true);
  });

  it('rejects a state-changing request that carries no session cookie (404)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const res = await client.post<ErrorBody>('/api/public/submission', { body: {} });
    expect(res.status).toBe(404);
    expect(res.json?.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('rejects a state-changing request from a disallowed Origin (403)', async () => {
    const client = new HttpClient(server.baseUrl, server.origin);
    const res = await client.post<ErrorBody>('/api/public/session', {
      body: {},
      origin: 'http://evil.example',
    });
    expect(res.status).toBe(403);
    expect(res.json?.error.code).toBe('NOT_AUTHORIZED');
  });

  it('never leaks another candidate result through a guessed ref (404)', async () => {
    // A fresh candidate cannot read the first candidate's result by ref.
    const attacker = new HttpClient(server.baseUrl, server.origin);
    await attacker.post<SessionStart>('/api/public/session', { body: {} });
    const guessed = 'RES-000000000000000000000000';
    const res = await attacker.get<ErrorBody>(`/api/public/result/${guessed}`);
    expect(res.status).toBe(404);
    expect(res.json?.error.code).toBe('NOT_FOUND');
  });
});
