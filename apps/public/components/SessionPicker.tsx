'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccessCodeModal } from './AccessCodeModal';
import { ToastView, useToast } from './Toast';

interface SessionView {
  key: string;
  name: string;
  description: string | null;
  tagline: string | null;
  requiresAccessCode: boolean;
  accent: string | null;
  order: number;
  state: 'available' | 'active' | 'completed';
}

/**
 * SessionPicker — the candidate's choice between sessions (Perkenalan Teman,
 * Pendekatan, …). Fully data-driven from GET /api/public/sessions (nothing
 * hardcoded). Open sessions start immediately; gated sessions open the access
 * code modal. Skeletons while loading; a graceful single-CTA fallback if no
 * sessions are configured yet.
 */
export function SessionPicker() {
  const router = useRouter();
  const { toast, notify, clear } = useToast();
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [gated, setGated] = useState<SessionView | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch('/api/public/sessions', { credentials: 'include' });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { sessions: SessionView[] };
      setSessions(data.sessions);
    } catch {
      setFailed(true);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOpen = useCallback(
    async (s: SessionView) => {
      if (busyKey) return;
      setBusyKey(s.key);
      try {
        const res = await fetch('/api/public/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionKey: s.key }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          notify('error', body.error?.message ?? 'Could not start the session.');
          setBusyKey(null);
          return;
        }
        router.push('/session');
      } catch {
        notify('error', 'Connection problem. Please try again.');
        setBusyKey(null);
      }
    },
    [busyKey, notify, router],
  );

  function activate(s: SessionView) {
    if (s.requiresAccessCode && s.state === 'available') {
      setGated(s);
    } else {
      void startOpen(s);
    }
  }

  // Loading skeletons.
  if (sessions === null) {
    return (
      <div className="picker" aria-hidden="true">
        <div className="skeleton" style={{ height: '11rem' }} />
        <div className="skeleton" style={{ height: '11rem' }} />
      </div>
    );
  }

  // No sessions configured yet → graceful single CTA (legacy start).
  if (sessions.length === 0) {
    return (
      <div className="enter enter-2" style={{ marginTop: '1.5rem' }}>
        {failed ? (
          <p className="status-line error" role="alert">
            We couldn’t load the sessions. Please refresh.
          </p>
        ) : null}
        <Link className="btn primary" href="/start">
          Get started
        </Link>
      </div>
    );
  }

  const ctaLabel = (s: SessionView) =>
    s.state === 'active'
      ? 'Continue'
      : s.state === 'completed'
        ? 'View again'
        : s.requiresAccessCode
          ? 'Enter code'
          : 'Begin';

  return (
    <>
      <div className="picker">
        {sessions.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`session-card enter enter-${Math.min(i + 1, 4)}${s.requiresAccessCode ? ' gated' : ''}`}
            onClick={() => activate(s)}
            disabled={busyKey !== null}
            aria-label={`${s.name}${s.requiresAccessCode ? ' (requires access code)' : ''}`}
          >
            <div className="card-head">
              <h3>{s.name}</h3>
              {s.requiresAccessCode ? <span className="lock-badge">🔒 Invite</span> : null}
            </div>
            {s.tagline ? <p className="eyebrow">{s.tagline}</p> : null}
            <p className="desc">
              {s.description ??
                (s.requiresAccessCode
                  ? 'An exclusive session — you’ll need an access code.'
                  : 'Start getting to know each other.')}
            </p>
            <span className="card-cta">
              {busyKey === s.key ? <span className="spinner" /> : null}
              {s.state === 'active' || s.state === 'completed' ? (
                <span className="state-chip">{s.state}</span>
              ) : null}
              {busyKey === s.key ? 'Starting…' : `${ctaLabel(s)} →`}
            </span>
          </button>
        ))}
      </div>

      {gated ? (
        <AccessCodeModal
          sessionKey={gated.key}
          sessionName={gated.name}
          onClose={() => setGated(null)}
        />
      ) : null}

      <ToastView toast={toast} onDone={clear} />
    </>
  );
}
