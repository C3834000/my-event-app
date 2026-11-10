import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type LlEvent, type Registration } from '../api';

type Props = { events: LlEvent[]; activeEvent: LlEvent | null; notify: (m: string) => void; onAuthError: (e: unknown) => void };

function csvCell(v: string) {
  // מונע הזרקת נוסחאות באקסל (=, +, -, @)
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function RegistrationsPanel({ events, activeEvent, notify, onAuthError }: Props) {
  const [eventId, setEventId] = useState(activeEvent?.id || events[0]?.id || '');
  const [rows, setRows] = useState<Registration[]>([]);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId && (activeEvent || events[0])) setEventId(activeEvent?.id || events[0].id);
  }, [eventId, activeEvent, events]);

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      setRows(await api<Registration[]>(`admin/registrations?event=${eventId}`));
    } catch (err) {
      onAuthError(err);
    }
  }, [eventId, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim();
    return rows.filter((r) => !q || r.full_name.includes(q) || r.phone.includes(q.replace(/\D/g, '') || '~'));
  }, [rows, query]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      notify(msg);
      await load();
    } catch (err) {
      onAuthError(err);
      notify(err instanceof ApiError ? err.message : 'הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    await act(() => api('admin/registrations', { method: 'POST', body: { event_id: eventId, full_name: name, phone } }), 'הנרשם נוסף');
    setName('');
    setPhone('');
  }

  function exportCsv() {
    const lines = ['שם,טלפון,נרשם בתאריך', ...rows.map((r) => [r.full_name, r.phone, new Date(r.created_at).toLocaleString('he-IL')].map(csvCell).join(','))];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'registrations.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const event = events.find((e) => e.id === eventId);
  if (events.length === 0) return <div className="banner warn">צרו קודם אירוע בלשונית "אירועים".</div>;

  return (
    <div className="stack">
      <section className="card">
        <div className="toolbar">
          <label className="inline">אירוע
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}{e.is_active ? ' (פעיל)' : ''}</option>)}
            </select>
          </label>
          {event && (
            <button className="btn small" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/r/${event.slug}`).then(() => notify('קישור ההרשמה הועתק'));
            }}>העתקת קישור הרשמה</button>
          )}
          <span className="spacer" />
          <button className="btn small" disabled={rows.length === 0} onClick={exportCsv}>ייצוא לאקסל</button>
          <button className="btn small danger" disabled={busy || rows.length === 0} onClick={() => {
            if (window.confirm(`למחוק את כל ${rows.length} הנרשמים של האירוע? (מומלץ אחרי סיום האירוע)`)) act(() => api(`admin/registrations?event=${eventId}`, { method: 'DELETE' }), 'כל הנרשמים נמחקו');
          }}>מחיקת כל הנרשמים</button>
        </div>
        <form className="toolbar" onSubmit={add}>
          <input placeholder="שם מלא" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} />
          <input placeholder="טלפון" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={16} />
          <button className="btn primary" disabled={busy}>הוספה ידנית</button>
        </form>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>נרשמים ({rows.length})</h2>
          <input className="search" placeholder="חיפוש" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <table className="table">
          <thead><tr><th>שם</th><th>טלפון</th><th>מקור</th><th>נרשם</th><th /></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td dir="ltr">{r.phone}</td>
                <td>{r.source === 'admin' ? 'ידני' : 'טופס'}</td>
                <td>{new Date(r.created_at).toLocaleString('he-IL')}</td>
                <td><button className="btn small danger" disabled={busy} onClick={() => act(() => api(`admin/registrations/${r.id}`, { method: 'DELETE' }), 'נמחק')}>מחיקה</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
