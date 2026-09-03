'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

interface ResultView {
  resultRef: string;
  result: 'PASS' | 'FAIL';
  completedAt: string;
  verificationRef: string | null;
  contactAvailable: boolean;
}

/**
 * /result/[ref] — server-authoritative result page (Func §62–65).
 *
 * Copy stays non-judgmental (Master §28). Numeric score is deliberately NOT
 * shown to the public (confirmed decision). Refresh returns the same result
 * because the server has already persisted it (Func §63).
 */
export default function ResultPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; result: ResultView }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/result/${encodeURIComponent(ref)}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'Result unavailable.');
        }
        const parsed = (await res.json()) as ResultView;
        if (!cancelled) setState({ kind: 'ok', result: parsed });
      } catch (e) {
        if (!cancelled)
          setState({
            kind: 'error',
            message: e instanceof Error ? e.message : 'Result unavailable.',
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (state.kind === 'loading')
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    );
  if (state.kind === 'error')
    return (
      <main>
        <h1>Result unavailable</h1>
        <p className="status-line error">{state.message}</p>
      </main>
    );

  const r = state.result;
  const pass = r.result === 'PASS';
  return (
    <main>
      <h1>
        {pass ? "You're in." : 'Not a match for this connection flow.'}{' '}
        <span className={`result-badge ${pass ? 'pass' : 'fail'}`}>{r.result}</span>
      </h1>
      <p className="muted">
        {pass
          ? 'Looks like we have something worth talking about.'
          : 'Thank you for taking the time.'}
      </p>
      <div className="panel">
        <p className="muted">
          Completed {new Date(r.completedAt).toLocaleString()}. Reference {r.resultRef}.
        </p>
        {r.verificationRef ? (
          <p>
            Public verification:{' '}
            <Link href={`/verify/${r.verificationRef}`}>{r.verificationRef}</Link>
          </p>
        ) : null}
      </div>
      {pass && r.contactAvailable && r.resultRef ? (
        <Link className="primary" href={`/contact/${r.resultRef}`}>
          Continue to chat
        </Link>
      ) : null}
    </main>
  );
}
