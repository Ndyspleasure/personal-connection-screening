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
 * /result/[ref] — server-authoritative result page (Func §62–65). Copy stays
 * non-judgmental (Master §28); no numeric score is shown. Refresh returns the
 * same persisted result. Restyled with an entrance animation on the outcome.
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
      <main className="narrow">
        <div
          className="skeleton"
          style={{ height: '2.5rem', width: '70%', marginBottom: '1rem' }}
        />
        <div className="skeleton" style={{ height: '7rem' }} />
      </main>
    );
  if (state.kind === 'error')
    return (
      <main className="narrow">
        <h1 className="enter">Result unavailable</h1>
        <p className="status-line error enter enter-1">{state.message}</p>
        <a className="btn ghost enter enter-2" href="/">
          Back home
        </a>
      </main>
    );

  const r = state.result;
  const pass = r.result === 'PASS';
  return (
    <main className="narrow">
      <span className="eyebrow enter">Your result</span>
      <h1 className="enter enter-1">{pass ? 'You’re in.' : 'Thank you for taking the time.'}</h1>
      <p className="enter enter-2">
        <span className={`result-badge ${pass ? 'pass' : 'fail'}`}>
          {pass ? '✓ ' : ''}
          {r.result}
        </span>
      </p>
      <p className="muted enter enter-2">
        {pass
          ? 'Looks like we have something worth talking about.'
          : 'The result is decided by the server — no hard feelings.'}
      </p>
      <div className="panel enter enter-3">
        <p className="muted small" style={{ margin: 0 }}>
          Completed {new Date(r.completedAt).toLocaleString()} · Reference {r.resultRef}
        </p>
        {r.verificationRef ? (
          <p className="small" style={{ marginBottom: 0 }}>
            Public verification:{' '}
            <Link href={`/verify/${r.verificationRef}`}>{r.verificationRef}</Link>
          </p>
        ) : null}
      </div>
      {pass && r.contactAvailable && r.resultRef ? (
        <Link className="btn primary enter enter-4" href={`/contact/${r.resultRef}`}>
          Continue to chat →
        </Link>
      ) : null}
    </main>
  );
}
