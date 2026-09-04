'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Content editor (Functional §80; Acceptance CMS-01). Drives the OWNER-only
 * /api/admin/content endpoints. All text is rendered through React (auto-escaped),
 * so stored content is treated as untrusted (Threat TH-046). Section edits carry
 * an optimistic `contentVersion`; a 409 means someone else changed it first.
 */

interface ProfileState {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  publishedAt: string | null;
}
interface SectionState {
  id: string;
  sectionType: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  displayOrder: number;
  visibility: string;
  contentVersion: number;
}

async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  let data: unknown = null;
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    data = await res.json().catch(() => null);
  }
  const error =
    !res.ok && data && typeof data === 'object' && 'error' in data
      ? ((data as { error: { message?: string; code?: string } }).error?.message ??
        (data as { error: { code?: string } }).error?.code ??
        'Request failed')
      : null;
  return { ok: res.ok, status: res.status, data: (data as T) ?? null, error };
}

export default function ContentEditorPage() {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [sections, setSections] = useState<SectionState[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [content, me] = await Promise.all([
      api<{ profile: ProfileState | null; sections: SectionState[] }>('/api/admin/content'),
      api<{ role: string }>('/api/admin/me'),
    ]);
    if (!content.ok) {
      setNotice({
        kind: 'error',
        text:
          content.status === 403
            ? 'You are not authorized, or admin auth is not configured yet.'
            : (content.error ?? 'Failed to load content.'),
      });
      setLoading(false);
      return;
    }
    setRole(me.data?.role ?? null);
    setProfile(content.data?.profile ?? null);
    setSlug(content.data?.profile?.slug ?? '');
    setDisplayName(content.data?.profile?.displayName ?? '');
    setSections(content.data?.sections ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    setNotice(null);
    const res = await api<ProfileState>('/api/admin/content/profile', {
      method: 'PUT',
      body: { slug, displayName },
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Save failed.' });
    setProfile(res.data);
    setNotice({ kind: 'ok', text: 'Profile saved (draft).' });
  }

  async function publishProfile() {
    setNotice(null);
    const res = await api<ProfileState>('/api/admin/content/profile/publish', { method: 'POST' });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Publish failed.' });
    setProfile(res.data);
    setNotice({ kind: 'ok', text: 'Profile published — it is now live.' });
  }

  async function addSection() {
    setNotice(null);
    const res = await api<SectionState>('/api/admin/content/sections', {
      method: 'POST',
      body: { sectionType: 'section', title: 'New section', displayOrder: sections.length },
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Add failed.' });
    await load();
  }

  async function saveSection(s: SectionState) {
    setNotice(null);
    const res = await api<SectionState>(`/api/admin/content/sections/${s.id}`, {
      method: 'PUT',
      body: {
        expectedVersion: s.contentVersion,
        sectionType: s.sectionType,
        title: s.title,
        subtitle: s.subtitle,
        body: s.body,
        displayOrder: s.displayOrder,
        visibility: s.visibility,
      },
    });
    if (res.status === 409) {
      setNotice({ kind: 'error', text: 'That section changed elsewhere — reloading latest.' });
      await load();
      return;
    }
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Save failed.' });
    setSections((prev) => prev.map((x) => (x.id === s.id ? (res.data as SectionState) : x)));
    setNotice({ kind: 'ok', text: `Section saved (v${res.data?.contentVersion}).` });
  }

  async function deleteSection(id: string) {
    setNotice(null);
    const res = await api(`/api/admin/content/sections/${id}`, { method: 'DELETE' });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Delete failed.' });
    setSections((prev) => prev.filter((x) => x.id !== id));
    setNotice({ kind: 'ok', text: 'Section deleted.' });
  }

  function patchSection(id: string, patch: Partial<SectionState>) {
    setSections((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  return (
    <main className="wide">
      <p className="crumbs">
        <Link href="/dashboard">← Dashboard</Link>
      </p>
      <h1>Content</h1>
      <p className="muted">
        Everything the public site shows is edited here — nothing is hardcoded.
        {role ? ` Signed in as ${role.toLowerCase()}.` : ''}
      </p>

      {notice ? <p className={`status-line ${notice.kind}`}>{notice.text}</p> : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section className="panel">
            <h2>Profile</h2>
            <label className="field">
              <span>Slug</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="owner" />
            </label>
            <label className="field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Name shown on the landing page"
              />
            </label>
            <p className="muted small">
              Status: {profile?.status ?? 'not created'}
              {profile?.publishedAt ? ` · published ${profile.publishedAt.slice(0, 10)}` : ''}
            </p>
            <div className="row">
              <button className="primary" onClick={saveProfile} disabled={!slug || !displayName}>
                Save draft
              </button>
              <button className="ghost" onClick={publishProfile} disabled={!profile}>
                Publish
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="row spread">
              <h2>Sections</h2>
              <button className="ghost" onClick={addSection}>
                + Add section
              </button>
            </div>
            {sections.length === 0 ? (
              <p className="muted">No sections yet.</p>
            ) : (
              sections.map((s) => (
                <fieldset key={s.id}>
                  <legend>
                    {s.sectionType} · v{s.contentVersion}
                  </legend>
                  <label className="field">
                    <span>Type</span>
                    <input
                      value={s.sectionType}
                      onChange={(e) => patchSection(s.id, { sectionType: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={s.title ?? ''}
                      onChange={(e) => patchSection(s.id, { title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Subtitle</span>
                    <input
                      value={s.subtitle ?? ''}
                      onChange={(e) => patchSection(s.id, { subtitle: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Body</span>
                    <textarea
                      rows={3}
                      value={s.body ?? ''}
                      onChange={(e) => patchSection(s.id, { body: e.target.value })}
                    />
                  </label>
                  <div className="row">
                    <label className="field inline">
                      <span>Order</span>
                      <input
                        type="number"
                        value={s.displayOrder}
                        onChange={(e) =>
                          patchSection(s.id, { displayOrder: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="field inline">
                      <span>Visibility</span>
                      <select
                        value={s.visibility}
                        onChange={(e) => patchSection(s.id, { visibility: e.target.value })}
                      >
                        <option value="PUBLIC">PUBLIC</option>
                        <option value="HIDDEN">HIDDEN</option>
                      </select>
                    </label>
                  </div>
                  <div className="row">
                    <button className="primary" onClick={() => saveSection(s)}>
                      Save
                    </button>
                    <button className="danger" onClick={() => deleteSection(s.id)}>
                      Delete
                    </button>
                  </div>
                </fieldset>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
