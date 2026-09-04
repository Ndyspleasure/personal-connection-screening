'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/admin-client';

/**
 * Questionnaire builder (Functional §81–86, §110). Add questions to a DRAFT
 * version, define per-option scoring + a passing score, then publish — the
 * server runs the atomic publish pipeline and re-validates everything. A
 * PUBLISHED version is immutable and can only be archived.
 */

interface OptionView {
  id: string;
  value: string;
  label: string;
}
interface QuestionView {
  questionVersionId: string;
  position: number;
  type: string;
  text: string;
  description: string | null;
  required: boolean;
  options: OptionView[];
}
interface VersionDetail {
  id: string;
  questionnaireId: string;
  versionNumber: number;
  status: string;
  revision: number;
  scoringVersionId: string | null;
  isCurrent: boolean;
  questions: QuestionView[];
  scoring: { id: string; status: string; passingScore: number } | null;
}

const TYPES = ['single_choice', 'multiple_choice', 'boolean', 'text', 'numeric'] as const;
const hasOptions = (t: string) =>
  t === 'single_choice' || t === 'multiple_choice' || t === 'boolean';

export default function BuilderPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = use(params);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Add-question form.
  const [qType, setQType] = useState<string>('single_choice');
  const [qText, setQText] = useState('');
  const [qRequired, setQRequired] = useState(true);
  const [qOptions, setQOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: '' },
  ]);

  // Scoring editor.
  const [passingScore, setPassingScore] = useState(1);
  const [points, setPoints] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<VersionDetail>(`/api/admin/questionnaire-versions/${versionId}`);
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
    setDetail(res.data);
    setPoints((prev) => {
      const next = { ...prev };
      for (const q of res.data?.questions ?? []) {
        for (const o of q.options) if (!(o.id in next)) next[o.id] = 0;
      }
      return next;
    });
    setLoading(false);
  }, [versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onPickType(t: string) {
    setQType(t);
    if (t === 'boolean')
      setQOptions([
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ]);
    else if (hasOptions(t)) setQOptions([{ value: '', label: '' }]);
    else setQOptions([]);
  }

  async function addQuestion() {
    setNotice(null);
    const options = hasOptions(qType)
      ? qOptions.filter((o) => o.value.trim() && o.label.trim())
      : undefined;
    const res = await api(`/api/admin/questionnaire-versions/${versionId}/questions`, {
      method: 'POST',
      body: {
        type: qType,
        text: qText,
        required: qRequired,
        ...(options && options.length > 0 ? { options } : {}),
      },
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Add failed.' });
    setQText('');
    onPickType(qType);
    setNotice({ kind: 'ok', text: 'Question added.' });
    await load();
  }

  async function publish() {
    setNotice(null);
    const rules = (detail?.questions ?? [])
      .flatMap((q) => q.options)
      .map((o) => ({ optionVersionId: o.id, points: Number(points[o.id] ?? 0) }));
    if (rules.length === 0) {
      return setNotice({
        kind: 'error',
        text: 'Add at least one choice/boolean question so scoring can be defined.',
      });
    }
    const res = await api(`/api/admin/questionnaire-versions/${versionId}/publish`, {
      method: 'POST',
      body: { passingScore: Number(passingScore), rules },
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Publish failed.' });
    setNotice({ kind: 'ok', text: 'Published — this version is now live and immutable.' });
    await load();
  }

  async function archive() {
    setNotice(null);
    const res = await api(`/api/admin/questionnaire-versions/${versionId}/archive`, {
      method: 'POST',
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Archive failed.' });
    setNotice({ kind: 'ok', text: 'Archived.' });
    await load();
  }

  if (loading)
    return (
      <main className="wide">
        <p className="muted">Loading…</p>
      </main>
    );
  if (!detail)
    return (
      <main className="wide">
        <p className="crumbs">
          <Link href="/questionnaires">← Questionnaires</Link>
        </p>
        {notice ? <p className={`status-line ${notice.kind}`}>{notice.text}</p> : null}
      </main>
    );

  const isDraft = detail.status === 'DRAFT';
  const allOptions = detail.questions.flatMap((q) => q.options.map((o) => ({ q, o })));

  return (
    <main className="wide">
      <p className="crumbs">
        <Link href="/questionnaires">← Questionnaires</Link>
      </p>
      <h1>
        Version {detail.versionNumber}{' '}
        <span className="muted small">
          · {detail.status}
          {detail.isCurrent ? ' · current (live)' : ''}
        </span>
      </h1>
      {notice ? <p className={`status-line ${notice.kind}`}>{notice.text}</p> : null}

      <section className="panel">
        <h2>Questions</h2>
        {detail.questions.length === 0 ? (
          <p className="muted">No questions yet.</p>
        ) : (
          detail.questions.map((q) => (
            <fieldset key={q.questionVersionId}>
              <legend>
                #{q.position + 1} · {q.type}
                {q.required ? ' · required' : ''}
              </legend>
              <p>{q.text}</p>
              {q.options.length > 0 ? (
                <ul className="nav-list">
                  {q.options.map((o) => (
                    <li key={o.id}>
                      {o.label} <span className="muted small">({o.value})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </fieldset>
          ))
        )}
      </section>

      {isDraft ? (
        <>
          <section className="panel">
            <h2>Add question</h2>
            <label className="field">
              <span>Type</span>
              <select value={qType} onChange={(e) => onPickType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Question text</span>
              <input value={qText} onChange={(e) => setQText(e.target.value)} />
            </label>
            <label className="option">
              <input
                type="checkbox"
                checked={qRequired}
                onChange={(e) => setQRequired(e.target.checked)}
              />
              Required
            </label>
            {hasOptions(qType) ? (
              <div>
                <p className="muted small">Options</p>
                {qOptions.map((o, i) => (
                  <div className="row" key={i}>
                    <label className="field inline">
                      <span>Value</span>
                      <input
                        value={o.value}
                        onChange={(e) =>
                          setQOptions((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <label className="field inline">
                      <span>Label</span>
                      <input
                        value={o.label}
                        onChange={(e) =>
                          setQOptions((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <button
                      className="danger"
                      onClick={() => setQOptions((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="ghost"
                  onClick={() => setQOptions((prev) => [...prev, { value: '', label: '' }])}
                >
                  + Option
                </button>
              </div>
            ) : null}
            <div className="row">
              <button className="primary" onClick={addQuestion} disabled={!qText.trim()}>
                Add question
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Scoring & publish</h2>
            <p className="muted small">
              Assign points per option; the score is the sum of selected options. A candidate passes
              at or above the passing score.
            </p>
            {allOptions.length === 0 ? (
              <p className="muted">Add a choice or boolean question to score.</p>
            ) : (
              allOptions.map(({ q, o }) => (
                <label className="field" key={o.id}>
                  <span>
                    {q.text} → {o.label}
                  </span>
                  <input
                    type="number"
                    value={points[o.id] ?? 0}
                    onChange={(e) =>
                      setPoints((prev) => ({ ...prev, [o.id]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))
            )}
            <label className="field">
              <span>Passing score</span>
              <input
                type="number"
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
              />
            </label>
            <button className="primary" onClick={publish} disabled={allOptions.length === 0}>
              Publish version
            </button>
          </section>
        </>
      ) : detail.status === 'PUBLISHED' ? (
        <section className="panel">
          <h2>Published</h2>
          <p className="muted">
            This version is immutable. Passing score: {detail.scoring?.passingScore ?? '—'}.
          </p>
          <button className="danger" onClick={archive}>
            Archive version
          </button>
        </section>
      ) : null}
    </main>
  );
}
