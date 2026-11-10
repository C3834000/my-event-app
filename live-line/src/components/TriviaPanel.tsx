import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, maskPhone, type LiveState, type LlEvent, type Question } from '../api';

type Props = {
  live: LiveState | null;
  activeEvent: LlEvent | null;
  refresh: () => Promise<void>;
  notify: (m: string) => void;
  onAuthError: (e: unknown) => void;
};

const EMPTY = { text: '', options: ['', '', '', ''], correct: '1', points: '10' };

export default function TriviaPanel({ live, activeEvent, refresh, notify, onAuthError }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeEvent) return;
    try {
      setQuestions(await api<Question[]>(`admin/questions?event=${activeEvent.id}`));
    } catch (err) {
      onAuthError(err);
    }
  }, [activeEvent, onAuthError]);

  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      notify(okMsg);
      await Promise.all([load(), refresh()]);
    } catch (err) {
      onAuthError(err);
      notify(err instanceof ApiError ? err.message : 'הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!activeEvent) return;
    const body = {
      text: form.text,
      options: form.options.map((o) => o.trim()).filter((o, i, arr) => o || arr.slice(i + 1).some(Boolean)),
      correct: form.correct,
      points: Number(form.points),
    };
    await act(
      () => (editing
        ? api(`admin/questions/${editing}`, { method: 'PATCH', body })
        : api('admin/questions', { method: 'POST', body: { ...body, event_id: activeEvent.id } })),
      editing ? 'השאלה עודכנה' : 'השאלה נוספה',
    );
    setForm(EMPTY);
    setEditing(null);
  }

  function startEdit(q: Question) {
    setEditing(q.id);
    const opts = [...q.options];
    while (opts.length < 4) opts.push('');
    setForm({ text: q.text, options: opts, correct: q.correct || '1', points: String(q.points) });
  }

  if (!activeEvent) return <div className="banner warn">בחרו אירוע פעיל בלשונית "אירועים" כדי לנהל טריוויה.</div>;

  const open = live?.openQuestion || null;
  const listeners = live?.counts.listeners || 0;

  return (
    <div className="two-col">
      <div className="stack">
        {open && (
          <section className="card open-q">
            <div className="row-between">
              <h2>שאלה פתוחה</h2>
              <Elapsed since={open.opened_at} />
            </div>
            <p className="qtext">{open.text}</p>
            <p className="muted">ענו {open.totalAnswers} מתוך {listeners} מחוברים. המשתתפים מקישים את מספר התשובה בטלפון.</p>
            <Distribution q={open} />
            <div className="toolbar">
              <span>התשובה הנכונה:</span>
              <CloseButtons q={open} busy={busy} onClose={(correct) => act(() => api(`admin/questions/${open.id}/close`, { method: 'POST', body: { correct } }), 'השאלה נסגרה והניקוד עודכן')} />
            </div>
          </section>
        )}

        <section className="card">
          <h2>{editing ? 'עריכת שאלה' : 'שאלה חדשה'}</h2>
          <form className="form" onSubmit={save}>
            <label>
              השאלה
              <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required maxLength={500} rows={2} />
            </label>
            <div className="options">
              {form.options.map((o, i) => (
                <label key={i} className="opt">
                  <span className="opt-num">{i + 1}</span>
                  <input value={o} maxLength={120} placeholder={`תשובה ${i + 1}`} onChange={(e) => {
                    const options = [...form.options];
                    options[i] = e.target.value;
                    setForm({ ...form, options });
                  }} />
                  <input type="radio" name="correct" checked={form.correct === String(i + 1)} onChange={() => setForm({ ...form, correct: String(i + 1) })} aria-label={`תשובה ${i + 1} נכונה`} />
                </label>
              ))}
            </div>
            <div className="toolbar">
              {form.options.length < 9 && <button type="button" className="btn small" onClick={() => setForm({ ...form, options: [...form.options, ''] })}>+ תשובה</button>}
              <label className="inline">ניקוד <input type="number" min={0} max={1000} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
              <span className="spacer" />
              {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(EMPTY); }}>ביטול</button>}
              <button className="btn primary" disabled={busy}>{editing ? 'שמירה' : 'הוספה'}</button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="row-between">
            <h2>שאלות ({questions.length})</h2>
            <button className="btn small danger" disabled={busy || questions.length === 0} onClick={() => {
              if (window.confirm('לאפס את כל התשובות והניקוד של האירוע?')) act(() => api('admin/trivia/reset', { method: 'POST', body: { event_id: activeEvent.id } }), 'המשחק אופס');
            }}>איפוס משחק</button>
          </div>
          <ol className="qlist">
            {questions.map((q) => (
              <li key={q.id} className={`q ${q.status}`}>
                <div className="q-main">
                  <span className={`status ${q.status}`}>{{ draft: 'ממתינה', open: 'פתוחה', closed: 'נסגרה' }[q.status]}</span>
                  <span className="qtext">{q.text}</span>
                </div>
                {q.options.length > 0 && (
                  <div className="q-opts">
                    {q.options.map((o, i) => o && <span key={i} className={q.correct === String(i + 1) ? 'opt-chip correct' : 'opt-chip'}>{i + 1}. {o}</span>)}
                  </div>
                )}
                <div className="toolbar">
                  <span className="muted small">{q.points} נק׳ · נכונה: {q.correct || '—'}</span>
                  <span className="spacer" />
                  {q.status !== 'open' && <button className="btn small primary" disabled={busy || Boolean(open)} onClick={() => act(() => api(`admin/questions/${q.id}/open`, { method: 'POST' }), 'השאלה נפתחה. ההקשות אופסו')}>{q.status === 'closed' ? 'פתיחה מחדש' : 'פתיחה'}</button>}
                  {q.status !== 'open' && <button className="btn small" disabled={busy} onClick={() => startEdit(q)}>עריכה</button>}
                  {q.status !== 'open' && <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm('למחוק את השאלה?')) act(() => api(`admin/questions/${q.id}`, { method: 'DELETE' }), 'השאלה נמחקה'); }}>מחיקה</button>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="card leaderboard">
        <h2>טבלת מובילים</h2>
        <ol>
          {(live?.leaderboard || []).slice(0, 20).map((r, i) => (
            <li key={r.phone}>
              <span className="rank">{i + 1}</span>
              <span className="lname">{r.name || maskPhone(r.phone.startsWith('id:') ? '' : r.phone)}</span>
              <span className="lscore">{r.score}</span>
            </li>
          ))}
        </ol>
        {(live?.leaderboard || []).length === 0 && <p className="muted">הניקוד יופיע אחרי סגירת השאלה הראשונה.</p>}
      </aside>
    </div>
  );
}

function Distribution({ q }: { q: Question & { distribution: Record<string, number>; totalAnswers: number } }) {
  const n = Math.max(q.options.length, 4);
  const max = Math.max(1, ...Object.values(q.distribution));
  return (
    <div className="dist">
      {Array.from({ length: n }, (_, i) => String(i + 1)).map((d) => {
        const v = q.distribution[d] || 0;
        return (
          <div key={d} className="dist-row">
            <span className="dist-label">{d}{q.options[Number(d) - 1] ? `. ${q.options[Number(d) - 1]}` : ''}</span>
            <span className="dist-bar"><span style={{ width: `${(v / max) * 100}%` }} /></span>
            <span className="dist-val">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function CloseButtons({ q, busy, onClose }: { q: Question; busy: boolean; onClose: (correct: string) => void }) {
  const n = Math.max(q.options.length, 4);
  return (
    <>
      {Array.from({ length: n }, (_, i) => String(i + 1)).map((d) => (
        <button key={d} className={q.correct === d ? 'btn small primary' : 'btn small'} disabled={busy} onClick={() => onClose(d)}>
          {d}
        </button>
      ))}
      <span className="muted small">(לחיצה סוגרת את השאלה ומחשבת ניקוד)</span>
    </>
  );
}

function Elapsed({ since }: { since: string | null }) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  return <span className="timer">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}
