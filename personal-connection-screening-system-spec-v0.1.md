# Personal Connection Screening System
## Master System Specification
### Version 0.1 — Behavior, Functional, Security, Data & State Foundation

> **Status:** Draft Foundation  
> **Purpose:** Menjadi source of truth sebelum pemilihan technology stack dan implementation.  
> **Scope:** Public Web + Admin/CMS + Session + Questionnaire + Evaluation + Verification + Audit.

---

# 1. Executive Summary

Sistem ini adalah **personal connection gateway** yang memungkinkan pemilik website memberikan informasi tentang dirinya terlebih dahulu kepada orang yang ingin mengenal atau menghubunginya.

Alih-alih setiap orang memulai percakapan dengan pola yang sama:

> "Halo, nama kamu siapa? Salam kenal."

user diarahkan ke website yang berisi:

1. Informasi tentang pemilik.
2. Penjelasan mengenai tujuan website.
3. Questionnaire/screening.
4. Evaluation berdasarkan jawaban.
5. Result `PASS` atau `FAIL`.
6. Verification untuk result final.
7. Akses lanjutan/contact hanya jika memenuhi policy.

Sistem terdiri dari dua interface:

- **Public Web:** pengalaman user.
- **Admin/CMS:** pusat pengelolaan seluruh content dan configuration yang memang diperbolehkan untuk diubah.

Kompleksitas teknis harus berada di belakang layar sehingga pengalaman user tetap sederhana.

---

# 2. Core Principle

## 2.1 Server is the Source of Truth

Client/browser dianggap **untrusted**.

Client boleh mengirim:
- answer
- progress
- navigation intent
- session token

Client tidak boleh menjadi sumber kebenaran untuk:
- score
- PASS/FAIL
- completion state
- questionnaire version
- scoring version
- verification validity
- ownership/authorization

Semua keputusan final ditentukan dan divalidasi server.

---

## 2.2 Historical Data is Immutable

Submission yang telah final tidak boleh berubah hanya karena:
- questionnaire baru dipublish,
- question diedit,
- scoring diubah,
- passing score diubah,
- policy berubah,
- data CMS saat ini berubah.

History harus selalu dapat direkonstruksi.

---

## 2.3 Version Everything That Affects Evaluation

Minimal:
- Questionnaire Version
- Question Version
- Answer Option Version/Identity
- Scoring Version
- Policy Version bila policy memengaruhi result/attempt behavior

Sebuah submission harus dapat menjawab:

> "Dengan content dan rules versi apa result ini dihasilkan?"

---

## 2.4 Session is Not Person Identity

Session merepresentasikan satu perjalanan pengisian.

Session bukan:
- orang,
- IP address,
- browser,
- device,
- cookie,
- verification identity.

IP/cookie/device hanya dapat digunakan sebagai supporting signal atau mekanisme session continuity.

---

## 2.5 Question Number is Not Question Identity

"Question 3" hanya menunjukkan posisi.

Identity ditentukan oleh:
- `question_id`
- `question_version_id`

Dengan demikian pertanyaan nomor 3 boleh berubah tanpa membuat jawaban lama dianggap menjawab pertanyaan baru.

---

# 3. System Components

## 3.1 Public Web

Fungsi:
- menampilkan personal profile
- menampilkan explanation/introduction
- membuat session
- menjalankan questionnaire
- menyimpan progress
- resume session
- submit
- menampilkan result
- menampilkan verification
- membuka contact/chat bila permitted

---

## 3.2 Admin/CMS

Fungsi:
- profile/content management
- questionnaire management
- question builder
- option management
- scoring management
- policy management
- version management
- publish/archive
- sessions monitoring
- submissions monitoring
- result monitoring
- verification
- audit log
- integrity monitoring

---

## 3.3 Evaluation Engine

Fungsi:
- validasi answer
- menerapkan scoring rule
- menghitung score
- menentukan PASS/FAIL
- membuat immutable evaluation record

Evaluation tidak boleh bergantung pada score yang dikirim client.

---

## 3.4 Session Engine

Fungsi:
- create session
- resume
- expiration
- revoke
- state transition
- concurrency handling
- session-version locking

---

## 3.5 Audit & Integrity Layer

Fungsi:
- mencatat event penting
- mendeteksi impossible state
- menyimpan histori perubahan kritis
- mendukung investigasi/recovery

---

# 4. Public User Journey

## 4.1 First Visit

User membuka public URL.

Belum membuat session.

State:

`VISITOR`

User dapat membaca content tanpa membuat session.

---

## 4.2 Start

User menekan `START`.

Server:
1. menentukan current published questionnaire.
2. menentukan applicable policy.
3. membuat session/attempt.
4. mengunci questionnaire version untuk session tersebut.
5. menentukan expiry/deadline.
6. membuat secure session token/cookie.
7. mengembalikan state session kepada client.

Start berulang kali harus idempotent terhadap active session sesuai policy.

---

## 4.3 Before Questionnaire

Sebelum pertanyaan pertama, public web dapat menampilkan:
- estimasi durasi
- aturan resume
- penjelasan penggunaan jawaban
- time limit bila aktif
- informasi bahwa result ditentukan server

---

## 4.4 Questionnaire

User mengerjakan pertanyaan satu per satu atau dalam bentuk flow yang ditentukan CMS.

Progress:
- tersimpan secara server-side
- dapat memiliki local draft untuk UX
- server state adalah authoritative

---

## 4.5 Resume

Jika session masih valid dan resume diizinkan:
- browser dapat melanjutkan dari progress terakhir
- session tetap menggunakan questionnaire version saat session dibuat
- hasil resume ditentukan berdasarkan server state

---

## 4.6 Submit

User menyelesaikan questionnaire.

Server:
1. memvalidasi session.
2. memvalidasi state.
3. memvalidasi questionnaire version.
4. memvalidasi seluruh answer.
5. memastikan required answer lengkap.
6. memastikan answer option valid.
7. memastikan attempt belum final.
8. mengunci/finalisasi submission secara aman.
9. menjalankan evaluation.
10. menyimpan score/result.
11. membuat verification record.
12. mengembalikan result.

---

## 4.7 Result

Result final:
- tidak dihitung ulang hanya karena refresh.
- tidak berubah karena CMS berubah.
- terkait dengan submission tertentu.
- memiliki questionnaire/scoring context.
- dapat memiliki verification ID.

---

# 5. Session Model

## 5.1 Session States

```text
NEW
  |
  v
ACTIVE
  |
  +--> COMPLETED
  |
  +--> ABANDONED
  |
  +--> EXPIRED
  |
  +--> REVOKED
```

`PASS`/`FAIL` bukan session state.

---

## 5.2 Session Lifetime

CMS memiliki konfigurasi:

```text
Session Lifetime
Allow Resume
```

Contoh:

```text
Session Lifetime = 24 hours
```

Jika session dibuat:
- `created_at` = waktu server saat create
- `expires_at` = created_at + 24h

Session baru membaca konfigurasi saat session dibuat.

Perubahan CMS tidak otomatis memperpanjang session lama.

---

## 5.3 Questionnaire Time Limit

Berbeda dengan session lifetime.

CMS dapat memiliki:

```text
Questionnaire Time Limit
```

Contoh:

```text
Session Lifetime = 24h
Questionnaire Time Limit = 30m
```

Artinya:
- user punya sampai 24 jam untuk resume session,
- tetapi setelah questionnaire dimulai, deadline pengerjaan adalah 30 menit jika policy menggunakan absolute timer.

Keduanya harus disimpan terpisah.

---

## 5.4 Cookie

Cookie digunakan sebagai mekanisme session continuity.

Cookie:
- secure
- HTTP-only bila sesuai
- same-site policy yang tepat
- memiliki expiration yang relevan dengan session lifetime

Tetapi cookie **bukan source of truth**.

Pada setiap request sensitif server memverifikasi:
- token valid
- session ada
- session belum expired
- session belum revoked
- state transition valid

Jika cookie hilang, session tidak otomatis menjadi milik user lain.

---

# 6. Session Scenarios

## 6.1 Start Clicked Multiple Times

Expected:
- tidak membuat banyak active session secara tidak sengaja.
- operasi harus idempotent atau memiliki deduplication behavior.

---

## 6.2 Refresh

Expected:
- resume session yang sama bila session masih valid.
- tidak membuat session baru.

---

## 6.3 Browser Closed

Expected:
- session tetap ada di server.
- user dapat resume bila cookie/session continuity masih tersedia dan session belum expired.

---

## 6.4 Session Expired

Expected:
- session menjadi `EXPIRED`.
- tidak dapat submit.
- tidak dianggap `FAIL`.
- histori tetap tersedia.
- policy menentukan apakah user dapat membuat attempt baru.

---

## 6.5 Session Completed

Expected:
- session tidak lagi menerima answer mutation.
- submit ulang ditolak.
- result tetap tersedia.

---

# 7. Questionnaire Architecture

## 7.1 Questionnaire

Satu questionnaire memiliki:
- identity
- version
- status
- published timestamp
- archive state
- settings
- question order
- evaluation references

---

## 7.2 Questionnaire Version Lifecycle

```text
DRAFT
  |
  v
REVIEW (optional)
  |
  v
PUBLISHED
  |
  v
ARCHIVED
```

Published version yang telah digunakan tidak diedit di tempat.

Perubahan menghasilkan version baru.

---

## 7.3 Active Version

Pada waktu tertentu dapat ada satu current published version untuk flow tertentu.

Session baru menggunakan current published version.

Session lama mempertahankan version yang dikunci.

---

# 8. Question Architecture

## 8.1 Question Identity

Question memiliki:
- `question_id`
- satu atau lebih versions

Question number/order bukan identity.

---

## 8.2 Question Version

Question version memegang:
- text
- description/help
- type
- required state
- answer structure
- option set reference
- scoring reference
- metadata

Published question version tidak diedit.

---

## 8.3 Editing Question 3

Contoh:

```text
v1:
Q3 = "Apakah kamu suka kopi?"
```

Kemudian admin ingin:

```text
Q3 = "Apakah kamu suka traveling?"
```

Jangan melakukan mutation terhadap historical version.

Buat version baru:

```text
old: q_019:v1
new: q_019:v2
```

Jawaban:

```text
q_019:v1
```

tidak pernah dianggap menjawab:

```text
q_019:v2
```

---

# 9. Question Changes

## 9.1 Question Added

Jika dilakukan pada draft:
- update draft.

Jika questionnaire sudah published:
- create new questionnaire version.

---

## 9.2 Question Deleted

Draft:
- boleh dihapus jika belum memiliki historical dependency.

Published/historical:
- jangan hard delete.
- archive/inactive.

---

## 9.3 Question Reordered

Reordering mengubah order/version context, bukan identity.

Session lama tidak berubah.

---

## 9.4 Required/Optional Changed

Perubahan harus masuk version baru.

Session lama mengikuti version lama.

---

## 9.5 Option Changed

Jika option yang telah digunakan di historical submissions ingin diubah:
- historical option identity tetap tersedia.
- new version/context digunakan untuk future attempts.

---

# 10. Progress & Resume

## 10.1 Answer Persistence

Answer dapat disimpan incremental/autosave.

Setiap persisted answer terkait:

- session/attempt
- question version
- answer state
- timestamp

---

## 10.2 Local State

Browser boleh menyimpan local draft untuk UX.

Namun:

`LOCAL STATE != SERVER STATE`

Local state tidak boleh digunakan untuk mengubah:
- result
- score
- completion
- authorization

---

## 10.3 User Stops Midway

Contoh:

```text
Q1 ✓
Q2 ✓
Q3 ✓
Q4 ← stopped
```

State tetap:
`ACTIVE`

Bukan:
`FAIL`

Resume policy menentukan apakah session masih dapat dilanjutkan.

---

## 10.4 Refresh Midway

Expected:
- baca server state
- lanjut ke progress yang valid

---

## 10.5 Browser Crash

Expected:
- progress server-side yang sudah persisted tetap ada.
- user dapat resume bila session masih valid.

---

## 10.6 Offline

Jika offline:
- local UI boleh mempertahankan draft
- answer dianggap persisted hanya setelah server acknowledgement
- saat reconnect dilakukan reconciliation
- request stale/duplicate harus aman terhadap retry

---

# 11. Concurrency

## 11.1 Two Tabs

Sistem harus memiliki authoritative server state.

Jika tab menggunakan state lama:
- request dapat ditolak sebagai stale/conflicting state
- client melakukan resync

---

## 11.2 Multi-device

Satu session dapat dibuka pada lebih dari satu device hanya jika policy mengizinkan.

Server tetap menentukan state.

Conflict tidak boleh diam-diam menyebabkan data corrupt.

---

## 11.3 Old Request Arrives Late

Request lama tidak boleh menimpa state baru.

State transition harus melakukan validation terhadap current authoritative state/version.

---

# 12. Submission Lifecycle

## 12.1 Submission States

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

Failure states dapat mencakup:

```text
RECOVERABLE_ERROR
EVALUATION_ERROR
INTEGRITY_ERROR
```

Error bukan business result.

---

## 12.2 Submit Validation

Sebelum finalization:

1. Session valid.
2. Session belum expired.
3. Session belum completed.
4. Questionnaire version sesuai.
5. Semua required answers ada.
6. Answer type valid.
7. Option identity valid.
8. Payload tidak mengandung unsupported fields yang memengaruhi evaluation.
9. Attempt belum memiliki final submission.
10. Concurrency/version check lolos.

---

# 13. Idempotent Submission

Double click:

```text
Submit
Submit
Submit
```

harus menghasilkan:

```text
ONE FINAL SUBMISSION
ONE RESULT
ONE VERIFICATION
```

Request duplicate harus aman.

---

# 14. Timeout & Network Failure

## 14.1 Server Completed, Client Did Not Receive Response

Server state adalah authoritative.

Saat client refresh/resume:
- retrieve existing submission/result
- jangan membuat submission kedua
- jangan menjalankan evaluation baru secara tidak perlu

---

## 14.2 Request Retry

Retry yang sama tidak boleh membuat duplicate final record.

---

## 14.3 Database Error During Submit

Jika operasi belum dapat difinalisasi secara konsisten:
- jangan menghasilkan PASS/FAIL palsu.
- tandai sebagai error/recoverable state sesuai transaction boundary.
- lakukan retry/reconciliation.

---

# 15. Evaluation Engine

## 15.1 Input

Evaluation hanya menggunakan trusted server state:

```text
answers
questionnaire_version
question_versions
scoring_version
evaluation policy
```

---

## 15.2 Client Score

Client mengirim:

```text
score = 99
result = PASS
```

harus dianggap untrusted.

Server menghitung ulang.

---

## 15.3 Score Calculation

Contoh:

```text
YES = +10
NO  = 0
```

Server menghitung berdasarkan scoring version yang terkait dengan submission.

---

## 15.4 Passing Score

Default policy:

```text
score >= passing_score => PASS
score < passing_score  => FAIL
```

Passing score disimpan sebagai historical evaluation context.

---

# 16. Evaluation Versioning

Perubahan pada:
- question weight
- score rule
- scoring formula
- passing score

tidak mengubah completed submission lama.

Submission menyimpan reference/version terhadap evaluation context yang digunakan.

---

# 17. Result

## 17.1 Business Result

Possible examples:

```text
PASS
FAIL
```

Result business hanya diberikan bila evaluation berhasil dan data konsisten.

---

## 17.2 System Result

Separate from business result:

```text
PROCESSING
RECOVERABLE_ERROR
EVALUATION_ERROR
INTEGRITY_ERROR
```

Jangan mengubah technical error menjadi FAIL.

---

# 18. Result Immutability

Setelah final:

```text
score
result
questionnaire_version
scoring_version
passing_score
evaluation context
```

harus immutable sebagai historical record.

Perbaikan administratif harus menjadi event/record baru yang dapat diaudit.

---

# 19. Repeat / Retake

CMS harus menyediakan policy, misalnya:

```text
NEVER
ON_NEW_VERSION
AFTER_COOLDOWN
ADMIN_APPROVAL
UNLIMITED
```

Konfigurasi dapat memiliki:

```text
max_attempts
cooldown
```

---

## 19.1 Previous PASS, New Version

Example:

```text
Attempt #1
v4
PASS
```

Current:

```text
v5
```

Jika policy mengizinkan:
- user ditawarkan retake.
- attempt baru dibuat.
- attempt lama tidak berubah.

---

## 19.2 Previous FAIL, New Version

Behavior sama sesuai repeat policy.

FAIL lama tidak menghalangi PASS pada future version jika policy mengizinkan.

---

## 19.3 Multiple Attempts With Different Results

Valid:

```text
v4 → PASS
v5 → FAIL
v6 → PASS
```

Selama tiap result berasal dari evaluation context yang valid.

---

# 20. Verification

Setiap final submission dapat menghasilkan `verification_id`.

Verification harus menunjuk ke immutable submission, bukan current configuration.

Contoh:

```text
Verification ID
   |
   v
Submission
   |
   +-- Questionnaire Version
   +-- Scoring Version
   +-- Score
   +-- Result
   +-- Completion Time
```

---

## 20.1 Public Verification

Public verification hanya boleh menampilkan informasi yang memang intended untuk public.

Contoh:

```text
VALID
PASS
Completed Date
Questionnaire Version
Verification ID
```

Tidak otomatis membuka:
- seluruh answers
- private metadata
- security metadata
- internal audit

---

## 20.2 Admin Verification

Admin dapat melihat detail sesuai authorization:
- answers
- score
- result
- versions
- session
- events
- integrity state

---

# 21. Security Model

## 21.1 Trust Boundary

```text
Browser / Client
        |
        | UNTRUSTED
        v
API / Server
        |
        | TRUSTED VALIDATION
        v
System of Record
```

---

## 21.2 Authorization

User hanya boleh:
- mengakses session yang diotorisasi oleh valid session credential
- membaca own progress
- membaca own result

User tidak boleh:
- membuka submission user lain
- membaca private admin data
- mengganti ownership
- meminta arbitrary result

---

## 21.3 Session Token

Session token harus:
- sulit ditebak
- tidak sequential
- memiliki expiration
- dapat direvoke
- tidak dianggap sebagai database numeric ID

---

## 21.4 Replay Protection

Request lama dari completed/expired/revoked session harus ditolak.

---

## 21.5 Enumeration Protection

Session ID dan verification ID tidak boleh mudah ditebak.

Error response tidak boleh membocorkan detail sensitif tentang object milik user lain.

---

# 22. IP, VPN & Device

## 22.1 IP

IP adalah security/abuse signal.

IP bukan identity absolut.

Perubahan IP tidak otomatis membatalkan session.

---

## 22.2 Shared IP

Banyak user dari IP yang sama tidak otomatis dianggap satu orang.

---

## 22.3 VPN/Proxy

VPN/proxy tidak otomatis berarti malicious.

Dapat menjadi risk signal bila dikombinasikan dengan:
- abnormal request rate
- brute force
- automation
- suspicious replay

---

## 22.4 Cookie Deletion

Jika cookie hilang:
- jangan otomatis claim user baru sebagai fakta.
- jangan otomatis mengambil ownership session lama tanpa mekanisme recovery yang valid.

Untuk MVP, dapat diarahkan ke new session.

---

# 23. Rate Limiting & Abuse

Sistem harus memiliki proteksi terhadap:
- rapid start
- rapid submit
- brute-force session ID
- brute-force verification ID
- repeated API calls
- automation
- suspicious submission patterns

Rate limiting dapat diterapkan pada beberapa level:
- IP
- session token
- endpoint
- account/admin identity bila ada
- device/risk signal bila sesuai

Namun tidak boleh bergantung hanya pada IP.

---

# 24. Admin/CMS

## 24.1 Content Management

Content yang dapat dikelola:

- Hero title
- Hero subtitle
- About
- Profile
- Work
- Education
- Interests
- Values
- Links
- CTA
- Success copy
- Failure copy
- Resume copy
- Expiration copy
- General informational text

Tidak hardcoded sebagai source of truth.

---

## 24.2 Questionnaire Management

CMS harus mendukung:

- create questionnaire
- draft
- version
- add question
- edit question
- reorder
- required/optional
- add/remove options
- activate/deactivate
- publish
- archive
- duplicate/create new version

---

## 24.3 Scoring Management

CMS dapat mengatur:

- scoring rule
- weight
- formula
- passing score
- category/result policy

Published scoring context harus versioned untuk historical consistency.

---

## 24.4 Session Policy

CMS dapat mengatur:

```text
Session Lifetime
Allow Resume
Questionnaire Time Limit
```

Perubahan hanya berlaku sesuai effective policy untuk session baru, kecuali ada explicit administrative migration policy.

---

## 24.5 Retake Policy

CMS dapat mengatur:
- max attempts
- cooldown
- repeat policy
- new-version behavior

---

# 25. Publishing Rules

## Draft

Dapat diedit.

## Published

Tidak diedit secara destructive.

Perubahan:
`Create New Version`

## Archived

Tidak digunakan untuk new sessions.

Historical references tetap tersedia.

---

# 26. Admin Concurrency

Jika dua admin mengedit entity yang sama:

- sistem harus mendeteksi stale editor state.
- tidak boleh silent overwrite.

Expected outcome:

```text
VERSION_CONFLICT
```

dan admin diarahkan untuk melihat latest state.

---

# 27. Historical Data

Historical submission harus tetap readable walaupun:
- question diarchive
- questionnaire diarchive
- scoring lama tidak lagi aktif
- option lama tidak lagi digunakan
- current questionnaire berubah
- current passing score berubah

---

# 28. Data Integrity

Sistem harus mendeteksi impossible state.

Contoh:

```text
PASS + score < passing_score
FAIL + score >= passing_score
COMPLETED + required answer missing
COMPLETED + completed_at missing
Result exists + submission missing
Answer points to question version not used by session
Session uses invalid questionnaire version
Submission has impossible state transition
```

Jika ditemukan:

`INTEGRITY_ERROR`

Jangan melakukan silent repair.

---

# 29. Audit Trail

Audit event minimal dapat mencakup:

```text
SESSION_CREATED
SESSION_RESUMED
SESSION_EXPIRED
SESSION_REVOKED
ANSWER_SAVED
ANSWER_UPDATED
QUESTIONNAIRE_VERSION_CREATED
QUESTIONNAIRE_PUBLISHED
QUESTIONNAIRE_ARCHIVED
SUBMISSION_STARTED
SUBMISSION_FINALIZED
EVALUATION_STARTED
EVALUATION_COMPLETED
RESULT_GENERATED
VERIFICATION_CREATED
ADMIN_POLICY_CHANGED
INTEGRITY_ERROR_DETECTED
```

Event penting sebaiknya immutable atau append-only secara konseptual.

---

# 30. Recovery

Sistem harus mampu recovery dari:

1. submit timeout
2. browser refresh setelah server completion
3. duplicate request
4. service restart
5. evaluation retry
6. temporary DB/network failure
7. partial processing detection
8. stale client state

Prinsip:

> **Recover from authoritative server state, not from client assumptions.**

---

# 31. Observability

Admin sebaiknya dapat melihat:
- active sessions
- expired sessions
- submissions
- evaluation status
- errors
- integrity warnings
- suspicious activity
- audit events

Dashboard tidak harus menampilkan technical internals kepada public user.

---

# 32. Impossible State Detection

Minimal detector memeriksa:

```text
1. Result/result status contradiction
2. Missing mandatory timestamps
3. Missing referenced version
4. Invalid state transition
5. Duplicate final submission
6. Orphan answer
7. Orphan submission
8. Result without submission
9. Session version mismatch
10. Evaluation version mismatch
```

---

# 33. State Transition Rules

State transition harus eksplisit.

Contoh:

```text
NEW -> ACTIVE       ALLOWED
ACTIVE -> COMPLETED ALLOWED
ACTIVE -> EXPIRED   ALLOWED
ACTIVE -> ABANDONED ALLOWED
ACTIVE -> REVOKED   ALLOWED

COMPLETED -> ACTIVE      FORBIDDEN
COMPLETED -> SUBMITTING  FORBIDDEN
EXPIRED -> COMPLETED     FORBIDDEN
REVOKED -> COMPLETED     FORBIDDEN
```

Kecuali ada explicit administrative recovery workflow yang membuat event baru dan audit trail.

---

# 34. Attempt Model

Satu person tidak boleh direpresentasikan hanya sebagai satu submission.

Conceptual relationship:

```text
Candidate / Visitor Context
        |
        +-- Attempt #1
        |      +-- Session
        |      +-- Questionnaire Version
        |      +-- Submission
        |      +-- Result
        |
        +-- Attempt #2
               +-- Session
               +-- Questionnaire Version
               +-- Submission
               +-- Result
```

Satu user dapat memiliki:
- PASS dan FAIL
- beberapa questionnaire version
- beberapa attempts

sesuai repeat policy.

---

# 35. Important Behavioral Rules

## Rule 01
Opening public page tidak otomatis membuat session.

## Rule 02
Start harus idempotent/deduplicated.

## Rule 03
Active session dapat dilanjutkan sesuai policy.

## Rule 04
Session memiliki fixed questionnaire version.

## Rule 05
Published questionnaire tidak dimutasi.

## Rule 06
Question identity tidak sama dengan question number.

## Rule 07
Historical answer selalu terkait question version yang digunakan.

## Rule 08
Client score/result selalu dianggap untrusted.

## Rule 09
Server menghitung evaluation.

## Rule 10
Completed submission immutable.

## Rule 11
Duplicate submit menghasilkan satu final outcome.

## Rule 12
Timeout tidak boleh membuat duplicate submission.

## Rule 13
Expired session bukan FAIL.

## Rule 14
Version lama tetap valid untuk historical records.

## Rule 15
IP bukan identity absolut.

## Rule 16
Cookie membantu continuity tetapi bukan source of truth.

## Rule 17
Configuration saat ini tidak mengubah historical result.

## Rule 18
Impossible state harus dideteksi.

## Rule 19
Technical error tidak boleh diterjemahkan menjadi business FAIL.

## Rule 20
Audit diperlukan untuk perubahan dan event kritis.

---

# 36. Priority Model

## P0 — Production Blocker

Failure dapat menyebabkan:
- hasil palsu
- data corrupt
- duplicate final submission
- cross-user data access
- broken historical integrity
- invalid scoring
- invalid verification
- state corruption

Area:
- session integrity
- version locking
- submit idempotency
- scoring integrity
- authorization
- historical immutability
- concurrency correctness
- database consistency
- integrity checking

---

## P1 — High Priority

Failure terutama menyebabkan:
- poor UX
- abuse increase
- difficult recovery
- multi-device conflict
- advanced resilience issue

Area:
- sophisticated resume
- advanced abuse detection
- multi-device polish
- detailed admin controls
- advanced observability

---

## P2 — Post-MVP

Area yang tidak menyebabkan core correctness/security failure:
- cosmetic UX enhancements
- advanced analytics
- additional convenience workflows
- advanced browser fallback
- non-critical administrative features

---

# 37. Original Scenario Coverage

Specification ini mencakup domain skenario:

```text
A. Session
B. Questionnaire & Question
C. Progress & Resume
D. Submit
E. Scoring & Result
F. Repeat / Retake
G. Double Tab & Multi-device
H. Network & Browser
I. Security & Session Abuse
J. IP, VPN & Abuse
K. Admin / CMS
L. Data Integrity & History
M. Observability & Recovery
```

Initial scenario inventory:
`1–180`

Additional recovery/integrity scenarios:
`181–193`

Total:
`193 scenarios`

---

# 38. Acceptance Criteria

Sistem belum boleh dianggap production-ready bila salah satu fundamental acceptance criteria gagal.

## AC-01
User tidak dapat menentukan PASS/FAIL dari frontend.

## AC-02
Questionnaire version tidak berubah di tengah active session.

## AC-03
Mengubah Q3 tidak membuat answer lama dianggap menjawab Q3 versi baru.

## AC-04
Published questionnaire version tidak dimutasi secara destructive.

## AC-05
Historical result tidak berubah karena CMS saat ini.

## AC-06
Double submit tidak menghasilkan duplicate final submission.

## AC-07
Timeout/retry tidak menghasilkan duplicate final submission.

## AC-08
Old request tidak dapat menimpa current state.

## AC-09
Completed submission tidak dapat dimodifikasi sebagai normal user.

## AC-10
Expired/revoked session tidak dapat submit.

## AC-11
Session user lain tidak dapat diakses.

## AC-12
Verification ID tidak memberikan unauthorized private data.

## AC-13
Questionnaire/scoring version historis tetap dapat direferensikan walaupun archived.

## AC-14
System dapat mendeteksi impossible state.

## AC-15
Technical evaluation error tidak menjadi FAIL.

## AC-16
Server dapat memulihkan result ketika client tidak menerima response setelah server menyelesaikan submission.

## AC-17
Cookie membantu resume tanpa menjadi sole source of truth.

## AC-18
Session lifetime dan questionnaire time limit dapat diatur terpisah.

## AC-19
CMS dapat mengubah content tanpa source-code modification untuk content yang memang configurable.

## AC-20
Behavior yang mengatur security/integrity tetap server-enforced dan tidak dapat diubah melalui content CMS biasa.

---

# 39. Functional Specification — Page Map

## Public

### `/`
Introduction / profile / CTA

### `/start`
Session creation / pre-questionnaire information

### `/session/...`
Questionnaire experience

### `/result/...`
Result experience

### `/verify/...`
Public verification page bila diaktifkan

### `/contact/...`
Contact/chat gate bila PASS dan policy mengizinkan

---

## Admin

Conceptual pages:

```text
/dashboard
/content
/questionnaires
/questionnaires/:id
/questionnaires/:id/versions
/questions
/scoring
/policies
/sessions
/submissions
/results
/verifications
/audit
/integrity
/settings
```

Actual routing dapat ditentukan setelah architecture dipilih.

---

# 40. CMS-Driven Content Policy

Konten berikut harus configurable tanpa code deployment:

- personal introduction
- section titles
- section descriptions
- CTA text
- questionnaire questions
- answer options
- ordering
- question required/optional
- scoring weights
- passing score
- success/failure copy
- resume messaging
- expiration messaging
- selected session/repeat policy

Konten berikut harus tetap **server-enforced**:

- authorization
- integrity rules
- immutable history
- final submission behavior
- identity/security validation
- version locking
- anti-replay
- critical state transitions

---

# 41. Recommended UX Philosophy

Public UX harus terasa seperti:

```text
READ
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

Bukan terasa seperti:
- admin dashboard
- exam system
- bureaucratic form
- rejection machine

Terminologi yang lebih manusiawi dapat digunakan pada public page.

Contoh:

```text
PASS
```

dapat ditampilkan sebagai:

> **You're in.**

Sedangkan FAIL dapat ditampilkan sebagai:

> **Not a match for this connection flow.**

Internal system tetap boleh memakai enum teknis `PASS`/`FAIL`.

---

# 42. Privacy Principle

Sistem hanya menyimpan data yang memang diperlukan.

Public verification tidak boleh membuka internal/private data.

Metadata security:
- IP
- device signals
- risk signals
- session internals

tidak boleh ditampilkan kepada user kecuali memang dibutuhkan dan sesuai policy.

---

# 43. Technology-Neutral Requirement

Dokumen ini sengaja tidak menentukan:
- frontend framework
- backend framework
- database engine
- cache
- hosting
- authentication provider
- analytics provider
- AI provider

Technology selection dilakukan setelah:
1. Functional Specification final.
2. Security/Threat Model final.
3. Data & State Model final.

---

# 44. Next Engineering Documents

Setelah master behavior specification ini disetujui, fase berikutnya:

## Document A — Functional Specification

Berisi:
- page-by-page behavior
- CTA/button behavior
- loading state
- empty state
- error state
- resume behavior
- validation behavior
- admin workflow
- content workflow
- user messaging

## Document B — Security & Threat Model

Berisi:
- trust boundaries
- authentication/authorization
- token security
- CSRF/XSS considerations
- replay protection
- enumeration protection
- rate limiting
- abuse detection
- IP/device considerations
- admin security
- privacy considerations

## Document C — Data & State Model

Berisi:
- entities
- relationships
- immutable records
- versioning
- state transitions
- constraints
- invariants
- transaction boundaries
- concurrency model
- audit model

## Document D — Technology Architecture

Baru setelah A/B/C:
- technology selection
- hosting
- database
- frontend/backend
- deployment
- observability
- CI/CD
- security stack

---

# 45. Final Design Philosophy

Sistem ini harus mengikuti tiga lapisan:

```text
USER EXPERIENCE
Simple, clear, human
        |
        v
BUSINESS LOGIC
Deterministic, configurable
        |
        v
ENGINEERING INTEGRITY
Secure, immutable, auditable
```

Dan prinsip utamanya:

> **User mengontrol input.**
>
> **Server mengontrol state.**
>
> **Versioning mengontrol konteks.**
>
> **Evaluation engine mengontrol result.**
>
> **Audit menjaga history.**
>
> **Verification membuktikan result.**
>
> **CMS mengontrol content/configuration yang memang boleh berubah.**

---

# 46. Current Status

### Completed

- [x] Initial 180 user/system scenarios
- [x] Additional 13 observability/recovery scenarios
- [x] Core invariants
- [x] Session lifecycle
- [x] Questionnaire versioning
- [x] Question versioning
- [x] Scoring versioning
- [x] Session cookie/continuity concept
- [x] Session lifetime
- [x] Questionnaire time limit
- [x] Progress/resume
- [x] Concurrency behavior
- [x] Submission behavior
- [x] Evaluation behavior
- [x] Retake policy
- [x] Security principles
- [x] IP/VPN behavior
- [x] CMS behavior
- [x] Historical integrity
- [x] Audit/integrity model
- [x] Recovery principles
- [x] Acceptance criteria

### Not yet locked

- [ ] Specific technology stack
- [ ] Exact database schema
- [ ] Exact API contract
- [ ] Exact authentication design
- [ ] Exact deployment architecture
- [ ] Detailed threat model
- [ ] Detailed ERD
- [ ] Detailed UI design
- [ ] Implementation

---

# 47. Decision Gate Before Coding

Coding should begin only after the team can answer "YES" to:

```text
[ ] Every critical user scenario has deterministic behavior.
[ ] Session lifecycle is defined.
[ ] Questionnaire versioning is defined.
[ ] Question versioning is defined.
[ ] Scoring versioning is defined.
[ ] Submission idempotency is defined.
[ ] Concurrency behavior is defined.
[ ] Historical immutability is defined.
[ ] Authorization boundaries are defined.
[ ] Verification behavior is defined.
[ ] CMS behavior is defined.
[ ] Recovery behavior is defined.
[ ] Impossible-state behavior is defined.
[ ] P0 acceptance criteria are testable.
```

Only after these are satisfied should technology and implementation be selected.

---

## Document End
