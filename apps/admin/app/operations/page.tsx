'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/admin-client';

/**
 * Operations (Functional §92–93, §95, §97): read-only submission monitor + audit
 * trail, plus session revoke (the confirmed P0 security control). All values are
 * rendered through React (auto-escaped) since some derive from candidate input.
 */

interface SubmissionRow {
  submissionRef: string;
  resultType: string | null;
  verificationRef: string | null;
  verificationStatus: string | null;
  questionnaireLabel: string;
  submittedAt: string | null;
}
interface SessionRow {
  sessionRef: string;
  sessionStatus: string;
  attemptRef: string;
  attemptStatus: string;
  createdAt: string | null;
  expiresAt: string | null;
}
interface AuditRow {
  id: string;
  createdAt: string | null;
  action: string;
  actorType: string;
  entityType: string | null;
  summary: string | null;
}
interface FindingRow {
  id: string;
  kind: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  detectedAt: string | null;
}

const short = (ref: string) => (ref.length > 16 ? `${ref.slice(0, 14)}…` : ref);
const when = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 19) : '—');

export default function OperationsPage() {
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [subs, sess, aud, integ] = await Promise.all([
      api<{ submissions: SubmissionRow[] }>('/api/admin/submissions'),
      api<{ sessions: SessionRow[] }>('/api/admin/sessions'),
      api<{ events: AuditRow[] }>('/api/admin/audit'),
      api<{ findings: FindingRow[] }>('/api/admin/integrity'),
    ]);
    if (!subs.ok || !sess.ok || !aud.ok || !integ.ok) {
      const first = [subs, sess, aud, integ].find((r) => !r.ok);
      setNotice({
        kind: 'error',
        text:
          first?.status === 403
            ? 'You are not authorized, or admin auth is not configured yet.'
            : (first?.error ?? 'Failed to load.'),
      });
      setLoading(false);
      return;
    }
    setSubmissions(subs.data?.submissions ?? []);
    setSessions(sess.data?.sessions ?? []);
    setAudit(aud.data?.events ?? []);
    setFindings(integ.data?.findings ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(ref: string) {
    setNotice(null);
    const res = await api(`/api/admin/sessions/${ref}/revoke`, { method: 'POST' });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Revoke failed.' });
    setNotice({ kind: 'ok', text: 'Session revoked.' });
    await load();
  }

  async function runScan() {
    setNotice(null);
    const res = await api<{ findingCount: number }>('/api/admin/integrity/scan', {
      method: 'POST',
    });
    if (!res.ok) return setNotice({ kind: 'error', text: res.error ?? 'Scan failed.' });
    setNotice({
      kind: res.data && res.data.findingCount > 0 ? 'error' : 'ok',
      text: `Integrity scan complete: ${res.data?.findingCount ?? 0} finding(s).`,
    });
    await load();
  }

  return (
    <main className="wide">
      <p className="crumbs">
        <Link href="/dashboard">← Dashboard</Link>
      </p>
      <h1>Operations</h1>
      {notice ? <p className={`status-line ${notice.kind}`}>{notice.text}</p> : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <section className="panel">
            <h2>Sessions</h2>
            {sessions.length === 0 ? (
              <p className="muted">No sessions yet.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Status</th>
                      <th>Attempt</th>
                      <th>Started</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.sessionRef}>
                        <td title={s.sessionRef}>{short(s.sessionRef)}</td>
                        <td>{s.sessionStatus}</td>
                        <td>{s.attemptStatus}</td>
                        <td>{when(s.createdAt)}</td>
                        <td>
                          {s.sessionStatus === 'ACTIVE' || s.sessionStatus === 'NEW' ? (
                            <button className="danger" onClick={() => revoke(s.sessionRef)}>
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Submissions</h2>
            {submissions.length === 0 ? (
              <p className="muted">No completed submissions yet.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Result</th>
                      <th>Questionnaire</th>
                      <th>Verification</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.submissionRef}>
                        <td>
                          <span
                            className={`result-badge ${s.resultType === 'PASS' ? 'pass' : 'fail'}`}
                          >
                            {s.resultType ?? '—'}
                          </span>
                        </td>
                        <td>{s.questionnaireLabel}</td>
                        <td>{s.verificationStatus ?? '—'}</td>
                        <td>{when(s.submittedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="row spread">
              <h2>Integrity</h2>
              <button className="ghost" onClick={runScan}>
                Run scan now
              </button>
            </div>
            {findings.length === 0 ? (
              <p className="muted">No integrity findings recorded.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Detected</th>
                      <th>Kind</th>
                      <th>Severity</th>
                      <th>Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f) => (
                      <tr key={f.id}>
                        <td>{when(f.detectedAt)}</td>
                        <td>{f.kind}</td>
                        <td>{f.severity}</td>
                        <td title={f.entityId ?? ''}>
                          {f.entityType ?? '—'}
                          {f.entityId ? ` ${short(f.entityId)}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Audit trail</h2>
            {audit.length === 0 ? (
              <p className="muted">No audit events yet.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.id}>
                        <td>{when(e.createdAt)}</td>
                        <td>{e.action}</td>
                        <td>{e.actorType}</td>
                        <td>{e.summary ?? e.entityType ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
