import { and, asc, eq, sql } from 'drizzle-orm';
import { contentSection, profile, type ContentSection, type Profile } from '../schema/content';
import type { DbExecutor } from './authoring';

/**
 * Admin-side content authoring (Functional §80; Data §6–7). Display-only CMS
 * content: lower immutability than evaluation-affecting entities. Section edits
 * are guarded by an optimistic `content_version` check so two admins never
 * silently overwrite each other (Threat TH-037; Func §113).
 *
 * MVP models a single owner profile row; the public projection reads only the
 * PUBLISHED one.
 */

export async function getAnyProfile(db: DbExecutor): Promise<Profile | null> {
  const rows = await db.select().from(profile).limit(1);
  return rows[0] ?? null;
}

export async function upsertProfile(
  db: DbExecutor,
  input: { slug: string; displayName: string },
): Promise<Profile> {
  const existing = await getAnyProfile(db);
  if (!existing) {
    const [row] = await db
      .insert(profile)
      .values({ slug: input.slug, displayName: input.displayName, status: 'DRAFT' })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(profile)
    .set({ slug: input.slug, displayName: input.displayName, updatedAt: sql`now()` })
    .where(eq(profile.id, existing.id))
    .returning();
  return row!;
}

export async function publishProfileRow(db: DbExecutor, id: string): Promise<Profile> {
  const [row] = await db
    .update(profile)
    .set({ status: 'PUBLISHED', publishedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(profile.id, id))
    .returning();
  return row!;
}

export async function listAllContentSections(db: DbExecutor): Promise<ContentSection[]> {
  return db.select().from(contentSection).orderBy(asc(contentSection.displayOrder));
}

export async function getContentSection(
  db: DbExecutor,
  id: string,
): Promise<ContentSection | null> {
  const rows = await db.select().from(contentSection).where(eq(contentSection.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertContentSection(
  db: DbExecutor,
  input: {
    sectionType: string;
    title?: string | null;
    subtitle?: string | null;
    body?: string | null;
    displayOrder?: number;
    visibility?: string;
  },
): Promise<ContentSection> {
  const [row] = await db
    .insert(contentSection)
    .values({
      sectionType: input.sectionType,
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      body: input.body ?? null,
      displayOrder: input.displayOrder ?? 0,
      visibility: input.visibility ?? 'PUBLIC',
    })
    .returning();
  return row!;
}

/**
 * Optimistic-concurrency update: only succeeds when the caller's
 * `expectedVersion` still matches the stored `content_version`. Returns the new
 * row on success, or null on a version conflict (no write performed).
 */
export async function updateContentSectionWithVersion(
  db: DbExecutor,
  input: {
    id: string;
    expectedVersion: number;
    sectionType: string;
    title?: string | null;
    subtitle?: string | null;
    body?: string | null;
    displayOrder?: number;
    visibility?: string;
  },
): Promise<ContentSection | null> {
  const rows = await db
    .update(contentSection)
    .set({
      sectionType: input.sectionType,
      title: input.title ?? null,
      subtitle: input.subtitle ?? null,
      body: input.body ?? null,
      displayOrder: input.displayOrder ?? 0,
      visibility: input.visibility ?? 'PUBLIC',
      contentVersion: sql`${contentSection.contentVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(contentSection.id, input.id),
        eq(contentSection.contentVersion, input.expectedVersion),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteContentSection(db: DbExecutor, id: string): Promise<boolean> {
  const rows = await db.delete(contentSection).where(eq(contentSection.id, id)).returning();
  return rows.length > 0;
}
