import React from 'react';
import { Check, Star } from 'lucide-react';
import { Task } from '../types';
import { TopCategoryMeta } from '../data/taskCategories';

export const shortDue = (task: Task): string => {
  if (!task.dueDate) return '';
  const d = new Date(task.dueDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  if (diff < 0 && diff >= -14) return `לפני ${-diff} ימים`;
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

type Props = {
  task: Task;
  meta: TopCategoryMeta;
  todayKey: string;
  selected: boolean;
  pinned: boolean;
  onSelect: () => void;
  onToggle: () => void;
  /** בלי onPin (למשל בארכיון) — לא מוצג כוכב */
  onPin?: () => void;
};

/** שורה אחת במשימות: סימון, כותרת, תת-קטגוריה, תאריך, תתי-משימות וכוכב פוקוס. */
const TaskRow: React.FC<Props> = ({ task, meta, todayKey, selected, pinned, onSelect, onToggle, onPin }) => {
  const due = shortDue(task);
  const overdue = !!(task.dueDate && task.dueDate < todayKey && !task.isCompleted);
  const subs = task.subTasks || [];
  const doneSubs = subs.filter((s) => s.isCompleted).length;
  const subLabel = task.category && task.category !== meta.label ? task.category : '';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border-r-4 cursor-pointer transition-colors text-right ${meta.restBorder} ${
        selected ? 'bg-sky-50 ring-1 ring-sky-300' : pinned ? 'bg-amber-50/70 hover:bg-amber-50' : 'bg-white hover:bg-slate-50'
      } ${task.isCompleted ? 'opacity-55' : ''}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
          task.isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-sky-500 bg-white'
        }`}
        aria-label={task.isCompleted ? 'סמן כלא הושלם' : 'סמן כהושלם'}
      >
        {task.isCompleted && <Check size={12} strokeWidth={3} />}
      </button>

      {task.priority >= 5 && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="דחוף" />}

      <span className={`flex-1 min-w-0 truncate text-sm font-bold ${task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
      </span>

      {subLabel && <span className="hidden lg:inline text-[11px] font-medium text-slate-400 truncate max-w-[7rem] shrink-0">{subLabel}</span>}
      {subs.length > 0 && (
        <span className="text-[11px] font-bold text-sky-700 shrink-0">
          {doneSubs}/{subs.length}
        </span>
      )}
      {due && <span className={`text-[11px] font-bold shrink-0 ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>{due}</span>}

      {onPin && (
      <button
        type="button"
        title={pinned ? 'הסר מהפוקוס' : 'לפוקוס היום'}
        aria-label={pinned ? 'הסר מהפוקוס' : 'לפוקוס היום'}
        onClick={(e) => {
          e.stopPropagation();
          onPin();
        }}
        className={`shrink-0 p-0.5 rounded-md hover:bg-amber-100 ${pinned ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
      >
        <Star size={16} className={pinned ? 'fill-amber-400' : ''} />
      </button>
      )}
    </div>
  );
};

export default TaskRow;
