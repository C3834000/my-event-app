import { useMemo, useState } from 'react';
import { api, ApiError, formatDuration, maskPhone, type LiveState, type Participant } from '../api';

type Props = {
  live: LiveState | null;
  refresh: () => Promise<void>;
  notify: (m: string) => void;
  onAuthError: (e: unknown) => void;
};

type Filter = 'all' | 'hands' | 'unmuted' | 'unregistered';
type Action = 'mute' | 'unmute' | 'kick' | 'lowerhand' | 'raisehand';

const ACTION_LABEL: Record<Action, string> = {
  mute: 'השתקה', unmute: 'פתיחת מיקרופון', kick: 'הוצאה מהקו', lowerhand: 'הורדת יד', raisehand: 'הרמת יד',
};

export default function LivePanel({ live, refresh, notify, onAuthError }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPhones, setShowPhones] = useState(false);
  const [busy, setBusy] = useState(false);

  const listeners = useMemo(() => (live?.participants || []).filter((p) => !p.admin), [live]);
  const admins = useMemo(() => (live?.participants || []).filter((p) => p.admin), [live]);

  const visible = useMemo(() => {
    const q = query.trim();
    return listeners
      .filter((p) => (filter === 'hands' ? p.hand : filter === 'unmuted' ? !p.mute : filter === 'unregistered' ? !p.registered : true))
      .filter((p) => !q || (p.name || '').includes(q) || p.phone.includes(q.replace(/\D/g, '') || '~'))
      .sort((a, b) => Number(b.hand) - Number(a.hand) || Number(a.mute) - Number(b.mute) || (a.name || 'ת').localeCompare(b.name || 'ת', 'he'));
  }, [listeners, filter, query]);

  async function run(action: Action, opts: { ids?: string[]; all?: boolean; label?: string }) {
    const count = opts.all ? listeners.length : opts.ids?.length || 0;
    if (count === 0) return;
    if (action === 'kick' && !window.confirm(`להוציא ${opts.all ? 'את כל המשתתפים' : count === 1 ? (opts.label || 'משתתף זה') : `${count} משתתפים`} מהקו?`)) return;
    let confirm = false;
    if (action === 'unmute' && opts.all) {
      if (!window.confirm(`לפתוח מיקרופון לכל ${count} המשתתפים? כולם ישמעו את כולם.`)) return;
      confirm = true;
    }
    setBusy(true);
    try {
      const r = await api<{ count: number }>('admin/live/action', {
        method: 'POST',
        body: opts.all ? { action, scope: 'all_listeners', confirm } : { action, ids: opts.ids },
      });
      notify(`${ACTION_LABEL[action]}: ${r.count} משתתפים`);
      setSelected(new Set());
      await refresh();
    } catch (err) {
      onAuthError(err);
      notify(err instanceof ApiError ? err.message : 'הפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (!live) return <p className="muted">מתחבר לקו…</p>;

  const sel = [...selected].filter((id) => listeners.some((p) => p.id === id));

  return (
    <div className="stack">
      {!live.room.found && (
        <div className="banner warn">
          חדר הוועידה לא פעיל כרגע. הוא ייפתח כשהמנחה יתקשר לשלוחת הניהול.
          {live.room.availableRooms > 0 && ' (יש חדרי ועידה אחרים פעילים במערכת — בדקו את YEMOT_CONF_ROOM)'}
        </div>
      )}
      {!live.event && <div className="banner warn">לא נבחר אירוע פעיל, ולכן שמות הנרשמים לא יוצגו. בחרו אירוע בלשונית "אירועים".</div>}

      <section className="stats">
        <Stat label="מחוברים" value={live.counts.listeners} />
        <Stat label="מזוהים בשם" value={`${live.counts.registeredOnLine}/${live.counts.listeners}`} />
        <Stat label="ידיים מורמות" value={live.counts.hands} highlight={live.counts.hands > 0} />
        <Stat label="מיקרופון פתוח" value={live.counts.unmuted} highlight={live.counts.unmuted > 0} />
        <Stat label="מנחים בקו" value={live.counts.admins} />
      </section>

      <section className="card">
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={() => run('mute', { all: true })}>🔇 השתקת כולם</button>
          <button className="btn" disabled={busy} onClick={() => run('unmute', { all: true })}>🎙️ פתיחה לכולם</button>
          <button className="btn" disabled={busy || live.counts.hands === 0} onClick={() => run('lowerhand', { ids: listeners.filter((p) => p.hand).map((p) => p.id) })}>✋ הורדת כל הידיים</button>
          <button className="btn danger" disabled={busy} onClick={() => run('kick', { all: true })}>הוצאת כולם</button>
          <span className="spacer" />
          {sel.length > 0 && (
            <span className="selbar">
              נבחרו {sel.length}:
              <button className="btn small" disabled={busy} onClick={() => run('mute', { ids: sel })}>השתקה</button>
              <button className="btn small" disabled={busy} onClick={() => run('unmute', { ids: sel })}>פתיחה</button>
              <button className="btn small danger" disabled={busy} onClick={() => run('kick', { ids: sel })}>הוצאה</button>
            </span>
          )}
        </div>

        <div className="toolbar">
          <div className="seg">
            {(['all', 'hands', 'unmuted', 'unregistered'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'seg-btn active' : 'seg-btn'} onClick={() => setFilter(f)}>
                {{ all: 'הכול', hands: 'יד מורמת', unmuted: 'מדברים', unregistered: 'לא רשומים' }[f]}
              </button>
            ))}
          </div>
          <input className="search" placeholder="חיפוש שם או מספר" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="check small">
            <input type="checkbox" checked={showPhones} onChange={(e) => setShowPhones(e.target.checked)} /> הצגת מספרים מלאים
          </label>
        </div>

        {admins.length > 0 && (
          <p className="muted small">
            מנחה בקו: {admins.map((a) => (showPhones ? a.phone : maskPhone(a.phone))).join(', ')}
          </p>
        )}

        <div className="grid">
          {visible.map((p) => (
            <ParticipantCard key={p.id} p={p} selected={selected.has(p.id)} toggle={toggle} showPhone={showPhones} busy={busy} run={run} questionOpen={Boolean(live.openQuestion)} />
          ))}
          {visible.length === 0 && <p className="muted">אין משתתפים להצגה.</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={highlight ? 'stat hl' : 'stat'}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ParticipantCard({ p, selected, toggle, showPhone, busy, run, questionOpen }: {
  p: Participant; selected: boolean; toggle: (id: string) => void; showPhone: boolean; busy: boolean;
  run: (a: Action, o: { ids?: string[]; label?: string }) => void; questionOpen: boolean;
}) {
  const label = p.name || (showPhone ? p.phone : maskPhone(p.phone));
  return (
    <div className={`pcard ${p.hand ? 'hand' : ''} ${!p.mute ? 'live' : ''} ${selected ? 'sel' : ''}`}>
      <label className="pcard-head">
        <input type="checkbox" checked={selected} onChange={() => toggle(p.id)} aria-label={`בחירת ${label}`} />
        <span className="pname">{p.name || <span className="muted">לא רשום</span>}</span>
        {p.hand && <span className="badge hand">✋</span>}
        {!p.mute && <span className="badge live">🎙️</span>}
      </label>
      <div className="pmeta">
        <span dir="ltr">{showPhone ? p.phone || 'חסוי' : maskPhone(p.phone)}</span>
        <span>{formatDuration(p.duration)}</span>
        {p.score > 0 && <span className="badge">{p.score} נק׳</span>}
        {questionOpen && <span className={p.survey ? 'badge ans' : 'badge muted'}>{p.survey ? `הקיש ${p.survey}` : 'טרם ענה'}</span>}
      </div>
      <div className="pactions">
        {p.mute
          ? <button className="btn small" disabled={busy} onClick={() => run('unmute', { ids: [p.id] })}>פתיחה</button>
          : <button className="btn small" disabled={busy} onClick={() => run('mute', { ids: [p.id] })}>השתקה</button>}
        {p.hand && <button className="btn small" disabled={busy} onClick={() => run('lowerhand', { ids: [p.id] })}>הורדת יד</button>}
        <button className="btn small danger" disabled={busy} onClick={() => run('kick', { ids: [p.id], label })}>הוצאה</button>
      </div>
    </div>
  );
}
