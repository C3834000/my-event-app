import React from 'react';
import { Check, Star } from 'lucide-react';
import { Task } from '../types';
import { getTopCategory, topCategoryMeta } from '../data/tasksSeed';

const shortDue = (task: Task): string => {
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
  todayKey: string;
  onToggle: () => void;
  onOpen: () => void;
  onPinToday: () => void;
};

const TaskCard: React.FC<Props> = ({ task, todayKey, onToggle, onOpen, onPinToday }) => {
  const top = getTopCategory(task.category);
  const meta = top === 'hidden' ? null : topCategoryMeta(top);
  const tagLabel = meta?.id ?? 'ארכיון';
  const subLabel = task.category && task.category !== tagLabel ? task.category : '';
  const due = shortDue(task);
  const overdue = !!(task.dueDate && task.dueDate < todayKey && !task.isCompleted);
  const pinned = task.dueDate === todayKey;
  const subs = task.subTasks || [];
  const doneSubs = subs.filter((s) => s.isCompleted).length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className={`w-full text-right bg-white rounded-xl border border-slate-200 border-r-4 ${meta?.border ?? 'border-r-slate-300'} shadow-sm hover:border-slate-300 transition-colors px-3 py-2.5 cursor-pointer ${
        task.isCompleted ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
            task.isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-sky-500 bg-white'
          }`}
          aria-label={task.isCompleted ? 'סמן כלא הושלם' : 'סמן כהושלם'}
        >
          {task.isCompleted && <Check size={12} strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className={`flex-1 font-bold text-sm leading-snug ${task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
              {task.title}
            </p>
            {task.priority >= 5 && <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" title="דחוף" />}
            {task.priority === 3 && <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-400 shrink-0" title="רגיל" />}
            <button
              type="button"
              title="להיום"
              onClick={(e) => {
                e.stopPropagation();
                onPinToday();
              }}
              className={`shrink-0 p-0.5 rounded-md hover:bg-amber-50 ${pinned ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
            >
              <Star size={16} className={pinned ? 'fill-amber-400' : ''} />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className={`px-1.5 py-0.5 rounded-md font-bold ${meta?.tag ?? 'bg-slate-100 text-slate-600'}`}>{tagLabel}</span>
            {subLabel && <span className="text-slate-400 font-medium">{subLabel}</span>}
            {due && <span className={`font-bold ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>{due}</span>}
            {subs.length > 0 && (
              <span className="text-sky-700 font-bold">
                {doneSubs}/{subs.length}
              </span>
            )}
          </div>
          {task.progress > 0 && task.progress < 100 && (
            <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${meta?.bar ?? 'bg-slate-400'}`} style={{ width: `${task.progress}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
