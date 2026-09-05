import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { policyVersion } from './policy';
import { questionnaireVersion, questionVersion } from './questionnaire';
import { scoringVersion } from './scoring';

/**
 * Execution domain (Data & State Model §21–32, §45).
 *
 * Attempt is the business unit of participation; Session is the browser
 * continuity context bound to an attempt (Data §24). Attempts snapshot their
 * evaluation context (questionnaire_version, scoring_version, policy_version)
 * PLUS a frozen policy_snapshot JSONB so historical behavior never depends on
 * current CMS state (Data §20, §46, §91–94; INV-D07). PASS/FAIL are business
 * results and never appear as session/attempt state (Data §26; Master §5.1).
 */

export const candidateContext = pgTable('candidate_context', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicRef: text('public_ref').notNull().unique(),
  // Optional PII — captured only at the contact gate after PASS (Data §21, §76;
  // confirmed product decision). Nullable by default; never required for the
  // core screening flow.
  name: text('name'),
  contact: text('contact'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attempt = pgTable(
  'attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicRef: text('public_ref').notNull().unique(),
    candidateContextId: uuid('candidate_context_id').references(() => candidateContext.id),

    // Version-lock triple (Data §46, INV-D07). All three are frozen at
    // creation time. New CMS publishes never mutate these references.
    questionnaireVersionId: uuid('questionnaire_version_id')
      .notNull()
      .references(() => questionnaireVersion.id),
    scoringVersionId: uuid('scoring_version_id')
      .notNull()
      .references(() => scoringVersion.id),
    policyVersionId: uuid('policy_version_id')
      .notNull()
      .references(() => policyVersion.id),
    // Frozen snapshot of the effective policy values used for this attempt
    // (Data §20). Read directly for lifetime/deadline decisions so a later
    // policy edit cannot retroactively shift them.
    policySnapshot: jsonb('policy_snapshot').notNull(),

    // CREATED | ACTIVE | SUBMITTING | EVALUATING | COMPLETED |
    // EXPIRED | ABANDONED | REVOKED | EVALUATION_ERROR | INTEGRITY_ERROR
    status: text('status').notNull().default('CREATED'),

    // Server-owned timestamps only (Data §65).
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    questionnaireStartedAt: timestamp('questionnaire_started_at', { withTimezone: true }),
    questionnaireDeadline: timestamp('questionnaire_deadline', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Retake accounting uses candidate + questionnaire_version_id via app logic;
    // an index there speeds up eligibility checks.
    byQnvIdx: index('attempt_questionnaire_version_idx').on(t.questionnaireVersionId),
    byCandidateIdx: index('attempt_candidate_idx').on(t.candidateContextId),
  }),
);

export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicRef: text('public_ref').notNull().unique(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempt.id),
    // Hashed session-token fingerprint — the raw token lives only in the
    // client cookie (Tech §13, §114; Threat TH-001/002).
    tokenFingerprint: text('token_fingerprint').notNull().unique(),
    // NEW | ACTIVE | COMPLETED | EXPIRED | ABANDONED | REVOKED (Data §26).
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    attemptIdx: index('session_attempt_idx').on(t.attemptId),
  }),
);

export const answer = pgTable(
  'answer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempt.id),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersion.id),
    // Per-answer optimistic-concurrency guard (Data §57–58; Func §113).
    // Not the same as the attempt-level revision; each answer row versions
    // independently so two edits to different questions don't collide.
    revision: integer('revision').notNull().default(0),
    // Value fields keyed by question type (Data §29; Func §20).
    selectedOptionVersionIds: jsonb('selected_option_version_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    textValue: text('text_value'),
    numericValue: integer('numeric_value'),
    booleanValue: boolean('boolean_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // At most one current answer per attempt+question_version (Data §31, §61).
    attemptQuestionUnique: unique('answer_attempt_question_version_unique').on(
      t.attemptId,
      t.questionVersionId,
    ),
    attemptIdx: index('answer_attempt_idx').on(t.attemptId),
    // Value payload sanity: no answer row may be totally empty.
    hasSomeValue: check(
      'answer_has_some_value',
      sql`jsonb_array_length(${t.selectedOptionVersionIds}) > 0
        OR ${t.textValue} IS NOT NULL
        OR ${t.numericValue} IS NOT NULL
        OR ${t.booleanValue} IS NOT NULL`,
    ),
  }),
);

export type CandidateContext = typeof candidateContext.$inferSelect;
export type Attempt = typeof attempt.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Answer = typeof answer.$inferSelect;

/** Policy snapshot shape frozen onto attempt.policySnapshot (Data §20). */
export interface AttemptPolicySnapshot {
  policyVersionId: string;
  sessionLifetimeSeconds: number;
  questionnaireTimeLimitSeconds: number | null;
  timerMode: 'absolute';
  allowResume: boolean;
  allowMultiDevice: boolean;
  retakeMode: string;
  maxAttempts: number;
  cooldownSeconds: number;
}
