import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Hand, Clock, Calendar, RotateCcw, ClipboardCopy, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Task, TaskPriority } from '../types';
import { buildSecretaryDeskData } from '../services/secretaryDesk';
import { saveSecretaryTask } from '../services/secretaryTaskUpdate';
import { parseEventDateKey } from '../services/eventKpi';
import { SecretaryOverview, SecretaryStats } from '../components/SecretaryOverview';
import SecretaryMail from '../components/SecretaryMail';

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

type BucketId = 'stuck' | 'urgent' | 'today' | 'week' | 'later' | 'done';

const BUCKETS: { id: BucketId; title: string; hint: string; tone: string }[] = [
  { id: 'urgent', title: 'דחוף היום', hint: 'באיחור או דחוף עם יעד היום', tone: 'border-red-300 bg-red-50' },
  { id: 'today', title: 'היום', hint: 'יעד היום או בפוקוס של היום', tone: 'border-amber-200 bg-amber-50' },
  { id: 'week', title: 'השבוע', hint: '7 הימים הקרובים', tone: 'border-slate-200 bg-white' },
  { id: 'later', title: 'בהמשך / בלי תאריך', hint: '', tone: 'border-slate-200 bg-white' },
  { id: 'stuck', title: 'ממתין למשה', hint: 'סומן "תקוע"', tone: 'border-purple-200 bg-purple-50' },
  { id: 'done', title: 'בוצע היום', hint: '', tone: 'border-green-200 bg-green-50' },
];

const formatDue = (task: Task, todayKey: string) => {
  const due = parseEventDateKey(task.dueDate);
  if (!due) return '';
  if (due === todayKey) return task.dueTime ? `היום ${task.dueTime}` : 'היום';
  const [, m, d] = due.split('-');
  const label = `${Number(d)}.${Number(m)}`;
  return due < todayKey ? `באיחור · ${label}` : label;
};

/** הופך כתובות בטקסט לקישורים לחיצים */
const Linkified: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(https?:\/\/\S+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
          קישור
        </a>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

type Action = 'done' | 'partial' | 'stuck';

const ACTION_LABEL: Record<Action, string> = {
  done: 'מה בוצע?',
  partial: 'מה בוצע ומה נשאר?',
  stuck: 'מה צריך ממשה?',
};

const DeskCard: React.FC<{ task: Task; todayKey: string; onSave: (task: Task, action: Action, note: string) => Promise<void>; onReopen: (task: Task) => Promise<void> }> = ({
  task,
  todayKey,
  onSave,
  onReopen,
}) => {
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState(task.doneNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const due = formatDue(task, todayKey);
  const notes = task.notes || task.requiredResources;

  const open = (a: Action) => {
    setAction(a);
    setNote(task.doneNote || '');
    setError('');
  };

  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError('');
    try { await onSave(task, action, note.trim()); setAction(null); }
    catch (error) { setError(error instanceof Error ? error.message : 'העדכון לא אושר בענן.'); }
    finally { setBusy(false); }
  };

  const reopen = async () => {
    setBusy(true);
    setError('');
    try { await onReopen(task); }
    catch (error) { setError(error instanceof Error ? error.message : 'העדכון לא אושר בענן.'); }
    finally { setBusy(false); }
  };

  return (
    <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className={`font-black text-slate-800 leading-snug ${task.isCompleted ? 'line-through text-slate-400' : ''}`}>{task.title}</h3>
        {task.priority >= TaskPriority.High && !task.isCompleted && (
          <span className="shrink-0 text-[11px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">דחוף</span>
        )}
      </div>

      {notes && (
        <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-line">
          <Linkified text={notes} />
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
        {due && (
          <span className={`inline-flex items-center gap-1 ${due.startsWith('באיחור') ? 'text-red-600' : ''}`}>
            <Calendar size={12} /> {due}
          </span>
        )}
        {task.estimatedTimeMin > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {task.estimatedTimeMin} דק'
          </span>
        )}
        <span>{task.category}</span>
        {task.deskStatus === 'partial' && <span className="text-amber-700">◐ בוצע חלקית</span>}
      </div>

      {task.doneNote && !action && (
        <p className="mt-2 text-sm bg-slate-50 rounded-lg px-3 py-2 text-slate-700">
          <span className="font-black">מה בוצע: </span>
          {task.doneNote}
        </p>
      )}

      {action ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-black text-slate-500">{ACTION_LABEL[action]}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-black hover:bg-purple-700 disabled:opacity-50"
            >
              {busy ? 'שומרת…' : 'שמירה'}
            </button>
            <button type="button" onClick={() => setAction(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">
              ביטול
            </button>
          </div>
        </div>
      ) : task.isCompleted ? (
        <button type="button" disabled={busy} onClick={() => void reopen()} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50">
          <RotateCcw size={14} /> החזרה לפתוח
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => open('done')} className="inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-green-600 text-white text-sm font-black hover:bg-green-700">
            <CheckCircle2 size={16} /> בוצע
          </button>
          <button type="button" onClick={() => open('partial')} className="inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-amber-100 text-amber-800 text-sm font-black hover:bg-amber-200">
            <CircleDashed size={16} /> חלקית
          </button>
          <button type="button" onClick={() => open('stuck')} className="inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-purple-100 text-purple-800 text-sm font-black hover:bg-purple-200">
            <Hand size={16} /> תקוע
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </article>
  );
};

const SecretaryDesk: React.FC = () => {
  const { tasks, leads, events, customers, userEmail, cloudSyncOk, lastCloudSyncAt, reloadFromCloud } = useApp();
  const [copied, setCopied] = useState(false);
  const [syncError, setSyncError] = useState('');

  const now = new Date();
  const todayKey = toDateKey(now);
  const data = useMemo(() => buildSecretaryDeskData(tasks, leads, events, customers, todayKey), [tasks, leads, events, customers, todayKey]);
  const { mine } = data;
  const grouped = useMemo(() => new Map<BucketId, Task[]>(Object.entries(data.grouped) as [BucketId, Task[]][]), [data]);

  const todayOpen = ['urgent', 'today'].reduce((n, id) => n + (grouped.get(id as BucketId)?.length || 0), 0);
  const doneToday = grouped.get('done')?.length || 0;
  const updateTaskConfirmed = (id: string, updates: Partial<Task>) => saveSecretaryTask(id, updates, reloadFromCloud);

  const handleSave = async (task: Task, action: Action, note: string) => {
    if (action === 'done') {
      await updateTaskConfirmed(task.id, { isCompleted: true, progress: 100, completedDate: new Date().toISOString(), doneNote: note, deskStatus: null });
    } else if (action === 'partial') {
      await updateTaskConfirmed(task.id, { doneNote: note, deskStatus: 'partial' });
    } else {
      await updateTaskConfirmed(task.id, { doneNote: note, deskStatus: 'stuck' });
    }
  };

  const handleReopen = (task: Task) => updateTaskConfirmed(task.id, { isCompleted: false, progress: 0, completedDate: undefined, deskStatus: null });

  const summary = useMemo(() => {
    const line = (t: Task) => `• ${t.title}${t.doneNote ? ` — ${t.doneNote}` : ''}`;
    const section = (title: string, list: Task[] = []) => (list.length ? `${title}:\n${list.map(line).join('\n')}` : '');
    const partial = mine.filter((t) => !t.isCompleted && t.deskStatus === 'partial');
    return [
      `סיכום יום ${now.toLocaleDateString('he-IL')}`,
      section('✓ בוצע', grouped.get('done')),
      section('◐ בוצע חלקית', partial),
      section('✋ צריך את משה', grouped.get('stuck')),
      section('נשאר פתוח להיום', [...(grouped.get('urgent') || []), ...(grouped.get('today') || [])].filter((t) => t.deskStatus !== 'partial')),
    ]
      .filter(Boolean)
      .join('\n\n');
  }, [mine, grouped]); // eslint-disable-line react-hooks/exhaustive-deps

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* הדפדפן חסם גישה ללוח — כפתור המייל עדיין עובד */
    }
  };

  const hebrewDate = now.toLocaleDateString('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' });
  const gregDate = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-7xl mx-auto px-1 py-3 md:px-3 md:py-5 space-y-5" dir="rtl">
      <header className="bg-gradient-to-l from-purple-700 to-indigo-700 text-white rounded-3xl p-6 shadow-lg">
        <p className="text-sm font-bold opacity-80">
          {gregDate} · {hebrewDate}
        </p>
        <h1 className="text-2xl font-black mt-1">שולחן המזכירה</h1>
        <p className="mt-2 text-sm font-bold opacity-90">{lastCloudSyncAt ? `${todayOpen} משימות לטיפול היום · ${doneToday} סומנו כבוצעו היום` : 'משימות, לקוחות, אירועים ודואר במקום אחד'}</p>
      </header>

      <div className={`rounded-xl px-4 py-3 text-sm flex flex-wrap justify-between gap-2 ${cloudSyncOk && !syncError ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`} role="status">
        <span>{cloudSyncOk && lastCloudSyncAt && !syncError ? `ה־CRM מעודכן · סנכרון אחרון ${new Date(lastCloudSyncAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : lastCloudSyncAt ? `החיבור ל־CRM נותק; מוצגים נתונים מהסנכרון האחרון (${new Date(lastCloudSyncAt).toLocaleString('he-IL')}).` : 'נתוני ה־CRM טרם סונכרנו. מנסים להתחבר…'}</span>
        <button type="button" className="font-bold underline" onClick={() => { setSyncError(''); void reloadFromCloud().catch(() => setSyncError('לא ניתן לסנכרן כרגע. בדקו את החיבור ונסו שוב.')); }}>רענון נתונים</button>
        {syncError && <span className="basis-full">{syncError}</span>}
      </div>

      {lastCloudSyncAt && <SecretaryStats data={data} />}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-5 items-start">
        <main className="space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">המשימות שלי</h2><p className="text-xs text-slate-500 mt-1">רק משימות שמשויכות למזכירה ב־CRM</p></div><Link to="/tasks" className="text-sm font-bold text-purple-700 hover:underline">ניהול משימות</Link></div>
          {!lastCloudSyncAt && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">המשימות יוצגו לאחר סנכרון מוצלח עם ה־CRM.</p>}
          {lastCloudSyncAt && mine.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">עדיין לא שויכו משימות למזכירה. אפשר לשייך משימות דרך <Link to="/tasks" className="text-purple-700 underline font-bold">לוח המשימות</Link>.</div>}

      {lastCloudSyncAt && BUCKETS.map((b) => {
        const list = grouped.get(b.id);
        if (!list?.length) return null;
        return (
          <section key={b.id} className={`rounded-3xl border p-3 ${b.tone}`}>
            <div className="flex items-baseline justify-between px-1 mb-2">
              <h2 className="font-black text-slate-800">
                {b.title} <span className="text-slate-400">({list.length})</span>
              </h2>
              {b.hint && <span className="text-[11px] font-bold text-slate-400">{b.hint}</span>}
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <DeskCard key={t.id} task={t} todayKey={todayKey} onSave={handleSave} onReopen={handleReopen} />
              ))}
            </div>
          </section>
        );
      })}

      {lastCloudSyncAt && mine.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="font-black text-slate-800">סיכום יום למשה</h2>
          <pre className="whitespace-pre-wrap text-sm text-slate-600 bg-slate-50 rounded-xl p-3 font-sans">{summary}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copySummary} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800">
              <ClipboardCopy size={16} /> {copied ? 'הועתק' : 'העתקה'}
            </button>
            <a
              href={`mailto:${userEmail}?subject=${encodeURIComponent(`סיכום יום ${now.toLocaleDateString('he-IL')}`)}&body=${encodeURIComponent(summary)}`}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-purple-100 text-purple-800 text-sm font-black hover:bg-purple-200"
            >
              <Mail size={16} /> שליחה במייל
            </a>
          </div>
        </section>
      )}
        </main>
        <aside>{lastCloudSyncAt ? <SecretaryOverview data={data} customers={customers} /> : <SecretaryMail />}</aside>
      </div>
    </div>
  );
};

export default SecretaryDesk;
