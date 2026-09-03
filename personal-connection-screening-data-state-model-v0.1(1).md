# Personal Connection Screening System
## Data & State Model
### Version 0.1

> **Status:** Draft Data Foundation  
> **Depends on:** Master System Specification v0.1, Functional Specification v0.1, Security & Threat Model v0.1  
> **Purpose:** Mendefinisikan entity, identifier, relationship, versioning, state machine, constraints, invariants, concurrency model, immutable history, audit structure, dan transaction boundaries secara technology-neutral.

---

# 1. Data Model Objective

Data model harus mampu menjawab secara deterministik:

1. Siapa/apa yang memiliki session?
2. Session sedang berada pada state apa?
3. Questionnaire version mana yang digunakan?
4. Question version mana yang dijawab?
5. Scoring version mana yang menghasilkan score?
6. Result berasal dari submission yang mana?
7. Apakah attempt masih dapat dilanjutkan?
8. Apakah user boleh retake?
9. Apakah dua request berasal dari state yang sama atau stale?
10. Apakah sebuah historical result masih dapat diverifikasi?
11. Apa yang terjadi ketika CMS berubah?
12. Apa yang terjadi ketika terjadi partial failure?

---

# 2. Modeling Principles

## DM-01 — Stable Identity

Entity memiliki stable internal identity yang tidak berubah sepanjang lifecycle entity.

## DM-02 — Opaque External Reference

Identifier yang terekspos ke public tidak boleh berupa sequential database IDs.

## DM-03 — Versioning for Evaluation Context

Semua data yang dapat memengaruhi evaluation harus dapat direkonstruksi berdasarkan version.

## DM-04 — Historical Immutability

Record final tidak dimutasi secara destructive.

## DM-05 — Server-Owned State

State transition terjadi berdasarkan server-side rules.

## DM-06 — Explicit Relationships

Jawaban, submission, result, dan verification harus memiliki referensi eksplisit.

## DM-07 — No Implicit Meaning from Position

Question position/order tidak boleh menjadi identity.

## DM-08 — Append Where History Matters

Event/audit/correction/history lebih baik disimpan sebagai append-only conceptual model.

---

# 3. Conceptual Domain Model

```text
CONTENT DOMAIN
    │
    ├── Profile
    ├── Content Section
    └── Public Content
             │
             ▼
QUESTIONNAIRE DOMAIN
    │
    ├── Questionnaire
    │      └── Questionnaire Version
    │             └── Question Binding
    │                    └── Question Version
    │                           └── Answer Option Version
    │
    └── Evaluation Configuration
           └── Scoring Version
                  └── Scoring Rule

USER FLOW DOMAIN
    │
    ├── Candidate Context
    │
    ├── Attempt
    │      └── Session
    │             └── Answer
    │
    └── Submission
           └── Evaluation
                  └── Result
                         └── Verification

GOVERNANCE DOMAIN
    │
    ├── Policy Version
    ├── Admin Actor
    ├── Audit Event
    ├── Security Event
    └── Integrity Finding
```

---

# 4. Core Entities

Minimum conceptual entities:

1. Profile
2. Content Section
3. Questionnaire
4. Questionnaire Version
5. Question
6. Question Version
7. Answer Option
8. Answer Option Version
9. Scoring Configuration
10. Scoring Version
11. Scoring Rule
12. Policy Configuration
13. Policy Version
14. Candidate Context
15. Attempt
16. Session
17. Answer
18. Submission
19. Evaluation
20. Result
21. Verification
22. Audit Event
23. Security Event
24. Integrity Finding
25. Admin Actor / Admin Session

Not all need to map 1:1 to tables in the eventual database. This document defines conceptual boundaries first.

---

# 5. Identifier Strategy

Every important entity should have:

```text
internal_id
public_reference
```

Conceptually:

```text
internal_id
    ↓
database/system identity

public_reference
    ↓
safe external reference
```

Public references should be:
- opaque
- non-sequential
- high entropy
- safe to expose where intended

Examples:

```text
session_ref    = ses_xxxxxxxxx
attempt_ref    = att_xxxxxxxxx
submission_ref = sub_xxxxxxxxx
result_ref     = res_xxxxxxxxx
verification_ref = ver_xxxxxxxxx
```

Exact format is intentionally left to technology architecture.

---

# 6. Entity: Profile

Purpose:
- stores public information about the owner.

Possible fields:

```text
profile_id
slug
display_name
status
created_at
updated_at
published_at
```

Profile content itself may be split into content sections.

---

# 7. Entity: Content Section

Purpose:
- CMS-driven public information.

Examples:
- Hero
- About
- Career
- Education
- Interests
- Values
- CTA

Conceptual fields:

```text
section_id
section_type
title
subtitle
body
display_order
visibility
content_version
created_at
updated_at
```

Display-only content does not necessarily require the same immutability model as evaluation content.

---

# 8. Entity: Questionnaire

Represents a logical questionnaire identity.

Conceptual:

```text
questionnaire_id
name
slug
status
created_at
updated_at
```

Questionnaire identity remains stable across versions.

Example:

```text
Questionnaire
    id = qnr_001
    versions:
       v1
       v2
       v3
```

---

# 9. Entity: Questionnaire Version

Represents a frozen evaluation experience.

Conceptual fields:

```text
questionnaire_version_id
questionnaire_id
version_number
version_status
published_at
published_by
created_at
```

Possible status:

```text
DRAFT
REVIEW
PUBLISHED
ARCHIVED
```

Published version used by sessions must be immutable.

---

# 10. Questionnaire Version Membership

A questionnaire version needs an explicit list/binding of questions.

Conceptual entity:

```text
questionnaire_version_question
```

Fields:

```text
questionnaire_version_id
question_version_id
position
required_override (if supported)
visibility/branch rule reference (if supported)
```

Important:

`position` is presentation metadata only.

Identity is:

```text
question_version_id
```

---

# 11. Entity: Question

Represents logical question identity across versions.

Conceptual:

```text
question_id
stable_key
status
created_at
```

Example:

```text
question_id = q_0017
```

It may have:

```text
v1
v2
v3
```

---

# 12. Entity: Question Version

Frozen definition of a question.

Conceptual:

```text
question_version_id
question_id
version_number
type
text
description
required
status
created_at
published_at
```

Example:

```text
q_0017:v1
"Apakah kamu suka kopi?"

q_0017:v2
"Seberapa sering kamu minum kopi?"
```

These are distinct evaluation inputs.

---

# 13. Entity: Answer Option

Represents logical option identity where option re-use is desirable.

Example:

```text
option_id = opt_yes
```

However historical evaluation must still preserve the option version/context.

---

# 14. Entity: Answer Option Version

Conceptual:

```text
option_version_id
option_id
question_version_id
value
label
position
score_reference
status
```

Example:

```text
opt_yes:v1
label = "Yes"
score = +10
```

Later:

```text
opt_yes:v2
label = "Yes"
score = +5
```

Historical option interpretation remains recoverable.

---

# 15. Entity: Scoring Configuration

Logical identity of evaluation logic.

```text
scoring_configuration_id
name
status
```

---

# 16. Entity: Scoring Version

Frozen version of scoring logic.

Conceptual:

```text
scoring_version_id
scoring_configuration_id
version_number
formula_type
passing_rule
published_at
published_by
```

---

# 17. Entity: Scoring Rule

Defines scoring behavior.

Possible conceptual structure:

```text
scoring_rule_id
scoring_version_id
question_version_id / option_version_id
operator
value
weight
rule_order
```

Exact formula representation depends on technology and product decisions.

---

# 18. Entity: Policy Configuration

Logical identity for operational policies.

Examples:
- session policy
- repeat policy
- verification policy
- retention policy

---

# 19. Entity: Policy Version

Frozen effective configuration.

Possible fields:

```text
policy_version_id
policy_type
version_number
effective_at
expires_at
created_by
```

Policies that affect historical behavior should be version-referenceable.

---

# 20. Session Policy Snapshot

When an attempt/session is created, relevant policy values should be captured or referenceable.

Examples:

```text
session_lifetime
allow_resume
questionnaire_time_limit
repeat_mode
max_attempts
cooldown
```

This avoids historical behavior becoming dependent on current CMS settings.

---

# 21. Entity: Candidate Context

This system does not necessarily require account-based user identity.

Candidate context can represent the connection candidate as known by the system.

Possible fields:

```text
candidate_context_id
created_at
updated_at
```

Candidate identity association is intentionally minimal unless product requirements require explicit registration.

Important:

A candidate context must not be inferred solely from:
- IP
- cookie
- browser fingerprint
- device

---

# 22. Entity: Attempt

Attempt is the primary unit of questionnaire participation.

Conceptual fields:

```text
attempt_id
attempt_ref
candidate_context_id (optional)
questionnaire_version_id
scoring_version_id
policy_version_id
status
created_at
started_at
completed_at
```

Attempt represents:

> One evaluation journey against one specific questionnaire/evaluation context.

---

# 23. Attempt State

Recommended:

```text
CREATED
   ↓
ACTIVE
   ↓
SUBMITTING
   ↓
EVALUATING
   ↓
COMPLETED
```

Alternative terminal/intermediate states:

```text
EXPIRED
ABANDONED
REVOKED
RECOVERABLE_ERROR
EVALUATION_ERROR
INTEGRITY_ERROR
```

Exact division between Session and Attempt status must be kept consistent.

---

# 24. Session vs Attempt

They are intentionally different concepts.

## Attempt

Represents the business-level participation.

Example:

```text
Attempt #3
Questionnaire v8
Result PASS
```

## Session

Represents a browser/authenticated continuity context associated with the attempt.

Example:

```text
Session X
→ Attempt #3
```

A session may expire while the attempt remains a historical record.

---

# 25. Entity: Session

Conceptual:

```text
session_id
session_ref
attempt_id
session_status
session_token_reference
created_at
expires_at
last_seen_at
revoked_at
```

Security-sensitive token material should not be stored in plaintext where avoidable.

---

# 26. Session State

```text
NEW
ACTIVE
COMPLETED
EXPIRED
ABANDONED
REVOKED
```

Possible transition:

```text
NEW → ACTIVE
ACTIVE → COMPLETED
ACTIVE → EXPIRED
ACTIVE → ABANDONED
ACTIVE → REVOKED
```

Completed session should not return to normal active mutation state.

---

# 27. Session Expiry

Server calculates:

```text
expires_at =
server_created_at + session_lifetime_at_creation
```

Important:

Current CMS policy is not used to retroactively recalculate existing session expiry unless an explicit migration policy exists.

---

# 28. Questionnaire Deadline

If enabled:

```text
questionnaire_started_at
questionnaire_deadline
```

Deadline is calculated using trusted server time.

Refresh/reconnect cannot reset deadline.

---

# 29. Entity: Answer

Answer is an attempt-scoped response.

Conceptual:

```text
answer_id
attempt_id
question_version_id
option_version_id (nullable)
text_value (nullable)
numeric_value (nullable)
boolean_value (nullable)
selected_values (nullable)
status
created_at
updated_at
```

Exact value fields depend on supported question types.

---

# 30. Answer Identity

Critical identity:

```text
attempt_id
+
question_version_id
```

Not:

```text
attempt_id
+
question_position
```

This prevents the Q3 replacement problem.

---

# 31. One Current Answer Per Question Version

Normal assumption:

For each attempt and question version:

```text
UNIQUE(attempt_id, question_version_id)
```

If answer history is needed, use separate answer events/version history.

---

# 32. Answer History

Two options conceptually:

### Option A — Mutable current answer + audit

Store current answer and audit updates.

### Option B — Append-only answer revisions

```text
Answer Revision 1
Answer Revision 2
Answer Revision 3
```

For this system, either is possible.

Recommended:
- current answer record for efficient reads
- audit/event record for changes where necessary

The final submission must capture the final effective answer set.

---

# 33. Entity: Submission

Submission represents the finalization attempt.

Conceptual:

```text
submission_id
submission_ref
attempt_id
status
submitted_at
finalized_at
idempotency_reference
```

An attempt should have at most one final submission under the default model.

---

# 34. Submission Uniqueness

Core invariant:

```text
ONE ATTEMPT
    ↓
MAX ONE FINAL SUBMISSION
```

Database/system constraint should enforce this independently from UI.

---

# 35. Submission State

Recommended:

```text
DRAFT
SUBMITTING
EVALUATING
COMPLETED
RECOVERABLE_ERROR
EVALUATION_ERROR
INTEGRITY_ERROR
```

Only `COMPLETED` is a final business outcome carrier.

---

# 36. Entity: Evaluation

Evaluation records how result was calculated.

Conceptual:

```text
evaluation_id
submission_id
questionnaire_version_id
scoring_version_id
input_snapshot_reference
score
passing_score
result
started_at
completed_at
evaluation_status
```

---

# 37. Evaluation Snapshot

The evaluation record should preserve or reference enough information to reconstruct:

```text
Questionnaire Version
Question Versions
Answer set
Scoring Version
Passing Rule
Passing Score
Evaluation outcome
```

Two approaches:

### Reference model
Store all version IDs and retrieve immutable definitions.

### Snapshot model
Store a frozen evaluation snapshot.

Recommended conceptual architecture:

> Use stable references to immutable versions and retain a normalized/frozen summary sufficient for audit.

Exact hybrid implementation can be decided later.

---

# 38. Entity: Result

Result is the user-facing business outcome.

Conceptual:

```text
result_id
result_ref
submission_id
result_type
score
created_at
```

Possible result types:

```text
PASS
FAIL
```

Technical processing statuses should not be represented as normal business results.

---

# 39. Entity: Verification

Verification references a final result/submission.

Conceptual:

```text
verification_id
verification_ref
result_id
status
created_at
revoked_at
```

Possible status:

```text
VALID
REVOKED
```

MVP may only require VALID.

---

# 40. Entity: Audit Event

Audit records what happened.

Conceptual fields:

```text
audit_event_id
event_type
actor_type
actor_reference
entity_type
entity_reference
timestamp
metadata
correlation_reference
```

Examples:

```text
SESSION_CREATED
ANSWER_UPDATED
QUESTIONNAIRE_PUBLISHED
SUBMISSION_FINALIZED
RESULT_GENERATED
ADMIN_POLICY_CHANGED
```

Audit data should be protected and conceptually append-only.

---

# 41. Entity: Security Event

Security event is distinct from ordinary business audit.

Examples:
- repeated invalid session attempts
- brute-force pattern
- unauthorized resource access
- unusual API activity
- possible enumeration

Conceptual:

```text
security_event_id
event_type
severity
source_reference
timestamp
metadata
resolved_at
```

---

# 42. Entity: Integrity Finding

Represents a data/system consistency violation.

Conceptual:

```text
integrity_finding_id
finding_type
severity
entity_type
entity_reference
detected_at
status
resolution_reference
```

Possible status:

```text
OPEN
INVESTIGATING
RESOLVED
FALSE_POSITIVE
```

---

# 43. Entity: Admin Actor

Represents authenticated administrator identity.

Conceptual:

```text
admin_actor_id
display_name
status
role
created_at
```

Authentication credentials should be managed outside ordinary content records.

---

# 44. Entity: Admin Session

Conceptual:

```text
admin_session_id
admin_actor_id
created_at
expires_at
revoked_at
last_seen_at
```

Admin sessions must have stricter security controls than public questionnaire sessions.

---

# 45. Core Relationships

```text
Questionnaire
  1 ─── N QuestionnaireVersion

Question
  1 ─── N QuestionVersion

QuestionnaireVersion
  N ─── N QuestionVersion
       through QuestionBinding

QuestionVersion
  1 ─── N AnswerOptionVersion

ScoringConfiguration
  1 ─── N ScoringVersion

ScoringVersion
  1 ─── N ScoringRule

CandidateContext
  1 ─── N Attempt

QuestionnaireVersion
  1 ─── N Attempt

Attempt
  1 ─── N Session

Attempt
  1 ─── N Answer

Attempt
  1 ─── N Submission
       but MAX 1 FINAL

Submission
  1 ─── 1 Evaluation

Submission
  1 ─── 1 Result

Result
  1 ─── N Verification
       conceptually, but normally one active verification

Any entity
  1 ─── N AuditEvent
```

---

# 46. Attempt Context Lock

When Attempt is created, it must lock:

```text
questionnaire_version
scoring_version
policy_version
```

or sufficient equivalent snapshots.

This prevents evaluation from changing because current CMS changed.

---

# 47. Candidate Identity Modeling

The system intentionally avoids assuming:

```text
1 IP = 1 candidate
1 cookie = 1 candidate
1 browser = 1 candidate
1 device = 1 candidate
```

Candidate identity may remain anonymous unless a product decision introduces explicit identity.

---

# 48. Session Token Relationship

Conceptually:

```text
Browser
   |
   | secure session cookie
   v
Session credential reference
   |
   v
Session
   |
   v
Attempt
```

Do not use a raw database ID as the browser credential.

---

# 49. Version Graph

Questionnaire:

```text
QNR-01
 │
 ├── v1 ── q1:v1, q2:v1, q3:v1
 │
 ├── v2 ── q1:v1, q2:v1, q3:v2
 │
 └── v3 ── q1:v2, q2:v1, q3:v2
```

Scoring:

```text
SCORE-01
 │
 ├── v1
 ├── v2
 └── v3
```

Policy:

```text
POLICY-01
 │
 ├── v1
 └── v2
```

---

# 50. Historical Submission Example

```text
Attempt #A1

Questionnaire Version: v7
Scoring Version: v3
Policy Version: v2

Answers:
  q01:v2 = YES
  q02:v1 = "..."
  q03:v4 = NO

Evaluation:
  Score = 84
  Passing = 70
  Result = PASS
```

If current system becomes:

```text
Questionnaire v8
Scoring v4
Passing 80
```

Attempt A1 remains:

```text
84
PASS
```

---

# 51. Question Replacement Data Behavior

Old:

```text
Question q3
Version v1
"Do you like coffee?"
```

Answer:

```text
Attempt A
q3:v1 = YES
```

New:

```text
Question q3
Version v2
"Do you like traveling?"
```

New attempt:

```text
Attempt B
q3:v2 = NULL
```

No cross-version answer matching.

---

# 52. State Machine — Attempt

```text
CREATED
   |
   v
ACTIVE
   |
   +------------------+
   |                  |
   v                  v
SUBMITTING         EXPIRED
   |
   v
EVALUATING
   |
   +------------------------+
   |                        |
   v                        v
COMPLETED              EVALUATION_ERROR
```

Possible side state:

```text
ACTIVE → ABANDONED
ACTIVE → REVOKED
```

---

# 53. State Machine — Session

```text
NEW
 |
 v
ACTIVE
 |
 +--> COMPLETED
 |
 +--> EXPIRED
 |
 +--> ABANDONED
 |
 +--> REVOKED
```

Only valid transitions are allowed.

---

# 54. State Machine — Submission

```text
DRAFT
 |
 v
SUBMITTING
 |
 v
EVALUATING
 |
 v
COMPLETED
```

Errors:

```text
SUBMITTING → RECOVERABLE_ERROR
EVALUATING → EVALUATION_ERROR
ANY critical state → INTEGRITY_ERROR
```

Recovery actions must be explicit and audited.

---

# 55. Terminal State Principle

Terminal states:

```text
COMPLETED
EXPIRED
REVOKED
```

Normal user operations cannot transition a terminal state back to ACTIVE.

Administrative recovery, if ever required, must create explicit audit evidence.

---

# 56. State Transition Authorization

Every state transition should validate:

```text
current_state
+
actor
+
requested_transition
+
version
+
authorization
```

Example:

```text
COMPLETED → SUBMITTING
```

must be rejected.

---

# 57. Optimistic Concurrency

Mutable active state should have a revision/version counter conceptually:

```text
state_version
```

Example:

```text
Session revision = 14
```

Client operates against revision 14.

Server receives request:

```text
expected_revision = 14
```

If actual is now 15:

```text
STALE_STATE
```

Request does not silently overwrite revision 15.

Exact implementation deferred.

---

# 58. Answer Concurrency

Example:

```text
Tab A revision 5
Tab B revision 5

Tab A updates Q3
→ revision 6

Tab B sends update based on revision 5
→ reject/reconcile
```

Possible user-facing response:

> This session was updated elsewhere. Refreshing your latest progress.

---

# 59. Submit Concurrency

Two requests:

```text
Submit A
Submit B
```

Only one may finalize the attempt.

The other should see:
- already finalized
- current result
- or safe equivalent response

No duplicate final record.

---

# 60. Idempotency

Critical operations should carry/use an idempotency concept:

```text
idempotency_key
```

Especially:
- submit
- retryable state-changing requests
- administrative critical actions

Duplicate request with same operation identity must resolve safely.

---

# 61. Uniqueness Constraints

Conceptual minimum:

```text
questionnaire_id + version_number
question_id + version_number
scoring_configuration_id + version_number
policy_type + version_number
attempt_ref
session_ref
submission_ref
result_ref
verification_ref
```

And:

```text
attempt_id + final_submission_constraint
attempt_id + question_version_id
```

where applicable.

---

# 62. Foreign-Key Integrity

References must always point to valid entities.

Examples:

Answer:
→ valid attempt
→ valid question version
→ question version belongs to attempt questionnaire version

Submission:
→ valid attempt

Evaluation:
→ valid submission

Result:
→ valid evaluation/submission

Verification:
→ valid result

---

# 63. Cross-Version Integrity Rules

These must be true:

```text
Answer.question_version
    ∈
Attempt.questionnaire_version.questions
```

And:

```text
Evaluation.questionnaire_version
    =
Attempt.questionnaire_version
```

And:

```text
Evaluation.scoring_version
    =
Attempt.scoring_version
```

---

# 64. Result Integrity Rules

Must always be true:

```text
Result.submission
exists
```

and:

```text
Result.score
+
Result.passing_score
+
Result.rule
```

must produce the stored result according to the scoring logic/version used.

If not:

`INTEGRITY_ERROR`

---

# 65. Time Integrity

Server-owned timestamps:

```text
created_at
started_at
submitted_at
completed_at
expires_at
published_at
```

Client must not be trusted to establish these times.

---

# 66. Ordering Integrity

Question position is unique within a questionnaire version where ordering is required:

```text
questionnaire_version_id + position
```

No duplicate position unless branching/parallel presentation is explicitly supported.

---

# 67. Required Question Integrity

At evaluation time, required status must come from:

```text
questionnaire_version
question_version
```

not from client.

---

# 68. Answer Option Integrity

An answer option is valid only if:

```text
option_version
belongs to
question_version
```

and the question version belongs to the session's questionnaire version.

---

# 69. Answer Type Integrity

Server verifies the submitted answer matches question type.

Examples:

```text
single_choice → valid option
number → valid number/range
text → valid text constraints
boolean → valid boolean
multiple_choice → valid set of options
```

---

# 70. Submission Snapshot Integrity

Final submission must have a deterministic set of effective answers.

No answer should be in an ambiguous state when evaluation begins.

---

# 71. Immutable Records

Conceptually immutable after completion/publish:

### Published content affecting evaluation
- questionnaire version
- question version
- option version
- scoring version
- applicable policy version

### Completed execution
- final submission
- final evaluation
- final result
- verification historical reference

---

# 72. Mutable Records

May remain mutable while active:

- draft questionnaire
- draft question
- draft scoring
- active session progress
- active answers
- CMS display-only content

Mutation rules must change once publication/finalization happens.

---

# 73. Soft Delete / Archive

For historical entities:

Preferred:

```text
ACTIVE
→ INACTIVE
→ ARCHIVED
```

rather than hard delete.

Applicable to:
- question
- option
- questionnaire
- scoring version
- policy
- content

---

# 74. Hard Delete Policy

Hard delete should be prohibited or highly restricted when entity has historical dependencies.

Examples:
- published question
- used option
- published questionnaire version
- completed submission
- final result
- audit event

---

# 75. Retention Model

Retention should be separately defined for:

```text
active sessions
expired sessions
abandoned sessions
submissions
results
verification
audit
security events
integrity findings
```

Exact retention period remains an open product/legal decision.

---

# 76. Candidate Data Minimization

Candidate context should not contain unnecessary information.

If name/contact is not required for core flow, it should not be required merely for data convenience.

---

# 77. IP Data Modeling

If IP is collected, it should be separate from core identity.

Conceptually:

```text
Security Metadata
    |
    ├── ip_reference/value
    ├── user_agent summary
    ├── risk signals
    └── timestamps
```

Retention/access policy applies separately.

---

# 78. Device Signal Modeling

If later introduced, device/browser signals should be modeled as security metadata, not identity truth.

Avoid:

```text
device_id = person identity
```

Instead:

```text
device/risk signal
→ confidence input
```

---

# 79. Audit Event Relationship

Every critical action can reference:

```text
actor
entity
before_state summary
after_state summary
action
timestamp
correlation ID
```

Do not store secrets or sensitive full payloads unnecessarily.

---

# 80. Correlation ID

One user operation may generate multiple system events.

Example:

```text
request correlation = corr_ABC
```

Events:

```text
SUBMISSION_STARTED
EVALUATION_STARTED
EVALUATION_COMPLETED
RESULT_CREATED
VERIFICATION_CREATED
```

This allows tracing without coupling identity to request logs.

---

# 81. Transaction Boundary — Start

Conceptually atomic:

```text
Create Attempt
+
Create Session
+
Lock Questionnaire Version
+
Lock Scoring/Policy Context
```

Then issue session continuity credential after successful creation.

---

# 82. Transaction Boundary — Answer Save

Conceptually:

```text
Validate Session
+
Validate Question Version
+
Validate Answer
+
Check Concurrency
+
Persist Answer
+
Update Revision
```

All critical parts should have consistent transaction semantics.

---

# 83. Transaction Boundary — Submit

Critical sequence:

```text
Validate Session
↓
Validate Attempt
↓
Check Expiration
↓
Check Time Limit
↓
Check Completeness
↓
Check Version
↓
Check Duplicate Submission
↓
Finalize Submission
```

Finalization must be atomic with respect to competing submit requests.

---

# 84. Transaction Boundary — Evaluation

Conceptually:

```text
Load immutable context
↓
Load effective answers
↓
Run scoring
↓
Validate evaluation
↓
Persist evaluation
↓
Persist result
```

If verification creation is part of the same transactional system, it should be coordinated consistently.

---

# 85. Transaction Boundary — CMS Publish

Conceptually:

```text
Validate Draft
↓
Create immutable version
↓
Publish version
↓
Set current pointer
↓
Audit publish
```

Existing active sessions do not update.

---

# 86. Recovery Model

Every recoverable state must have a deterministic path.

Example:

```text
SUBMITTING
     ↓
RECOVERABLE_ERROR
     ↓
retry/check authoritative state
     ↓
COMPLETED
```

Do not create a second attempt merely because client lost the response.

---

# 87. Duplicate Finalization Detection

If system detects:

```text
2 final submissions
for same attempt
```

this is not normal business behavior.

It becomes:

`INTEGRITY_ERROR`

and is visible to admin/security monitoring.

---

# 88. Orphan Detection

Examples:

```text
Answer without Attempt
Submission without Attempt
Result without Submission
Verification without Result
Evaluation without Submission
```

These are integrity violations.

---

# 89. Version Orphan Detection

Examples:

```text
Session points to missing Questionnaire Version
Answer points to missing Question Version
Evaluation points to missing Scoring Version
```

Must be detected.

---

# 90. State Consistency Checks

Periodic or event-driven integrity checks should verify:

```text
Session state valid
Attempt state valid
Submission state valid
Version references valid
Answer references valid
Result consistency valid
Verification consistency valid
```

---

# 91. Current vs Historical Pointers

CMS may have:

```text
Questionnaire current_version = v9
```

But historical Attempt retains:

```text
attempt.questionnaire_version = v7
```

Do not resolve historical data through `current_version`.

Always use explicit historical reference.

---

# 92. Current Scoring vs Historical Scoring

Same principle:

```text
Scoring current = v5
```

does not modify:

```text
Attempt A.scoring_version = v3
```

---

# 93. Effective Policy

Policy changes should have an explicit effective boundary.

Example:

```text
Policy v1
effective < 2026-09-05

Policy v2
effective >= 2026-09-05
```

New sessions choose policy according to defined effective time.

---

# 94. Attempt Version Snapshot

For maximum auditability, an Attempt should be able to answer:

```text
Which questionnaire?
Which question versions?
Which scoring?
Which policy?
Which options?
Which result rule?
```

without relying on mutable CMS current state.

---

# 95. Data Lifecycle

```text
DRAFT CONTENT
    ↓
VALIDATED
    ↓
PUBLISHED VERSION
    ↓
USED BY ATTEMPTS
    ↓
ARCHIVED
    ↓
HISTORICAL REFERENCE
```

Execution:

```text
ATTEMPT CREATED
    ↓
SESSION ACTIVE
    ↓
ANSWERS SAVED
    ↓
SUBMISSION
    ↓
EVALUATION
    ↓
RESULT
    ↓
VERIFICATION
```

---

# 96. Public Data Boundary

Public may receive:

```text
public content
question text/options
own progress
own result
public verification
```

Only where policy permits.

Public should not receive:
- raw internal IDs
- admin credentials
- audit records
- security events
- unnecessary scoring internals
- another candidate's data

---

# 97. Admin Data Boundary

Admin may access:
- questionnaire versions
- scoring context
- submissions
- answers
- results
- verification
- audit
- security events
- integrity findings

Access remains subject to admin authorization.

---

# 98. Verification Data Boundary

Verification is a projection of historical result.

It is not an alternate database containing arbitrary copied business data.

Conceptually:

```text
Verification
   ↓
Result
   ↓
Submission
```

---

# 99. Result as Derived Business Record

Result is derived from:

```text
Submission
+
Questionnaire version
+
Answers
+
Scoring version
```

Once persisted, it becomes the historical business record.

It should not be recalculated against current configuration during display.

---

# 100. Data Integrity Invariants

## INV-D01
Every active session references exactly one attempt.

## INV-D02
Every attempt references one questionnaire version.

## INV-D03
Every evaluation references one submission.

## INV-D04
Every result references one completed evaluation/submission.

## INV-D05
Every answer references a question version belonging to the attempt questionnaire version.

## INV-D06
A completed attempt has at most one final submission.

## INV-D07
A completed result cannot be changed by current CMS configuration.

## INV-D08
Published evaluation-affecting versions cannot be mutated destructively.

## INV-D09
Terminal state cannot silently transition backward.

## INV-D10
Client values never become authoritative score/result/state.

---

# 101. State Invariants

## Session

```text
EXPIRED cannot submit.
REVOKED cannot submit.
COMPLETED cannot accept normal answer edits.
```

## Attempt

```text
COMPLETED cannot become ACTIVE through normal user flow.
```

## Submission

```text
COMPLETED cannot be submitted again.
```

---

# 102. Evaluation Invariants

```text
score = deterministic evaluation of trusted inputs
result = deterministic application of result rule
passing_score = evaluation context value
```

If deterministic reconstruction fails:

`INTEGRITY_ERROR`

---

# 103. Concurrency Invariants

## INV-C01
Only one request can finalize an attempt.

## INV-C02
Stale revisions cannot overwrite newer revisions.

## INV-C03
Duplicate retries resolve safely.

## INV-C04
Historical final state cannot be overwritten by late requests.

---

# 104. Security/Data Boundary Invariants

## INV-SD01
Public reference does not imply authorization.

## INV-SD02
Cookie does not imply identity beyond the session it securely authenticates.

## INV-SD03
IP does not imply candidate identity.

## INV-SD04
Question number does not imply question identity.

## INV-SD05
Current CMS state does not imply historical execution context.

---

# 105. Deletion Invariants

## INV-X01
Historical submission cannot depend on a hard-deleted evaluation version.

## INV-X02
Historical answer cannot lose its question version reference.

## INV-X03
Verification cannot become unresolved because admin archived content.

---

# 106. Proposed Entity Summary

| Entity | Mutable? | Versioned? | Historical Dependency? |
|---|---|---|---|
| Profile | Yes | Optional | Low |
| Content Section | Yes | Optional | Low |
| Questionnaire | Limited | Yes | High |
| Questionnaire Version | No after publish | Yes | High |
| Question | Limited | Yes | High |
| Question Version | No after publish | Yes | High |
| Answer Option | Limited | Yes | High |
| Option Version | No after publish | Yes | High |
| Scoring Configuration | Limited | Yes | High |
| Scoring Version | No after publish | Yes | High |
| Policy Configuration | Limited | Yes | Medium/High |
| Policy Version | No after effective use | Yes | High |
| Candidate Context | Limited | No | Medium |
| Attempt | Limited during lifecycle | No | High |
| Session | Yes during lifecycle | No | Medium |
| Answer | Yes while active | Revisions optional | High |
| Submission | Limited until final | No | High |
| Evaluation | No after final | No | High |
| Result | No after final | No | High |
| Verification | Limited if revocable | No | High |
| Audit Event | Append-only | No | High |
| Security Event | Append-oriented | No | High |
| Integrity Finding | Status mutable | No | High |
| Admin Actor | Yes | No | High |
| Admin Session | Yes | No | Medium |

---

# 107. P0 Data Model Requirements

Before production:

```text
[ ] Explicit stable identity
[ ] Opaque public references
[ ] Questionnaire versioning
[ ] Question versioning
[ ] Option versioning
[ ] Scoring versioning
[ ] Policy context locking
[ ] Session/attempt separation
[ ] Explicit answer/question relation
[ ] One-final-submission invariant
[ ] Server-controlled timestamps
[ ] Historical immutable evaluation
[ ] Result integrity constraints
[ ] Verification relation
[ ] Concurrency revision
[ ] Idempotency
[ ] Foreign-key/reference integrity
[ ] Audit events
[ ] Integrity detection
```

---

# 108. Data Model Acceptance Criteria

## DM-AC-01
Changing Q3 creates a distinct question version context.

## DM-AC-02
Old answer remains linked to old question version.

## DM-AC-03
Active session remains tied to its original questionnaire version.

## DM-AC-04
Current questionnaire version cannot alter historical attempt.

## DM-AC-05
Current scoring cannot alter historical result.

## DM-AC-06
Current passing score cannot alter historical result.

## DM-AC-07
One attempt cannot have two final submissions.

## DM-AC-08
Answer cannot reference foreign question version.

## DM-AC-09
Evaluation cannot reference scoring version unrelated to attempt.

## DM-AC-10
Result cannot exist without valid submission/evaluation.

## DM-AC-11
Verification cannot point to missing result.

## DM-AC-12
Terminal state transitions are enforced.

## DM-AC-13
Stale request cannot overwrite newer revision.

## DM-AC-14
Historical records remain resolvable after archive.

## DM-AC-15
Impossible state is detectable.

---

# 109. Example Complete Data Chain

```text
QUESTIONNAIRE
QNR-01
   |
   v
QUESTIONNAIRE VERSION
QNR-01:v7
   |
   +── Q1:v2
   +── Q2:v1
   +── Q3:v4
   |
   v
ATTEMPT
ATT-ABC
   |
   +── SESSION
   |      SES-XYZ
   |
   +── ANSWERS
   |      Q1:v2 → YES
   |      Q2:v1 → "..."
   |      Q3:v4 → NO
   |
   v
SUBMISSION
SUB-123
   |
   v
EVALUATION
EVAL-123
   |
   +── Scoring v3
   +── Passing 70
   +── Score 84
   |
   v
RESULT
RES-123
   |
   ├── PASS
   └── Verification
          VER-123
```

---

# 110. Example Version Update

Current:

```text
Questionnaire v7
Q3:v4 = "Do you like coffee?"
Scoring v3
Passing = 70
```

Admin creates:

```text
Questionnaire v8
Q3:v5 = "Do you like traveling?"
Scoring v4
Passing = 75
```

Old Attempt:

```text
ATT-ABC
→ v7
→ Q3:v4
→ Scoring v3
→ Passing 70
→ Score 84
→ PASS
```

New Attempt:

```text
ATT-DEF
→ v8
→ Q3:v5
→ Scoring v4
→ Passing 75
```

No cross-contamination.

---

# 111. Example Double Submit

Two requests:

```text
SUBMIT request A
SUBMIT request B
```

Both target:

```text
ATT-ABC
```

Server behavior:

```text
Request A
→ wins finalization

Request B
→ sees completed/finalized state
→ does not create second final submission
→ may return existing outcome
```

Result:

```text
1 Attempt
1 Final Submission
1 Evaluation
1 Result
```

---

# 112. Example Timeout Recovery

```text
Browser
  ↓
Submit
  ↓
Network timeout
```

Unknown to browser:

```text
Server
  ↓
Submission finalized
  ↓
Evaluation completed
  ↓
Result persisted
```

User reloads:

```text
Session
→ Attempt
→ Submission
→ Result
```

No second submission.

---

# 113. Example Corruption Detection

Impossible state:

```text
Result = PASS
Score = 60
Passing = 70
```

System:

```text
Integrity Finding
Type = RESULT_RULE_MISMATCH
Severity = CRITICAL
```

Do not silently change:
- score
- result
- passing score

Investigate using historical/audit data.

---

# 114. Future Extensibility

Model should be able to support later:
- branching questionnaire
- multiple questionnaires
- different connection flows
- categories
- AI-assisted evaluation
- multi-admin roles
- multiple verification types
- external contact integrations
- localization
- analytics
- notification systems

without breaking core historical invariants.

---

# 115. Technology-Neutrality

This model intentionally does not specify:
- SQL vs NoSQL
- PostgreSQL vs another database
- ORM
- API framework
- frontend framework
- cache
- queue
- hosting

Those decisions belong to Technology Architecture.

---

# 116. Final Data Principle

The system should be understandable as:

```text
CONTENT
  ↓
VERSION
  ↓
ATTEMPT
  ↓
SESSION
  ↓
ANSWER
  ↓
SUBMISSION
  ↓
EVALUATION
  ↓
RESULT
  ↓
VERIFICATION
```

with governance surrounding it:

```text
POLICY
SCORING
AUDIT
SECURITY
INTEGRITY
```

And the most important rule is:

> **Historical execution must never depend on mutable current CMS state.**

---

# 117. Final State Principle

> **State must be explicit.**

> **Identity must be explicit.**

> **Version context must be explicit.**

> **Relationships must be explicit.**

> **Terminal states must be final for normal flow.**

> **Concurrency must be detected.**

> **Critical operations must be idempotent.**

> **Historical context must remain reconstructable.**

> **If data cannot be proven consistent, the system must flag it rather than invent a result.**

---

# 118. Next Phase

Data & State Model selesai sebagai fondasi konseptual.

Tahap berikutnya:

## Technology Architecture & Stack

Akan menentukan:
- frontend architecture
- backend/API architecture
- database
- authentication
- session/token mechanism
- cookie strategy
- CMS architecture
- deployment
- Vercel architecture
- storage
- rate limiting
- caching
- observability
- backup/recovery
- testing strategy
- CI/CD
- environment separation

Technology selection harus dievaluasi terhadap seluruh invariant dan acceptance criteria dalam tiga dokumen sebelumnya.

---

## Document End
