import { getPublicContent, type PublicContent } from '@pcs/domain';
import { getDb } from '@pcs/db';

// Content is server-authoritative and CMS-driven; never statically inlined.
export const dynamic = 'force-dynamic';

const EMPTY: PublicContent = { profile: null, sections: [] };

async function loadContent(): Promise<{ content: PublicContent; ready: boolean }> {
  try {
    return { content: await getPublicContent(getDb()), ready: true };
  } catch {
    // Database/CMS not provisioned yet — render a neutral bootstrap state
    // rather than any hardcoded personal content.
    return { content: EMPTY, ready: false };
  }
}

export default async function HomePage() {
  const { content, ready } = await loadContent();

  return (
    <main>
      {content.profile ? (
        <>
          <h1>{content.profile.displayName}</h1>
          {content.sections.map((s, i) => (
            <section key={`${s.sectionType}-${i}`} style={{ marginTop: '1.5rem' }}>
              {s.title ? <h2>{s.title}</h2> : null}
              {s.subtitle ? <p className="muted">{s.subtitle}</p> : null}
              {s.body ? <p>{s.body}</p> : null}
            </section>
          ))}
        </>
      ) : (
        <>
          <h1>Connect</h1>
          <p className="muted">
            {ready
              ? 'This connection flow has not been published yet.'
              : 'Bootstrap mode — content, questions, and copy are managed in the admin CMS and will appear here once the database is provisioned and published.'}
          </p>
        </>
      )}
    </main>
  );
}
