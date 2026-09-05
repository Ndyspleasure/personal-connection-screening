'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/admin-client';

/**
 * Policy manager (Functional §90–91). Edits the versioned policy that governs
 * NEW sessions — session lifetime, questionnaire time limit, resume, and retake.
 * Each save is a new DRAFT; publishing makes it live for new sessions only
 * (historical attempts keep their snapshot).
 */

const RETAKE_MODES = ['NEVER', 'ON_NEW_VERSION', 'AFTER_COOLDOWN', 'ADMIN_APPROVAL', 'UNLIMITED'];

interface PolicyView {
  id: string;
  versionNumber: number;
  status: string;
  sessionLifetimeSeconds: number;
  questionnaireTimeLimitSeconds: number | null;
  timerMode: string;
  allowResume: boolean;
  allowMultiDevice: boolean;
  retakeMode: string;
  maxAttempts: number;
  cooldownSeconds: number;
}
interface PolicyState {
  configId: string | null;
  currentPublished: PolicyView | null;
  versions: PolicyView[];
}

const DEFAULTS = {
  sessionLifetimeSeconds: 86400,
  questionnaireTimeLimitSeconds: 1800,
  allowResume: true,
  allowMultiDevice: true,
  retakeMode: 'ON_NEW_VERSION',
  maxAttempts: 3,
  cooldownSeconds: 0,
};

export default function PolicyPage() {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [state, setState] = useState<PolicyState | null>(null);
  const [form, setForm] = useState({ ...DEFAULTS });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<PolicyState>('/api/admin/policy');
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
    setState(res.data);
    const cur = res.data?.currentPublished;
    if (cur) {
      setForm({
        sessionLifetimeSeconds: cur.sessionLifetimeSeconds,
        questionnaireTimeLimitSeconds: cur.questionnaireTimeLimitSeconds ?? 0,
        allowResume: cur.allowResume,
        allowMultiDevice: cur.allowMultiDevice,
        retakeMode: cur.retakeMode,
        maxAttempts: cur.maxAttempts,
        cooldownSeconds: cur.cooldownSeconds,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDraft() {
    setNotice(null);
    const res = await api<PolicyView>('/api/admin/policy', { method: 'POST', body: form });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Save failed.' });
    setNotice({ kind: 'ok', text: `Draft v${res.data?.versionNumber} saved.` });
    await load();
  }

  async function publish(versionId: string) {
    setNotice(null);
    const res = await api<PolicyView>(`/api/admin/policy/${versionId}/publish`, { method: 'POST' });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Publish failed.' });
    setNotice({ kind: 'ok', text: 'Policy published — live for new sessions.' });
    await load();
  }

  return (
    <main className="wide">
      <p className="crumbs">
        <Link href="/dashboard">← Dashboard</Link>
      </p>
      <h1>Policy</h1>
      <p className="muted">
        Governs new sessions only. Timer mode is absolute (a fixed deadline from start).
      </p>
      {notice ? <p className={`status-line ${notice.kind}`}>{notice.text}</p> : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section className="panel">
            <h2>Edit policy</h2>
            <label className="field">
              <span>Session lifetime (seconds)</span>
              <input
                type="number"
                value={form.sessionLifetimeSeconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sessionLifetimeSeconds: Number(e.target.value) }))
                }
              />
            </label>
            <label className="field">
              <span>Questionnaire time limit (seconds, 0 = none)</span>
              <input
                type="number"
                value={form.questionnaireTimeLimitSeconds}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    questionnaireTimeLimitSeconds: Number(e.target.value),
                  }))
                }
              />
            </label>
            <div className="row">
              <label className="field inline">
                <span>Retake mode</span>
                <select
                  value={form.retakeMode}
                  onChange={(e) => setForm((f) => ({ ...f, retakeMode: e.target.value }))}
                >
                  {RETAKE_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field inline">
                <span>Max attempts</span>
                <input
                  type="number"
                  value={form.maxAttempts}
                  onChange={(e) => setForm((f) => ({ ...f, maxAttempts: Number(e.target.value) }))}
                />
              </label>
              <label className="field inline">
                <span>Cooldown (seconds)</span>
                <input
                  type="number"
                  value={form.cooldownSeconds}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cooldownSeconds: Number(e.target.value) }))
                  }
                />
              </label>
            </div>
            <label className="option">
              <input
                type="checkbox"
                checked={form.allowResume}
                onChange={(e) => setForm((f) => ({ ...f, allowResume: e.target.checked }))}
              />
              Allow resume
            </label>
            <label className="option">
              <input
                type="checkbox"
                checked={form.allowMultiDevice}
                onChange={(e) => setForm((f) => ({ ...f, allowMultiDevice: e.target.checked }))}
              />
              Allow multi-device
            </label>
            <button className="primary" onClick={saveDraft}>
              Save draft
            </button>
          </section>

          <section className="panel">
            <h2>Versions</h2>
            {state?.currentPublished ? (
              <p className="muted small">
                Live: v{state.currentPublished.versionNumber} · lifetime{' '}
                {state.currentPublished.sessionLifetimeSeconds}s · retake{' '}
                {state.currentPublished.retakeMode}
              </p>
            ) : (
              <p className="muted">No published policy yet.</p>
            )}
            {(state?.versions ?? []).length === 0 ? null : (
              <ul className="nav-list">
                {state!.versions.map((v) => (
                  <li key={v.id}>
                    v{v.versionNumber} — {v.status}
                    {v.status === 'DRAFT' ? (
                      <>
                        {' '}
                        <button className="ghost" onClick={() => publish(v.id)}>
                          Publish
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
