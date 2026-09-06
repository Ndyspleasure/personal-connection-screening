# Deployment & production guide

How to take this monorepo to production. Nothing here is provisioned
automatically — provisioning cloud resources is a deliberate, human step.

## Topology (Technology Architecture §45, §49, §82–84, §134)

Two Vercel projects from **one** repository, deployed independently:

| Project      | Root directory | Purpose                | Distinct domain (example)     |
| ------------ | -------------- | ---------------------- | ----------------------------- |
| `pcs-public` | `apps/public`  | Candidate-facing flow  | `screening.example.com`       |
| `pcs-admin`  | `apps/admin`   | Owner CMS + operations | `admin.screening.example.com` |

Distinct domains mean **distinct cookies**: the public opaque session cookie and
the admin Supabase session never share an origin. Set each project's
"Root Directory" to the app folder; the monorepo build uses Turborepo so shared
packages build transitively.

The database (PostgreSQL / Supabase) and Upstash Redis are shared services both
projects talk to server-side only.

Both apps pin their serverless functions to a single region via each app's
`vercel.json` (`"regions": ["sin1"]`, Singapore) so function execution is
co-located with the database region and DB round-trips stay in-region. Set this
to match wherever the database actually lives.

## Environments (Brief §46)

Three isolated environments, each with its **own database and secrets** — never
point local or preview at the production database:

| Env        | `APP_ENV`     | Database                   | Cookies    |
| ---------- | ------------- | -------------------------- | ---------- |
| dev        | `development` | local Postgres             | non-Secure |
| preview    | `preview`     | preview/branch DB          | Secure     |
| production | `production`  | production DB (pooled URL) | Secure     |

`APP_ENV=development` is the only mode that issues a non-Secure session cookie
(so local http works); preview and production always set Secure.

## Environment variables

See `.env.example` for the full list. Server-only (never `NEXT_PUBLIC_*`):

- `DATABASE_URL` — the **pooled** Supabase connection string in production
  (`prepare:false` keeps the client pooler-compatible).
- `SESSION_SECRET`, `VERIFICATION_SECRET` — 16+ byte random secrets.
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; admin project only.
- `ADMIN_BOOTSTRAP_EMAIL` — the first OWNER, self-provisioned on first sign-in
  while the `admin_actor` allow-list is empty. Unset it once the owner exists.
- `UPSTASH_REDIS_REST_URL` / `_TOKEN` — enable distributed rate limiting
  (without them the in-memory limiter is used — dev/test only, never prod).
- `CRON_SECRET` — Bearer token the scheduled integrity scan checks; required in
  production or the cron endpoint fails closed.
- `PUBLIC_ALLOWED_ORIGINS` / `ADMIN_ALLOWED_ORIGINS` — comma-separated origins
  for the Origin/CSRF gate; set each to the app's own production origin.

Public project also needs `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` only if the
public app ever needs Supabase (it does not today); the admin project needs both.

## Migrations (Technology Architecture §88–89)

Migrations are versioned SQL under `packages/db/drizzle` (0000–0011), applied by
a **migration-privileged role** in a controlled CI/CD step — never from a
developer laptop against production:

```bash
DATABASE_URL="<target>" pnpm --filter @pcs/db db:migrate
```

Migrations are additive and non-destructive; immutability and append-only
guarantees are enforced by DB triggers (`0003`, `0005`, `0007`, `0009`, `0011`).
Run migrations **before** promoting the new app build.

## Scheduled jobs

`apps/admin/vercel.json` declares the daily integrity scan
(`/api/cron/integrity-scan`, `0 3 * * *`). Vercel Cron sends
`Authorization: Bearer $CRON_SECRET`; the route rejects any other caller.

## CI/CD (Technology Architecture §87; Brief §47)

`.github/workflows/ci.yml` runs on every PR: install → format → lint →
typecheck → unit → migrate + integration (ephemeral Postgres) → build → E2E
(public journey + security). Production promotion is a protected, manual step
after preview verification.

## Health & observability (Technology Architecture §54–56)

- Liveness: `GET /api/health` on both apps.
- Structured logs: unexpected 5xx errors are logged as single-line JSON with a
  correlation id and automatic redaction of tokens/secrets/cookies
  (`logServerError`).

---

## Production checklist (Security §79; Technology Architecture §134)

Before launch, confirm every item:

- [ ] Separate databases + secrets per environment; production DB unreachable
      from local/preview.
- [ ] `SESSION_SECRET`, `VERIFICATION_SECRET`, `CRON_SECRET` set to strong random
      values in production; not shared across environments.
- [ ] `ADMIN_BOOTSTRAP_EMAIL` used once to create the owner, then removed.
- [ ] Upstash configured in production (distributed rate limiting active).
- [ ] `PUBLIC_ALLOWED_ORIGINS` / `ADMIN_ALLOWED_ORIGINS` set to the real origins.
- [ ] Cookies are Secure in preview/production (`APP_ENV` set correctly).
- [ ] Migrations applied by the migration role; `db:migrate` clean on the target.
- [ ] Integrity cron scheduled and reachable; a manual `Run scan now` returns 0
      findings on a clean database.
- [ ] Backup configured and a **restore tested** before launch.
- [ ] Health checks green; structured error logs visible in the platform.
- [ ] A published questionnaire + scoring + policy exist (the public flow needs
      all three) — verify a full candidate journey end to end in preview.
