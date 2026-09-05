# Architecture (living document)

This is the current, authoritative architecture of the implementation. It is kept
in sync with the code. The full reasoning, phase plan, and risk register live in
[`00-repository-audit-and-implementation-plan.md`](./00-repository-audit-and-implementation-plan.md);
the source specifications are under [`specs/`](./specs).

## Shape

A pnpm + Turborepo **modular monolith** with two independently deployable Next.js
apps over one shared domain core and one PostgreSQL system of record.

```
apps/public   → connect.<domain>   (candidate experience)
apps/admin    → admin.<domain>     (CMS, Supabase Auth)
packages/*    → shared domain, db, security, validation, config, types, ui
PostgreSQL    → system of record (immutable history, versioning, constraints)
Upstash Redis → distributed rate limiting
```

## Non-negotiable invariants (enforced in code, not convention)

- **Server is the authority.** The browser sends input; the server owns state,
  versioning, scoring, authorization, and results. (`packages/domain`)
- **Opaque public references**, never database keys, and never proof of
  authorization on their own. (`packages/security/ids.ts`)
- **Session tokens** are opaque, high-entropy, and stored only as an HMAC
  fingerprint; the raw token lives only in an HttpOnly/Secure/SameSite cookie
  carrying no business state. (`packages/security/tokens.ts`, `cookies.ts`)
- **Explicit, guarded state machines** for session/attempt/submission; terminal
  states never silently revive. (`packages/domain/state-machines`)
- **Immutable history / version locking** (Phase 3–4): attempts snapshot their
  questionnaire, scoring, and policy versions; published versions never mutate.
- **Fail closed** with safe, non-leaky errors. (`packages/security/errors.ts`)
- **Secret boundary**: server-only config is never re-exported into a client
  bundle. (`packages/config` — `./server` vs `./public`)

## CMS-driven vs server-enforced (important split)

Per the specs (Master §33, §40; Security model §73; Data §71–74):

- **CMS-driven (editable, no code deploy):** profile, all public copy including
  PASS/FAIL/resume/expiry messages, questionnaire questions/options/order/
  required, scoring weights & passing score, and policy (session lifetime,
  questionnaire time limit, resume, retake, max attempts, cooldown). All of
  these are versioned where they affect evaluation.
- **Server-enforced (NOT ordinary-CMS editable):** authorization, immutability,
  version locking, idempotency, anti-replay, state transitions, integrity rules,
  and abuse/rate-limit thresholds. Making these CMS-editable would weaken the
  "browser is not an authority" guarantee. Rate-limit values may be exposed in a
  separate **protected, audited system-settings** surface if tunability is
  needed — never through ordinary content editing.

## Confirmed product decisions (MVP)

| Area                    | Decision                                               |
| ----------------------- | ------------------------------------------------------ |
| Questionnaire timer     | Absolute deadline                                      |
| Multi-device            | Allowed (reconciled by optimistic concurrency)         |
| Retake                  | Policy-driven; default `ON_NEW_VERSION`                |
| Max attempts / cooldown | 3 / none (configurable)                                |
| Public verification     | Shows PASS/FAIL + completion date + version label      |
| Numeric score           | Not shown publicly                                     |
| Candidate name/contact  | Optional (nullable; captured only at the contact gate) |
| Session revoke          | Yes                                                    |
| Verification revoke     | Modeled (`status`) but no MVP UI                       |
| Branching questions     | Not in MVP                                             |
| Admin role              | Single `OWNER` (schema leaves room for more)           |
| Question types          | single, multiple, boolean, text, numeric               |
| Rate limiting           | Upstash from day one                                   |

## Data model

Content domain shipped (migration `0001`). Questionnaire/question/option,
scoring, and policy versioning (0002–0004), execution (attempt/session/answer,
0005), and finalization (submission/evaluation/result/verification, 0006), plus
governance (audit/security/integrity/admin, 0007) follow in Phases 3–5. See the
plan doc §3 for the full schema and invariant DDL.
