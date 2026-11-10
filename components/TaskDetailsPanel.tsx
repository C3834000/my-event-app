import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Plus, Star, Trash2, X } from 'lucide-react';
import { AppEvent, SubTask, Task, TaskActivity, TaskCategory, TaskFrequency, TaskPriority } from '../types';
import { TopCategoryMeta } from '../data/taskCategories';

const TIME_PRESETS = [
  { label: '10 דק׳', min: 10 },
  { label: '15 דק׳', min: 15 },
  { label: '30 דק׳', min: 30 },
  { label: 'שעה', min: 60 },
  { label: '1.5 ש׳', min: 90 },
  { label: '2 ש׳', min: 120 },
  { label: '3 ש׳', min: 180 },
];

/** שדות טקסט נשמרים ביציאה מהשדה (לא בכל הקשה), כדי לא לשלוח עדכון לענן על כל אות. */
type TextDraft = {
  title: string;
  helper: string;
  notes: string;
  potentialRevenue: string;
  waitingDays: string;
};

const draftOf = (t: Task): TextDraft => ({
  title: t.title,
  helper: t.helper || '',
  notes: t.notes || '',
  potentialRevenue: t.potentialRevenue ? String(t.potentialRevenue) : '',
  waitingDays: t.waitingDays ? String(t.waitingDays) : '',
});

const diffDraft = (t: Task, d: TextDraft): Partial<Task> => {
  const patch: Partial<Task> = {};
  const title = d.title.trim();
  if (title && title !== t.title) patch.title = title;
  if (d.helper !== (t.helper || '')) patch.helper = d.helper;
  if (d.notes !== (t.notes || '')) patch.notes = d.notes;
  const rev = Number(d.potentialRevenue) || 0;
  if (rev !== (t.potentialRevenue || 0)) patch.potentialRevenue = rev;
  const wait = Number(d.waitingDays) || 0;
  if (wait !== (t.waitingDays || 0)) patch.waitingDays = wait;
  return patch;
};

type Props = {
  task: Task;
  meta: TopCategoryMeta | null;
  categoryOptions: TaskCategory[];
  pinned: boolean;
  onUpdate: (patch: Partial<Task>) => void;
  onToggle: () => void;
  onPin: () => void;
  onDelete: () => void;
  /** בטלפון: חזרה לרשימה */
  onBack?: () => void;
  /** האירוע שהמשימה קשורה אליו */
  event?: AppEvent;
  onUnlinkEvent?: () => void;
  /** שרשור המייל שהמשימה ננעצה ממנו */
  email?: { threadId: string; subject: string; from?: string };
  onUnlinkEmail?: () => void;
};

const stamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** יומן פעילות: כותבים פסקה, Enter שומר אותה עם חותמת זמן (Shift+Enter = שורה חדשה). */
const ActivityLog: React.FC<{ entries: TaskActivity[]; onChange: (next: TaskActivity[]) => void }> = ({ entries, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...entries, { id: `a_${Date.now()}`, at: new Date().toISOString(), text }]);
    setDraft('');
  };
  const newestFirst = [...entries].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <div className="min-h-0 flex flex-col">
      <span className="text-[11px] font-black text-slate-500">יומן פעילות {entries.length > 0 && `· ${entries.length}`}</span>
      <textarea
        className="mt-1 shrink-0 w-full px-2 py-1.5 bg-amber-50/60 border border-dashed border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-300 resize-none placeholder:text-amber-500/80"
        rows={2}
        placeholder="מה נעשה? Enter שומר עם תאריך ושעה · Shift+Enter שורה חדשה"
        aria-label="רשומה חדשה ביומן"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
      />
      <div className="flex-1 min-h-0 overflow-y-auto mt-1 space-y-1">
        {newestFirst.length === 0 && <p className="text-[11px] font-bold text-slate-400 px-1">עוד לא תועדה פעילות</p>}
        {newestFirst.map((a) => (
          <div key={a.id} className="group px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-amber-700" dir="ltr">
                {stamp(a.at)}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm('למחוק את הרשומה מהיומן?')) onChange(entries.filter((x) => x.id !== a.id));
                }}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-slate-400 hover:text-rose-500"
                aria-label="מחק רשומה"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap break-words">{a.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const label = 'text-[11px] font-black text-slate-500';
const field = 'w-full mt-0.5 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-sky-300 font-bold text-sm';

/** כל פרטי המשימה במסך אחד, עם עריכה ושמירה אוטומטית. */
const TaskDetailsPanel: React.FC<Props> = ({ task, meta, categoryOptions, pinned, onUpdate, onToggle, onPin, onDelete, onBack, event, onUnlinkEvent, email, onUnlinkEmail }) => {
  const [draft, setDraft] = useState<TextDraft>(() => draftOf(task));
  const [newSub, setNewSub] = useState('');
  // מתעדכן אחרי כל רינדור, כך שבניקוי (מעבר משימה / סגירה) הוא עדיין מחזיק את המשימה הקודמת והטיוטה שלה
  const latest = useRef({ task, draft, onUpdate });
  useEffect(() => {
    latest.current = { task, draft, onUpdate };
  });

  // מעבר למשימה אחרת: שומרים את מה שנכתב במשימה הקודמת וטוענים את החדשה
  useEffect(() => {
    setDraft(draftOf(task));
    setNewSub('');
    return () => {
      const { task: t, draft: d, onUpdate: save } = latest.current;
      const patch = diffDraft(t, d);
      if (Object.keys(patch).length) save(patch);
    };
  }, [task.id]);

  // משימה שהשתנתה מבחוץ (סנכרון מהענן) — מעדכנים שדות שהמשתמש לא נגע בהם
  useEffect(() => {
    setDraft((prev) => {
      const fresh = draftOf(task);
      const active = document.activeElement as HTMLElement | null;
      const editing = active?.dataset?.field as keyof TextDraft | undefined;
      return editing ? { ...fresh, [editing]: prev[editing] } : fresh;
    });
  }, [task.title, task.helper, task.notes, task.potentialRevenue, task.waitingDays]);

  const commitText = () => {
    const patch = diffDraft(task, draft);
    if (Object.keys(patch).length) onUpdate(patch);
    if (!draft.title.trim()) setDraft((d) => ({ ...d, title: task.title }));
  };

  const text = (key: keyof TextDraft) => ({
    'data-field': key,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
    onBlur: commitText,
  });

  const subs = task.subTasks || [];
  const setSubs = (next: SubTask[]) => onUpdate({ subTasks: next });

  const addSub = () => {
    const title = newSub.trim();
    if (!title) return;
    setSubs([
      ...subs,
      { id: `st_${Date.now()}`, title, isCompleted: false, priority: TaskPriority.Medium, estimatedTimeMin: 15, progress: 0 },
    ]);
    setNewSub('');
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-right" dir="rtl">
      <div className={`shrink-0 flex items-center gap-2 px-3 py-2 text-white ${meta?.header ?? 'bg-slate-600'}`}>
        {onBack && (
          <button type="button" onClick={onBack} className="p-1 -mr-1 rounded hover:bg-white/20" aria-label="חזרה לרשימה">
            <ArrowRight size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`w-6 h-6 shrink-0 rounded-full border-2 border-white flex items-center justify-center ${task.isCompleted ? 'bg-white text-emerald-600' : ''}`}
          aria-label={task.isCompleted ? 'סמן כלא הושלם' : 'סמן כהושלם'}
        >
          {task.isCompleted && <Check size={14} strokeWidth={3} />}
        </button>
        <input
          {...text('title')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className={`flex-1 min-w-0 bg-transparent outline-none font-black text-lg placeholder:text-white/60 focus:bg-white/15 rounded px-1 ${task.isCompleted ? 'line-through' : ''}`}
          aria-label="כותרת"
        />
        <button
          type="button"
          onClick={onPin}
          title={pinned ? 'הסר מהפוקוס' : 'לפוקוס היום'}
          aria-label={pinned ? 'הסר מהפוקוס' : 'לפוקוס היום'}
          className="p-1 rounded hover:bg-white/20 shrink-0"
        >
          <Star size={20} className={pinned ? 'fill-yellow-300 text-yellow-300' : 'text-white/80'} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-3 overflow-y-auto">
        {event && (
          <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-sm">
            <span className="shrink-0">📅</span>
            <Link to={`/events?eventId=${encodeURIComponent(event.id)}`} className="flex-1 min-w-0 truncate font-bold text-purple-800 hover:underline" title="פתח את האירוע">
              {event.title}
              {event.date ? ` · ${event.date.slice(0, 10).split('-').reverse().join('.')}` : ''}
            </Link>
            {onUnlinkEvent && (
              <button type="button" onClick={onUnlinkEvent} className="text-[11px] font-bold text-slate-400 hover:text-rose-600 shrink-0">
                נתק
              </button>
            )}
          </div>
        )}
        {email && (
          <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sm">
            <span className="shrink-0">✉️</span>
            <Link to={`/mail?threadId=${encodeURIComponent(email.threadId)}`} className="flex-1 min-w-0 truncate font-bold text-sky-800 hover:underline" title="פתח את המייל">
              {email.subject || '(ללא נושא)'}
              {email.from ? ` · ${email.from}` : ''}
            </Link>
            {onUnlinkEmail && (
              <button type="button" onClick={onUnlinkEmail} className="text-[11px] font-bold text-slate-400 hover:text-rose-600 shrink-0">
                נתק
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2.5 gap-y-2 shrink-0">
          <div className="col-span-2">
            <label className={label}>תחום</label>
            <select className={field} value={task.category} onChange={(e) => onUpdate({ category: e.target.value as TaskCategory })}>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>עדיפות</label>
            <select className={field} value={task.priority} onChange={(e) => onUpdate({ priority: Number(e.target.value) as TaskPriority })}>
              <option value={1}>נמוכה</option>
              <option value={3}>רגילה</option>
              <option value={5}>גבוהה/דחוף</option>
            </select>
          </div>
          <div>
            <label className={label}>תדירות</label>
            <select
              className={field}
              value={task.frequency || TaskFrequency.OneTime}
              onChange={(e) => onUpdate({ frequency: e.target.value as TaskFrequency })}
            >
              {Object.values(TaskFrequency).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>תאריך</label>
            <input type="date" className={field} value={task.dueDate || ''} onChange={(e) => onUpdate({ dueDate: e.target.value || undefined })} />
          </div>
          <div>
            <label className={label}>שעה</label>
            <input type="time" className={field} value={task.dueTime || ''} onChange={(e) => onUpdate({ dueTime: e.target.value || undefined })} />
          </div>
          <div>
            <label className={label}>זמן משוער</label>
            <select
              className={field}
              value={task.estimatedTimeMin || 0}
              onChange={(e) => onUpdate({ estimatedTimeMin: Number(e.target.value) || 0 })}
            >
              <option value={0}>ללא</option>
              {!TIME_PRESETS.some((p) => p.min === task.estimatedTimeMin) && task.estimatedTimeMin > 0 && (
                <option value={task.estimatedTimeMin}>{task.estimatedTimeMin} דק׳</option>
              )}
              {TIME_PRESETS.map((p) => (
                <option key={p.min} value={p.min}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>מי יעזור</label>
            <input className={field} {...text('helper')} />
          </div>

          <div className="col-span-2">
            <label className={label}>תזכורת</label>
            <input
              type="datetime-local"
              className={field}
              value={task.reminderDate || ''}
              onChange={(e) => onUpdate({ reminderDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className={label}>הכנסה פוטנציאלית ₪</label>
            <input type="number" min={0} className={field} {...text('potentialRevenue')} />
          </div>
          <div>
            <label className={label}>ימים בהמתנה</label>
            <input type="number" min={0} className={field} {...text('waitingDays')} />
          </div>

          <div className="col-span-2">
            <label className={label}>קלות ביצוע</label>
            <div className="mt-0.5 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onUpdate({ easeOfExecution: n })}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-black border ${
                    (task.easeOfExecution || 3) === n ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                  title={['קשה מאוד', 'קשה', 'בינוני', 'קל', 'קל מאוד'][n - 1]}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <label className={label}>התקדמות: {task.progress}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={25}
              className="w-full mt-1.5 accent-sky-600"
              value={task.progress}
              onChange={(e) => {
                const progress = Number(e.target.value);
                onUpdate({ progress, isCompleted: progress === 100 });
              }}
            />
          </div>
        </div>

        <div className="shrink-0">
          <label className={label}>הערות</label>
          <textarea className={`${field} resize-none`} rows={2} {...text('notes')} />
        </div>

        <div className="flex-1 min-h-[14rem] md:min-h-[8rem] grid grid-rows-2 md:grid-rows-1 md:grid-cols-2 gap-3">
        <ActivityLog entries={task.activityLog || []} onChange={(next) => onUpdate({ activityLog: next })} />
        <div className="min-h-0 flex flex-col">
          <div className="flex items-center justify-between">
            <span className={label}>
              תתי משימות {subs.length > 0 && `· ${subs.filter((s) => s.isCompleted).length}/${subs.length}`}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto mt-1 space-y-1">
            {subs.map((st, idx) => (
              <div key={st.id} className="flex items-center gap-1.5 px-1.5 py-1 bg-slate-50 rounded-lg border border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const next = [...subs];
                    next[idx] = { ...st, isCompleted: !st.isCompleted, progress: st.isCompleted ? 0 : 100 };
                    setSubs(next);
                  }}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    st.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                  }`}
                  aria-label={st.isCompleted ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                >
                  {st.isCompleted && <Check size={10} className="text-white" />}
                </button>
                <input
                  key={`${st.id}:${st.title}`}
                  defaultValue={st.title}
                  onBlur={(e) => {
                    const title = e.target.value.trim();
                    if (!title || title === st.title) {
                      e.target.value = st.title;
                      return;
                    }
                    const next = [...subs];
                    next[idx] = { ...st, title };
                    setSubs(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className={`flex-1 min-w-0 bg-transparent outline-none text-sm font-bold focus:bg-white rounded px-1 ${
                    st.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'
                  }`}
                  aria-label="תת-משימה"
                />
                <button
                  type="button"
                  onClick={() => setSubs(subs.filter((_, i) => i !== idx))}
                  className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                  aria-label="מחק תת-משימה"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5 shrink-0">
            <input
              className="flex-1 min-w-0 px-2 py-1.5 bg-sky-50/60 border border-dashed border-sky-200 rounded-lg text-sm font-bold outline-none placeholder:text-sky-400/80"
              placeholder="+ תת-משימה — Enter"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
            <button type="button" onClick={addSub} disabled={!newSub.trim()} className="p-1.5 text-sky-600 disabled:opacity-30" aria-label="הוסף תת-משימה">
              <Plus size={16} />
            </button>
          </div>
        </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-slate-100">
        <span className="text-[11px] font-bold text-slate-400">נשמר אוטומטית</span>
        <button type="button" onClick={onDelete} className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1">
          <Trash2 size={13} /> מחק משימה
        </button>
      </div>
    </div>
  );
};

export default TaskDetailsPanel;
