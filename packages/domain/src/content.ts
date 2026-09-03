import { getPublishedProfile, listVisibleContentSections, type Database } from '@pcs/db';

/**
 * Public content service (Master Spec §24.1; Functional Spec §5). Returns a
 * CMS-driven, display-safe projection of the owner profile + content sections.
 * Content is configurable without a code deploy (Acceptance CMS-01).
 */
export interface PublicProfileView {
  displayName: string;
  slug: string;
}

export interface PublicContentSectionView {
  sectionType: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
}

export interface PublicContent {
  profile: PublicProfileView | null;
  sections: PublicContentSectionView[];
}

export async function getPublicContent(db: Database): Promise<PublicContent> {
  const [profile, sections] = await Promise.all([
    getPublishedProfile(db),
    listVisibleContentSections(db),
  ]);
  return {
    profile: profile ? { displayName: profile.displayName, slug: profile.slug } : null,
    sections: sections.map((s) => ({
      sectionType: s.sectionType,
      title: s.title,
      subtitle: s.subtitle,
      body: s.body,
    })),
  };
}
