import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { questionnaire } from './questionnaire';

/**
 * Session catalog + access codes (Two-Session phase).
 *
 * A `session_kind` is a CMS-managed, data-driven "session" the candidate can
 * choose (e.g. Perkenalan Teman, Pendekatan). It points at the questionnaire it
 * runs; adding a future session is a new row, never new code. Nothing about a
 * session is hardcoded in the frontend — the public app lists ACTIVE kinds from
 * the server.
 *
 * An `access_code` gates an exclusive kind (`requires_access_code`). Only a
 * non-reversible HMAC of the code is stored (never plaintext); verification and
 * usage accounting happen on the server. Codes are operational/mutable config
 * (activate/disable/revoke, expiry, usage caps) — every admin change is audited
 * in `audit_event`.
 */
export const sessionKind = pgTable(
  'session_kind',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Stable slug used by the API/URLs (e.g. 'perkenalan-teman', 'pendekatan').
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    tagline: text('tagline'),
    // Presentation order in the picker (ascending).
    displayOrder: integer('display_order').notNull().default(0),
    // Exclusive sessions require a valid access code before a session may start.
    requiresAccessCode: boolean('requires_access_code').notNull().default(false),
    // The questionnaire this session runs; its current published version is
    // resolved at start time (Data §10, §46).
    questionnaireId: uuid('questionnaire_id')
      .notNull()
      .references(() => questionnaire.id),
    // Optional visual hint for the card (purely presentational, CMS-driven).
    accent: text('accent'),
    // ACTIVE | HIDDEN — only ACTIVE kinds are listed to candidates.
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index('session_kind_order_idx').on(t.displayOrder),
    statusCheck: check('session_kind_status_check', sql`${t.status} IN ('ACTIVE', 'HIDDEN')`),
  }),
);

export const accessCode = pgTable(
  'access_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionKindId: uuid('session_kind_id')
      .notNull()
      .references(() => sessionKind.id),
    // HMAC fingerprint of the plaintext code (Tech §13; Threat TH-001/002).
    // The raw code lives only with the admin/candidate — never in the DB.
    codeHash: text('code_hash').notNull(),
    // Admin-facing label so codes are recognisable without revealing them.
    label: text('label'),
    // ACTIVE | DISABLED | REVOKED. Only ACTIVE codes can open a session.
    status: text('status').notNull().default('ACTIVE'),
    // Optional server-checked expiry (Threat §29 — never client-trusted).
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Optional usage cap; enforced with a concurrency-safe atomic increment.
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // A given plaintext code is unique within its session kind.
    kindHashUnique: unique('access_code_kind_hash_unique').on(t.sessionKindId, t.codeHash),
    hashIdx: index('access_code_hash_idx').on(t.codeHash),
    kindIdx: index('access_code_kind_idx').on(t.sessionKindId),
    statusCheck: check(
      'access_code_status_check',
      sql`${t.status} IN ('ACTIVE', 'DISABLED', 'REVOKED')`,
    ),
    useCountCheck: check('access_code_use_count_check', sql`${t.useCount} >= 0`),
    maxUsesCheck: check(
      'access_code_max_uses_check',
      sql`${t.maxUses} IS NULL OR ${t.maxUses} > 0`,
    ),
  }),
);

export type SessionKind = typeof sessionKind.$inferSelect;
export type AccessCode = typeof accessCode.$inferSelect;
