import { getPublicContent, type PublicContent } from '@pcs/domain';
import { getDb } from '@pcs/db';
import { SessionPicker } from '../components/SessionPicker';

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
      <span className="eyebrow enter">✦ A personal connection</span>
      <h1 className="enter enter-1">
        <span className="gradient-text">{heroTitle}</span>
      </h1>
      {heroSubtitle ? (
        <p className="muted enter enter-2" style={{ fontSize: '1.12rem', maxWidth: '42ch' }}>
          {heroSubtitle}
        </p>
      ) : null}

      {content.profile ? (
        <>
          <SessionPicker />
          {otherSections.length ? (
            <div style={{ marginTop: '2.75rem' }}>
              {otherSections.map((s, i) => (
                <section
                  className="panel enter"
                  key={`${s.sectionType}-${i}`}
                  style={{ marginTop: '1rem' }}
                >
                  {s.title ? <h2 style={{ marginTop: 0 }}>{s.title}</h2> : null}
                  {s.subtitle ? <p className="muted">{s.subtitle}</p> : null}
                  {s.body ? <p style={{ marginBottom: 0 }}>{s.body}</p> : null}
                </section>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted enter enter-2">
          {ready
            ? 'This connection flow has not been published yet.'
            : 'Bootstrap mode — content, questions, and copy are managed in the admin CMS and will appear here once the database is provisioned and published.'}
        </p>
      )}
    </main>
  );
}
