'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /start — the CTA screen.
 *
 * Client-side POST /api/public/session opens (or reuses) a session cookie
 * (Master §7, Functional §7). Double-click is disabled locally AND server
 * dedup lives in the route handler (Master §7.2).
 */
export default function StartPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function start() {
    if (started.current || busy) return;
    started.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/public/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Could not start the session.');
      }
      router.push('/session');
    } catch (e) {
      setBusy(false);
      started.current = false;
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  // If the browser already has an active session, jump straight to /session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/public/session', { credentials: 'include' });
      if (!cancelled && res.ok) router.replace('/session');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main>
      <h1>Before we say hi</h1>
      <p className="muted">
        A short questionnaire helps us skip the &ldquo;who are you?&rdquo; small talk. The result is
        decided by the server, not your browser.
      </p>
      <div className="panel">
        <p>
          Your progress is saved on the server. You can leave and come back within the session
          window.
        </p>
        <button className="primary" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      </div>
      {error ? (
        <p className="status-line error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
