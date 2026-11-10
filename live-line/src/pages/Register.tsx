import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

type PublicEvent = { title: string; event_date: string | null; registration_open: boolean };

export default function Register({ slug }: { slug: string }) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // מלכודת בוטים
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<PublicEvent>(`public/event/${slug}`).then(setEvent).catch(() => setNotFound(true));
  }, [slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('public/register', { method: 'POST', body: { slug, full_name: name, phone, consent, website } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="center-page">
        <div className="card narrow"><h1>הקישור אינו תקין</h1><p className="muted">בדקו את הקישור שקיבלתם מהמארגנים.</p></div>
      </main>
    );
  }
  if (!event) return <main className="center-page"><p className="muted">טוען…</p></main>;

  return (
    <main className="center-page">
      <div className="card narrow">
        <h1>{event.title}</h1>
        {event.event_date && <p className="muted">{new Date(event.event_date).toLocaleDateString('he-IL')}</p>}
        {done ? (
          <div className="success-box">
            <h2>נרשמתם בהצלחה ✓</h2>
            <p>ביום הפעילות חייגו <strong>מהמספר שרשמתם</strong>, כדי שהמנחה יזהה אתכם בשמכם.</p>
          </div>
        ) : !event.registration_open ? (
          <p className="muted">ההרשמה לאירוע זה סגורה.</p>
        ) : (
          <form onSubmit={submit} className="form">
            <label>
              שם מלא
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" />
            </label>
            <label>
              מספר הטלפון שממנו תחייגו
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" dir="ltr" maxLength={16} autoComplete="tel" placeholder="050-0000000" />
            </label>
            <div className="hp" aria-hidden="true">
              <label>אתר<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
            </div>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>אני מסכים/ה שהשם ומספר הטלפון ישמשו רק לזיהוי בפעילות זו ויימחקו בסיומה.</span>
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary" disabled={busy}>{busy ? 'שולח…' : 'הרשמה'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
