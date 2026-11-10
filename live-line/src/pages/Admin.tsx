import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type LiveState, type LlEvent } from '../api';
import LivePanel from '../components/LivePanel';
import TriviaPanel from '../components/TriviaPanel';
import RegistrationsPanel from '../components/RegistrationsPanel';
import EventsPanel from '../components/EventsPanel';
import AuditPanel from '../components/AuditPanel';

type Tab = 'live' | 'trivia' | 'registrations' | 'events' | 'audit';
const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'שידור חי' },
  { id: 'trivia', label: 'טריוויה' },
  { id: 'registrations', label: 'נרשמים' },
  { id: 'events', label: 'אירועים' },
  { id: 'audit', label: 'יומן פעולות' },
];
const POLL_MS = 2000;

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('auth/login', { method: 'POST', body: { password, code } });
      setPassword('');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-page">
      <form className="card narrow form" onSubmit={submit}>
        <h1>כניסת מנחה</h1>
        <label>
          סיסמה
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          קוד מאפליקציית האימות
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" dir="ltr" required pattern="\d{6}" placeholder="000000" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
      </form>
    </main>
  );
}

export default function Admin() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('live');
  const [events, setEvents] = useState<LlEvent[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [liveError, setLiveError] = useState('');
  const [toast, setToast] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  }, []);

  const onAuthError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) setAuth(false);
  }, []);

  useEffect(() => {
    api<{ authenticated: boolean }>('auth/me').then((r) => setAuth(r.authenticated)).catch(() => setAuth(false));
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await api<LlEvent[]>('admin/events'));
    } catch (err) {
      onAuthError(err);
    }
  }, [onAuthError]);

  const refreshLive = useCallback(async () => {
    try {
      setLive(await api<LiveState>('admin/live'));
      setLiveError('');
    } catch (err) {
      onAuthError(err);
      setLiveError((err as Error).message);
    }
  }, [onAuthError]);

  useEffect(() => {
    if (auth) loadEvents();
  }, [auth, loadEvents]);

  // רענון חי רק בלשוניות שצריכות אותו, ורק כשהחלון גלוי
  useEffect(() => {
    if (!auth || (tab !== 'live' && tab !== 'trivia')) return;
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden) await refreshLive();
      timer.current = window.setTimeout(loop, POLL_MS);
    };
    loop();
    return () => {
      stopped = true;
      window.clearTimeout(timer.current);
    };
  }, [auth, tab, refreshLive]);

  async function logout() {
    await api('auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuth(false);
  }

  if (auth === null) return <main className="center-page"><p className="muted">טוען…</p></main>;
  if (!auth) return <Login onDone={() => setAuth(true)} />;

  const activeEvent = events.find((e) => e.is_active) || null;

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">
          <span className={`dot ${live?.room.found ? 'on' : ''}`} />
          <strong>קו חי</strong>
          <span className="muted">{activeEvent ? activeEvent.title : 'אין אירוע פעיל'}</span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <button className="btn ghost" onClick={logout}>יציאה</button>
      </header>

      <main className="content">
        {liveError && (tab === 'live' || tab === 'trivia') && <div className="banner error">{liveError}</div>}
        {tab === 'live' && <LivePanel live={live} refresh={refreshLive} notify={notify} onAuthError={onAuthError} />}
        {tab === 'trivia' && <TriviaPanel live={live} activeEvent={activeEvent} refresh={refreshLive} notify={notify} onAuthError={onAuthError} />}
        {tab === 'registrations' && <RegistrationsPanel events={events} activeEvent={activeEvent} notify={notify} onAuthError={onAuthError} />}
        {tab === 'events' && <EventsPanel events={events} reload={loadEvents} notify={notify} onAuthError={onAuthError} />}
        {tab === 'audit' && <AuditPanel onAuthError={onAuthError} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
