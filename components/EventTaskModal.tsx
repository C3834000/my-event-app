import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { AppEvent, Task, TaskCategory, TaskFrequency, TaskPriority } from '../types';
import { FALLBACK_SUB, getTaskCategories, useCategoryConfig } from '../data/taskCategories';

type Props = {
  event: AppEvent;
  onCreate: (task: Task) => void;
  onClose: () => void;
};

/** יצירת משימה מתוך אירוע. המשימה נשמרת עם eventId ומופיעה בלוח המשימות. */
const EventTaskModal: React.FC<Props> = ({ event, onCreate, onClose }) => {
  const catConfig = useCategoryConfig();
  const categories = useMemo(() => getTaskCategories({ includeHidden: false }), [catConfig]);
  const defaultCategory = categories.includes('אירועים') ? 'אירועים' : categories.includes('כללי') ? 'כללי' : FALLBACK_SUB;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>(defaultCategory);
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.Medium);
  const [dueDate, setDueDate] = useState(event.date ? event.date.slice(0, 10) : '');
  const [helper, setHelper] = useState('');

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onCreate({
      id: `t_${Date.now()}`,
      title: t,
      category,
      priority,
      isCompleted: false,
      progress: 0,
      estimatedTimeMin: 30,
      frequency: TaskFrequency.OneTime,
      subTasks: [],
      dueDate: dueDate || undefined,
      helper: helper.trim() || undefined,
      eventId: event.id,
    });
  };

  const field = 'w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-purple-300 font-bold text-sm';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" dir="rtl">
      <form
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-800">משימה חדשה לאירוע</h3>
            <p className="text-xs font-bold text-purple-700 truncate">
              📅 {event.title}
              {event.date ? ` · ${event.date.slice(0, 10).split('-').reverse().join('.')}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-800" aria-label="סגור">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="text-xs font-black text-slate-500">שם המשימה</label>
          <input autoFocus className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מה צריך לעשות?" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-xs font-black text-slate-500">קטגוריה</label>
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-slate-500">תאריך יעד</label>
            <input type="date" className={field} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-black text-slate-500">עדיפות</label>
            <select className={field} value={priority} onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}>
              <option value={TaskPriority.Low}>נמוכה</option>
              <option value={TaskPriority.Medium}>רגילה</option>
              <option value={TaskPriority.High}>גבוהה/דחוף</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-black text-slate-500">מי יעזור</label>
            <input className={field} value={helper} onChange={(e) => setHelper(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-400 hover:text-slate-700">
            ביטול
          </button>
          <button type="submit" disabled={!title.trim()} className="bg-purple-600 text-white px-6 py-2 rounded-xl font-black disabled:opacity-40">
            צור משימה
          </button>
        </div>
      </form>
    </div>
  );
};

export default EventTaskModal;
