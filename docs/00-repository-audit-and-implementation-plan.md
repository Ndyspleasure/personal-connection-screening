# Personal Connection Screening System
## Repository Audit, Architecture Assessment & Implementation Plan
### Planning deliverable — v0.1 (pre-implementation)

> **Status:** Planning only. **No application code has been written.** This document is the required first-pass response to Brief §57 ("Your First Task") and Brief §51 ("Implementation Order"). Implementation begins only after this plan is reviewed and the open product decisions in §4 are confirmed.
>
> **Source of truth:** the five specification documents committed to this repository:
> - `personal-connection-screening-system-spec-v0.1.md` (Master System Spec)
> - `personal-connection-screening-functional-spec-v0.1.md`
> - `personal-connection-screening-security-threat-model-v0.1.md`
> - `personal-connection-screening-data-state-model-v0.1(1).md`
> - `personal-connection-screening-technology-architecture-stack-v0.1.md`
>
> All five have been read in full. Section references below (e.g. *Sec §21*, *Data §46*, *Threat TH-024*, *AC SEC-AC-09*) point back to those documents so the implementation stays traceable to specification (Brief §54).

---

# 1. Repository Audit

### 1.1 Current state

| Aspect | Finding |
|---|---|
| **Framework / code** | **None.** The repository contains no application code. |
| **Directory structure** | Flat. Five `*.md` specification files at the repo root; nothing else. |
| **Package manager** | Not configured. No `package.json`, `pnpm-workspace.yaml`, lockfile, or `node_modules`. |
| **Dependencies** | None. |
| **Database setup** | None. No migrations, no schema, no Supabase config, no `DATABASE_URL`. |
| **Authentication** | None. No Supabase Auth, no session code, no cookies. |
| **Deployment config** | None. No `vercel.json`, no CI workflows (`.github/`), no env files. |
| **Reusable code/components** | None (no code). The **five specs are themselves the reusable asset** — an unusually complete, self-consistent blueprint covering behavior, functional flows, threats, data/state, and stack. |
| **Git** | On branch `claude/connection-screening-system-mpl4my` (the designated development branch). Working tree clean. One commit: `7e75f3a "Menambah pondasi projek"` adding the five specs (12,946 lines). Remote: `github.com/Ndyspleasure/personal-connection-screening`. |

Verification performed: recursive file search for `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `*.ts`, `*.tsx`, `*.sql`, `.env*`, `Dockerfile`, `vercel.json` — **all empty**.

### 1.2 Conflicts with the target architecture

**None.** This is a clean greenfield. There is no existing code to overwrite, no dependency to reconcile, and no architectural decision already baked into code that fights the recommended stack. Brief §50 ("do not overwrite unrelated work", "identify conflicts before destructive changes") is satisfied trivially: nothing will be overwritten.

The only two housekeeping items (not conflicts):
1. The spec files live at the repo root with versioned filenames. During Phase 1 they should move to `/docs` (Brief §54) — a non-destructive `git mv`, preserving history.
2. `origin/HEAD` is not set; the default branch is `main`. PRs from the feature branch will target `main`.

### 1.3 Audit conclusion

The repository is a **specification-first greenfield**. Implementation can proceed exactly as the Technology Architecture document prescribes, with no adaptation required to accommodate pre-existing code. Brief §50's "if a project already exists, adapt rather than recreate" does not apply — there is no code project yet, only the design corpus.

---

# 2. Architecture Assessment

### 2.1 Can the recommended stack be implemented cleanly here?

**Yes, without compromise.** Because the repo is empty of code, the modular-monolith / two-app architecture (Tech §5, §93–95, §149) can be laid down as-designed. The stack below is confirmed as-is from the Technology Architecture doc; the assessment adds concrete, implementation-level decisions where the specs deliberately left them "to implementation."

### 2.2 Confirmed stack (Tech §1, §135)

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Public Web | Next.js (App Router) on Vercel — deploy target `connect.<domain>` |
| Admin CMS | Next.js (App Router) on Vercel — deploy target `admin.<domain>` |
| System of record | PostgreSQL via Supabase |
| DB access | Drizzle ORM (server-side only), migrations in Git |
| Admin auth | Supabase Auth (MFA-capable) |
| Public session | Custom server-issued **opaque** token + HttpOnly/Secure/SameSite cookie |
| Validation | Zod (shared client+server schemas; server is authoritative) |
| Rate limiting | Vercel WAF (outer) + **Upstash Redis** (app-layer, distributed) — see Risk R-08 |
| Storage | Supabase Storage (deferred; not required for MVP) |
| Testing | Vitest (unit/integration) + Playwright (E2E) + API-level security tests |
| Package manager | pnpm (workspaces) |
| Monorepo orchestration | pnpm workspaces + **Turborepo** (task graph/caching) |
| Repo / CI | GitHub monorepo + Vercel Git integration + GitHub Actions |

### 2.3 Implementation-level decisions the specs left open (proposed)

These translate the specs' "exact X is an implementation choice" statements into concrete choices. Each is reversible behind the domain layer.

- **A-1 — Identifiers (Data §5, §113).** Internal PKs: **UUID v7** (time-sortable, index-friendly). External references: a **separate, opaque, prefixed, high-entropy** string per entity (`ses_`, `att_`, `sub_`, `res_`, `ver_` + ~128 bits base32-crockford). The public reference is *never* the DB PK (Threat TH-009 IDOR, Sec §21.3, §40).
- **A-2 — Public session token (Tech §12–14, Threat TH-001/002/006).** 32 random bytes → base64url raw token sent only in the cookie; DB stores **only a SHA-256 fingerprint** (Tech §13, §114). Cookie carries the token *reference*, never business state. Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age` aligned to session lifetime (Sec §67). Every sensitive request re-validates server-side (Sec §5.4, Threat TH-004/005).
- **A-3 — Optimistic concurrency (Data §57–58, Threat TH-026/027).** Mutable active rows (`session`, `answer` aggregate, draft entities) carry an integer `revision`. Writes are guarded `... WHERE id = $1 AND revision = $expected`; a 0-row update → `STALE_STATE` (409), never a silent overwrite.
- **A-4 — One-final-submission (Data §34, §61, INV-D06, Threat TH-024/029).** A **partial unique index** `UNIQUE (attempt_id) WHERE status = 'COMPLETED'` (or a `final_submission` boolean flag with a partial unique index) enforces it at the database, independent of application logic. Submit also carries an `idempotency_key` unique per attempt (Data §60, Tech §30).
- **A-5 — Finalization atomicity (Data §83–84, Tech §32, Sec §39).** Submit finalization runs in a **single Postgres transaction**: lock/finalize attempt → create submission → run (lightweight, synchronous) evaluation → persist evaluation + result → create verification → write audit. `SELECT … FOR UPDATE` on the attempt row serializes competing submits; the loser reads the existing result (Data §59, §111; Func §51). Evaluation stays in-request for MVP because scoring is lightweight (Tech §33); an async job path is a documented future migration if AI/long-running eval is added (Tech §33, §91).
- **A-6 — Version locking (Tech §27, Data §46).** On attempt creation, snapshot `questionnaire_version_id`, `scoring_version_id`, `policy_version_id` **and** a frozen `policy_snapshot` JSON (lifetime, time-limit, resume, retake) so historical behavior never reads current CMS state (Data §20, §91–94, INV-D07, INV-SD05).
- **A-7 — Immutability enforcement (Data §71, §74, INV-D08, Threat TH-033/034).** Defense in depth: (a) application layer never issues UPDATE/DELETE on historical tables; (b) DB-level `BEFORE UPDATE/DELETE` triggers on published/completed rows raise an exception; (c) a restricted DB role for the app that lacks UPDATE on immutable tables where practical. History changes only via new versions or audited correction records (Sec §49).
- **A-8 — Server-only DB boundary (Tech §10, §20–21, RISK-01).** Neither browser touches Postgres/Supabase directly. All access flows through the server domain layer using a server-only connection. Supabase RLS is enabled as defense-in-depth, not as the primary authorization (Tech §20). Service-role credentials stay server-side.
- **A-9 — Server time only (Tech §111, Data §65, Sec §68–69).** All security/business timestamps come from Postgres (`now()`); client timestamps are display-only. Expiry/deadline are computed and re-checked at request time, never trusted from cron (Tech §64).

### 2.4 Layering (Tech §22–23, §71–72, §95–97)

```
Route Handler (thin: parse, authenticate/authorize context, map errors)
      ↓
Application Service  (packages/domain — orchestration, transactions)
      ↓
Domain Rule / State Machine / Evaluation  (pure, unit-testable)
      ↓
Repository  (packages/db — Drizzle, typed queries)
      ↓
PostgreSQL  (constraints, transactions, immutability triggers)
```

Critical rules (scoring, state transitions, version validation, authorization) live in `packages/domain` and are shared by both apps so behavior cannot diverge (Tech §6, §95). Every protected service method takes an explicit `actor`/`context` and authorizes before returning data (Tech §71, §73–74; Threat TH-007/042).

### 2.5 Assessment conclusion

The recommended architecture is a strong fit and implementable cleanly. The system's whole value is **server-authoritative correctness under adversarial input** (Sec §82), so the plan front-loads the data model, domain core, and the concurrency/idempotency/immutability guarantees, with UI layered on top.

---

# 3. Detailed Implementation Plan

Ordered by the seven phases shared by Brief §51 and Tech §138. Each phase lists files/modules, migrations, routes, and tests. Full DDL and the complete route/scenario tables are the "canonical detail" of this plan; representative extracts are shown inline.

### 3.0 Proposed repository layout (Tech §5, §123)

```
/apps
  /public                 # Next.js public web (connect.<domain>)
    /app  /components  /lib
  /admin                  # Next.js admin CMS (admin.<domain>)
    /app  /components  /lib
/packages
  /db                     # Drizzle schema, migrations, repositories, DB client
  /domain                 # services, state machines, evaluation engine, invariants
  /validation             # Zod schemas (request/response/error contracts)
  /security               # tokens, hashing, cookies, rate-limit, authz helpers
  /config                 # env parsing (server-only vs public), constants
  /types                  # shared TS types, error codes, DTOs
  /ui                     # shared React primitives
/tests
  /integration  /e2e  /security
/docs                     # specs (moved here) + architecture.md, scenario-matrix.md, …
/.github/workflows        # CI
turbo.json  pnpm-workspace.yaml  package.json  tsconfig.base.json
```

Server-only modules are explicitly separated from client-safe exports so no secret leaks into a browser bundle (Tech §47, §85; Sec INV-S10).

### 3.1 Phase 1 — Foundation

- **Create:** pnpm workspace + Turborepo; `tsconfig.base.json` (strict); two Next.js apps; the seven `packages/*` skeletons; ESLint/Prettier; `.env.example` (names only, no secrets); `.github/workflows/ci.yml` skeleton.
- **Database:** Supabase projects (dev + prod, separate); Drizzle configured; migration `0001` (content domain: `profile`, `content_section`); `drizzle-kit` migration workflow committed to Git (Tech §50, §88).
- **Docs:** `git mv` the five specs into `/docs`; add `docs/architecture.md` (this plan's architecture section, kept current) and a `docs/scenario-matrix.md` stub (the 193-scenario → test-ID map, Brief §49/§54).
- **Tests:** CI green on lint + typecheck + a trivial unit test; one integration test proving DB connectivity + migration apply/rollback in an ephemeral Postgres.

### 3.2 Phase 2 — Security foundation (Brief §Phase 2; Sec §79 baseline)

- **`packages/security`:** opaque ID/token generation (A-1, A-2); SHA-256 fingerprinting; cookie read/write helpers (A-2); CSRF/origin validation for cookie-based state-changing requests (Threat TH-049, Tech §81); request-size/field limits (Threat TH-044); safe error mapper that never leaks internals (Threat TH-054, Func §100–101).
- **Admin auth:** Supabase Auth wired into the admin app; server-side session validation; route protection via middleware **plus** per-service authorization (Tech §72, §74); login rate limiting + audit (Threat TH-010/011/012); MFA-ready (Tech §19).
- **Public session primitives:** create/validate/resume/expire/revoke session (server-authoritative), backed by migration `0005` tables (built in Phase 4 but the security primitives land here).
- **Rate limiting:** Upstash Redis limiter for high-risk keys — start, submit, verification lookup, admin login (Sec §28, §36; Threat TH-023/039/040/045). Layered under Vercel WAF (Tech §35–36).
- **Secrets:** `packages/config` splits server-only vs `NEXT_PUBLIC_*`; env validated at boot; secrets never committed (Tech §46–47; Sec §36; INV-S10).
- **Tests (security-first):** API-level tests that assert fail-closed behavior even when the UI would prevent the action (Sec §77): forged cookie, missing/expired/revoked session, cross-origin state change, oversized payload.

### 3.3 Phase 3 — Core domain (questionnaire, versioning, scoring, policy)

- **Migrations `0002`–`0004`** (Data §8–19, §45, §61–66):
  - `0002` questionnaire domain: `questionnaire`, `questionnaire_version`, `question`, `question_version`, `answer_option`, `answer_option_version`, `questionnaire_version_question` (binding with `position`).
  - `0003` scoring: `scoring_configuration`, `scoring_version`, `scoring_rule`.
  - `0004` policy: `policy_configuration`, `policy_version`.
  - Constraints: `UNIQUE(questionnaire_id, version_number)`, `UNIQUE(question_id, version_number)`, `UNIQUE(questionnaire_version_id, position)` (Data §61, §66); version `status` enum `DRAFT|REVIEW|PUBLISHED|ARCHIVED`; immutability triggers on `PUBLISHED` rows (A-7).
- **`packages/domain`:** `QuestionnaireService`, `QuestionService`, `ScoringService`, `PolicyService`; the **EvaluationEngine** as a pure function `evaluate(answers, questionnaireVersion, scoringVersion, policy) → { score, passingScore, result }` (Tech §25–26; Func §56–60) — deterministic, no I/O, exhaustively unit-tested including the `score == passing ⇒ PASS` boundary (Func §59).
- **Publish workflow** (Tech §28, §104; Data §85; Func §83–86, §110): validate draft → create immutable version → publish → move current pointer → audit. Pre-publish validation rejects invalid config (Tech §130; Sec §73).
- **Tests:** unit — evaluation across scoring versions (v3 `YES=+10` vs v4 `YES=+5` yield different scores for identical answers; Sec §22, Data §110); publish immutability (published version cannot be mutated, VER-01/DM-AC-01).

### 3.4 Phase 4 — Candidate flow (the heart of the system)

- **Migrations `0005`–`0006`** (Data §21–39, §45):
  - `0005` execution: `candidate_context`, `attempt`, `session`, `answer` (+ `revision` columns).
  - `0006` finalization: `submission`, `evaluation`, `result`, `verification`.
  - Invariants in SQL: attempt version-lock columns + `policy_snapshot` (A-6); `UNIQUE(attempt_id, question_version_id)` on `answer` (Data §31, §63); partial unique one-final-submission (A-4); FKs `evaluation→submission`, `result→evaluation/submission`, `verification→result` (Data §62, §88); check constraints binding `answer.question_version_id ∈ attempt.questionnaire_version` enforced in the write path + integrity scan (Data §63, INV-D05).
- **Domain services:** `SessionService` (start/resume/expire/revoke; state machine `NEW→ACTIVE→{COMPLETED,EXPIRED,ABANDONED,REVOKED}`, Data §26, §53); `AnswerService` (validated, revision-checked, idempotent autosave; Func §24, §29; Data §82); `SubmissionService.finalize()` (A-5, the atomic finalize+evaluate+result+verification, Tech §103); `ResultService`, `VerificationService` (with a strict `VerificationPublicView` DTO, Tech §38–39; Threat TH-008); `RetakeService` (server-side eligibility: mode/max/cooldown from locked policy; Func §71–78; Threat TH-021/022).
- **Public API routes** (Tech §22; Func §4):

  | Method + Route | Purpose | Key protections |
  |---|---|---|
  | `POST /api/public/session` | Start / idempotent create | dedupe active session, rate limit, lock versions (Func §7, §7.2) |
  | `GET /api/public/session` | Resume / current state | server-authoritative state (Func §6, §13, §17) |
  | `GET /api/public/questionnaire` | Locked version + questions | version from session, never client (Func §19, §34) |
  | `PUT /api/public/answer` | Save answer | revision check, type/option/version validation (Func §46; Data §67–69) |
  | `POST /api/public/submission` | Submit | idempotency key, atomic finalize, server scoring (Func §46–51) |
  | `GET /api/public/result/:ref` | Result | ownership via session, opaque ref (Func §64–65) |
  | `GET /api/public/verify/:ref` | Public verification | public projection only (Func §67) |
  | `GET /api/public/retake` | Eligibility | server policy (Func §71) |
  | `GET /api/public/contact/:ref` | Contact gate | PASS + policy only (Func §69) |

- **Public UI (thin, state-driven, CMS copy):** landing/about → start/confirm → questionnaire (component registry per question type, Tech §127) → resume/expired/processing/result/verify screens, each mapped to server state (Func §118). PASS/FAIL copy is CMS-driven and non-judgmental (Func §62; Brief §28).
- **Tests (integration + E2E, correctness-critical):** double-start → one session; refresh → resume same session; expired → cannot submit, not FAIL; two-tab stale write → 409; **double submit → one final submission/result/verification**; submit timeout → reload returns existing result, no duplicate (Func §48–51, §130; AC PUB-11/12, SUB-05/06, SEC-AC-09/10); Q3-replacement → no cross-version answer contamination (Func §132; VER-04).

### 3.5 Phase 5 — CMS / Admin (Brief §Phase 5; Func §79–98)

- **Admin API + UI:** content editor (profile + all public copy, Func §80); question builder with draft→validate→version→publish (Tech §128; Func §81–86); scoring manager with test-evaluation before publish (Tech §129; Func §87–89); policy manager (session lifetime, time limit, resume, retake — versioned, Func §90–91); publish/archive with explicit impact confirmation (Func §110–111); dashboard (Func §79); submission monitor + detail (Func §92–93); audit view (Func §95); integrity dashboard (Func §96); session revoke + admin recovery, all audited (Func §97, §114).
- **Admin concurrency:** optimistic version check on draft edits → `VERSION_CONFLICT`, no silent overwrite (Sec §26; Threat TH-037; Func §113).
- **Migration `0007`** governance tables: `audit_event`, `security_event`, `integrity_finding`, `admin_actor`, `admin_session` (Data §40–44).
- **Tests:** publish creates new version and leaves active sessions on the old one (VER-05; Func §110); passing-score change does not alter historical results (VER-07; Data §110); admin authz on every privileged route (Threat TH-042; AC CMS-09/SEC-AC-14/15); CMS XSS — stored content and candidate answers rendered as untrusted (Threat TH-046/047; SEC-AC-17/18).

### 3.6 Phase 6 — Reliability (concurrency, idempotency, audit, integrity, recovery)

- **Audit** everywhere critical (Data §40, §79–80; Sec §48): the full event set (Brief §37) with correlation IDs (Tech §56; Data §80), append-only.
- **IntegrityService** (Data §87–90, §100–105; Func §98; Sec §38): request-time invariant checks + a scheduled scan (Vercel Cron, secured with `CRON_SECRET`, Tech §63–64, §131) detecting the impossible states in Brief §38 / Data §113 (e.g. `PASS ∧ score < passing`, missing timestamps, orphans, duplicate finals, version mismatches). On detection → `INTEGRITY_ERROR` finding, **never** silent repair (Data §113; Sec §41; INT-02).
- **Recovery** (Sys §30; Data §86, §111–112; Sec §40–41): deterministic paths for submit timeout, refresh-after-completion, duplicate request, service restart, evaluation retry, transient DB failure — always recovering from authoritative server state.
- **Tests:** two concurrent finalize requests (integration, real DB) → exactly one final record; late/stale request rejected; forced `EVALUATION_ERROR` stays technical, never becomes FAIL (Func §60; Sys §17.2; AC-15).

### 3.7 Phase 7 — Testing, hardening & production

- **Test suites finalized** (Tech §58; Sec §76): unit, integration, E2E, and the **security suite** (fake score/result, IDOR, replay, session/verification enumeration, stale request, direct API call, authorization bypass — Brief §48; Sec §76–77). Each of the 193 scenarios (Brief §49) is mapped to at least one test in `docs/scenario-matrix.md`.
- **Deployment (Tech §45, §49, §82–84, §134):** two Vercel projects from one repo (`apps/public`, `apps/admin`), distinct domains and cookies; environments dev/preview/prod with separate DBs and secrets (never prod DB from local, Brief §46); migrations run in a controlled CI/CD step with a migration-privileged role, non-destructive (Tech §88–89).
- **CI/CD (Tech §87; Brief §47):** PR → install → lint → typecheck → unit → integration (ephemeral Postgres) → build → security tests → preview → (protected) production.
- **Ops:** structured logs with correlation IDs and redaction (Tech §55; Sec §47, §53); backup + tested restore before launch (Tech §51, §134); health checks (Tech §54); the Sec §79 and Tech §134 production checklists must pass.

### 3.8 Acceptance-criteria coverage (Brief §56)

Every Brief §56 checkbox maps to a phase and a test: CMS-driven content (P5/CMS-01), immutable published questionnaire & question versions (P3/VER-01), versioned scoring (P3/CMS-05), session version lock (P4/VER-05), separate session lifetime vs time limit (P4/AC-18), resume (P4/PUB-03), server validation & scoring (P4/SUB-02/03), client cannot force PASS (P4/SEC-AC-01), idempotent submit (P4/PUB-11), immutable history (P3–P6/AC-05), retake policy (P4/CMS-07), two-tab conflict (P4/TH-027), stale rejection (P6/SUB-06), cross-user blocked (P4/PUB-14), safe verification (P4/SEC-AC-13), admin auth + audit (P2/P5/SEC-AC-14/15), integrity checks (P6/INT-01), timeout recovery (P4/PUB-12), secret protection (P2/SEC-AC-16).

---

# 4. Risk List

### 4.1 Ambiguous requirements — the open product decisions (with recommended MVP defaults)

The specs enumerate ~20 explicitly open decisions (Func §135, Sec §81, Data). They are *product* decisions, not architecture blockers, but a handful change the **schema or core logic** and should be confirmed before Phase 3/4. Recommended defaults:

| # | Decision (spec ref) | Recommended MVP default | Affects |
|---|---|---|---|
| D-1 | Questionnaire timer semantics — absolute vs active-time (Func §135.6, §133) | **Absolute** deadline from `questionnaire_started_at` (simplest, matches Data §28) | schema/logic |
| D-2 | Multi-device use of one session (Func §135.7; Sys §14, §11.2) | **Allowed**, reconciled by optimistic concurrency (A-3); never IP/device identity | logic |
| D-3 | Completed-FAIL may retake same version (Func §135.8, §19.2) | **Policy-driven**; default retake mode `ON_NEW_VERSION` | logic |
| D-4 | Default max attempts / cooldown (Func §135.9–10) | `max_attempts = 3`, `cooldown = none` (configurable) | data |
| D-5 | Public verification shows PASS/FAIL? (Func §135.11, §67) | **Show** validity + PASS/FAIL + completion date + version label; nothing else (Sec §42) | DTO |
| D-6 | Public result shows numeric score? (Func §135.13) | **No** (privacy; Sec §42) | DTO/UI |
| D-7 | Candidate name/contact collected? (Func §135.14; Data §76) | **No** for core flow; captured only at the contact gate after PASS | schema/privacy |
| D-8 | Session revocation in MVP? (Func §135.18) | **Yes** — it is a P0 security control (Threat TH-004; Sec §33) | logic |
| D-9 | Verification revocation in MVP? (Func §135.19, §115) | **Defer**; model a `status` column now, no UI | schema (cheap) |
| D-10 | Branching questions in MVP? (Func §135.16, §134) | **Defer** | scope |
| D-11 | Admin roles (Tech §18) | **Single owner role** MVP; schema leaves room for roles | scope |
| D-12 | MVP question types (Func §135.1, §20) | single-choice, multiple-choice, boolean, text, numeric | builder scope |

**Risk:** proceeding to Phase 3/4 without confirming D-1, D-5, D-7 (schema/DTO-affecting) risks rework. → *Mitigation:* confirm these in the review of this plan.

### 4.2 Technical risks

- **R-01 — Serverless ↔ Postgres connections (Tech §107–109; RISK-04).** Vercel functions are ephemeral; naive connections exhaust Postgres. → Use Supabase's pooled connection / a serverless-friendly driver; no reliance on process memory for correctness.
- **R-02 — Finalize+evaluate within function limits (Tech §33, §107).** Acceptable for lightweight synchronous scoring; must stay bounded. → Keep evaluation pure/fast; if AI/long eval is added, migrate to the documented async-job path (Tech §91) — do not silently exceed limits.
- **R-03 — Transaction correctness of finalization (A-5; Data §83–84).** The finalize→evaluate→result→verification chain must be atomic; a partial state must be recoverable, never a fake PASS/FAIL (Sec §40). → Single DB transaction + `SELECT … FOR UPDATE`; integration tests for each partial-failure case.
- **R-04 — Optimistic-concurrency edge cases (A-3; Data §57–59).** Incorrectly scoped revision checks could allow silent overwrite or false conflicts. → Revision guards on every mutable write; explicit stale-write integration tests (two tabs, late request).
- **R-05 — Immutability enforcement gaps (A-7; Data §71–74).** App-only guards can be bypassed by a bug or a stray query. → DB triggers + restricted role as the real backstop; tests that attempt an illegal UPDATE and assert rejection.

### 4.3 Architecture risks (Tech §139)

- **R-06 — Overusing Supabase client-side (RISK-01).** → All DB access server-side via domain layer; RLS as defense-in-depth; service-role key server-only (A-8).
- **R-07 — Cookie/IP treated as identity (RISK-02/03; INV-SD02/03).** → Cookie = continuity only; IP = risk signal only; server session is the sole authority (A-2, A-9).

### 4.4 Security risks (Threat model P0 clusters — must all ship before launch)

- **R-08 — Distributed rate limiting on serverless.** In-memory counters don't work across Vercel instances; WAF alone won't cover business-operation limits (Tech §35 note). → **Adopt Upstash Redis from the start** for start/submit/verify/admin-login (a deliberate lean-forward from the specs' "optional Redis"; Sec §28, §36). *Decision to confirm:* Redis day-one vs WAF+DB-counter interim.
- **R-09 — The P0 threat surface is the product.** Server-side scoring, per-resource authorization, opaque IDs + rate limits, idempotent submit, CSRF/origin on cookie writes, XSS encoding for CMS + answers, admin auth/MFA, secret boundary, safe errors (Threat TH-001…TH-049; Sec §66 invariants). → These are not "hardening later"; they are built into Phases 2 and 4 and gated by the security test suite (Sec §77). Missing any one fails the Sec §79 baseline.

### 4.5 Migration / data & process risks

- **R-10 — Migration safety (Tech §88–89; Brief §46).** Destructive or careless migrations could damage historical data. → Forward-only corrective migrations, non-destructive, run in a controlled step; backup + tested restore before production (Tech §51).
- **R-11 — Breadth vs correctness (193 scenarios, Brief §49).** Large surface + a very high correctness bar. → Correctness-first sequencing: domain core + integration/security tests before polished UI; the scenario matrix tracks coverage so nothing is silently skipped.
- **R-12 — Change management (Brief §55).** If a requirement proves impossible/unsafe, do **not** silently deviate — document Requirement/Problem/Impact/Alternative/Decision and update the spec. (No such conflict found yet.)

---

# 5. Recommended Next Step

1. **Review this plan** and confirm two things:
   - the confirmed stack (§2.2) and implementation-level decisions (§2.3), and
   - the schema/DTO-affecting product defaults — at minimum **D-1** (absolute timer), **D-5** (verification shows PASS/FAIL + date), **D-7** (no candidate PII in core flow), and the **R-08** rate-limiting choice (Upstash day-one vs deferred).
2. **On approval, implement Phase 1 + Phase 2** as the first increment — foundation (monorepo, apps, packages, DB connection, migration `0001`, CI, `/docs` reorg) **and** the security foundation (tokens, cookies, admin auth, rate limiting, secret boundary, CSRF/origin, safe errors), landing with a green CI pipeline and the first fail-closed security tests. This front-loads exactly the guarantees the product exists to provide (Sec §82) before any candidate-facing UI.
3. Proceed through Phases 3→7 in order, keeping `docs/scenario-matrix.md` and the acceptance-criteria map (§3.8) current so the build stays traceable to specification (Brief §54).

**No application code will be written until this plan is approved.** This document is the required planning gate (Brief §47, §57, §58; Sec §80; Data §107).
