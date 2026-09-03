# Personal Connection Screening System
## Technology Architecture & Stack
### Version 0.1

> **Status:** Draft Technology Architecture
> **Depends on:** Master System Specification v0.1, Functional Specification v0.1, Security & Threat Model v0.1, Data & State Model v0.1
> **Purpose:** Menetapkan arsitektur teknis dan technology stack yang mampu memenuhi seluruh functional, security, state, versioning, integrity, dan operational requirements yang telah disepakati.

---

# 1. Executive Decision

Recommended stack:

```text
Frontend / Web
→ Next.js + TypeScript + App Router

Deployment
→ Vercel

Database / System of Record
→ PostgreSQL via Supabase

Admin Authentication
→ Supabase Auth
   + MFA / strong admin security

ORM / Database Access
→ Drizzle ORM
   + server-side Postgres connection

Primary API / Business Logic
→ Next.js Route Handlers / Server-side application layer

Public Session
→ Custom server-issued opaque session token
   + HttpOnly Secure cookie

Rate Limiting / Abuse
→ Vercel WAF
   + optional Upstash Redis for application-level rate limiting

File Storage
→ Supabase Storage

Monitoring
→ Vercel Observability
   + structured application logs
   + database monitoring

Source Control
→ GitHub

CI/CD
→ Vercel Git integration
   + automated checks/tests

Testing
→ Vitest
   + Playwright
   + targeted integration/security tests

Package Management
→ pnpm

Repository Structure
→ Monorepo
```

# 2. Architecture Decision Summary

## ADR-01 — Next.js

Use Next.js with App Router and TypeScript as the web application framework.

Reason:

- supports full-stack applications
- server/client separation
- route handlers
- server-side logic
- strong TypeScript ecosystem
- straightforward Vercel deployment
- appropriate for both interactive public experience and admin CMS

Next.js officially supports full-stack applications and the App Router is the newer router architecture.

## ADR-02 — Vercel

Use Vercel as primary deployment platform.

Reason:

- native Next.js deployment
- managed function execution
- CDN/edge delivery
- environment variable support
- WAF/firewall
- deployment previews
- Git-based deployments

Vercel supports Node.js Functions for TypeScript/JavaScript applications and provides configurable runtime behavior.

## ADR-03 — PostgreSQL via Supabase

Use PostgreSQL as the system of record.

Supabase provides a managed PostgreSQL environment plus authentication, storage, and related services.

Reason:

- relational model fits versioned/questionnaire data
- strong constraints and transactions
- foreign keys
- unique constraints
- excellent fit for immutable historical data
- mature SQL ecosystem
- managed backups/infrastructure
- optional Row Level Security

Supabase documents PostgreSQL as a core system component and supports database security using grants and RLS.

## ADR-04 — Custom Public Session

Do NOT use standard user authentication for candidates in MVP.

Instead:

- anonymous candidate flow
- server-generated opaque session token
- HttpOnly/Secure cookie
- server-side session record
- explicit expiration/revocation

Reason:

- candidate does not need an account
- simpler UX
- preserves privacy
- satisfies resume requirements
- avoids unnecessary registration

## ADR-05 — Supabase Auth for Admin

Use Supabase Auth for admin identity.

Admin application:

- authenticated
- role-aware
- protected
- MFA-ready
- separate from public anonymous session

Supabase Auth provides token validation, issuance/refresh and integrates with PostgreSQL authorization.

## ADR-06 — Server-Side Business Logic

Critical business logic lives on the server:

- create session
- save answer
- resume
- finalize submission
- scoring
- result
- verification
- retake policy
- version locking
- audit
- authorization

The browser never becomes authoritative.

---

# 3. High-Level Architecture

```text
                         INTERNET
                            |
                +-----------+-----------+
                |                       |
                v                       v
       +----------------+      +----------------+
       | Public Web     |      | Admin Web      |
       | Next.js        |      | Next.js        |
       | Vercel         |      | Vercel         |
       +-------+--------+      +-------+--------+
               |                       |
               +-----------+-----------+
                           |
                           v
                  SERVER-SIDE DOMAIN
                  / APPLICATION LOGIC
                           |
              +------------+-------------+
              |            |             |
              v            v             v
         PostgreSQL     Redis/RL       Storage
         Supabase      Upstash*       Supabase
              |
              v
          Audit / Integrity

* Optional application-level Redis.
```

---

# 4. Two Web Applications

The requested system has two independently deployable applications.

## 4.1 Public

Example:

- connect.yourdomain.com

Responsibilities:

- public profile
- questionnaire
- session
- resume
- submission
- result
- verification
- contact gate

## 4.2 Admin/CMS

Example:

- admin.yourdomain.com

Responsibilities:

- CMS
- questionnaire builder
- versioning
- scoring
- policies
- sessions
- submissions
- verification
- audit
- integrity monitoring

---

# 5. Monorepo Recommendation

Use one repository with independently deployable apps.

Example:

```text
/apps
  /public
  /admin

/packages
  /db
  /domain
  /validation
  /security
  /ui
  /config
  /types

/tests
```

Each application can become a separate Vercel project.

Benefits:

- shared types
- shared validation
- shared business rules
- shared UI primitives
- one source of truth
- independent deployments
- no duplicated logic

---

# 6. Separation of Concerns

## Public App

Owns:

- public rendering
- candidate UX
- public session endpoints
- questionnaire interaction

## Admin App

Owns:

- admin UX
- CMS endpoints
- privileged actions

## Shared Domain Package

Owns:

- state transition rules
- evaluation logic
- version validation
- policy logic
- invariants
- shared schemas

This prevents critical rules from diverging between apps.

---

# 7. System of Record

PostgreSQL is the authoritative persistent state.

Database is responsible for:

- identities
- versions
- session state
- attempts
- answers
- submissions
- evaluations
- results
- verification
- audit
- integrity findings

Redis is NOT the system of record.

---

# 8. PostgreSQL Responsibilities

Use relational constraints for:

- foreign keys
- unique indexes
- check constraints where appropriate
- transaction boundaries
- immutable/history references
- one-final-submission invariant

Do not rely only on TypeScript validation.

---

# 9. Supabase Usage

Recommended Supabase services:

```text
Supabase
├── PostgreSQL
├── Auth (Admin)
└── Storage (optional)
```

Application logic remains in Next.js/server-side domain layer.

Supabase Edge Functions exist and can execute TypeScript globally, but this project does not require them for the core application because the primary server-side application layer can remain in Next.js.

---

# 10. Database Access Strategy

Recommended:

```text
Next.js Server
    ↓
Domain/Repository Layer
    ↓
Drizzle ORM
    ↓
PostgreSQL
```

Do not expose privileged database credentials to browser code.

---

# 11. Why Drizzle

Drizzle is recommended as the typed database layer because it provides:

- TypeScript-native schema definitions
- predictable SQL mapping
- migrations
- explicit queries
- good control over transactional operations

The exact ORM can be replaced later without changing domain behavior.

---

# 12. Public Session Architecture

Candidate session:

```text
Browser
  |
  | HttpOnly Secure Cookie
  v
Session Token
  |
  v
Server
  |
  v
Session Record
  |
  v
Attempt
```

The cookie contains only a session credential/token reference.

Do not store:

- score
- result
- answers
- questionnaire config
- authorization flags

inside client-controlled cookies.

---

# 13. Session Token Design

Token should be:

- cryptographically random
- high entropy
- opaque
- non-sequential
- short-lived according to policy
- revocable

Recommended persistence pattern:

```text
Browser:
raw session token

Server:
hashed/token fingerprint reference
```

The raw token should not be unnecessarily stored in plaintext database fields.

---

# 14. Cookie Configuration

Conceptual target:

```text
HttpOnly = true
Secure = true
SameSite = appropriate/restrictive
Path = minimum required scope
Max-Age/Expires = aligned to session lifecycle
```

Exact cookie settings will be finalized after domain architecture is selected.

---

# 15. Session Expiration

Database:

- created_at
- expires_at

Server validates current time.

Example:

```text
created_at = 13:00
session lifetime = 24h
expires_at = next day 13:00
```

Changing CMS lifetime later does not change existing expires_at.

---

# 16. Questionnaire Time Limit

Database:

- questionnaire_started_at
- questionnaire_deadline

Deadline is server-derived.

Browser timer is purely presentation.

---

# 17. Admin Authentication

Admin web uses authenticated identity.

Recommended architecture:

```text
Admin Browser
   ↓
Supabase Auth
   ↓
Authenticated Admin Session
   ↓
Admin Server
   ↓
Authorization
   ↓
Database
```

Supabase Auth supports validation, issuing and refreshing authentication tokens and integrates with database authorization.

---

# 18. Admin Authorization

Authentication answers:

- Who are you?

Authorization answers:

- What can you do?

At MVP:

- one primary admin role is acceptable.

Architecture should support future roles:

- Owner
- Admin
- Editor
- Analyst
- Support

---

# 19. Admin MFA

MFA should be supported/recommended for admin.

Highest-impact actions may later require reauthentication/MFA confirmation:

- scoring changes
- publish
- archive
- session revoke
- administrative result correction

---

# 20. Database Security / RLS

Supabase RLS can provide defense in depth.

Important:

- RLS is not a replacement for application authorization.

Supabase explicitly recommends enabling RLS for exposed tables and controlling grants/policies.

Privileged service-role credentials must remain server-side because they bypass RLS.

---

# 21. Recommended Database Access Boundary

Public browser:

- NO DIRECT PRIVILEGED DB ACCESS

Admin browser:

- NO DIRECT PRIVILEGED DB ACCESS

Both use server-side application/domain layer.

This provides one centralized business authorization boundary.

---

# 22. API Architecture

Conceptual endpoint groups:

```text
/api/public/session
/api/public/questionnaire
/api/public/answer
/api/public/submission
/api/public/result
/api/public/verification

/api/admin/content
/api/admin/questionnaires
/api/admin/questions
/api/admin/scoring
/api/admin/policies
/api/admin/sessions
/api/admin/submissions
/api/admin/results
/api/admin/verification
/api/admin/audit
/api/admin/integrity
```

Actual routing is implementation detail.

---

# 23. Domain Service Layer

Do not put critical logic directly in route handlers.

Recommended:

```text
Route Handler
   ↓
Application Service
   ↓
Domain Rule
   ↓
Repository
   ↓
Database
```

Example:

```text
POST /submit
  ↓
SubmissionService.finalize()
  ↓
validateAttempt()
validateAnswers()
lockAttempt()
evaluate()
persistResult()
createVerification()
  ↓
Database
```

---

# 24. Validation Layer

Use shared runtime validation schemas.

Conceptual:

```text
Request
 ↓
Schema Validation
 ↓
Authorization
 ↓
Domain Validation
 ↓
Database
```

Recommended tool:

- Zod or equivalent TypeScript schema validator

Client schemas improve UX, but server validation remains mandatory.

---

# 25. Evaluation Engine

Evaluation should be a pure/controlled domain service:

```text
Evaluation Input
    ↓
Scoring Version
    ↓
Scoring Rules
    ↓
Score
    ↓
Passing Rule
    ↓
PASS/FAIL
```

No dependency on browser state.

---

# 26. Evaluation Determinism

Given identical:

- Questionnaire Version
- Question Versions
- Answers
- Scoring Version
- Policy

the same evaluation should produce the same result.

If deterministic evaluation is impossible:

- mark error
- do not invent result

---

# 27. Version Locking

When Attempt is created:

- attempt.questionnaire_version_id
- attempt.scoring_version_id
- attempt.policy_version_id

These references are locked for the execution context.

New CMS publish does not modify them.

---

# 28. Publish Architecture

```text
Draft
  ↓
Validate
  ↓
Create Immutable Version
  ↓
Publish
  ↓
Current Version Pointer Updated
```

Existing attempts continue using their references.

---

# 29. CMS Preview

Preview should run against draft data but never create production submissions.

Suggested mechanisms:

- preview mode
- draft-only session
- non-production attempt flag

No real verification should be generated from preview.

---

# 30. Idempotency

Critical API operations should support idempotent behavior.

Highest priority:

- create session
- save answer
- submit
- admin publish
- admin critical actions

Submit especially needs:

- idempotency key
- unique final-submission constraint
- state locking/concurrency control

---

# 31. Concurrency Architecture

Use database transaction + optimistic/concurrency validation.

Conceptually:

```text
State Revision N
     |
request expects N
     |
database checks
     |
if current != N
     ↓
STALE / CONFLICT
```

For final submission, atomic database protection is mandatory.

---

# 32. Transaction Strategy

**Answer Update**

```text
BEGIN
  validate session
  validate question
  check revision
  update answer
  increment revision
COMMIT
```

**Final Submit**

```text
BEGIN
  validate session
  validate attempt
  validate expiration
  validate completeness
  lock/finalize attempt
  create submission
COMMIT
```

Evaluation may be coordinated with the finalization transaction depending on execution architecture.

---

# 33. Evaluation Execution

For MVP scoring logic is expected to be lightweight.

Therefore:

```text
HTTP request
→ validate
→ finalize
→ calculate
→ persist
→ respond
```

should be acceptable when processing remains within platform function limits.

Vercel documents configurable function durations; limits vary by plan/runtime, so the application should not assume unlimited request execution.

If AI/long-running evaluation is added later:

- move to asynchronous job architecture
- queue work
- persist processing state

---

# 34. Redis / Rate Limiting

Application-level Redis is optional for MVP.

Recommended use:

- high-frequency API limits
- brute-force detection
- temporary counters
- distributed rate-limiting state

Upstash Rate Limit is specifically designed for serverless/Vercel environments and supports HTTP-based rate limiting, multiple limits, analytics, and dynamic limits.

---

# 35. Vercel WAF

Vercel WAF should provide an outer protection layer.

Use it for:

- blocking abusive traffic
- IP restrictions where appropriate
- traffic rules
- rate limiting
- challenge/deny behavior where supported

Vercel documents WAF custom rules for log/deny/challenge/bypass/rate-limit actions and says the WAF is available across plans.

Vercel also provides platform-wide DDoS mitigation plus WAF layers.

Application rate limiting remains necessary because WAF policy and business-operation limits are different layers.

---

# 36. Rate-Limit Layers

Recommended:

```text
Layer 1
Vercel WAF
    ↓
Layer 2
Application/API limit
    ↓
Layer 3
Session/operation-specific limit
```

Examples:

- Start
- Verification lookup
- Answer save
- Submit
- Admin login

---

# 37. IP Handling

Application may read request IP through infrastructure-supported request metadata.

IP should be stored only when justified.

Use for:

- abuse detection
- rate limiting
- investigation

Not for:

- definitive identity
- ownership proof
- automatic person matching

---

# 38. Verification Architecture

Verification should be a server-generated public reference.

Example:

```text
VER-8F31A2...
```

Public request:

```text
/verify/VER-...
```

Server:

- finds verification
- checks current verification status
- loads referenced historical result
- returns public projection only

---

# 39. Public Verification Projection

Never expose database object directly.

Create explicit DTO/projection:

- VerificationPublicView

Only permitted fields.

This prevents accidental leakage when database schema evolves.

---

# 40. Admin DTO Boundary

Admin endpoints should have separate DTOs from public endpoints.

Do not reuse:

- SubmissionRecord

directly as JSON response to public browser.

Instead:

- SubmissionAdminView
- SubmissionPublicView

---

# 41. Caching Strategy

**Public display-only content**

Can be cached aggressively.

**Questionnaire content**

Can be cached by immutable version.

**Active session**

Must not be publicly cached.

**Submission/result**

Must be authorization-aware.

**Admin**

Do not publicly cache.

---

# 42. Version-Aware Caching

Because questionnaire versions are immutable:

```text
/questionnaire/v7
```

can be safely cached if implementation uses version-specific resources.

Current pointer:

```text
current → v8
```

is separate.

Active session does not depend on current pointer.

---

# 43. Storage

Supabase Storage may be used for:

- profile images
- CMS media
- future attachments

Public and private buckets must be separated.

MVP can avoid uploads if not needed.

---

# 44. File Upload Security

If enabled:

- MIME/type validation
- extension validation
- size limits
- randomized filename
- access policy
- safe download
- image processing where appropriate

No executable content.

---

# 45. Environment Separation

At minimum:

- development
- preview/staging
- production

Separate:

- database
- secrets
- admin credentials
- API keys
- storage buckets
- domain configuration

Do not connect preview deployments to production database casually.

---

# 46. Environment Variables

Examples:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_PUBLIC_KEY
SUPABASE_SERVER_SECRET
AUTH_SECRET
SESSION_SECRET
VERIFICATION_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Actual names are implementation detail.

Secrets:

- server-only
- never committed
- never exposed client-side

---

# 47. Secret Boundary

Client bundle may receive only explicitly public configuration.

Never expose:

- database password
- service role key
- session signing secret
- verification secret
- admin credentials
- private API keys

---

# 48. Custom Domain Architecture

Recommended:

```text
connect.example.com
admin.example.com
```

Optional API:

```text
api.example.com
```

For MVP, API endpoints can remain inside each Next.js application.

Shared domain logic keeps behavior consistent.

---

# 49. Deployment Strategy

Two Vercel projects:

```text
Project A
public-web

Project B
admin-web
```

One Git repository.

Deployment:

- every branch/PR can generate preview
- production deploy from protected branch
- environment-specific variables

---

# 50. Database Migration Strategy

Migrations must be versioned in Git.

Example:

```text
migrations/
001_initial.sql
002_question_version.sql
003_submission_integrity.sql
...
```

No manual production-only schema modifications.

---

# 51. Database Backup

Production database must have:

- automatic backups according to selected plan
- retention policy
- restore procedure
- tested recovery

Backup is not considered successful until restore is demonstrably possible.

---

# 52. Disaster Recovery

Define:

- RPO
- RTO
- restore owner
- backup retention
- incident procedure

Exact values remain product/operations decisions.

---

# 53. Monitoring

Minimum monitoring:

- Vercel deployment
- Vercel function errors
- API error rates
- database errors
- submission failures
- evaluation errors
- integrity errors
- security events

---

# 54. Health Checks

Recommended logical health signals:

- Application
- Database
- Evaluation
- Storage
- Rate Limiter

Admin can see:

- HEALTHY
- DEGRADED
- ERROR

---

# 55. Logging

Use structured JSON logs.

Include:

- correlation ID
- request type
- route
- duration
- status
- error code
- safe entity reference

Avoid:

- session raw token
- full answers
- credentials
- secret values

---

# 56. Correlation IDs

Every critical request should have a correlation/reference ID.

Example:

```text
corr_01H...
```

One operation can generate:

- SUBMISSION_STARTED
- EVALUATION_STARTED
- EVALUATION_COMPLETED
- RESULT_CREATED
- VERIFICATION_CREATED

with same correlation ID.

---

# 57. Error Tracking

Use a production error tracking service if desired.

Requirements:

- source maps
- environment tagging
- release tracking
- PII filtering
- sensitive field scrubbing

Provider can be selected later.

---

# 58. Testing Architecture

**Unit**

Test:

- scoring
- state transitions
- version compatibility
- policy
- validation

Tool:

- Vitest or equivalent

**Integration**

Test:

- database transactions
- session lifecycle
- submission
- concurrency
- versioning

**E2E**

Test:

- public flow
- resume
- result
- admin flow
- publish
- retake

Tool:

- Playwright

**Security**

Test:

- IDOR
- replay
- invalid session
- fake score
- stale request
- direct API abuse
- admin authorization

---

# 59. Contract Testing

Shared schemas should make public/admin API contracts explicit.

Conceptually:

- Request Schema
- Response Schema
- Error Schema

This reduces frontend/backend drift.

---

# 60. Error Code Model

Use machine-readable error codes.

Examples:

```text
SESSION_NOT_FOUND
SESSION_EXPIRED
SESSION_REVOKED
STALE_STATE
QUESTION_NOT_IN_VERSION
INVALID_ANSWER
REQUIRED_ANSWER_MISSING
SUBMISSION_ALREADY_COMPLETED
EVALUATION_ERROR
NOT_AUTHORIZED
RATE_LIMITED
INTEGRITY_ERROR
```

Public UI maps technical errors to human-readable messages.

---

# 61. API Versioning

MVP:

- internal same-version API is acceptable.

If external clients are later introduced:

```text
/api/v1/...
```

Public web itself does not require formal public API versioning until external consumers exist.

---

# 62. Background Jobs

MVP may not need a persistent queue.

Use background processing only when:

- AI evaluation is introduced
- email/notification delivery is required
- long-running exports are required
- heavy analytics are added

Do not create a queue solely for architecture aesthetics.

---

# 63. Scheduled Jobs

Vercel Cron can be used for scheduled maintenance such as:

- cleanup
- integrity scan
- metrics aggregation
- stale-session processing

Vercel supports cron jobs invoking Vercel Functions.

Cron jobs should be secured with a secret and not treated as publicly callable maintenance endpoints. Vercel documents a CRON_SECRET pattern for securing cron invocations.

---

# 64. Important Cron Caveat

Expiration should never rely exclusively on cron.

Example:

```text
Session expires 14:00
```

If cleanup cron runs at 14:30, the session is still considered expired at 14:00 because request-time logic checks expires_at.

Cron is for maintenance, not the source of truth for time validity.

---

# 65. Public Performance

Public landing content should be optimized with:

- static/server-rendered content where appropriate
- CDN caching
- minimal client JavaScript
- lazy media loading
- version-aware caching

Questionnaire interaction remains dynamic.

---

# 66. Admin Performance

Admin needs:

- pagination
- filtering
- server-side queries
- indexed search fields
- limited result sizes

Do not load every submission into browser memory.

---

# 67. Database Index Strategy

Indexes should target:

- session_ref
- attempt_ref
- submission_ref
- result_ref
- verification_ref
- status
- timestamps
- questionnaire_version
- candidate/context references
- audit entity references

Exact indexes follow actual query patterns.

---

# 68. Pagination

All potentially large admin collections must be paginated:

- submissions
- sessions
- audit
- security events
- integrity findings

Prefer cursor-based pagination for large/high-change datasets where practical.

---

# 69. Search

Admin search should use indexed fields.

Do not implement unrestricted full-database search through client-side filtering.

---

# 70. Data Exposure Architecture

Use separate data models/views:

```text
Database
   |
   +-- Public projection
   |
   +-- Candidate projection
   |
   +-- Admin projection
   |
   +-- Security projection
```

This prevents accidental overexposure.

---

# 71. Authorization Architecture

Every protected service method should accept actor/context.

Example concept:

```text
SubmissionService.getSubmission(
  actor,
  submissionReference
)
```

Service verifies authorization before returning data.

Do not rely solely on route-level middleware.

---

# 72. Middleware

Middleware can help with:

- routing
- basic request filtering
- admin route protection
- redirects

But middleware is not the complete security layer.

Critical authorization remains in server/domain services.

---

# 73. Public Session Authorization

Every candidate operation should derive authorization from validated session context.

Do not accept:

```text
attempt_id
```

from browser and assume access.

Instead:

```text
validated session
→ associated attempt
→ requested resource
→ authorize
```

---

# 74. Admin Authorization

Admin requests:

```text
Authenticated
 ↓
Role/permission check
 ↓
Resource authorization
 ↓
Domain action
```

---

# 75. Verification Security

Verification ID is not a secret equivalent to an admin password.

Even if known publicly:

- public output is limited
- private data remains protected
- verification points only to allowed projection

---

# 76. Anti-Replay Architecture

Critical requests can carry:

- idempotency key
- request timestamp where useful
- state revision
- server-side nonce/reference if needed

The exact combination will depend on endpoint.

---

# 77. Payload Security

Every API payload is validated for:

- shape
- type
- length
- allowed fields
- allowed enum
- version compatibility

Unknown fields should not be trusted.

---

# 78. Output Security

All rendered user-generated content is untrusted.

CMS rich text, if supported:

- sanitized
- encoded
- restricted

Candidate answers:

- encoded before rendering
- never interpreted as HTML/script

---

# 79. CSP / Browser Security Headers

Production should use appropriate security headers:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- Referrer-Policy
- appropriate frame policy

Exact CSP depends on third-party integrations.

---

# 80. CORS

Because public/admin applications are controlled deployments:

- keep CORS restrictive
- avoid wildcard for privileged APIs
- allow only required origins

If APIs remain same-origin within each application, CORS complexity is minimized.

---

# 81. CSRF

For cookie-authenticated state-changing requests:

- use framework/platform-appropriate CSRF protection
- validate origin where appropriate
- use secure SameSite configuration
- avoid cross-site state-changing endpoints

---

# 82. Admin Domain Isolation

Public:

```text
connect.example.com
```

Admin:

```text
admin.example.com
```

Benefits:

- separate security boundary
- separate deployment
- separate cookies if configured
- easier monitoring
- easier incident isolation

---

# 83. Admin Cookie Scope

Admin cookie should not unnecessarily be scoped to the public domain.

Use narrow domain/path scope where practical.

This reduces cross-application credential exposure.

---

# 84. Public and Admin Environment Isolation

Do not reuse unnecessary credentials.

Example:

```text
Public
→ public-safe variables
→ server DB access

Admin
→ admin auth
→ privileged server access
```

Production admin secrets should not be available to public project unless necessary.

---

# 85. Shared Packages Security

Shared package must distinguish:

- client-safe exports
- server-only exports

Never accidentally import server secret/config into browser bundle.

Use explicit server-only modules/boundaries.

---

# 86. Supply Chain

Dependencies should be:

- minimal
- pinned through lockfile
- updated regularly
- audited
- removed when unused

CI should check:

- dependency vulnerabilities
- type errors
- lint
- tests
- build

---

# 87. CI/CD Pipeline

Recommended:

```text
Pull Request
    ↓
Install
    ↓
Lint
    ↓
Typecheck
    ↓
Unit Tests
    ↓
Integration Tests
    ↓
Build
    ↓
Security Checks
    ↓
Preview
    ↓
Review
    ↓
Production
```

Production deployment should be protected.

---

# 88. Database Migration in CI/CD

Migrations should:

- run in controlled production step
- be backward-aware where needed
- avoid destructive changes
- have rollback/recovery plan

Never automatically destroy historical data.

---

# 89. Rollback

Application rollback:

- redeploy previous known-good build.

Database rollback:

- avoid blind reverse migrations
- use forward corrective migration where possible

Because historical data is immutable, rollback must preserve it.

---

# 90. Feature Flags

Recommended for risky future features:

- AI evaluation
- new questionnaire engine
- new result flow
- verification enhancements

Feature flags should not bypass security invariants.

---

# 91. AI Future Architecture

If AI evaluation is added:

```text
Candidate Answers
       ↓
Sanitized Data
       ↓
Evaluation Job
       ↓
AI Model
       ↓
Structured AI Output
       ↓
Server Validation
       ↓
Business Evaluation
       ↓
Result
```

AI is never the unrestricted authority.

---

# 92. No AI for Core Integrity

Do not use AI to decide:

- whether session belongs to candidate
- whether request is authorized
- whether version is valid
- whether submission already exists
- whether result can be persisted

Those are deterministic system functions.

---

# 93. Recommended MVP Architecture

Keep MVP intentionally simple:

- 2 Next.js apps
- 1 PostgreSQL database
- 1 Supabase project
- 1 admin auth system
- 1 optional Redis
- 1 shared monorepo
- Vercel deployment

Do not introduce:

- microservices
- Kubernetes
- dedicated API servers
- event buses
- queues

until actual requirements justify them.

---

# 94. Why Not Microservices

The domain is currently one cohesive application.

Microservices would add:

- network boundaries
- distributed transactions
- observability complexity
- deployment overhead
- more failure modes

without solving a present requirement.

Modular monolith is the better initial architecture.

---

# 95. Modular Monolith

Internal architecture:

```text
apps/
  public
  admin

shared domain modules:
  session
  questionnaire
  answer
  submission
  evaluation
  result
  verification
  audit
  security
```

Externally:

- two web applications

Internally:

- one coherent domain model

---

# 96. Repository/Service Boundaries

Recommended domain modules:

- SessionService
- QuestionnaireService
- QuestionService
- AnswerService
- SubmissionService
- EvaluationService
- ResultService
- VerificationService
- PolicyService
- AuditService
- SecurityService
- IntegrityService

---

# 97. Database Repository Boundaries

Each domain module accesses data through repositories or typed query functions.

Avoid:

- arbitrary SQL throughout UI code
- DB calls directly in React components
- duplicated authorization logic

---

# 98. Schema Ownership

Each domain module should conceptually own its data behavior.

For example:

```text
questionnaire
questionnaire_version
question
question_version
```

owned by Questionnaire domain.

```text
attempt
session
answer
submission
```

owned by Execution domain.

---

# 99. Database Namespace

A single PostgreSQL database is recommended initially.

Schemas can remain in one application schema or be separated logically if complexity grows.

Do not create multiple databases prematurely.

---

# 100. Public Domain

Public app has no admin database authority.

It can invoke only server functions needed for:

- session
- questionnaire
- answer
- submission
- result
- verification

---

# 101. Admin Domain

Admin has privileged operations:

- CRUD draft
- publish
- archive
- scoring configuration
- policy
- audit
- integrity

All destructive/high-impact operations require explicit authorization.

---

# 102. Example Full Request — Answer

```text
Browser
 ↓
POST /api/public/answer
 ↓
Validate session cookie
 ↓
Validate session state
 ↓
Load attempt
 ↓
Validate questionnaire version
 ↓
Validate question version
 ↓
Validate answer schema
 ↓
Check concurrency revision
 ↓
Save answer
 ↓
Increment revision
 ↓
Audit event
 ↓
Response
```

---

# 103. Example Full Request — Submit

```text
Browser
 ↓
POST /api/public/submission
 ↓
Validate session
 ↓
Validate attempt
 ↓
Validate expiration
 ↓
Validate timer
 ↓
Validate questionnaire version
 ↓
Validate required answers
 ↓
Validate answer references
 ↓
Acquire finalization protection
 ↓
Create submission
 ↓
Run evaluation
 ↓
Validate evaluation
 ↓
Persist result
 ↓
Create verification
 ↓
Audit
 ↓
Return result
```

---

# 104. Example Full Request — Admin Publish

```text
Admin
 ↓
Authenticated session
 ↓
Authorization
 ↓
Load draft
 ↓
Validate configuration
 ↓
Create immutable version
 ↓
Publish
 ↓
Update current pointer
 ↓
Audit
 ↓
Return publish result
```

---

# 105. Technology Selection Matrix

| Requirement | Next.js | Vercel | PostgreSQL/Supabase | Redis | Supabase Auth |
|---|---|---|---|---|---|
| Public Web | ✓ | ✓ | | | |
| Admin Web | ✓ | ✓ | | ✓ | ✓ |
| Session state | ✓ | ✓ | ✓ | optional | |
| Questionnaire | ✓ | ✓ | ✓ | | |
| Versioning | | | ✓ | | |
| Transactions | | | ✓ | | |
| Scoring | ✓ | ✓ | ✓ | | |
| Rate limiting | | ✓ | | ✓ | |
| Admin auth | ✓ | ✓ | | | ✓ |
| File storage | | | ✓ | | |
| Audit | ✓ | | ✓ | | |
| Verification | ✓ | ✓ | ✓ | | |
| Deployment | ✓ | ✓ | | | |

---

# 106. Why This Stack Fits the Invariants

**Server Authority**

Next.js server layer + PostgreSQL.

**Historical Immutability**

PostgreSQL relations/constraints + application versioning.

**Session**

Custom server session + secure cookie.

**Versioning**

Relational references.

**Concurrency**

PostgreSQL transaction/locking/version fields.

**Admin**

Supabase Auth.

**Abuse**

Vercel WAF + optional Redis.

**Public Content**

Next.js + database/CMS data.

---

# 107. Vercel Constraints to Respect

The architecture must respect function execution limits.

Current Vercel documentation states that function duration and resources depend on runtime/plan, with Node.js functions supporting configurable limits.

Therefore:

- no long synchronous jobs
- no infinite loops
- no large AI processing in normal request path
- no assumption of persistent server memory
- no reliance on local filesystem as permanent storage

---

# 108. Stateless Application Principle

Vercel server functions should be treated as ephemeral/stateless compute.

Persistent state belongs in:

- PostgreSQL
- storage
- Redis where appropriate

Do not depend on in-memory process state for correctness.

---

# 109. No Local Filesystem as Source of Truth

Never store:

- session state
- submissions
- answers
- results

in local/server filesystem.

Function instances are not the durable data layer.

---

# 110. Cache Is Not Truth

Whether cache uses:

- CDN
- Redis
- framework cache

it must never become the authoritative source for:

- session status
- submission completion
- result
- authorization

---

# 111. Server Time

All security/business timestamps originate from trusted server/database time.

Client time is used only for display.

---

# 112. Time Zone

Store timestamps in a timezone-safe format, preferably UTC.

Public/admin UI converts to desired display timezone.

---

# 113. UUID/Public ID Strategy

Internal database identity can use UUID-like identifiers.

Public references should be:

- opaque
- high entropy
- non-sequential

The exact identifier format is an implementation choice.

---

# 114. Hashing Secrets

Where tokens need lookup:

- store a cryptographic hash/fingerprint
- compare securely
- do not log raw tokens

Exact algorithm/format should be finalized during implementation.

---

# 115. Data Encryption

Use:

- TLS for transit
- managed encryption at rest
- secret management for credentials

Application-level field encryption should be added only for data that actually requires it.

---

# 116. Privacy

Do not collect:

- unnecessary precise location
- invasive fingerprints
- unnecessary device information

IP/security metadata should have explicit retention/access rules.

---

# 117. Analytics

MVP analytics should avoid collecting sensitive questionnaire content unnecessarily.

Basic metrics:

- sessions created
- completion rate
- PASS/FAIL counts
- abandonment
- average completion duration
- errors

Do not send raw candidate answers to generic analytics platforms.

---

# 118. Error Budget / Operational Targets

Initial non-binding targets can include:

- successful start rate
- successful answer-save rate
- successful submission rate
- evaluation error rate
- integrity error count

Exact SLOs are an operations decision.

---

# 119. Scaling Path

Initial:

```text
Vercel
+
Supabase Postgres
+
optional Redis
```

Growth path:

```text
Vercel
+
larger DB tier
+
Redis
+
background queue
+
dedicated worker
```

Only add components when usage/latency justifies them.

---

# 120. Future Multi-product Architecture

Because this project is part of a broader technology/founder environment, shared domain libraries should avoid coupling to one personal website brand.

Potential later:

- separate connection flows
- multiple questionnaires
- multiple public profiles
- multiple admins
- white-label screening products

But MVP remains single-tenant.

---

# 121. Single-Tenant MVP

Recommended initial assumption:

- ONE OWNER
- ONE PUBLIC PROFILE
- ONE PRIMARY ADMIN
- MULTIPLE QUESTIONNAIRE VERSIONS
- MULTIPLE ATTEMPTS

Multi-tenant architecture is unnecessary initially.

---

# 122. Multi-tenant Readiness

Even while single-tenant, primary domain IDs can be structured so tenant/owner context can later be introduced.

Do not build full tenant isolation before it is required.

---

# 123. Recommended Initial Repository

```text
/apps
  /public
    /app
    /components
    /lib

  /admin
    /app
    /components
    /lib

/packages
  /db
  /domain
  /validation
  /security
  /ui
  /config
  /types

/tests
  /unit
  /integration
  /e2e

/migrations
/docs
```

Exact directory layout may change.

---

# 124. Dependency Principles

Keep core runtime dependencies minimal.

Avoid adding a library when:

- platform already provides capability
- native browser/Next.js feature is sufficient
- simple internal code is safer

For critical security operations:

- prefer mature, audited libraries
- do not invent cryptography

---

# 125. Frontend State

Recommended:

- server state from API/server components
- local UI state with React
- local draft persistence only when necessary
- no global browser store as authoritative state

Do not put entire application state into a client-only store.

---

# 126. Form Validation

Client:

- instant feedback

Server:

- authoritative validation

Shared schema can reduce duplication.

---

# 127. Questionnaire UI Architecture

Question rendering can use a component registry:

```text
Question Type
   ↓
Renderer
   ├── SingleChoice
   ├── MultipleChoice
   ├── Text
   ├── Boolean
   └── Number
```

Supported types are driven by server-defined questionnaire schema.

---

# 128. CMS Question Builder Architecture

Admin UI:

```text
Question Builder
   ↓
Draft Schema
   ↓
Validation
   ↓
Version Creator
   ↓
Publish
```

Published versions are immutable.

---

# 129. Scoring Builder Architecture

Admin:

```text
Scoring Draft
 ↓
Validation
 ↓
Test Evaluation
 ↓
Publish Scoring Version
```

Admin must be able to test examples before publishing.

---

# 130. Configuration Validation

CMS should prevent publishing:

- invalid question types
- missing options
- invalid scoring references
- impossible required rules
- invalid passing score
- malformed branch rules if later introduced

---

# 131. Automated Integrity Checks

A scheduled/manual integrity checker can verify:

- versions
- references
- state transitions
- submission uniqueness
- evaluation consistency
- verification consistency

Vercel Cron can invoke maintenance functions, but runtime request validation remains authoritative.

---

# 132. Monitoring Dashboard

Admin dashboard should expose operational summary:

```text
System Status
Database
Public App
Admin App
Evaluation
Rate Limiting

Activity
Active Sessions
Completed
PASS
FAIL
Errors
Integrity
```

---

# 133. Alert Thresholds

Initial alerts:

- integrity error
- repeated evaluation failures
- database unavailable
- elevated 5xx
- suspicious API request spike
- repeated session enumeration

Threshold values are implementation/operations decisions.

---

# 134. Production Checklist

**Infrastructure**

- [ ] Vercel production projects
- [ ] Custom domains
- [ ] HTTPS
- [ ] Environment variables
- [ ] Supabase production DB
- [ ] Admin auth
- [ ] WAF
- [ ] Rate limiting
- [ ] Backup

**Application**

- [ ] Session
- [ ] Questionnaire
- [ ] Versioning
- [ ] Answer persistence
- [ ] Resume
- [ ] Submit
- [ ] Evaluation
- [ ] Result
- [ ] Verification
- [ ] CMS

**Security**

- [ ] Authorization
- [ ] Cookie security
- [ ] CSRF/origin protection
- [ ] Input validation
- [ ] XSS protections
- [ ] Replay protection
- [ ] Idempotency
- [ ] Rate limit
- [ ] Audit
- [ ] Secret management

---

# 135. Final Recommended Stack

```text
LANGUAGE
TypeScript

PUBLIC WEB
Next.js + App Router

ADMIN CMS
Next.js + App Router

UI
React + shared UI package

HOSTING
Vercel

DATABASE
PostgreSQL / Supabase

DATABASE ACCESS
Drizzle ORM

ADMIN AUTH
Supabase Auth

PUBLIC SESSION
Custom opaque session + Secure HttpOnly cookie

STORAGE
Supabase Storage

RATE LIMIT
Vercel WAF
+
Upstash Redis when application-level distributed limits are needed

TESTING
Vitest + Playwright

PACKAGE MANAGER
pnpm

REPOSITORY
Monorepo / GitHub

CI/CD
Vercel + GitHub

SCHEDULING
Vercel Cron where needed

OBSERVABILITY
Vercel logs/observability
+
structured app logs
+
optional error tracking
```

---

# 136. Technology Architecture Principle

Technology must implement the model, not redefine it.

```text
Functional Specification
        ↓
Security Model
        ↓
Data & State Model
        ↓
Technology
```

Not:

```text
Technology limitation
        ↓
change business behavior
```

---

# 137. What We Should NOT Build Yet

Avoid premature complexity:

- NO microservices
- NO Kubernetes
- NO event bus
- NO dedicated API cluster
- NO custom auth provider
- NO custom cryptography
- NO invasive fingerprinting
- NO AI-based security decisions
- NO full multi-tenant system
- NO distributed database
- NO queue unless long-running jobs exist

---

# 138. Recommended Build Order

**Phase 1 — Foundation**

- Monorepo
- Next.js apps
- TypeScript
- Supabase project
- PostgreSQL migrations
- Shared domain package

**Phase 2 — Security Foundation**

- Admin Auth
- Session token
- Cookie
- Authorization
- Secrets
- WAF
- Rate limit

**Phase 3 — Core Domain**

- Questionnaire
- Versioning
- Questions
- Options
- Policies
- Scoring

**Phase 4 — Candidate Flow**

- Session
- Resume
- Answers
- Submit
- Evaluation
- Result
- Verification

**Phase 5 — CMS**

- Content
- Question Builder
- Versioning
- Scoring
- Policies
- Publish

**Phase 6 — Reliability**

- Concurrency
- Idempotency
- Recovery
- Audit
- Integrity
- Monitoring

**Phase 7 — Testing & Production**

- Unit
- Integration
- E2E
- Security
- Load
- Backup/restore
- Production launch

---

# 139. Architecture Risks

**RISK-01 — Overusing Supabase client-side**

Mitigation:

- use server-side application layer
- restrict exposed database access
- RLS defense in depth

Supabase's own security documentation warns that exposed schemas require appropriate grants and RLS, and privileged service-role access bypasses RLS.

**RISK-02 — Using IP as identity**

Mitigation:

- IP only as risk/rate signal

**RISK-03 — Using cookie as identity**

Mitigation:

- cookie represents session credential
- authorization remains server-side

**RISK-04 — Serverless state assumptions**

Mitigation:

- all durable state in database/storage/Redis
- no process-memory authority

**RISK-05 — Long-running evaluation**

Mitigation:

- async worker later
- queue only when required

Vercel documents function execution limits; architecture must stay within those boundaries.

**RISK-06 — CMS accidental mutation**

Mitigation:

- immutable published versions
- new version workflow
- DB constraints
- audit

---

# 140. Decision: Supabase vs Separate Database Provider

Recommendation:

Start with Supabase PostgreSQL.

Reasons:

- reduces infrastructure count
- excellent fit for relational domain
- integrated Auth
- integrated Storage
- RLS support
- easy local/project workflow
- strong fit for Vercel

If later requirements exceed it, the domain/repository layer should make database migration possible.

---

# 141. Decision: Vercel vs Separate Hosting

Recommendation:

Start with Vercel.

The workload is primarily:

- web
- API
- database interactions
- lightweight evaluation
- CMS

Vercel's Node.js runtime is appropriate for TypeScript server functions and supports the required server-side patterns.

---

# 142. Decision: Redis Required?

Not strictly required for first MVP.

Start:

- Vercel WAF
- PostgreSQL

Add:

- Upstash Redis

when distributed application-level rate limiting or temporary counters require it.

Upstash supports serverless/Vercel-oriented HTTP rate limiting.

---

# 143. Decision: Separate API Server?

No for MVP.

Next.js server layer is sufficient.

Introduce a separate backend only if:

- external clients need API access
- workload becomes independent from web
- long-running workers appear
- organizational scale requires separation

---

# 144. Decision: Authentication for Candidates?

No account required for MVP.

Use secure anonymous session.

This preserves the low-friction experience:

```text
Open
→ Start
→ Answer
→ Result
```

---

# 145. Decision: Authentication for Admin?

Yes.

Use Supabase Auth with strong admin controls.

---

# 146. Decision: ORM

Recommended: Drizzle.

Reason:

- explicit SQL-oriented model
- TypeScript
- migrations
- predictable control over transactions/constraints

---

# 147. Decision: Monorepo

Yes.

Two deployable applications but one shared domain core.

---

# 148. Technology Architecture Gate

Before coding begins, the following should be approved:

- [ ] Two-app Vercel architecture
- [ ] Next.js + TypeScript
- [ ] Supabase PostgreSQL
- [ ] Supabase Auth for Admin
- [ ] Custom public session
- [ ] HttpOnly Secure cookie
- [ ] Drizzle ORM
- [ ] Shared domain package
- [ ] Server-side evaluation
- [ ] WAF
- [ ] Optional Redis
- [ ] GitHub monorepo
- [ ] Preview/staging/production separation
- [ ] Testing stack
- [ ] Monitoring
- [ ] Backup/recovery

---

# 149. Final Architecture Diagram

```text
                         ┌─────────────────────┐
                         │       INTERNET      │
                         └──────────┬──────────┘
                                    │
                           VERCEL / WAF
                                    │
                  ┌─────────────────┴─────────────────┐
                  │                                   │
                  ▼                                   ▼
       ┌─────────────────────┐             ┌─────────────────────┐
       │     PUBLIC WEB      │             │      ADMIN CMS      │
       │       Next.js       │             │       Next.js       │
       │       Vercel        │             │       Vercel        │
       └──────────┬──────────┘             └──────────┬──────────┘
                  │                                   │
                  │                         Supabase Auth
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    │
                           SERVER DOMAIN LAYER
                                    │
        ┌───────────────┬───────────┼───────────┬───────────────┐
        │               │           │           │               │
        ▼               ▼           ▼           ▼               ▼
     Session       Questionnaire  Submission Evaluation      Admin
      Engine          Engine       Engine      Engine         Domain
        │               │           │           │               │
        └───────────────┴───────────┼───────────┴───────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ PostgreSQL /        │
                         │ Supabase            │
                         │ SYSTEM OF RECORD    │
                         └──────────┬──────────┘
                                    │
               ┌────────────────────┼───────────────────┐
               │                    │                   │
               ▼                    ▼                   ▼
             Audit              Integrity          Historical
             Events             Findings            Records

Optional:
                    ┌─────────────────────┐
                    │   Upstash Redis      │
                    │ Rate Limit / Temp    │
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │ Supabase Storage     │
                    │ Public/Private Media │
                    └─────────────────────┘
```

---

# 150. Final Technology Principle

Use managed infrastructure where it improves reliability; keep business rules in our own domain layer; keep durable truth in PostgreSQL; keep secrets server-side; keep the public experience anonymous and simple; and do not introduce distributed complexity before the product requires it.

This architecture is intentionally a modular monolith with two independently deployed web interfaces.

It gives the project:

- low operational complexity
- strong data integrity
- good security boundaries
- straightforward Vercel deployment
- easy CMS iteration
- clean future expansion
- a practical path to AI/automation later

**Document End**
