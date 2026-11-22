import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import type { Task, TaskActivity } from '../types';
import { TaskPriority } from '../types';
import { buildSecretaryDeskData } from '../services/secretaryDesk';
import { appendSecretaryTaskActivity, saveSecretaryTask } from '../services/secretaryTaskUpdate';
import { tasksService } from '../services/supabase';
import { parseEventDateKey } from '../services/eventKpi';

type DeskData = ReturnType<typeof buildSecretaryDeskData>;
type Filter = 'daily' | 'all' | 'done';
const labels: Record<string, string> = { urgent: 'דחוף', today: 'היום', backlog: 'מצטברת', week: 'השבוע', later: 'בהמשך', stuck: 'ממתין למשה', done: 'בוצע היום' };
const uid = () => `t_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`}`;
const activityStamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const SecretaryTasks: React.FC<{ data: DeskData; today: string; ready: boolean; refresh: () => Promise<void> }> = ({ data, today, ready, refresh }) => {
  const [filter, setFilter] = useState<Filter>('daily');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [recentUpdates, setRecentUpdates] = useState<Record<string, TaskActivity>>({});

  const list = useMemo(() => {
    const keys = filter === 'done' ? ['done'] : filter === 'all' ? ['urgent', 'today', 'backlog', 'stuck', 'week', 'later'] : ['urgent', 'today', 'backlog', 'stuck'];
    return keys.flatMap(key => data.grouped[key as keyof typeof data.grouped].map(task => ({ task, bucket: key })));
  }, [data, filter]);
  const pageSize = 5;
  const lastPage = Math.max(0, Math.ceil(list.length / pageSize) - 1);
  const visiblePage = Math.min(page, lastPage);
  const rows = list.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  const setTab = (next: Filter) => { setFilter(next); setPage(0); };
  const close = () => { setSelected(null); setAdding(false); setMessage(''); };
  const openTask = (task: Task) => { setSelected(task); setNote(task.doneNote || ''); setMessage(''); };
  const taskUpdates = (task: Task) => {
    const entries = Array.isArray(task.activityLog) ? task.activityLog.filter(entry => entry && typeof entry.at === 'string' && typeof entry.text === 'string') : [];
    const recent = recentUpdates[task.id];
    if (recent && !entries.some(entry => entry.id === recent.id)) entries.push(recent);
    return entries.sort((a, b) => b.at.localeCompare(a.at));
  };

  const complete = async (task: Task) => {
    if (busy) return; setBusy(true); setMessage('');
    try {
      await saveSecretaryTask(task.id, task.isCompleted ? { isCompleted: false, progress: 0, deskStatus: null } : { isCompleted: true, progress: 100, completedDate: new Date().toISOString(), deskStatus: null }, refresh);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'העדכון לא אושר בענן.'); }
    finally { setBusy(false); }
  };
  const saveStatus = async (status: 'partial' | 'stuck') => {
    if (!selected || busy) return; setBusy(true); setMessage('');
    try { await saveSecretaryTask(selected.id, { doneNote: note.trim(), deskStatus: status }, refresh); close(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'העדכון לא אושר בענן.'); }
    finally { setBusy(false); }
  };
  const setQuickStatus = async (task: Task, status: 'partial' | 'stuck') => {
    if (busy) return; setBusy(true); setMessage('');
    try { await saveSecretaryTask(task.id, { deskStatus: task.deskStatus === status ? null : status }, refresh); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'העדכון לא אושר בענן.'); }
    finally { setBusy(false); }
  };
  const addUpdate = async (event: React.FormEvent, task: Task) => {
    event.preventDefault();
    const text = (drafts[task.id] || '').trim();
    if (!text || busy) return; setBusy(true); setMessage('');
    try {
      const entry = await appendSecretaryTaskActivity(task.id, text, refresh);
      setRecentUpdates(previous => ({ ...previous, [task.id]: entry }));
      setDrafts(previous => ({ ...previous, [task.id]: '' }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'העדכון לא אושר בענן.'); }
    finally { setBusy(false); }
  };
  const add = async (event: React.FormEvent) => {
    event.preventDefault(); if (!title.trim() || busy) return; setBusy(true); setMessage('');
    const id = uid();
    try {
      const saved = await tasksService.create({ id, title: title.trim(), assignee: 'מזכירה', category: 'כללי', priority: TaskPriority.Medium, isCompleted: false, estimatedTimeMin: 0, progress: 0, dueDate: date || today });
      if (!saved || saved.id !== id || saved.assignee !== 'מזכירה') throw new Error('Missing task confirmation');
      setTitle(''); setDate(''); close();
      try { await refresh(); } catch { setMessage('המשימה נשמרה, אך הנתונים לא התרעננו. רעננו את ה־CRM.'); }
    } catch { setMessage('לא התקבל אישור לשמירה. רעננו את הנתונים לפני ניסיון נוסף.'); }
    finally { setBusy(false); }
  };
  return <section className="h-full min-h-0 flex flex-col rounded-2xl border border-violet-200 bg-violet-50/60 p-3 shadow-sm" aria-labelledby="secretary-task-heading">
    <div className="flex items-center justify-between gap-1 shrink-0"><h2 id="secretary-task-heading" className="flex items-center gap-1 font-black text-violet-950"><CheckSquare size={18} className="text-violet-700" /> משימות</h2><button type="button" disabled={!ready} onClick={() => { setAdding(true); setMessage(''); }} className="flex items-center gap-1 rounded-lg bg-violet-700 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} /> משימה</button></div>
    <p className="mt-1 text-[11px] text-slate-500 shrink-0">היום, באיחור ומשימות מצטברות שהוקצו למזכירה</p>
    <div className="mt-2 flex gap-1 shrink-0">{([['daily', 'לטיפול'], ['all', 'כל הפתוחות'], ['done', 'בוצעו היום']] as [Filter, string][]).map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-2 py-1 text-[11px] font-bold ${filter === key ? 'bg-violet-100 text-violet-800' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</div>
    <div className="mt-1 flex-1 min-h-0 overflow-y-auto">
      {rows.map(({ task, bucket }) => {
        const latest = taskUpdates(task)[0];
        return <article key={task.id} className="min-w-0 max-w-2xl overflow-hidden border-b border-violet-200 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <input type="checkbox" aria-label={`${task.isCompleted ? 'ביטול השלמת' : 'סימון כבוצעה:'} ${task.title}`} checked={task.isCompleted} disabled={busy} onChange={() => void complete(task)} className="h-4 w-4 shrink-0 accent-green-600" />
            <button type="button" onClick={() => openTask(task)} title={task.title} className="text-right min-w-0 flex-1 overflow-hidden"><span className={`block line-clamp-2 break-words text-xs font-bold ${task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</span><span className="block truncate text-[10px] text-slate-500">{labels[bucket]}{parseEventDateKey(task.dueDate) ? ` · ${parseEventDateKey(task.dueDate)!.split('-').reverse().slice(0, 2).join('.')}` : ''}</span></button>
          </div>
          {!task.isCompleted && <form onSubmit={event => void addUpdate(event, task)} className="mt-1 flex flex-wrap gap-1 pr-5">
            <button type="button" disabled={busy} onClick={() => void setQuickStatus(task, 'partial')} aria-pressed={task.deskStatus === 'partial'} aria-label={`בוצע חלקית: ${task.title}`} className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-bold disabled:opacity-50 ${task.deskStatus === 'partial' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-900'}`}>בוצע חלקית</button><button type="button" disabled={busy} onClick={() => void setQuickStatus(task, 'stuck')} aria-pressed={task.deskStatus === 'stuck'} aria-label={`ממתין למשה: ${task.title}`} className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-bold disabled:opacity-50 ${task.deskStatus === 'stuck' ? 'bg-violet-700 text-white' : 'bg-violet-100 text-violet-800'}`}>ממתין למשה</button>
            <input value={drafts[task.id] || ''} onChange={event => setDrafts(previous => ({ ...previous, [task.id]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} disabled={busy} aria-label={`עדכון טיפול: ${task.title}`} placeholder="עדכון טיפול · Enter" className="min-w-[5rem] flex-1 rounded border border-violet-200 bg-white px-2 py-1 text-xs outline-none focus:border-violet-500 disabled:opacity-50" />
            <button type="submit" disabled={busy || !(drafts[task.id] || '').trim()} className="rounded bg-violet-100 px-2 text-[10px] font-bold text-violet-800 disabled:opacity-40">הוספה</button>
          </form>}
          {latest && <p className="mt-1 truncate pr-5 text-[10px] text-slate-600" title={latest.text}><span className="font-bold text-violet-700" dir="ltr">{activityStamp(latest.at)}</span> · {latest.text}</p>}
        </article>;
      })}
      {!rows.length && <p className="py-3 text-xs text-slate-500">{!ready ? 'ממתינים לסנכרון נתוני ה־CRM…' : filter === 'done' ? 'עדיין לא סומנו משימות כבוצעו היום.' : 'אין משימות בקבוצה זו.'}</p>}
    </div>
    {message && !adding && !selected && <p role="status" className="text-[11px] text-amber-800 shrink-0">{message}</p>}
    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 shrink-0"><Link to="/tasks" className="font-bold text-violet-700">לכל המשימות</Link><span className="flex items-center gap-2"><button type="button" aria-label="עמוד קודם של משימות" onClick={() => setPage(Math.max(0, visiblePage - 1))} disabled={!visiblePage} className="disabled:opacity-30"><ChevronRight size={16} /></button>{visiblePage + 1} / {lastPage + 1}<button type="button" aria-label="עמוד הבא של משימות" onClick={() => setPage(Math.min(lastPage, visiblePage + 1))} disabled={visiblePage >= lastPage} className="disabled:opacity-30"><ChevronLeft size={16} /></button></span></div>

    {(adding || selected) && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-label={adding ? 'משימה חדשה' : 'פרטי משימה'}>
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"><div className="flex justify-between items-center gap-2"><h3 className="font-black text-lg">{adding ? 'משימה חדשה למזכירה' : selected?.title}</h3><button type="button" onClick={close} aria-label="סגירה"><X size={20} /></button></div>
        {adding ? <form onSubmit={(event) => void add(event)} className="mt-4 space-y-3"><label className="block text-sm font-bold">מה צריך לעשות?<input autoFocus value={title} onChange={event => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border p-2 font-normal" required /></label><label className="block text-sm font-bold">תאריך יעד<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label><p className="text-xs text-slate-500">ללא תאריך, המשימה תופיע להיום.</p><button disabled={busy || !title.trim()} className="rounded-lg bg-violet-700 px-4 py-2 text-white font-bold disabled:opacity-50">{busy ? 'שומרת…' : 'הוספה'}</button></form> : selected && <div className="mt-3 space-y-3"><p className="text-sm text-slate-600 whitespace-pre-line">{selected.notes || selected.requiredResources || 'אין פירוט נוסף.'}</p><label className="block text-sm font-bold">עדכון על הטיפול<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void saveStatus('partial')} className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">בוצע חלקית</button><button type="button" disabled={busy} onClick={() => void saveStatus('stuck')} className="rounded-lg bg-violet-100 px-3 py-2 text-sm font-bold text-violet-800">ממתין למשה</button><Link to={`/tasks?taskId=${encodeURIComponent(selected.id)}`} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">פרטים בלוח המשימות</Link></div>{taskUpdates(selected).length > 0 && <div><h4 className="text-sm font-bold">יומן עדכונים</h4><ul className="mt-1 space-y-2">{taskUpdates(selected).map(entry => <li key={entry.id} className="rounded-lg bg-slate-50 p-2"><p className="text-xs font-bold text-violet-700" dir="ltr">{activityStamp(entry.at)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{entry.text}</p></li>)}</ul></div>}</div>}
        {message && <p role="alert" className="mt-3 text-xs text-red-700">{message}</p>}
      </div>
    </div>}
  </section>;
};
export default SecretaryTasks;
