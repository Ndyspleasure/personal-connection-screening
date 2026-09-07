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
- `SESSION_SECRET` — 16+ byte random secret that signs the opaque public
  session-cookie fingerprint. Keep it **stable** (rotating it signs out every
  active candidate) and identical across all `pcs-public` instances.
- `VERIFICATION_SECRET` — 16+ byte random secret that signs result-verification
  links **and** hashes access codes. It **must be byte-for-byte identical in both
  `pcs-public` and `pcs-admin`**: the admin CMS mints a code by HMAC-ing it with
  this secret and stores only the hash, and the public app accepts a code by
  re-HMAC-ing the entered value with the same secret — mismatched secrets mean
  every code is rejected. Rotating it invalidates all outstanding access codes and
  verification links, so treat it as long-lived.
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

Migrations are versioned SQL under `packages/db/drizzle` (0000–0012), applied by
a **migration-privileged role** in a controlled CI/CD step — never from a
developer laptop against production:

```bash
DATABASE_URL="<target>" pnpm --filter @pcs/db db:migrate
```

Migrations are additive and non-destructive; immutability and append-only
guarantees are enforced by DB triggers (`0003`, `0005`, `0007`, `0009`, `0011`).
Run migrations **before** promoting the new app build.

## Sessions & access codes (two-session model, migration 0012)

The landing page is a **catalog** of sessions, not a single flow. Migration
`0012` adds two CMS-managed tables plus `attempt.session_kind_id`:

- **`session_kind`** — the catalog. Each row is one session (e.g.
  `perkenalan-teman`, `pendekatan`), maps to its **own published questionnaire**,
  carries a `display_order`, and a `requires_access_code` flag. Adding session 3
  or 4 is a **data** change — insert a row pointing at a published questionnaire;
  no code deploy.
- **`access_code`** — codes that gate a `requires_access_code` kind. Only the
  **HMAC hash** is stored (never plaintext); expiry, usage cap, and status
  (`ACTIVE`/`DISABLED`/`REVOKED`) are enforced server-side, and consumption is
  atomic (concurrency-safe usage counting).

Operate codes from the admin CMS at **`/access-codes`**: create (the plaintext is
shown **once**, at creation), disable/revoke (revoke is irreversible, behind a
confirm dialog), set expiry / max-uses, and watch usage. The public app verifies
and consumes a code at `POST /api/public/access-code`; a valid code starts the
gated session, and the **started session** (not the code) is the persisted grant,
so access survives a page reload.

**Config invariant:** `VERIFICATION_SECRET` must be identical in both apps (see
[Environment variables](#environment-variables)) — it is the shared HMAC key for
the mint/verify handshake. A gated kind is usable only when its questionnaire is
PUBLISHED **and** it has at least one ACTIVE, unexpired, non-exhausted code.

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
- [ ] `VERIFICATION_SECRET` is byte-identical in `pcs-public` and `pcs-admin`
      (else CMS-minted access codes are rejected by the public verifier).
- [ ] Every ACTIVE `session_kind` maps to a PUBLISHED questionnaire; each gated
      kind has at least one ACTIVE access code, and the gated flow is verified end
      to end (wrong code rejected, valid code opens the session).
