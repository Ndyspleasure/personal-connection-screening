# Personal Connection Screening System

A server-authoritative connection gateway: a public web experience where a visitor
reads about the owner, completes a versioned questionnaire, and receives a
server-computed `PASS` / `FAIL` with a verifiable record — plus an admin CMS to
manage content, questionnaires, scoring, and policy.

> **Core principle:** the browser is an interface, not an authority. The server owns
> state, versioning, scoring, and authorization. Historical records are immutable.
> See [`/docs`](./docs) for the full specification and the architecture/plan.

## Status

Bootstrap in progress. Implemented so far:

- **Phase 1 — Foundation:** pnpm + Turborepo monorepo, two Next.js apps, shared
  packages, Drizzle + first migration (content domain), CI.
- **Phase 2 — Security foundation:** opaque IDs & session-token primitives,
  cookie/CSRF helpers, safe error model, rate limiting (Upstash), admin auth
  wiring (Supabase Auth), server/public secret boundary.

Remaining phases (core domain, candidate flow, CMS, reliability, testing) are
tracked in [`docs/00-repository-audit-and-implementation-plan.md`](./docs/00-repository-audit-and-implementation-plan.md).

## Repository layout

```
apps/
  public/     Next.js public web  (connect.<domain>)
  admin/      Next.js admin CMS   (admin.<domain>)
packages/
  types/      shared types, enums, error codes, public DTOs
  config/     env parsing (server-only vs public), constants, default policy
  validation/ Zod request/response schemas
  security/   opaque IDs, tokens, cookies, CSRF, rate limiting, safe errors
  db/         Drizzle schema, migrations, repositories, DB client (server-only)
  domain/     services, state machines, evaluation engine, invariants
  ui/         shared React primitives
docs/         specifications + architecture/plan
```

## Local development

Requires Node ≥ 22 and pnpm 10.

```bash
pnpm install
cp .env.example .env          # fill in values (see below)
pnpm typecheck
pnpm test                     # unit tests
pnpm test:integration         # DB integration tests (needs a Postgres — see below)
pnpm dev                      # runs both apps
```

### A local Postgres for integration tests

```bash
docker run --rm -d --name pcs-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pcs postgres:16
pnpm db:migrate
pnpm test:integration
```

## What you must provision (not created automatically)

Building billed cloud resources on your accounts is intentionally left to you:

| Service                     | Purpose                 | Env vars                                                                                 |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| Supabase project (Postgres) | System of record        | `DATABASE_URL` (pooled)                                                                  |
| Supabase Auth               | Admin identity + MFA    | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Upstash Redis               | App-layer rate limiting | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                     |
| Vercel (2 projects)         | Deploy public + admin   | project env vars mirror `.env.example`                                                   |

Secrets are server-only and must never be committed or exposed to a client bundle.
