import React, { useState } from 'react';
import { Sun, X } from 'lucide-react';
import { Task } from '../types';
import { getTopCategory, TOP_CATEGORIES } from '../data/tasksSeed';
import { isFocusToday } from '../utils/focus';
import TaskCard from './TaskCard';

type Props = {
  tasks: Task[];
  todayKey: string;
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
  onPinToday: (task: Task) => void;
};

const MyDayDrawer: React.FC<Props> = ({ tasks, todayKey, onToggle, onOpen, onPinToday }) => {
  const [open, setOpen] = useState(false);
  const focus = tasks.filter((t) => isFocusToday(t, todayKey));
  const total = focus.length;
  const done = focus.filter((t) => t.isCompleted).length;

  const groups = TOP_CATEGORIES.map((meta) => ({
    meta,
    tasks: focus.filter((t) => getTopCategory(t.category) === meta.id),
  })).filter((g) => g.tasks.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-0 z-40 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm px-2 py-4 rounded-r-2xl shadow-lg items-center gap-1"
        style={{ writingMode: 'vertical-rl' }}
        aria-label="היום שלי"
      >
        <Sun size={16} />
        היום שלי
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden fixed left-3 bottom-20 z-50 h-12 w-12 rounded-full bg-amber-500 text-white shadow-lg flex items-center justify-center"
        aria-label="היום שלי"
      >
        <Sun size={22} />
        <span className="absolute -top-1 -left-1 min-w-[1.7rem] h-5 px-1 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">
          {done}/{total}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]">
          <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="סגור" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] bg-white rounded-t-3xl shadow-2xl flex flex-col" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="font-black text-slate-800">☀️ היום שלי · {done}/{total}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-800" aria-label="סגור">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto px-3 py-3 space-y-3">
              {groups.length === 0 && <p className="text-sm text-slate-400 font-bold text-center py-8">אין עדיין משימות בפוקוס</p>}
              {groups.map((g) => (
                <section key={g.meta.id}>
                  <h3 className="text-xs font-black text-slate-500 mb-1.5">{g.meta.id}</h3>
                  <div className="space-y-2">
                    {g.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        todayKey={todayKey}
                        variant="focus"
                        onToggle={() => onToggle(task.id)}
                        onOpen={() => {
                          setOpen(false);
                          onOpen(task);
                        }}
                        onPinToday={() => onPinToday(task)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MyDayDrawer;
