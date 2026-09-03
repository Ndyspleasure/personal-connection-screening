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
  revision: number | null; // server-known revision; null before first save
  saving: boolean;
  error: string | null;
}

/**
 * /session — the questionnaire.
 *
 * Loads GET /api/public/session + GET /api/public/questionnaire; renders
 * questions from the SERVER-LOCKED version (Master §7, Func §19–21). Every
 * answer PUT is revision-guarded (Func §29, §33). Submit is idempotent from
 * the client too (dedupes clicks locally; server enforces one final).
 */
export default function SessionPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'expired' | 'completed' | 'error'>(
    'loading',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attemptRef, setAttemptRef] = useState<string | null>(null);
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
      const session = (await sessionRes.json()) as {
        attemptRef: string;
        status: string;
      };
      setAttemptRef(session.attemptRef);
      if (session.status === 'COMPLETED') {
        // Fetch our own result and jump to /result/[ref].
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
      // Initialize local answers empty; revision is null until first save.
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
      // Build the payload per question type.
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

  if (status === 'loading')
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    );
  if (status === 'expired') {
    return (
      <main>
        <h1>Session unavailable</h1>
        <p className="muted">
          Your session has expired or is no longer available. Historical progress is safe on the
          server.
        </p>
        <a className="primary" href="/start">
          Start a new session
        </a>
      </main>
    );
  }
  if (status === 'completed') {
    return (
      <main>
        <h1>Already completed</h1>
        <p className="muted">This attempt has already been finalized.</p>
      </main>
    );
  }
  if (status === 'error') {
    return (
      <main>
        <h1>Something went wrong</h1>
        <p className="status-line error">{errorMessage}</p>
        <button className="ghost" onClick={load}>
          Retry
        </button>
      </main>
    );
  }

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

  return (
    <main>
      <h1>Questionnaire</h1>
      <p className="muted">Attempt {attemptRef}. Answers save server-side automatically.</p>

      {questions.map((q) => {
        const a = answers[q.questionVersionId]!;
        return (
          <fieldset key={q.questionVersionId}>
            <legend>
              {q.text}
              {q.required ? ' *' : ''}
            </legend>
            {q.description ? <p className="muted">{q.description}</p> : null}

            {(q.type === 'single_choice' || q.type === 'boolean') && (
              <>
                {q.options.map((opt) => (
                  <label className="option" key={opt.id}>
                    <input
                      type="radio"
                      name={q.questionVersionId}
                      checked={a.selectedOptionVersionIds[0] === opt.id}
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
                ))}
              </>
            )}

            {q.type === 'multiple_choice' && (
              <>
                {q.options.map((opt) => (
                  <label className="option" key={opt.id}>
                    <input
                      type="checkbox"
                      checked={a.selectedOptionVersionIds.includes(opt.id)}
                      onChange={(e) =>
                        setAnswers((s) => {
                          const current = s[q.questionVersionId]!;
                          const set = new Set(current.selectedOptionVersionIds);
                          if (e.target.checked) set.add(opt.id);
                          else set.delete(opt.id);
                          return {
                            ...s,
                            [q.questionVersionId]: {
                              ...current,
                              selectedOptionVersionIds: [...set],
                            },
                          };
                        })
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </>
            )}

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

            <div>
              <button className="ghost" onClick={() => saveAnswer(q)} disabled={a.saving}>
                {a.saving ? 'Saving…' : 'Save'}
              </button>
              {a.error ? <span className="status-line error"> {a.error}</span> : null}
              {a.revision !== null && !a.saving && !a.error ? (
                <span className="status-line"> Saved (rev {a.revision}).</span>
              ) : null}
            </div>
          </fieldset>
        );
      })}

      <button className="primary" onClick={submit} disabled={submitting || requiredMissing}>
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
      {requiredMissing ? (
        <p className="status-line"> Answer all required questions to submit.</p>
      ) : null}
      {submitError ? <p className="status-line error"> {submitError}</p> : null}
    </main>
  );
}
