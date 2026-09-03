# Personal Connection Screening System
## Functional Specification
### Version 0.1

> **Status:** Draft Functional Specification  
> **Depends on:** Master System Specification v0.1  
> **Purpose:** Mendefinisikan perilaku fungsional Public Web dan Admin/CMS secara operasional sebelum security model, data model, dan technology stack dikunci.

---

# 1. Scope

Functional Specification ini mendefinisikan:

- Public Web
- Admin/CMS
- User journey
- Session behavior
- Questionnaire behavior
- Progress & resume
- Submission
- Evaluation
- Result
- Verification
- Retake
- Error handling
- Concurrency behavior
- Content management
- Questionnaire management
- Scoring/policy management
- Submission monitoring
- Audit visibility
- Integrity handling
- Acceptance criteria

Dokumen ini **tidak mengunci technology stack**.

---

# 2. Product Goal

Sistem harus membuat pengalaman berikut sesederhana mungkin:

```text
OPEN
  ↓
READ ABOUT ME
  ↓
START
  ↓
ANSWER
  ↓
RESUME IF NEEDED
  ↓
SUBMIT
  ↓
RESULT
  ↓
CONNECT
```

Sementara seluruh kompleksitas:
- versioning
- state management
- concurrency
- scoring
- authorization
- integrity
- audit
- recovery

berada di belakang layar.

---

# 3. Roles

## 3.1 Public Visitor

Belum memiliki active session.

Boleh:
- membaca public content
- melihat questionnaire introduction
- memulai session

Tidak boleh:
- melihat submission private
- melihat admin data
- mengubah content

---

## 3.2 Active Candidate/User

Memiliki active session.

Boleh:
- melanjutkan questionnaire
- melihat progress
- mengubah jawaban yang masih editable
- submit saat memenuhi requirement
- melihat result miliknya sendiri

---

## 3.3 Completed Candidate

Attempt telah final.

Boleh:
- melihat result final
- melihat verification yang public
- melakukan retake jika policy mengizinkan

Tidak boleh:
- mengubah historical answer
- mengubah score
- mengubah result
- submit kembali menggunakan attempt yang sama

---

## 3.4 Administrator

Boleh:
- mengelola content
- mengelola questionnaire
- mengelola question
- mengelola scoring
- mengelola policy
- publish/archive
- melihat submissions
- melihat audit
- menangani integrity/recovery sesuai authorization

---

# 4. Public Web Information Architecture

Recommended pages:

```text
/
├── Introduction
├── About / Profile
├── How It Works
├── Start CTA
│
├── /start
│
├── /session/{opaque-session-reference}
│
├── /result/{opaque-result-reference}
│
├── /verify/{verification-id}
│
└── /contact/{secure-reference}
```

Exact URLs dapat berubah ketika architecture dipilih.

---

# 5. Public Page: Landing / Introduction

## 5.1 Purpose

Memperkenalkan pemilik website dan menjelaskan mengapa visitor diarahkan melalui flow ini.

## 5.2 Content

Content berasal dari CMS.

Dapat mencakup:
- title
- subtitle
- profile summary
- occupation
- education
- interests
- values
- selected personal facts
- call to action
- explanation of process

Tidak boleh mengharuskan deployment code untuk perubahan text content.

---

## 5.3 Primary CTA

Contoh:

`GET STARTED`

Saat diklik:
- cek apakah browser memiliki resumable active session
- jika ada, tampilkan resume path sesuai policy
- jika tidak ada, create session

---

# 6. Returning Visitor Detection

Ketika public page dibuka:

Server/client dapat memeriksa apakah terdapat valid session continuity signal.

Possible state:

```text
NO_SESSION
ACTIVE_SESSION
COMPLETED_SESSION
EXPIRED_SESSION
REVOKED_SESSION
```

Detection tidak boleh mengandalkan browser saja sebagai source of truth.

---

# 7. Start Flow

## 7.1 New Start

Trigger:
`START`

Expected:

```text
VISITOR
  ↓
SESSION_CREATED
  ↓
ACTIVE
```

System:
1. pilih current published questionnaire
2. pilih policy yang berlaku
3. lock questionnaire version
4. lock evaluation/scoring context bila policy mengharuskan
5. calculate session expiry
6. calculate questionnaire deadline jika digunakan
7. create session
8. issue secure session continuity token/cookie
9. return next UI state

---

## 7.2 Double Start

Jika user menekan Start berkali-kali:

Expected:
- jangan membuat sejumlah active sessions tanpa alasan
- operation harus idempotent/deduplicated
- UI dapat disable button saat processing

Jika request duplicate datang ke server, server harus tetap menjaga single intended session behavior.

---

# 8. Start Confirmation Screen

Sebelum pertanyaan pertama, public web dapat menampilkan:

```text
Estimated duration
Session lifetime
Questionnaire time limit
Resume policy
Privacy note
Submission note
```

Contoh:

> This questionnaire takes approximately 3–5 minutes.
>
> Your session remains resumable for 24 hours.
>
> Once started, the questionnaire must be completed within 30 minutes.

Copy dapat diubah dari CMS.

---

# 9. Session Creation Rules

Session harus menyimpan minimal secara konseptual:

- session identity
- attempt identity
- questionnaire version
- evaluation/scoring context
- created timestamp
- expiry timestamp
- questionnaire deadline bila ada
- status
- revocation state
- progress state

Session baru tidak boleh bergantung pada current CMS configuration setelah dibuat.

---

# 10. Session Lifetime

CMS menyediakan:

`Session Lifetime`

Contoh:

`24 hours`

Saat session dibuat:

```text
created_at = server time
expires_at = created_at + configured lifetime
```

Jika admin mengubah lifetime setelah session dibuat:
- session lama tetap mengikuti expiry yang sudah ditentukan
- session baru memakai configuration terbaru

---

# 11. Questionnaire Time Limit

CMS dapat mengatur:

`Questionnaire Time Limit`

Contoh:

`30 minutes`

Perilaku:
- mulai pada event yang ditetapkan sebagai questionnaire start
- deadline dibuat berdasarkan server time
- reload tidak mereset timer
- close browser tidak mereset timer
- perubahan CMS tidak memundurkan atau memperpanjang deadline session aktif

Jika deadline terlewati, submission normal ditolak sesuai policy.

---

# 12. Cookie / Session Continuity

Cookie dipakai untuk membantu resume.

Expected properties secara konseptual:
- secure
- restricted access
- appropriate same-site policy
- expiration sesuai session lifecycle

Cookie hanya menunjuk/membantu menemukan session.

Server tetap memvalidasi:
- token
- session
- expiry
- state
- authorization

---

# 13. Refresh Behavior

Jika user refresh:

### Active session
Resume same session.

### Expired session
Show expiration state.

### Completed session
Show result/relevant completed state.

### Invalid/revoked session
Show appropriate unavailable state.

Tidak membuat session baru hanya karena refresh.

---

# 14. Close Browser

Jika browser ditutup:

- session tetap berada di server
- persisted progress tetap ada
- resume tersedia selama policy mengizinkan dan session masih valid

---

# 15. Cookie Lost / Cleared

Jika cookie hilang:

- jangan mengklaim bahwa browser adalah user baru sebagai fakta
- jangan mengambil alih session lama hanya berdasarkan IP
- bila tidak ada valid recovery mechanism, arahkan ke new session flow

Historical data session lama tetap tersimpan.

---

# 16. Incognito / Private Browser

Private browsing diperlakukan sebagai browser context yang dapat kehilangan continuity ketika context ditutup.

Tidak boleh menjanjikan resume permanen lintas private browsing session tanpa explicit recovery mechanism.

---

# 17. Resume Screen

Jika active session ditemukan:

Tampilkan:

```text
Welcome back.

You have completed 5 of 10 questions.

[ CONTINUE ]
[ START OVER ]  (only if policy allows)
```

Content text berasal dari CMS.

---

# 18. Session Expired Screen

Contoh:

```text
Your session has expired.

This questionnaire can no longer be continued.

[ START NEW ]
```

Expired bukan FAIL.

---

# 19. Questionnaire Loading

Ketika session valid:

Server memberikan questionnaire version yang sudah terkunci.

UI menampilkan:
- current question
- progress
- available controls
- validation state

Client tidak menentukan question version secara bebas.

---

# 20. Question Rendering

Question dapat memiliki configurable type, misalnya:

- single choice
- multiple choice
- text
- paragraph
- yes/no
- numeric
- other approved types

Exact supported types harus ditentukan dalam questionnaire builder.

Question rendering harus menggunakan server-defined schema.

---

# 21. Question Position

UI dapat menampilkan:

`Question 3 of 10`

Tetapi backend tetap menggunakan:

```text
question_id
question_version_id
position
```

Position tidak boleh digunakan sebagai identity.

---

# 22. Required Question

Jika required:

User tidak dapat menyelesaikan questionnaire tanpa valid answer.

UI:
- menunjukkan required indicator
- memberikan validation message

Server:
- tetap memvalidasi required status
- tidak percaya hanya pada frontend validation

---

# 23. Optional Question

Jika optional:

User boleh melanjutkan tanpa answer.

Server tetap memvalidasi bahwa question memang optional pada questionnaire version session tersebut.

---

# 24. Answer Selection

Saat user menjawab:

```text
UI
 ↓
request
 ↓
server validation
 ↓
persist
 ↓
acknowledgement
```

Answer yang belum mendapat server acknowledgement tidak boleh dianggap persisted.

---

# 25. Updating Previous Answer

Selama attempt masih editable:

User dapat kembali ke question sebelumnya dan mengubah answer.

Expected:
- server menyimpan current valid answer
- historical answer mutation event dapat dicatat bila audit policy memerlukannya
- evaluation final menggunakan valid final answer

Setelah submission completed:
- answer tidak dapat diubah melalui normal user flow.

---

# 26. Back Navigation

Jika questionnaire mengizinkan:

```text
Q5
 ↓ Back
Q4
```

User dapat mengubah answer.

Jika questionnaire tidak mengizinkan:
- Back disabled atau restricted sesuai configuration.

---

# 27. Jump Navigation

Secara default, jump navigation harus configurable.

Jika disabled:
- user mengikuti urutan.

Jika enabled:
- server tetap menerima hanya question references yang valid untuk questionnaire version.

---

# 28. Progress Indicator

Progress dapat berdasarkan:
- completed question count
- step index
- percentage

Tetapi progress yang ditampilkan harus mencerminkan server state yang diketahui.

---

# 29. Autosave

Autosave dapat terjadi:
- ketika answer berubah
- ketika user klik Next
- pada interval tertentu bila diperlukan

Autosave harus idempotent.

---

# 30. Local Draft

Local draft dapat digunakan untuk membantu UX.

Contoh:
- user mengetik jawaban
- network putus
- browser mempertahankan draft

Namun:

`LOCAL_DRAFT != SERVER_PERSISTED`

UI harus dapat menandai state bila diperlukan.

---

# 31. Offline State

Saat offline:
- tampilkan offline indicator
- jangan klaim server save berhasil
- simpan draft lokal bila tersedia
- queue/reconcile request saat reconnect sesuai policy

---

# 32. Reconnect

Saat koneksi kembali:

1. cek session server
2. cek current server state
3. validasi local draft
4. reconcile
5. simpan valid changes
6. resolve stale/conflict state

Server state tetap authoritative.

---

# 33. Concurrent Edit

Jika dua tab/device mengedit state yang sama:

Sistem harus mendeteksi stale version/concurrency conflict.

Possible user message:

> This questionnaire has changed in another tab or device. Please refresh to continue.

Jangan melakukan silent destructive overwrite.

---

# 34. Questionnaire Version Lock

Saat session dibuat:

```text
session.questionnaire_version = Vx
```

Session selalu menggunakan Vx.

Jika admin publish Vy:
- existing active session tetap Vx
- new session memakai Vy

---

# 35. Editing Question While User is Active

Jika admin mengubah Q3:

User session lama:
- tetap menerima Q3 dari version lama

New sessions:
- menerima Q3 dari version baru

Tidak ada hot swap terhadap active session.

---

# 36. Question #3 Replacement

Scenario:

Old:

`Q3 = Do you like coffee?`

New:

`Q3 = Do you like traveling?`

Expected:
- old answer tetap terkait old question version
- new question version dianggap belum dijawab pada new questionnaire version
- tidak menggunakan question number sebagai resume identity

---

# 37. Question Deleted

Jika deleted dari draft:
- tidak tampil pada future published version.

Jika sudah historically used:
- historical object/reference tetap tersedia
- dapat menjadi archived/inactive
- historical submissions tetap dapat dibaca.

---

# 38. Question Added

Draft:
- ditambahkan ke draft.

Published:
- create new questionnaire version.

Existing sessions tidak mendapatkan question baru.

---

# 39. Question Reordered

Draft/new version dapat mengubah order.

Existing session tidak berubah.

---

# 40. Required/Optional Change

Perubahan required/optional terhadap published content membuat new version.

Historical session mengikuti version sebelumnya.

---

# 41. Answer Option Change

Jika option berubah pada published questionnaire:
- future version menggunakan option set baru
- historical answers tetap menunjuk ke historical option identity/context

Jangan mengubah makna historical answer secara destructive.

---

# 42. Questionnaire Archived

Archived questionnaire:
- tidak dipakai untuk new sessions
- historical session/submission tetap dapat mereferensikan version tersebut

---

# 43. Questionnaire Deleted

Hard delete tidak digunakan untuk historical questionnaire/version yang masih mempunyai dependency.

Operational behavior:
- archive/inactive
- preserve references

---

# 44. Navigation to Submit

Ketika semua required questions valid:

```text
[ SUBMIT ]
```

tersedia.

Jika belum:

```text
[ SUBMIT ] disabled
```

atau submit attempt ditolak dengan validation feedback.

Server tetap memeriksa ulang.

---

# 45. Submit Review Screen

Recommended optional screen:

```text
You're almost done.

Questions answered: 10/10

[ REVIEW ]
[ SUBMIT ]
```

Review screen content dapat dikonfigurasi.

---

# 46. Submit Validation

Server memeriksa:

1. session exists
2. session belongs to valid credential
3. session active
4. session not expired
5. time limit valid
6. questionnaire version matches
7. all required answers present
8. option references valid
9. answer types valid
10. attempt not already completed
11. concurrency check valid
12. payload valid

---

# 47. Submit State Transition

Conceptual:

```text
ACTIVE
  ↓
SUBMITTING
  ↓
EVALUATING
  ↓
COMPLETED
```

If recoverable failure:

```text
SUBMITTING
  ↓
RECOVERABLE_ERROR
```

If evaluation failure:

```text
EVALUATING
  ↓
EVALUATION_ERROR
```

---

# 48. Double Submit

User clicks Submit repeatedly.

Expected:
- only one final submission
- duplicate requests are safely deduplicated/rejected
- no duplicate result
- no duplicate verification

User should receive one authoritative final state.

---

# 49. Refresh During Submit

If browser refreshes while submit is processing:

On return:
- server determines current state
- if completed, show result
- if still processing, show processing
- if recoverable error, show retry/recovery
- never assume "not received" means "not submitted"

---

# 50. Network Timeout During Submit

Case:

Server completes:
`PASS`

Browser receives timeout.

On reload:
- retrieve persisted submission/result
- do not create duplicate submission

---

# 51. Two Simultaneous Submit Requests

Server must ensure:

```text
request A
request B
     ↓
one final submission
```

Only one wins finalization.

Other request receives:
- already processed
- current result
- or safe equivalent response

---

# 52. Submit After Completion

Expected:

`SUBMISSION_ALREADY_COMPLETED`

No mutation.

---

# 53. Submit After Expiration

Expected:

`SESSION_EXPIRED`

No result generated unless explicit recovery policy exists.

---

# 54. Submit With Unknown Question

If payload includes question not belonging to session questionnaire version:

Reject invalid payload.

Do not silently add or evaluate it.

---

# 55. Submit With Wrong Questionnaire Version

Reject.

Client cannot choose another version.

---

# 56. Score Calculation

Server obtains evaluation inputs from trusted persisted context.

Client-provided:
- score
- result
- weight
- passing score

are ignored as authoritative values.

---

# 57. Evaluation Flow

```text
Validated Answers
      ↓
Questionnaire Version
      ↓
Scoring Version
      ↓
Scoring Rules
      ↓
Calculate Score
      ↓
Apply Passing Rule
      ↓
Generate Result
      ↓
Persist Immutable Evaluation
```

---

# 58. PASS / FAIL

Default:

```text
score >= passing_score
    => PASS

score < passing_score
    => FAIL
```

Can be configurable if the evaluation model supports it.

---

# 59. Exact Passing Score

Example:

```text
Score = 70
Passing = 70
```

Default result:

`PASS`

---

# 60. Scoring Error

If evaluation cannot be trusted:

Do NOT return:
- PASS
- FAIL

Instead:

`EVALUATION_ERROR`

or recovery state.

---

# 61. Result Persistence

Final result must store or reference enough historical context to explain:
- questionnaire version
- scoring version
- passing score
- calculated score
- final result
- completion timestamp

---

# 62. Result Page

## PASS

Suggested UI:

```text
YOU'RE IN. 🟢

Looks like we have something worth talking about.

Verification ID:
CNX-XXXXXX

[ CONTINUE TO CHAT ]
```

Copy is CMS-driven.

---

## FAIL

Suggested UI:

```text
NOT A MATCH FOR THIS CONNECTION FLOW. 🔴

Thank you for taking the time.

[ CLOSE ]
```

Avoid insulting or judgmental language.

Copy is CMS-driven.

---

# 63. Result Refresh

Refreshing result page must show the same persisted result.

No recalculation against current CMS.

---

# 64. Result URL

Result URL should use opaque/non-sequential reference.

It must not rely on a guessable integer ID as authorization.

---

# 65. Result Ownership

User can only access result associated with valid session/authorized reference.

Never expose another candidate's result.

---

# 66. Verification

Final result may receive:

`verification_id`

Verification references immutable submission/result context.

---

# 67. Public Verification

Public verification may expose:

- valid/invalid
- PASS/FAIL if policy permits
- verification ID
- completion date
- questionnaire/version identifier or friendly version label if desired

Must not automatically expose:
- private answers
- internal score details if not intended
- IP
- security signals
- internal audit data

---

# 68. Admin Verification View

Admin can inspect:
- verification
- submission
- score
- result
- questionnaire version
- scoring version
- attempt
- session
- audit events
- integrity state

subject to admin authorization.

---

# 69. Contact / Chat Gate

If result is PASS and policy permits:

```text
PASS
 ↓
verification
 ↓
contact access
```

If FAIL:

Contact gate remains unavailable.

The exact contact channel can be configurable later:
- direct contact
- chat
- external link
- messaging platform
- custom connection form

---

# 70. Conversation Context

Optional feature:

Upon PASS, system can prepare a private candidate summary for admin.

Example:

```text
New Connection

Purpose: Friendship
Score: 87
Questionnaire: v13

Highlights:
- ...
- ...
- ...

Suggested opener:
...
```

This is admin-side utility and must not expose private/internal information to candidate.

---

# 71. Retake Detection

When user returns after completed attempt:

System checks:
- current questionnaire version
- previous attempts
- repeat policy
- max attempts
- cooldown

---

# 72. Retake: Never

If policy:

`NEVER`

User sees previous result/completion state but cannot create new attempt.

---

# 73. Retake: On New Version

If:
- previous attempt exists
- new questionnaire version is current
- policy allows

Show:

> A new version is available.

`[ TAKE AGAIN ]`

---

# 74. Retake: Cooldown

If cooldown exists:

Example:

`7 days`

Before cooldown ends:

> You can try again after {date/time}.

Server enforces cooldown.

Client cannot bypass it by changing system clock.

---

# 75. Retake: Max Attempts

If:

`max_attempts = 3`

Attempt #4 must be rejected unless admin override policy exists.

---

# 76. Multiple Attempts

Each attempt is independent.

Example:

```text
Attempt 1 → v4 → PASS
Attempt 2 → v5 → FAIL
Attempt 3 → v6 → PASS
```

All remain historical records.

---

# 77. PASS in Old Version, FAIL in New Version

Valid state.

UI/admin should distinguish versions.

Do not treat it as contradictory.

---

# 78. FAIL in Old Version, PASS in New Version

Also valid.

---

# 79. Admin Dashboard

Recommended overview:

```text
Active Sessions
Completed Attempts
PASS
FAIL
Expired
Abandoned
Evaluation Errors
Integrity Errors
Recent Activity
```

Metrics are informational and must not replace source-of-truth records.

---

# 80. CMS Content Module

Admin can manage:

## Profile

- name/display name
- occupation
- education
- bio
- interests
- values
- selected facts
- links

## Landing Copy

- hero
- explanation
- CTA
- section labels

## Result Copy

- PASS message
- FAIL message
- resume message
- expired message
- error messages
- contact gate message

---

# 81. CMS Question Builder

Question builder should support:

- question text
- description
- type
- required/optional
- options
- order
- scoring reference
- active/inactive state
- version status

---

# 82. CMS Draft Behavior

Draft may be freely edited according to admin permissions.

Changes do not affect active published sessions.

---

# 83. Create New Questionnaire Version

Recommended flow:

```text
Published v7
   ↓
Create New Version
   ↓
Draft v8
   ↓
Edit
   ↓
Validate
   ↓
Publish
```

Publishing v8 does not mutate v7.

---

# 84. Publish Validation

Before publish, CMS should validate:
- questionnaire has valid structure
- required questions have valid definitions
- options are valid
- references are valid
- scoring references exist
- no impossible configuration
- no duplicate ordering conflicts
- policy is coherent

Publish should fail rather than publish known-invalid configuration.

---

# 85. Edit Published Version

Normal behavior:

> Published version is immutable.

CMS should offer:

`CREATE NEW VERSION`

instead of destructive edit.

---

# 86. CMS Warning

If an admin attempts to alter content that already has historical use:

> This content is already used by historical submissions. A new version will be created so previous results remain unchanged.

---

# 87. Scoring Management

Admin can create/configure:
- scoring rules
- weights
- formulas
- passing score
- scoring version

Published scoring context must be versioned.

---

# 88. Passing Score Change

Changing passing score:
- affects future evaluations according to new version
- does not retroactively change completed results

---

# 89. Scoring Rule Change

Changing scoring:
- creates/version new evaluation context
- active old sessions continue using locked context
- historical submissions remain unchanged

---

# 90. Session Policy Management

CMS can configure:

```text
Session Lifetime
Questionnaire Time Limit
Allow Resume
```

Changes apply according to effective policy for new sessions unless explicit migration workflow exists.

---

# 91. Repeat Policy Management

CMS can configure:

```text
Repeat Mode
Maximum Attempts
Cooldown
New Version Retake
```

Policy changes should be versioned if needed to explain historical decisions.

---

# 92. Submission Monitoring

Admin can filter by:
- date
- result
- questionnaire version
- status
- attempt
- session
- verification
- integrity state

---

# 93. Submission Detail

Admin should be able to inspect:

```text
Attempt
Session
Questionnaire Version
Questions / Answers
Scoring Version
Score
Passing Score
Result
Verification
Timestamps
Audit Events
Integrity State
```

---

# 94. Admin Search

Search should support safe identifiers such as:
- submission reference
- session reference
- verification ID

Avoid exposing overly broad personal data through unrestricted search.

---

# 95. Audit View

Admin can inspect events such as:

```text
SESSION_CREATED
SESSION_RESUMED
ANSWER_SAVED
ANSWER_UPDATED
SESSION_EXPIRED
SESSION_REVOKED
QUESTIONNAIRE_VERSION_CREATED
QUESTIONNAIRE_PUBLISHED
SUBMISSION_STARTED
SUBMISSION_FINALIZED
EVALUATION_STARTED
EVALUATION_COMPLETED
RESULT_GENERATED
VERIFICATION_CREATED
ADMIN_POLICY_CHANGED
INTEGRITY_ERROR_DETECTED
```

---

# 96. Integrity Dashboard

Recommended categories:

```text
Healthy
Warnings
Critical
```

Examples:
- impossible state
- orphaned record
- invalid reference
- duplicate final submission
- scoring mismatch
- session/version mismatch

---

# 97. Admin Recovery

Recovery actions must be explicit and audited.

Possible actions:
- retry evaluation
- revoke session
- invalidate token
- mark known data inconsistency
- initiate controlled administrative correction

Do not silently overwrite historical data.

---

# 98. Impossible State Handling

Example:

```text
PASS
score = 50
passing = 70
```

Expected:
- flag `INTEGRITY_ERROR`
- do not silently rewrite result
- make the issue visible to admin

---

# 99. Browser Compatibility

If unsupported browser/feature is detected:
- show clear compatibility message
- provide safe fallback when possible
- do not corrupt state due to unsupported browser

Exact browser matrix belongs to deployment/testing specification.

---

# 100. Error UX Principles

Public errors should be:
- understandable
- non-technical
- actionable
- non-leaky

Avoid exposing:
- stack traces
- SQL errors
- internal IDs
- security details
- server internals

---

# 101. Error Categories

Public experience should distinguish conceptually:

```text
NETWORK_ERROR
SESSION_EXPIRED
SESSION_REVOKED
VALIDATION_ERROR
CONFLICT_ERROR
SUBMISSION_PROCESSING
EVALUATION_ERROR
TEMPORARY_SYSTEM_ERROR
INTEGRITY_ERROR
NOT_AUTHORIZED
NOT_FOUND
```

Public wording can be CMS-driven where safe.

---

# 102. No Silent Failure

Critical operations should result in:
- success acknowledgement
- retryable error
- explicit conflict
- explicit expiration
- explicit unavailable state

Never silently discard an answer or submit request.

---

# 103. Concurrency Acceptance

The system must remain correct when:
- two tabs submit
- multiple devices submit
- stale requests arrive late
- browser retries
- network retries
- browser refreshes during processing

---

# 104. Security Boundary in Functional Behavior

Client may request:

```text
save answer
submit
resume
view result
```

Server decides whether the operation is allowed.

---

# 105. Public-to-Admin Separation

Public web must never receive:
- CMS editing capabilities
- administrative audit data
- internal scoring rules unless explicitly designed to expose them
- security metadata
- private candidate summaries

---

# 106. Content Update Behavior

If admin changes a normal CMS text field:
- future page loads reflect new content according to publication behavior.

If admin changes historical evaluation content:
- must use versioning.

Content classification matters:
- display-only content may update normally
- evaluation-affecting content must be versioned

---

# 107. Display Content vs Evaluation Content

## Display-only

Examples:
- hero title
- bio
- decorative text
- general explanation

May update without altering historical result.

## Evaluation-affecting

Examples:
- questions
- options
- required flag
- scoring
- passing score
- branching rules
- questionnaire structure

Must be versioned when published.

---

# 108. Draft Preview

Admin should be able to preview draft questionnaire as candidate.

Preview must not:
- create production submission
- affect historical data
- consume attempt quota
- generate real verification

---

# 109. Test Mode

Recommended CMS test mode:

```text
PREVIEW / TEST
```

Allows admin to simulate:
- answer flow
- score
- PASS/FAIL
- required validation
- timer UI

Without creating production candidate data.

---

# 110. Publish Confirmation

Before publish:

```text
Publishing Version 14 will:
- become current version for new sessions
- leave active sessions on previous versions
- preserve historical submissions

[ CANCEL ]
[ PUBLISH ]
```

This makes impact explicit.

---

# 111. Archive Confirmation

Admin sees:

> Archiving this version will prevent new sessions from using it. Historical submissions remain available.

---

# 112. Destructive Action Protection

For important actions:
- confirmation
- clear consequences
- authorization
- audit event

Examples:
- revoke session
- archive questionnaire
- archive question
- policy changes
- admin correction

---

# 113. Admin Concurrent Editing

If two admins edit same draft:

Expected:
- detect stale editor state
- avoid silent overwrite
- show conflict resolution/reload path

---

# 114. Session Revocation

Admin can revoke active session if authorized.

After revocation:
- session requests rejected
- existing browser state cannot continue normal flow
- audit event created

---

# 115. Verification Revocation

If product policy later supports revocation:
- public verification reflects current verification status
- original submission history remains immutable
- revocation action is audited

Default MVP may omit revocation if unnecessary.

---

# 116. Privacy-Oriented Functional Rules

Collect only data needed for:
- session continuity
- questionnaire
- result
- security/abuse prevention
- audit requirements

Do not expose internal metadata to candidate.

---

# 117. User Notifications

Public system may use:
- inline validation
- toast
- modal
- banner
- status page
- result state

Exact UI patterns can be finalized during UI specification.

---

# 118. State-aware UI

UI should always reflect server-authoritative state.

Example:

```text
ACTIVE
→ questionnaire UI

SUBMITTING
→ processing UI

EVALUATING
→ evaluation UI

COMPLETED
→ result UI

EXPIRED
→ expired UI

REVOKED
→ unavailable UI
```

---

# 119. Loading Behavior

For critical actions:
- prevent duplicate click while request is in progress
- server still protects against duplicate requests
- show meaningful processing state

UI lock alone is not a security control.

---

# 120. Empty States

Examples:

No active questionnaire:

> The connection questionnaire is currently unavailable.

No historical attempts:

> No previous attempt found.

No audit events:

> No audit events available.

---

# 121. Not Found vs Unauthorized

Do not expose whether another user's private resource exists.

Public error behavior may use generic:

> This session or result is unavailable.

---

# 122. Auditability Requirement

Every critical state-changing admin action must have enough context to answer:
- who performed it
- what changed
- when
- what object was affected
- what version was involved

---

# 123. Functional Priority

## P0

Required for first production release:

- session correctness
- session/version lock
- answer validation
- required question validation
- autosave/persistence
- resume
- submit idempotency
- evaluation correctness
- result persistence
- historical immutability
- authorization boundaries
- basic verification
- basic audit
- error/recovery states
- CMS content/question versioning

## P1

Highly recommended:

- advanced multi-device behavior
- richer audit UI
- advanced recovery tooling
- sophisticated abuse controls
- test-mode tooling
- richer analytics
- admin conflict resolution UX

## P2

Post-MVP:

- advanced personalization
- advanced AI candidate summary
- sophisticated analytics
- advanced automation
- cosmetic enhancements
- additional integrations

---

# 124. Acceptance Criteria — Public

## PUB-01
Visitor can read public content without creating a session.

## PUB-02
Start creates one valid active session.

## PUB-03
Refresh resumes active session.

## PUB-04
Closing browser does not destroy server-side progress.

## PUB-05
Expired session cannot submit.

## PUB-06
Active session uses fixed questionnaire version.

## PUB-07
Question changes do not affect active historical session.

## PUB-08
Answer changes persist correctly.

## PUB-09
Optional questions can be skipped.

## PUB-10
Required questions cannot be skipped for valid submit.

## PUB-11
Double submit cannot create duplicate final submission.

## PUB-12
Submit timeout can recover through server state.

## PUB-13
Result refresh shows same final result.

## PUB-14
User cannot access another user's private result.

## PUB-15
PASS opens allowed contact flow.

## PUB-16
FAIL does not open restricted contact flow.

---

# 125. Acceptance Criteria — Versioning

## VER-01
Published questionnaire versions are immutable.

## VER-02
Question identity is not based on position number.

## VER-03
Changing Q3 creates a new question/version context.

## VER-04
Historical answer remains attached to historical question version.

## VER-05
Active sessions do not switch versions after publish.

## VER-06
Historical result does not change when current scoring changes.

## VER-07
Historical result does not change when current passing score changes.

---

# 126. Acceptance Criteria — Session

## SES-01
Session has created/expiry lifecycle.

## SES-02
Cookie expiry does not override server expiry.

## SES-03
Deleted cookie does not grant access to another session.

## SES-04
Session can be revoked.

## SES-05
Completed session cannot receive normal answer mutations.

## SES-06
Expired session remains auditable.

---

# 127. Acceptance Criteria — Submission

## SUB-01
Only valid active sessions may submit.

## SUB-02
Server validates all answer references.

## SUB-03
Server calculates score.

## SUB-04
Client-provided score/result is ignored as authoritative input.

## SUB-05
Duplicate submissions resolve to one final submission.

## SUB-06
Late/stale requests cannot overwrite new state.

---

# 128. Acceptance Criteria — CMS

## CMS-01
Display-only content is editable without source-code change.

## CMS-02
Questions can be created/edited in draft.

## CMS-03
Published questionnaire can create new versions.

## CMS-04
Historical versions remain available.

## CMS-05
Scoring can be versioned.

## CMS-06
Session policy can be configured.

## CMS-07
Retake policy can be configured.

## CMS-08
Admin can inspect submissions.

## CMS-09
Critical changes are auditable.

---

# 129. Acceptance Criteria — Integrity

## INT-01
Impossible state can be detected.

## INT-02
Impossible state does not silently become valid PASS/FAIL.

## INT-03
System can identify version mismatch.

## INT-04
System can identify duplicate final submission attempt.

## INT-05
Historical references remain resolvable after archive.

---

# 130. Functional Edge Case Matrix

| Scenario | Expected Behavior | Priority |
|---|---|---|
| Start clicked multiple times | Single intended active session | P0 |
| Refresh after Start | Resume same session | P0 |
| Browser closed | Resume if session valid | P0 |
| Session expired | Expired state, not FAIL | P0 |
| Cookie deleted | No unsafe automatic ownership recovery | P0 |
| Admin publishes new version | New sessions use new version | P0 |
| Active user during publish | Existing session remains old version | P0 |
| Q3 replaced | New version has different question context | P0 |
| Required question skipped | Submit rejected | P0 |
| Optional question skipped | Allowed | P0 |
| Double submit | One final submission | P0 |
| Submit timeout | Recover from server state | P0 |
| Two tabs submit | One authoritative final state | P0 |
| Multi-device edit | Concurrency rules apply | P0/P1 |
| Score sent by client | Ignored; server recalculates | P0 |
| Passing score changed | Historical result unchanged | P0 |
| Retake after version change | Allowed only by policy | P1 |
| VPN/IP change | Does not automatically invalidate | P1 |
| Questionnaire archived | No new sessions, history retained | P0 |
| Historical question removed from CMS | Reference remains resolvable | P0 |

---

# 131. End-to-End Example

## Candidate A

### 12:00

Opens:

`/`

Reads profile.

No session exists.

Clicks:

`START`

---

### 12:00:01

Server creates:

```text
Attempt #001
Session #X
Questionnaire v7
Session expires 13:00
Questionnaire deadline 12:30
```

---

### 12:03

User answers Q1–Q4.

Progress persisted.

---

### 12:04

Browser closed.

Session remains active.

---

### 12:15

User returns.

Cookie resumes Session #X.

UI:

> Welcome back. Continue from Question 5.

---

### 12:17

Admin publishes Questionnaire v8.

Candidate still continues on:

`v7`

---

### 12:20

Candidate reaches Q7.

Admin has changed the former Q7 in v8.

Candidate still sees Q7 from v7.

---

### 12:24

Candidate submits.

Server validates:
- Session = active
- Questionnaire = v7
- required answers = complete
- submission = not completed

Evaluation:
- scoring v3
- passing = 70
- score = 84

Result:

`PASS`

Verification created.

---

### 12:25

Browser fails to receive response.

User refreshes.

Server sees:

```text
Attempt #001
Submission = COMPLETED
Result = PASS
```

UI shows:

> YOU'RE IN. 🟢

No second submission is created.

---

# 132. Second Example — Question Replacement

Version 4:

```text
Q1 = q101:v1
Q2 = q102:v1
Q3 = q103:v1 → "Do you like coffee?"
```

User answers:

```text
q103:v1 = YES
```

Admin creates v5:

```text
Q3 = q103:v2 → "Do you like traveling?"
```

New attempt starts on v5.

System checks:

```text
q103:v2 answered?
```

Result:

`NO`

It does NOT check:

```text
Q3 answered?
```

This prevents answer contamination.

---

# 133. Third Example — Session Timeout

Configuration:

```text
Session Lifetime = 24h
Questionnaire Time Limit = 30m
```

User starts at:

`10:00`

Session expires:

`10:00 next day`

Questionnaire deadline:

`10:30`

User closes browser at:

`10:20`

Returns at:

`10:25`

Can resume.

Returns at:

`10:45`

Session may still exist technically, but questionnaire time limit has expired.

System applies configured timeout behavior.

No automatic FAIL unless business policy explicitly defines such a result.

---

# 134. Functional Non-Goals for MVP

Unless separately approved, MVP does not require:
- automatic identity matching across devices
- guaranteed person-level identity detection
- invasive browser fingerprinting
- automatic cross-device session recovery
- AI-based final evaluation
- complex branching logic
- direct messaging integration
- multi-admin role hierarchy beyond basic authorization
- complex analytics suite

These may be added later without changing core invariants.

---

# 135. Open Decisions Before Security/Data Design

The following items need explicit decisions before implementation:

1. Exact questionnaire question types for MVP.
2. Whether Back navigation is always enabled.
3. Whether jump navigation exists.
4. Exact session lifetime default.
5. Exact questionnaire time limit default.
6. Whether questionnaire timer is absolute or active-time.
7. Whether active session can be used on multiple devices.
8. Whether a completed FAIL can retake the same version.
9. Default maximum attempts.
10. Default cooldown.
11. Whether public verification displays PASS/FAIL.
12. Exact contact method after PASS.
13. Whether result score is publicly displayed.
14. Whether candidate name/contact is collected.
15. Whether candidate summary is generated.
16. Whether branching questions are needed in MVP.
17. Whether admin approval for retake is needed.
18. Whether session revocation is needed in MVP.
19. Whether verification revocation is needed in MVP.
20. Whether content translations are needed.

These are product decisions, not blockers to the core architecture.

---

# 136. Functional Specification Completion Gate

Before moving to Security & Threat Model, the team should be able to answer:

```text
[ ] What happens on every primary user action?
[ ] What happens on refresh?
[ ] What happens when browser closes?
[ ] What happens when session expires?
[ ] What happens when questions change?
[ ] What happens when scoring changes?
[ ] What happens when network fails?
[ ] What happens on duplicate requests?
[ ] What happens on two tabs/devices?
[ ] What happens on retake?
[ ] What can admin edit?
[ ] What requires a new version?
[ ] What is immutable?
[ ] What does user see for every major error?
[ ] What can be audited?
[ ] What is the exact PASS/FAIL gate?
```

If these have deterministic answers, the system is ready for the next engineering specification.

---

# 137. Next Documents

After this Functional Specification:

## 1. Security & Threat Model

Will define:
- trust boundaries
- session security
- token security
- authorization
- replay
- CSRF/XSS considerations
- enumeration
- abuse/rate limiting
- IP/VPN
- browser/device signals
- admin security
- privacy

## 2. Data & State Model

Will define:
- entities
- relationships
- identifiers
- versions
- state transitions
- constraints
- immutable records
- transaction boundaries
- concurrency
- audit schema

## 3. Technology Architecture

Only after 1 and 2:
- stack
- infrastructure
- deployment
- database
- cache
- observability
- CI/CD
- external services

---

# 138. Final Functional Principle

The intended behavior can be summarized as:

```text
PUBLIC EXPERIENCE
Simple
        ↓
SESSION
Controlled
        ↓
QUESTIONNAIRE
Version-locked
        ↓
ANSWERS
Server-persisted
        ↓
SUBMISSION
Idempotent
        ↓
EVALUATION
Server-authoritative
        ↓
RESULT
Immutable
        ↓
VERIFICATION
Auditable
        ↓
CONTACT
Policy-gated
```

And on the administration side:

```text
CMS
  ↓
DRAFT
  ↓
VALIDATE
  ↓
PUBLISH NEW VERSION
  ↓
NEW SESSIONS USE NEW VERSION
  ↓
OLD SESSIONS REMAIN UNCHANGED
  ↓
HISTORICAL SUBMISSIONS REMAIN IMMUTABLE
```

---

## Document End
