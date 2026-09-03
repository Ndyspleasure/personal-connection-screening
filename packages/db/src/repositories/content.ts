import { asc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { contentSection, profile, type ContentSection, type Profile } from '../schema/content';

/** The published owner profile, if any (Data & State Model §6). */
export async function getPublishedProfile(db: Database): Promise<Profile | null> {
  const rows = await db.select().from(profile).where(eq(profile.status, 'PUBLISHED')).limit(1);
  return rows[0] ?? null;
}

/** Visible public content sections ordered for display (Data & State Model §7). */
export async function listVisibleContentSections(db: Database): Promise<ContentSection[]> {
  return db
    .select()
    .from(contentSection)
    .where(eq(contentSection.visibility, 'PUBLIC'))
    .orderBy(asc(contentSection.displayOrder));
}
