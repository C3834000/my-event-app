import { useState, type FormEvent } from 'react';
import { api, ApiError, type LlEvent } from '../api';

type Props = { events: LlEvent[]; reload: () => Promise<void>; notify: (m: string) => void; onAuthError: (e: unknown) => void };

export default function EventsPanel({ events, reload, notify, onAuthError }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      notify(msg);
      await reload();
    } catch (err) {
      onAuthError(err);
      notify(err instanceof ApiError ? err.message : 'הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await act(() => api('admin/events', { method: 'POST', body: { title, event_date: date || null } }), 'האירוע נוצר');
    setTitle('');
    setDate('');
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>אירוע חדש</h2>
        <form className="toolbar" onSubmit={create}>
          <input placeholder="שם האירוע" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn primary" disabled={busy}>יצירה</button>
        </form>
      </section>

      <section className="card">
        <h2>אירועים</h2>
        <table className="table">
          <thead><tr><th>שם</th><th>תאריך</th><th>הרשמה</th><th>סטטוס</th><th /></tr></thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className={ev.is_active ? 'active-row' : ''}>
                <td>{ev.title}</td>
                <td>{ev.event_date ? new Date(ev.event_date).toLocaleDateString('he-IL') : '—'}</td>
                <td>
                  <label className="check small">
                    <input type="checkbox" checked={ev.registration_open} disabled={busy}
                      onChange={(e) => act(() => api(`admin/events/${ev.id}`, { method: 'PATCH', body: { registration_open: e.target.checked } }), e.target.checked ? 'ההרשמה נפתחה' : 'ההרשמה נסגרה')} />
                    {ev.registration_open ? 'פתוחה' : 'סגורה'}
                  </label>
                </td>
                <td>{ev.is_active ? <strong>פעיל בקו</strong> : <button className="btn small" disabled={busy} onClick={() => act(() => api(`admin/events/${ev.id}/activate`, { method: 'POST' }), 'האירוע הוגדר כפעיל')}>הגדרה כפעיל</button>}</td>
                <td className="actions">
                  <button className="btn small" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${ev.slug}`).then(() => notify('קישור ההרשמה הועתק'))}>קישור הרשמה</button>
                  <button className="btn small danger" disabled={busy} onClick={() => {
                    if (window.confirm(`למחוק את "${ev.title}" כולל כל הנרשמים, השאלות והניקוד?`)) act(() => api(`admin/events/${ev.id}`, { method: 'DELETE' }), 'האירוע נמחק');
                  }}>מחיקה</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="muted">אין אירועים עדיין.</p>}
      </section>
    </div>
  );
}
