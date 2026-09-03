import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Content domain (Data & State Model §6–7). Display-only CMS content; lower
 * immutability requirements than evaluation-affecting entities (Data §106).
 * Evaluation-affecting versioned entities (questionnaire/question/scoring/policy)
 * arrive in migration 0002–0004 during Phase 3.
 */
export const profile = pgTable('profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export const contentSection = pgTable('content_section', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionType: text('section_type').notNull(),
  title: text('title'),
  subtitle: text('subtitle'),
  body: text('body'),
  displayOrder: integer('display_order').notNull().default(0),
  visibility: text('visibility').notNull().default('PUBLIC'),
  contentVersion: integer('content_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profile.$inferSelect;
export type ContentSection = typeof contentSection.$inferSelect;
