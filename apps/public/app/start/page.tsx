'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /start — a direct entry point for the open session (Perkenalan Teman). The
 * picker on the home page is the primary route; this keeps a shareable,
 * single-purpose start screen. Server dedupes double-starts (Master §7.2).
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
    <main className="narrow">
      <span className="eyebrow enter">✦ Before we say hi</span>
      <h1 className="enter enter-1">
        <span className="gradient-text">A short, honest questionnaire</span>
      </h1>
      <p className="muted enter enter-2">
        It helps us skip the “who are you?” small talk. The result is decided by the server, not
        your browser.
      </p>
      <div className="panel enter enter-3">
        <p style={{ marginTop: 0 }}>
          Your progress is saved on the server. You can leave and come back within the session
          window.
        </p>
        <button
          className={`btn primary block${busy ? ' busy' : ''}`}
          onClick={start}
          disabled={busy}
        >
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
