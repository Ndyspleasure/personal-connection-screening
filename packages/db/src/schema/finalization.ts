import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { attempt } from './execution';

/**
 * Finalization domain (Data & State Model §33–39, §61).
 *
 * A completed attempt has EXACTLY ONE final submission (Data §34, INV-D06);
 * a completed submission has EXACTLY ONE evaluation and EXACTLY ONE result
 * (Data §35–38). Verification references a result (Data §39). All finalized
 * rows are historically immutable (Data §71) — guarded by DB triggers in the
 * companion custom migration.
 */

export const submission = pgTable(
  'submission',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicRef: text('public_ref').notNull().unique(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempt.id),
    // DRAFT | SUBMITTING | EVALUATING | COMPLETED |
    // RECOVERABLE_ERROR | EVALUATION_ERROR | INTEGRITY_ERROR
    status: text('status').notNull().default('SUBMITTING'),
    // Idempotency key for retry-safe finalize (Data §60; Master §17).
    // Unique across submissions on the same attempt.
    idempotencyKey: text('idempotency_key'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One idempotency key per attempt (Data §60). Different attempts can
    // reuse the same client-supplied key harmlessly.
    idemUnique: unique('submission_attempt_idempotency_unique').on(t.attemptId, t.idempotencyKey),
    attemptStatusIdx: index('submission_attempt_status_idx').on(t.attemptId, t.status),
    // ONE-final-submission invariant: partial unique index (Data §34, INV-D06).
    finalUniquePerAttempt: uniqueIndex('submission_one_final_per_attempt')
      .on(t.attemptId)
      .where(sql`${t.status} = 'COMPLETED'`),
  }),
);

export const evaluation = pgTable('evaluation', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => submission.id)
    .unique(),
  // Redundant with attempt (Data §63) but stored so a query can filter without
  // joining. The domain layer verifies these agree with attempt.* at write time
  // (INV-cross-version).
  questionnaireVersionId: uuid('questionnaire_version_id').notNull(),
  scoringVersionId: uuid('scoring_version_id').notNull(),
  score: integer('score').notNull(),
  passingScore: integer('passing_score').notNull(),
  // Frozen snapshot of the input answers + evaluation trace so historical
  // reconstruction never needs current CMS state (Data §37).
  inputSnapshot: jsonb('input_snapshot').notNull(),
  status: text('status').notNull().default('COMPLETED'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const result = pgTable('result', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicRef: text('public_ref').notNull().unique(),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => submission.id)
    .unique(),
  evaluationId: uuid('evaluation_id')
    .notNull()
    .references(() => evaluation.id)
    .unique(),
  // PASS | FAIL (Data §38). Technical error states never appear here.
  resultType: text('result_type').notNull(),
  score: integer('score').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicRef: text('public_ref').notNull().unique(),
  resultId: uuid('result_id')
    .notNull()
    .references(() => result.id)
    .unique(),
  // VALID | REVOKED (Data §39; verification-revoke modeled, MVP UI deferred).
  status: text('status').notNull().default('VALID'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export type Submission = typeof submission.$inferSelect;
export type Evaluation = typeof evaluation.$inferSelect;
export type Result = typeof result.$inferSelect;
export type Verification = typeof verification.$inferSelect;
