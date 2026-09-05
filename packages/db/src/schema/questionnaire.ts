import { boolean, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Questionnaire domain (Data & State Model §8–14, §45, §61–66).
 *
 * Identity is stable; evaluation context is frozen per version. Question
 * identity is `question_id + version_number` — never position. Published
 * versions are immutable (enforced in the domain/publish layer + DB guards in a
 * later migration); a change creates a NEW version.
 */

export const questionnaire = pgTable('questionnaire', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  // Pointer to the current published version for NEW sessions (Data §10, §91).
  currentVersionId: uuid('current_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const questionnaireVersion = pgTable(
  'questionnaire_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionnaireId: uuid('questionnaire_id')
      .notNull()
      .references(() => questionnaire.id),
    versionNumber: integer('version_number').notNull(),
    // DRAFT | REVIEW | PUBLISHED | ARCHIVED
    status: text('status').notNull().default('DRAFT'),
    // Optimistic-concurrency guard for draft edits (Data §57; Func §113).
    revision: integer('revision').notNull().default(0),
    // Scoring context locked to this questionnaire version (Data §36–37).
    scoringVersionId: uuid('scoring_version_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: unique('questionnaire_version_number_unique').on(
      t.questionnaireId,
      t.versionNumber,
    ),
  }),
);

export const question = pgTable('question', {
  id: uuid('id').primaryKey().defaultRandom(),
  stableKey: text('stable_key').notNull().unique(),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const questionVersion = pgTable(
  'question_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => question.id),
    versionNumber: integer('version_number').notNull(),
    // single_choice | multiple_choice | boolean | text | numeric
    type: text('type').notNull(),
    text: text('text').notNull(),
    description: text('description'),
    required: boolean('required').notNull().default(false),
    status: text('status').notNull().default('DRAFT'),
    revision: integer('revision').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUnique: unique('question_version_number_unique').on(t.questionId, t.versionNumber),
  }),
);

export const answerOption = pgTable('answer_option', {
  id: uuid('id').primaryKey().defaultRandom(),
  stableKey: text('stable_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const answerOptionVersion = pgTable(
  'answer_option_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    optionId: uuid('option_id')
      .notNull()
      .references(() => answerOption.id),
    // Option version belongs to a specific question version (Data §14, §68).
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersion.id),
    value: text('value').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    positionUnique: unique('answer_option_version_position_unique').on(
      t.questionVersionId,
      t.position,
    ),
  }),
);

/** Binding of question versions into a questionnaire version (Data §10). */
export const questionnaireVersionQuestion = pgTable(
  'questionnaire_version_question',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionnaireVersionId: uuid('questionnaire_version_id')
      .notNull()
      .references(() => questionnaireVersion.id),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersion.id),
    // Presentation only; identity is question_version_id (Data §10, §30).
    position: integer('position').notNull(),
  },
  (t) => ({
    positionUnique: unique('qvq_position_unique').on(t.questionnaireVersionId, t.position),
    membershipUnique: unique('qvq_membership_unique').on(
      t.questionnaireVersionId,
      t.questionVersionId,
    ),
  }),
);

export type Questionnaire = typeof questionnaire.$inferSelect;
export type QuestionnaireVersion = typeof questionnaireVersion.$inferSelect;
export type Question = typeof question.$inferSelect;
export type QuestionVersion = typeof questionVersion.$inferSelect;
export type AnswerOptionVersion = typeof answerOptionVersion.$inferSelect;
export type QuestionnaireVersionQuestion = typeof questionnaireVersionQuestion.$inferSelect;
