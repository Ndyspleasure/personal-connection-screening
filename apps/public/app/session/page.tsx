'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface QuestionView {
  position: number;
  questionVersionId: string;
  type: 'single_choice' | 'multiple_choice' | 'boolean' | 'text' | 'numeric';
  text: string;
  description: string | null;
  required: boolean;
  options: { id: string; value: string; label: string }[];
}

interface AnswerLocalState {
  selectedOptionVersionIds: string[];
  textValue: string;
  numericValue: string;
  revision: number | null;
  saving: boolean;
  error: string | null;
}

/**
 * /session — the questionnaire. Server-locked version, revision-guarded saves,
 * idempotent submit (logic unchanged). Restyled to the premium system with
 * per-answer feedback, a progress indicator, and reduced-motion-safe animation.
 */
export default function SessionPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'expired' | 'completed' | 'error'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerLocalState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => `sub_${crypto.randomUUID()}`, []);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const sessionRes = await fetch('/api/public/session', { credentials: 'include' });
      if (sessionRes.status === 404 || sessionRes.status === 410) {
        setStatus('expired');
        return;
      }
      if (!sessionRes.ok) throw new Error('session fetch failed');
      const session = (await sessionRes.json()) as { attemptRef: string; status: string };
      if (session.status === 'COMPLETED') {
        setStatus('completed');
        return;
      }
      if (session.status !== 'ACTIVE') {
        setStatus('expired');
        return;
      }

      const qRes = await fetch('/api/public/questionnaire', { credentials: 'include' });
      if (!qRes.ok) throw new Error('questionnaire fetch failed');
      const q = (await qRes.json()) as { questions: QuestionView[] };
      setQuestions(q.questions);
      const init: Record<string, AnswerLocalState> = {};
      for (const qq of q.questions) {
        init[qq.questionVersionId] = {
          selectedOptionVersionIds: [],
          textValue: '',
          numericValue: '',
          revision: null,
          saving: false,
          error: null,
        };
      }
      setAnswers(init);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setErrorMessage(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveAnswer = useCallback(
    async (q: QuestionView) => {
      const current = answers[q.questionVersionId];
      if (!current) return;
      const payload: Record<string, unknown> = {
        questionVersionId: q.questionVersionId,
        expectedRevision: current.revision,
      };
      if (q.type === 'single_choice' || q.type === 'boolean' || q.type === 'multiple_choice') {
        payload.selectedOptionVersionIds = current.selectedOptionVersionIds;
      } else if (q.type === 'text') {
        payload.textValue = current.textValue;
      } else if (q.type === 'numeric') {
        payload.numericValue = current.numericValue === '' ? null : Number(current.numericValue);
      }
      setAnswers((s) => ({
        ...s,
        [q.questionVersionId]: { ...s[q.questionVersionId]!, saving: true, error: null },
      }));
      try {
        const res = await fetch('/api/public/answer', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'Save failed.');
        }
        const parsed = (await res.json()) as { revision: number };
        setAnswers((s) => ({
          ...s,
          [q.questionVersionId]: {
            ...s[q.questionVersionId]!,
            saving: false,
            error: null,
            revision: parsed.revision,
          },
        }));
      } catch (e) {
        setAnswers((s) => ({
          ...s,
          [q.questionVersionId]: {
            ...s[q.questionVersionId]!,
            saving: false,
            error: e instanceof Error ? e.message : 'Save failed.',
          },
        }));
      }
    },
    [answers],
  );

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/public/submission', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Could not finalize.');
      }
      const parsed = (await res.json()) as { resultRef: string };
      router.push(`/result/${parsed.resultRef}`);
    } catch (e) {
      setSubmitting(false);
      setSubmitError(e instanceof Error ? e.message : 'Could not finalize.');
    }
  }, [idempotencyKey, router, submitting]);

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const a = answers[q.questionVersionId];
        if (!a) return false;
        if (q.type === 'text') return a.textValue.trim() !== '';
        if (q.type === 'numeric') return a.numericValue !== '';
        return a.selectedOptionVersionIds.length > 0;
      }).length,
    [questions, answers],
  );

  if (status === 'loading')
    return (
      <main className="narrow">
        <div
          className="skeleton"
          style={{ height: '2rem', width: '60%', marginBottom: '1.5rem' }}
        />
        <div className="skeleton" style={{ height: '9rem', marginBottom: '1rem' }} />
        <div className="skeleton" style={{ height: '9rem' }} />
      </main>
    );
  if (status === 'expired')
    return (
      <main className="narrow">
        <h1 className="enter">Session unavailable</h1>
        <p className="muted enter enter-1">
          Your session has expired or is no longer available. Historical progress is safe on the
          server.
        </p>
        <a className="btn primary enter enter-2" href="/start">
          Start a new session
        </a>
      </main>
    );
  if (status === 'completed')
    return (
      <main className="narrow">
        <h1 className="enter">Already completed</h1>
        <p className="muted enter enter-1">This attempt has already been finalized.</p>
        <a className="btn ghost enter enter-2" href="/">
          Back home
        </a>
      </main>
    );
  if (status === 'error')
    return (
      <main className="narrow">
        <h1 className="enter">Something went wrong</h1>
        <p className="status-line error enter enter-1">{errorMessage}</p>
        <button className="btn subtle enter enter-2" onClick={load}>
          Retry
        </button>
      </main>
    );

  const requiredMissing = questions.some((q) => {
    if (!q.required) return false;
    const a = answers[q.questionVersionId];
    if (!a) return true;
    if (q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'boolean') {
      return a.selectedOptionVersionIds.length === 0;
    }
    if (q.type === 'text') return a.textValue.trim() === '';
    if (q.type === 'numeric') return a.numericValue === '';
    return true;
  });
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <main className="narrow">
      <span className="eyebrow enter">Questionnaire</span>
      <h1 className="enter enter-1" style={{ fontSize: 'clamp(1.6rem, 3vw + 1rem, 2.2rem)' }}>
        A few honest questions
      </h1>
      <p className="muted enter enter-1">Answers save on the server as you go.</p>

      <div
        className="enter enter-2"
        aria-hidden="true"
        style={{
          height: '0.4rem',
          borderRadius: '999px',
          background: 'var(--surface-2)',
          overflow: 'hidden',
          margin: '0.5rem 0 1.5rem',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'var(--grad-primary)',
            transition: 'width 0.3s var(--ease)',
          }}
        />
      </div>

      {questions.map((q, i) => {
        const a = answers[q.questionVersionId]!;
        const saved = a.revision !== null && !a.saving && !a.error;
        return (
          <section
            className={`panel enter enter-${Math.min(i + 1, 4)}`}
            key={q.questionVersionId}
            style={{ marginBottom: '1rem' }}
          >
            <h2 style={{ marginTop: 0 }}>
              {q.text}
              {q.required ? <span style={{ color: 'var(--primary)' }}> *</span> : null}
            </h2>
            {q.description ? <p className="muted small">{q.description}</p> : null}

            {(q.type === 'single_choice' || q.type === 'boolean') &&
              q.options.map((opt) => {
                const on = a.selectedOptionVersionIds[0] === opt.id;
                return (
                  <label className={`choice${on ? ' selected' : ''}`} key={opt.id}>
                    <input
                      type="radio"
                      name={q.questionVersionId}
                      checked={on}
                      onChange={() =>
                        setAnswers((s) => ({
                          ...s,
                          [q.questionVersionId]: {
                            ...s[q.questionVersionId]!,
                            selectedOptionVersionIds: [opt.id],
                          },
                        }))
                      }
                    />
                    {opt.label}
                  </label>
                );
              })}

            {q.type === 'multiple_choice' &&
              q.options.map((opt) => {
                const on = a.selectedOptionVersionIds.includes(opt.id);
                return (
                  <label className={`choice${on ? ' selected' : ''}`} key={opt.id}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setAnswers((s) => {
                          const cur = s[q.questionVersionId]!;
                          const set = new Set(cur.selectedOptionVersionIds);
                          if (e.target.checked) set.add(opt.id);
                          else set.delete(opt.id);
                          return {
                            ...s,
                            [q.questionVersionId]: { ...cur, selectedOptionVersionIds: [...set] },
                          };
                        })
                      }
                    />
                    {opt.label}
                  </label>
                );
              })}

            {q.type === 'text' && (
              <textarea
                rows={3}
                value={a.textValue}
                onChange={(e) =>
                  setAnswers((s) => ({
                    ...s,
                    [q.questionVersionId]: {
                      ...s[q.questionVersionId]!,
                      textValue: e.target.value,
                    },
                  }))
                }
              />
            )}

            {q.type === 'numeric' && (
              <input
                type="number"
                value={a.numericValue}
                onChange={(e) =>
                  setAnswers((s) => ({
                    ...s,
                    [q.questionVersionId]: {
                      ...s[q.questionVersionId]!,
                      numericValue: e.target.value,
                    },
                  }))
                }
              />
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginTop: '0.75rem',
              }}
            >
              <button
                className={`btn subtle${a.saving ? ' busy' : ''}${saved ? ' ok' : ''}`}
                onClick={() => saveAnswer(q)}
                disabled={a.saving}
              >
                {a.saving ? 'Saving…' : saved ? '✓ Saved' : 'Save answer'}
              </button>
              {a.error ? <span className="status-line error">{a.error}</span> : null}
            </div>
          </section>
        );
      })}

      <button
        className={`btn primary block${submitting ? ' busy' : ''}`}
        onClick={submit}
        disabled={submitting || requiredMissing}
        style={{ marginTop: '0.5rem' }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
      {requiredMissing ? (
        <p className="status-line">Answer all required questions to submit.</p>
      ) : null}
      {submitError ? (
        <p className="status-line error" role="alert">
          {submitError}
        </p>
      ) : null}
    </main>
  );
}
