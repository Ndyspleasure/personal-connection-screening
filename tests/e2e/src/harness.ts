import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../../..');
export const PUBLIC_APP_DIR = path.join(REPO_ROOT, 'apps', 'public');
export const MIGRATIONS_DIR = path.join(REPO_ROOT, 'packages', 'db', 'drizzle');

/** Swap the database (path) component of a Postgres URL, preserving everything else. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Drop and recreate a dedicated database so every E2E run starts from a known,
 * empty schema. Uses the `postgres` maintenance database for the DDL because a
 * database cannot be dropped while a session is connected to it.
 */
export async function recreateDatabase(baseUrl: string, database: string): Promise<void> {
  const admin = postgres(withDatabase(baseUrl, 'postgres'), { max: 1, prepare: false });
  try {
    // Terminate any stragglers from a prior aborted run, then drop + create.
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

/** Poll the liveness probe until the server answers or the deadline passes. */
export async function waitForHealth(baseUrl: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
      lastErr = new Error(`health status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }
  throw new Error(`public app did not become healthy in ${timeoutMs}ms: ${String(lastErr)}`);
}

export interface RunningServer {
  baseUrl: string;
  origin: string;
  stop(): Promise<void>;
}

/**
 * Boot the ALREADY-BUILT public app with `next start`. APP_ENV=development is
 * deliberate: it makes the session cookie non-Secure so the journey works over
 * plain http (Secure cookies are dropped by http clients).
 */
export async function startPublicServer(params: {
  port: number;
  databaseUrl: string;
}): Promise<RunningServer> {
  const { port, databaseUrl } = params;
  const origin = `http://127.0.0.1:${port}`;
  const child: ChildProcessWithoutNullStreams = spawn(
    'pnpm',
    ['exec', 'next', 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: PUBLIC_APP_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_ENV: 'development',
        PORT: String(port),
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: 'e2e-session-secret-please-change-1',
        VERIFICATION_SECRET: 'e2e-verify-secret-please-change-1',
        PUBLIC_ALLOWED_ORIGINS: origin,
        // No Upstash creds -> the in-memory limiter is used (dev/test fallback).
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_REST_TOKEN: '',
      },
    },
  );

  const logs: string[] = [];
  const capture = (buf: Buffer) => {
    const text = buf.toString();
    logs.push(text);
    if (logs.length > 200) logs.shift();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const exited = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(
        new Error(`public server exited early (code=${code}, signal=${signal}):\n${logs.join('')}`),
      );
    });
  });

  try {
    await Promise.race([waitForHealth(origin), exited]);
  } catch (err) {
    child.kill('SIGKILL');
    throw err;
  }

  return {
    baseUrl: origin,
    origin,
    async stop() {
      if (child.exitCode !== null) return;
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        // Hard stop if it refuses to leave.
        setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
      });
    },
  };
}

/**
 * A tiny cookie-aware HTTP client. Node's fetch does not persist cookies or set
 * an Origin header, so we do both by hand — which is exactly what lets us prove
 * the server's cookie-auth and Origin/CSRF checks from the outside.
 */
export class HttpClient {
  private readonly jar = new Map<string, string>();

  constructor(
    private readonly baseUrl: string,
    private readonly origin: string,
  ) {}

  private applySetCookie(res: Response): void {
    const cookies = res.headers.getSetCookie?.() ?? [];
    for (const raw of cookies) {
      const pair = raw.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || value === 'deleted') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  private cookieHeader(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  hasCookie(name: string): boolean {
    return this.jar.has(name);
  }

  clearCookies(): void {
    this.jar.clear();
  }

  async request<T = unknown>(
    method: string,
    pathname: string,
    opts: { body?: unknown; origin?: string | null; sendCookies?: boolean } = {},
  ): Promise<{ status: number; json: T | null; res: Response }> {
    const headers: Record<string, string> = {};
    const sendCookies = opts.sendCookies ?? true;
    if (sendCookies && this.jar.size > 0) headers['cookie'] = this.cookieHeader();

    const stateChanging = method !== 'GET' && method !== 'HEAD';
    if (stateChanging) {
      const originValue = opts.origin === undefined ? this.origin : opts.origin;
      if (originValue !== null) headers['origin'] = originValue;
      headers['content-type'] = 'application/json';
    }

    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers,
      body: stateChanging ? JSON.stringify(opts.body ?? {}) : undefined,
      redirect: 'manual',
    });
    this.applySetCookie(res);

    let json: T | null = null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      json = (await res.json().catch(() => null)) as T | null;
    }
    return { status: res.status, json, res };
  }

  get<T = unknown>(pathname: string, opts?: { sendCookies?: boolean }) {
    return this.request<T>('GET', pathname, opts);
  }
  post<T = unknown>(
    pathname: string,
    opts?: { body?: unknown; origin?: string | null; sendCookies?: boolean },
  ) {
    return this.request<T>('POST', pathname, opts);
  }
  put<T = unknown>(
    pathname: string,
    opts?: { body?: unknown; origin?: string | null; sendCookies?: boolean },
  ) {
    return this.request<T>('PUT', pathname, opts);
  }
}
