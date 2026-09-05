'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/admin-client';

/** Questionnaire list + create (Functional §81). Links into the per-version builder. */

interface VersionRow {
  id: string;
  versionNumber: number;
  status: string;
  scoringVersionId: string | null;
  isCurrent: boolean;
}
interface QuestionnaireRow {
  id: string;
  slug: string;
  name: string;
  currentVersionId: string | null;
  versions: VersionRow[];
}

export default function QuestionnairesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [items, setItems] = useState<QuestionnaireRow[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ questionnaires: QuestionnaireRow[] }>('/api/admin/questionnaires');
    if (!res.ok) {
      setNotice({
        kind: 'error',
        text:
          res.status === 403
            ? 'You are not authorized, or admin auth is not configured yet.'
            : (res.error ?? 'Failed to load.'),
      });
      setLoading(false);
      return;
    }
    setItems(res.data?.questionnaires ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setNotice(null);
    const res = await api<{ draftVersionId: string }>('/api/admin/questionnaires', {
      method: 'POST',
      body: { slug, name },
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Create failed.' });
    router.push(`/questionnaires/${res.data!.draftVersionId}`);
  }

  async function addVersion(questionnaireId: string) {
    setNotice(null);
    const res = await api<{ id: string }>(`/api/admin/questionnaires/${questionnaireId}/versions`, {
      method: 'POST',
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Failed.' });
    router.push(`/questionnaires/${res.data!.id}`);
  }

  return (
    <main className="wide">
      <p className="crumbs">
        <Link href="/dashboard">← Dashboard</Link>
      </p>
      <h1>Questionnaires</h1>
      {notice ? <p className={`status-line ${notice.kind}`}>{notice.text}</p> : null}

      <section className="panel">
        <h2>New questionnaire</h2>
        <label className="field">
          <span>Slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="screening" />
        </label>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Connection screening"
          />
        </label>
        <button className="primary" onClick={create} disabled={!slug || !name}>
          Create + open builder
        </button>
      </section>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No questionnaires yet.</p>
      ) : (
        items.map((q) => (
          <section className="panel" key={q.id}>
            <div className="row spread">
              <h2>
                {q.name} <span className="muted small">/{q.slug}</span>
              </h2>
              <button className="ghost" onClick={() => addVersion(q.id)}>
                + New version
              </button>
            </div>
            <ul className="nav-list">
              {q.versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/questionnaires/${v.id}`}>v{v.versionNumber}</Link> — {v.status}
                  {v.isCurrent ? ' · current (live)' : ''}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
