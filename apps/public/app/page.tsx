import Link from 'next/link';
import { getPublicContent, type PublicContent } from '@pcs/domain';
import { getDb } from '@pcs/db';

// Content is server-authoritative and CMS-driven; never statically inlined.
export const dynamic = 'force-dynamic';

const EMPTY: PublicContent = { profile: null, sections: [] };

async function loadContent(): Promise<{ content: PublicContent; ready: boolean }> {
  try {
    return { content: await getPublicContent(getDb()), ready: true };
  } catch {
    return { content: EMPTY, ready: false };
  }
}

export default async function HomePage() {
  const { content, ready } = await loadContent();
  const headerTitle = content.profile?.displayName ?? 'Connect';
  const heroSection = content.sections.find((s) => s.sectionType === 'hero');
  const heroTitle = heroSection?.title ?? headerTitle;
  const heroSubtitle = heroSection?.subtitle ?? null;
  const otherSections = content.sections.filter((s) => s.sectionType !== 'hero');

  return (
    <main>
      <h1>{heroTitle}</h1>
      {heroSubtitle ? <p className="muted">{heroSubtitle}</p> : null}

      {content.profile ? (
        <>
          {otherSections.map((s, i) => (
            <section className="panel" key={`${s.sectionType}-${i}`}>
              {s.title ? <h2>{s.title}</h2> : null}
              {s.subtitle ? <p className="muted">{s.subtitle}</p> : null}
              {s.body ? <p>{s.body}</p> : null}
            </section>
          ))}
          <Link className="primary" href="/start">
            Get started
          </Link>
        </>
      ) : (
        <p className="muted">
          {ready
            ? 'This connection flow has not been published yet.'
            : 'Bootstrap mode — content, questions, and copy are managed in the admin CMS and will appear here once the database is provisioned and published.'}
        </p>
      )}
    </main>
  );
}
