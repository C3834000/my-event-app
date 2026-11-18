import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CircleDollarSign, Mail, Phone, X } from 'lucide-react';
import type { AppEvent, Customer, Task } from '../types';
import { useApp } from '../context/AppContext';
import { collectionTaskId, saveCollectionFollowUp } from '../services/secretaryCollections';
import { tasksService } from '../services/supabase';
import { parseEventDateKey } from '../services/eventKpi';
import { addCalendarDays, localDateKey } from '../services/secretaryDesk';

type DebtItem = { event: AppEvent; customer?: Customer; amount: number };
const money = (value: number) => `₪${Math.round(value).toLocaleString('he-IL')}`;
const dateLabel = (value?: string) => { const key = parseEventDateKey(value); return key ? key.split('-').reverse().join('.') : 'ללא תאריך'; };

const SecretaryCollections: React.FC<{ debt: DebtItem[]; tasks: Task[]; ready: boolean; refresh: () => Promise<void> }> = ({ debt, tasks, ready, refresh }) => {
  const { replyToEmail } = useApp();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DebtItem | null>(null);
  const [tab, setTab] = useState<'follow' | 'mail'>('follow');
  const [task, setTask] = useState<Task | null>(null);
  const [loadingTask, setLoadingTask] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const pageSize = 4;
  const lastPage = Math.max(0, Math.ceil(debt.length / pageSize) - 1);
  const visiblePage = Math.min(page, lastPage);

  const open = (item: DebtItem) => {
    setSelected(item); setTab('follow'); setTask(null); setNote(''); setDate(''); setTime('09:00'); setMessage(''); setSent(false);
    setTo(item.event.email || item.customer?.email || '');
    setSubject(`מעקב תשלום – ${item.event.title || 'אירוע'}`);
    setBody(`שלום,\n\nאשמח לעדכון לגבי יתרת התשלום עבור ${item.event.title || 'האירוע'} (${money(item.amount)}).\n\nתודה רבה`);
  };
  useEffect(() => {
    if (!selected) return;
    let active = true; setLoadingTask(true);
    void tasksService.getById(collectionTaskId(selected.event.id)).then(row => { if (active) setTask(row); }).catch(() => { if (active) setMessage('לא ניתן לטעון את תיעוד הגבייה כעת.'); }).finally(() => { if (active) setLoadingTask(false); });
    return () => { active = false; };
  }, [selected]);

  const save = async () => {
    if (!selected || busy) return; setBusy(true); setMessage('');
    try {
      await saveCollectionFollowUp(selected.event, note, date, time, refresh);
      setNote(''); setDate('');
      try { setTask(await tasksService.getById(collectionTaskId(selected.event.id))); setMessage('הטיפול נשמר.'); }
      catch { setMessage('הטיפול נשמר. רעננו כדי לראות את התיעוד.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'לא התקבל אישור לשמירה.'); }
    finally { setBusy(false); }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || busy || sent) return; setBusy(true); setMessage('');
    try {
      const result = await replyToEmail({ to: to.trim(), subject: subject.trim(), text: body.trim(), customerId: selected.event.customerId || null });
      if (!result.ok) { setMessage('לא התקבל אישור לשליחה. בדקו את הדואר היוצא לפני ניסיון נוסף.'); return; }
      setSent(true); setMessage('המייל נשלח.');
    } catch { setMessage('לא התקבל אישור לשליחה. בדקו את הדואר היוצא לפני ניסיון נוסף.'); }
    finally { setBusy(false); }
  };

  return <section className="h-full min-h-0 flex flex-col rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm" aria-labelledby="secretary-collections-heading">
    <div className="flex items-center justify-between gap-1 shrink-0"><h2 id="secretary-collections-heading" className="flex items-center gap-1 font-black text-amber-950"><CircleDollarSign size={18} className="text-amber-700" /> גבייה לטיפול</h2><span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-900">{debt.length}</span></div>
    <p className="mt-1 text-[11px] text-amber-800 shrink-0">יתרות באירועים שכבר התקיימו · {money(debt.reduce((sum, item) => sum + item.amount, 0))}</p>
    <div className="mt-2 grid grid-rows-4 flex-1 min-h-0 gap-1">
      {debt.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map(item => {
        const follow = tasks.find(task => task.id === collectionTaskId(item.event.id));
        return <button key={item.event.id} type="button" onClick={() => open(item)} className="min-h-0 rounded-xl border border-amber-100 bg-white px-2 py-1.5 text-right hover:border-amber-400 overflow-hidden"><span className="flex justify-between gap-2"><span className="truncate text-xs font-black text-slate-800">{item.customer?.name || item.event.title || 'ללא שם'}</span><span className="shrink-0 text-xs font-black text-amber-800">{money(item.amount)}</span></span><span className="block truncate text-[10px] text-slate-500">{item.event.title} · {dateLabel(item.event.date)}</span><span className="block truncate text-[10px] text-amber-700">{follow?.dueDate && !follow.isCompleted ? `מעקב: ${dateLabel(follow.dueDate)}` : 'מייל · תיעוד · תזכורת'}</span></button>;
      })}
      {!debt.length && <p className="py-3 text-xs text-amber-900">{ready ? 'לא נמצאו יתרות לאירועים שעברו.' : 'ממתינים לסנכרון נתוני ה־CRM…'}</p>}
    </div>
    <div className="flex items-center justify-between pt-1 text-[11px] text-amber-800 shrink-0"><Link to="/events" className="font-bold">לכל האירועים</Link><span className="flex items-center gap-2"><button type="button" aria-label="עמוד קודם של גבייה" onClick={() => setPage(Math.max(0, visiblePage - 1))} disabled={!visiblePage} className="disabled:opacity-30"><ChevronRight size={16} /></button>{visiblePage + 1} / {lastPage + 1}<button type="button" aria-label="עמוד הבא של גבייה" onClick={() => setPage(Math.min(lastPage, visiblePage + 1))} disabled={visiblePage >= lastPage} className="disabled:opacity-30"><ChevronLeft size={16} /></button></span></div>

    {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-label="טיפול בגבייה"><div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="flex justify-between items-start gap-2"><div className="min-w-0"><h3 className="font-black text-lg">טיפול בגבייה · {selected.customer?.name || selected.event.title}</h3><p className="text-sm text-slate-500">{selected.event.title} · {dateLabel(selected.event.date)} · יתרה {money(selected.amount)}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="סגירה"><X size={20} /></button></div>
      {(selected.event.phone || selected.customer?.phone) && <a href={`tel:${(selected.event.phone || selected.customer?.phone || '').replace(/[^+\d]/g, '')}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-sky-700"><Phone size={14} /> {selected.event.phone || selected.customer?.phone}</a>}
      <div className="mt-3 flex gap-2 border-b border-slate-200 pb-2"><button type="button" onClick={() => { setTab('follow'); setMessage(''); }} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === 'follow' ? 'bg-amber-100 text-amber-900' : 'text-slate-500'}`}>תיעוד ותזכורת</button><button type="button" onClick={() => { setTab('mail'); setMessage(''); }} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === 'mail' ? 'bg-sky-100 text-sky-800' : 'text-slate-500'}`}><Mail size={14} className="inline" /> מייל</button></div>
      {tab === 'follow' ? <div className="mt-3 space-y-3"><div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs font-black text-slate-600">תיעוד אחרון</p>{loadingTask ? <p className="text-xs text-slate-500">טוענת…</p> : task?.activityLog?.length ? <ul className="mt-1 space-y-1">{task.activityLog.slice(-2).reverse().map(entry => <li key={entry.id} className="text-xs text-slate-700"><span className="text-slate-400">{new Date(entry.at).toLocaleDateString('he-IL')} · </span>{entry.text}</li>)}</ul> : <p className="text-xs text-slate-500">אין תיעוד עדיין.</p>}{task?.dueDate && !task.isCompleted && <p className="mt-1 text-xs font-bold text-amber-800">מעקב נקבע ל־{dateLabel(task.dueDate)}{task.dueTime ? ` בשעה ${task.dueTime.slice(0, 5)}` : ''}</p>}{task?.activityLog && task.activityLog.length > 2 && <Link to={`/tasks?taskId=${encodeURIComponent(task.id)}`} className="text-xs font-bold text-violet-700">לתיעוד המלא במשימה</Link>}</div>
        <label className="block text-sm font-bold">הערה על השיחה או הטיפול<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} placeholder="לדוגמה: דיברנו, ביקשו לחזור ביום ראשון" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-sm font-bold">תאריך למעקב<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label><label className="text-sm font-bold">שעה<input type="time" value={time} onChange={event => setTime(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label></div>
        <div className="flex gap-2 text-xs"><span className="text-slate-500">בחירה מהירה:</span><button type="button" onClick={() => setDate(addCalendarDays(localDateKey(new Date()), 1))} className="font-bold text-amber-800">מחר</button><button type="button" onClick={() => setDate(addCalendarDays(localDateKey(new Date()), 7))} className="font-bold text-amber-800">בעוד שבוע</button></div>
        <p className="text-xs text-slate-500">תאריך המעקב יוצר משימה למזכירה ותזכורת ב־CRM. שמירת הערה ללא תאריך יוצרת משימה פתוחה למעקב.</p><button type="button" disabled={busy || loadingTask || (!note.trim() && !date)} onClick={() => void save()} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'שומרת…' : 'שמירת הטיפול'}</button>
      </div> : <form onSubmit={(event) => void send(event)} className="mt-3 space-y-2"><label className="block text-sm font-bold">אל<input type="email" required value={to} onChange={event => setTo(event.target.value)} dir="ltr" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label><label className="block text-sm font-bold">נושא<input required value={subject} onChange={event => setSubject(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label><label className="block text-sm font-bold">תוכן ההודעה<textarea required rows={4} value={body} onChange={event => setBody(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" /></label><button disabled={busy || sent} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'שולחת…' : sent ? 'נשלח' : 'שליחת מייל'}</button></form>}
      {message && <p role="status" className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
    </div></div>}
  </section>;
};
export default SecretaryCollections;
