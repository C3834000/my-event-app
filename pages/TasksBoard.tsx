import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Task, TaskCategory, TaskPriority, TaskFrequency, SubTask } from '../types';
import { Check, Trash2, Plus, Edit, X, Upload, Search, Filter, ChevronDown, ChevronLeft, ListTree } from 'lucide-react';
import { parseCSV } from '../services/utils';
import { TASK_CATEGORIES, TASK_CATEGORY_ORDER, buildTasksSeed } from '../data/tasksSeed';

const CATEGORIES: TaskCategory[] = TASK_CATEGORIES;

const CATEGORY_COLORS: Record<string, string> = {
  'קליכיף': 'text-indigo-700',
  'קליקלייט': 'text-blue-700',
  'אישי': 'text-amber-700',
  'בית': 'text-emerald-700',
  'משפחה': 'text-pink-700',
  'תוכנית מדע': 'text-sky-700',
  'תוכנית קיץ': 'text-cyan-700',
  'שיווק': 'text-violet-700',
  'תוכן': 'text-fuchsia-700',
  'תוכנה': 'text-indigo-800',
  'וידאו': 'text-sky-800',
  'משחקים': 'text-teal-700',
  'אירועים': 'text-orange-700',
  'כספים': 'text-lime-800',
  'תפעול': 'text-stone-700',
  'ציוד': 'text-yellow-800',
  'שיחות': 'text-blue-600',
  'מערכת': 'text-slate-700',
  'כללי': 'text-slate-600',
  'דחוף': 'text-rose-700',
  'דחוף / לסיווג': 'text-rose-700',
};

const TIME_PRESETS = [
  { label: '10 דק׳', min: 10 },
  { label: '15 דק׳', min: 15 },
  { label: '30 דק׳', min: 30 },
  { label: 'שעה', min: 60 },
  { label: '1.5 ש׳', min: 90 },
  { label: '2 ש׳', min: 120 },
  { label: '3 ש׳', min: 180 },
];

const formatDuration = (min: number) => {
  if (!min) return '';
  if (min < 60) return `${min} דק׳`;
  if (min === 60) return 'שעה';
  if (min % 60 === 0) return `${min / 60} ש׳`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} ש׳`;
};

const formatDayLabel = (task: Task) => {
  if (task.priority === 5 && !task.dueDate) return 'דחוף';
  if (!task.dueDate) return '';
  const d = new Date(task.dueDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return task.dueDate;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

const toLocalDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const endOfWeekDate = () => {
  const d = new Date();
  const day = d.getDay(); // 0 Sun
  const add = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
};

const cellInput =
  'w-full bg-transparent border-0 outline-none text-sm py-1 px-1 rounded focus:bg-white focus:ring-1 focus:ring-sky-300 placeholder:text-slate-300';

const TasksBoard: React.FC = () => {
  const { tasks, addTask, updateTask, toggleTask, deleteTask, importTasks, importTaskObjects } = useApp();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showSubTasksForm, setShowSubTasksForm] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState<{ parentTaskId: string; subTaskIndex: number; subTask: any } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCategory, setQuickCategory] = useState<TaskCategory>('כללי');
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubTitle, setNewSubTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const filteredTasks = useMemo(() => {
    const catRank = (c: string) => {
      const i = TASK_CATEGORY_ORDER.indexOf(c as TaskCategory);
      return i === -1 ? 999 : i;
    };
    return tasks
      .filter((task) => {
        const matchesSearch =
          task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (task.subTasks || []).some((st) => st.title.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
        const matchesStatus =
          filterStatus === 'all' ||
          (filterStatus === 'completed' ? task.isCompleted : !task.isCompleted);
        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => {
        const catDiff = catRank(a.category) - catRank(b.category);
        if (catDiff !== 0) return catDiff;
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        const aOverdue = !!(a.dueDate && new Date(a.dueDate) < new Date() && !a.isCompleted);
        const bOverdue = !!(b.dueDate && new Date(b.dueDate) < new Date() && !b.isCompleted);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return b.priority - a.priority;
      });
  }, [tasks, searchTerm, filterCategory, filterStatus]);

  const toggleSubExpand = (taskId: string) => {
    setExpandedSubs((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const patchSubTasks = (task: Task, subTasks: SubTask[]) => {
    updateTask(task.id, { subTasks });
  };

  const addSubTask = (task: Task, title: string) => {
    const t = title.trim();
    if (!t) return;
    const sub: SubTask = {
      id: `st_${Date.now()}`,
      title: t,
      isCompleted: false,
      priority: TaskPriority.Medium,
      estimatedTimeMin: 15,
      progress: 0,
    };
    patchSubTasks(task, [...(task.subTasks || []), sub]);
    setExpandedSubs((prev) => ({ ...prev, [task.id]: true }));
    setNewSubTitle('');
  };

  const toggleSubTask = (task: Task, idx: number) => {
    const updated = [...(task.subTasks || [])];
    const st = updated[idx];
    updated[idx] = { ...st, isCompleted: !st.isCompleted, progress: !st.isCompleted ? 100 : 0 };
    patchSubTasks(task, updated);
  };

  const renameSubTask = (task: Task, idx: number, title: string) => {
    const t = title.trim();
    if (!t) return;
    const updated = [...(task.subTasks || [])];
    updated[idx] = { ...updated[idx], title: t };
    patchSubTasks(task, updated);
  };

  const removeSubTask = (task: Task, idx: number) => {
    patchSubTasks(task, (task.subTasks || []).filter((_, i) => i !== idx));
  };

  const handleLoadSeed = () => {
    const existing = new Set(tasks.map((t) => t.title.trim()));
    const toAdd = buildTasksSeed(existing);
    if (!toAdd.length) {
      alert('כל המשימות מהרשימה כבר קיימות.');
      return;
    }
    if (!confirm(`להוסיף ${toAdd.length} משימות מהרשימה?`)) return;
    const n = importTaskObjects(toAdd);
    alert(`נוספו ${n} משימות. אפשר עכשיו לפצל לתתי-משימות עם כפתור העץ ליד כל שורה.`);
  };

  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleQuickAdd = () => {
    const title = quickTitle.trim();
    if (!title) return;
    const category =
      filterCategory !== 'all' ? (filterCategory as TaskCategory) : quickCategory;
    addTask({
      id: Date.now().toString(),
      title,
      isCompleted: false,
      priority: category === 'דחוף / לסיווג' ? TaskPriority.High : TaskPriority.Medium,
      category,
      estimatedTimeMin: 30,
      progress: 0,
      frequency: TaskFrequency.OneTime,
      subTasks: [],
    });
    setQuickTitle('');
    quickInputRef.current?.focus();
  };

  const patchTask = (id: string, updates: Partial<Task>) => updateTask(id, updates);

  const applyDayPreset = (task: Task, preset: string) => {
    if (preset === 'clear') {
      patchTask(task.id, { dueDate: undefined, priority: task.priority === 5 ? TaskPriority.Medium : task.priority });
      return;
    }
    if (preset === 'urgent') {
      patchTask(task.id, { priority: TaskPriority.High, category: task.category === 'כללי' ? 'דחוף / לסיווג' : task.category });
      return;
    }
    if (preset === 'today') patchTask(task.id, { dueDate: toLocalDate(0) });
    if (preset === 'tomorrow') patchTask(task.id, { dueDate: toLocalDate(1) });
    if (preset === 'week') patchTask(task.id, { dueDate: endOfWeekDate() });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 dir-rtl pb-8">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-l from-slate-800 to-sky-900 text-white px-5 py-5 shadow-md">
        <div className="text-sky-200 text-xs font-bold mb-1">המשימות שלי</div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">כל המשימות. שורה אחת. סדר ברור.</h2>
            <p className="text-sky-100/90 text-sm mt-1 font-medium">
              {completedCount} מתוך {totalCount} הושלמו
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  importTasks(await parseCSV(file));
                  alert('ייבוא משימות הושלם!');
                }
              }}
              className="hidden"
              accept=".csv"
            />
            <button
              onClick={handleLoadSeed}
              className="bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
              title="טוען את ~54 המשימות מהרשימה"
            >
              <ListTree size={16} /> טען רשימה
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
            >
              <Upload size={16} /> ייבוא
            </button>
            <button
              onClick={() => quickInputRef.current?.focus()}
              className="bg-sky-400 hover:bg-sky-300 text-slate-900 px-4 py-2 rounded-xl font-black flex items-center gap-2 text-sm shadow transition-all"
            >
              <Plus size={18} /> משימה חדשה
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-sky-300 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="חיפוש משימה..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-sky-300 text-sm font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold text-slate-600 outline-none focus:border-sky-300"
          >
            <option value="open">פתוחות</option>
            <option value="all">הכל</option>
            <option value="completed">בוצעו</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filterCategory === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            הכל
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterCategory === cat ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500">
                <th className="w-10 p-2 text-center">מצב</th>
                <th className="p-2 min-w-[200px]">משימה</th>
                <th className="p-2 w-28">תחום</th>
                <th className="p-2 w-28">יום ביצוע</th>
                <th className="p-2 w-24">שעה/מועד</th>
                <th className="p-2 w-24">זמן</th>
                <th className="p-2 w-28">מי יעזור</th>
                <th className="p-2 min-w-[140px]">הערות</th>
                <th className="w-16 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-14 text-center">
                    <Filter className="mx-auto text-slate-300 mb-2" size={36} />
                    <p className="text-slate-400 font-bold text-sm">אין משימות להצגה</p>
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setFilterCategory('all');
                        setFilterStatus('open');
                        quickInputRef.current?.focus();
                      }}
                      className="text-sky-600 font-bold text-sm mt-2 hover:underline"
                    >
                      הוסף משימה ראשונה
                    </button>
                  </td>
                </tr>
              )}

              {filteredTasks.map((task, idx) => {
                const overdue = !!(task.dueDate && new Date(task.dueDate) < new Date() && !task.isCompleted);
                const dayLabel = formatDayLabel(task);
                const subs = task.subTasks || [];
                const doneSubs = subs.filter((s) => s.isCompleted).length;
                const isExpanded = !!expandedSubs[task.id] || addingSubFor === task.id;
                return (
                  <React.Fragment key={task.id}>
                  <tr
                    className={`border-b border-slate-100 group hover:bg-sky-50/50 transition-colors ${
                      task.isCompleted ? 'opacity-50' : idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
                    } ${overdue ? 'bg-rose-50/70' : ''}`}
                  >
                    <td className="p-1.5 text-center align-middle">
                      <button
                        onClick={() => toggleTask(task.id)}
                        className={`w-5 h-5 mx-auto rounded-full border-2 flex items-center justify-center transition-all ${
                          task.isCompleted
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-slate-300 hover:border-sky-500 bg-white'
                        }`}
                        aria-label={task.isCompleted ? 'סמן כלא הושלם' : 'סמן כהושלם'}
                      >
                        {task.isCompleted && <Check size={12} strokeWidth={3} />}
                      </button>
                    </td>

                    <td className="p-1 align-middle">
                      <div className="flex items-center gap-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSubExpand(task.id)}
                          className={`shrink-0 p-0.5 rounded transition-colors ${
                            subs.length ? 'text-sky-600 hover:bg-sky-50' : 'text-slate-300 hover:text-sky-500 hover:bg-sky-50'
                          }`}
                          title={subs.length ? `${doneSubs}/${subs.length} תתי-משימות` : 'הוסף תתי-משימות'}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                        </button>
                        <input
                          className={`${cellInput} font-semibold ${task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}
                          defaultValue={task.title}
                          key={`title-${task.id}-${task.title}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== task.title) patchTask(task.id, { title: v });
                            else if (!v) e.target.value = task.title;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                        />
                        {subs.length > 0 && (
                          <span className="shrink-0 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded">
                            {doneSubs}/{subs.length}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-1 align-middle">
                      <select
                        className={`${cellInput} font-bold ${CATEGORY_COLORS[task.category] || 'text-slate-600'} cursor-pointer`}
                        value={task.category}
                        onChange={(e) => patchTask(task.id, { category: e.target.value as TaskCategory })}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-1 align-middle">
                      <div className="flex items-center gap-0.5">
                        <select
                          className={`${cellInput} font-bold ${
                            task.priority === 5 || overdue ? 'text-amber-700' : 'text-slate-700'
                          } cursor-pointer`}
                          value={
                            task.priority === 5 && !task.dueDate
                              ? 'urgent'
                              : dayLabel === 'היום'
                                ? 'today'
                                : dayLabel === 'מחר'
                                  ? 'tomorrow'
                                  : task.dueDate === endOfWeekDate()
                                    ? 'week'
                                    : task.dueDate
                                      ? 'custom'
                                      : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'custom') return;
                            if (!v) applyDayPreset(task, 'clear');
                            else applyDayPreset(task, v);
                          }}
                        >
                          <option value="">בחר יום</option>
                          <option value="today">היום</option>
                          <option value="tomorrow">מחר</option>
                          <option value="week">השבוע</option>
                          <option value="urgent">דחוף</option>
                          {task.dueDate && <option value="custom">{dayLabel || task.dueDate}</option>}
                        </select>
                        <input
                          type="date"
                          className="w-0 opacity-0 absolute"
                          id={`date-${task.id}`}
                          value={task.dueDate || ''}
                          onChange={(e) =>
                            patchTask(task.id, {
                              dueDate: e.target.value || undefined,
                              priority: task.priority === 5 && e.target.value ? task.priority : task.priority,
                            })
                          }
                        />
                        <button
                          type="button"
                          title="תאריך מדויק"
                          className="text-[10px] text-slate-400 hover:text-sky-600 font-bold px-0.5 shrink-0"
                          onClick={() => {
                            const el = document.getElementById(`date-${task.id}`) as HTMLInputElement | null;
                            if (!el) return;
                            try {
                              el.showPicker?.();
                            } catch {
                              el.click();
                            }
                          }}
                        >
                          📅
                        </button>
                      </div>
                    </td>

                    <td className="p-1 align-middle">
                      <input
                        type="time"
                        step={300}
                        className={`${cellInput} text-slate-600`}
                        value={task.dueTime || ''}
                        onChange={(e) => patchTask(task.id, { dueTime: e.target.value || undefined })}
                      />
                    </td>

                    <td className="p-1 align-middle">
                      <select
                        className={`${cellInput} text-slate-600 cursor-pointer`}
                        value={
                          TIME_PRESETS.some((p) => p.min === task.estimatedTimeMin)
                            ? task.estimatedTimeMin
                            : task.estimatedTimeMin || ''
                        }
                        onChange={(e) => patchTask(task.id, { estimatedTimeMin: Number(e.target.value) || 0 })}
                      >
                        <option value="">{formatDuration(task.estimatedTimeMin) || 'זמן'}</option>
                        {TIME_PRESETS.map((p) => (
                          <option key={p.min} value={p.min}>
                            {p.label}
                          </option>
                        ))}
                        {task.estimatedTimeMin > 0 &&
                          !TIME_PRESETS.some((p) => p.min === task.estimatedTimeMin) && (
                            <option value={task.estimatedTimeMin}>{formatDuration(task.estimatedTimeMin)}</option>
                          )}
                      </select>
                    </td>

                    <td className="p-1 align-middle">
                      <input
                        className={`${cellInput} text-slate-600`}
                        placeholder="מי יעזור"
                        defaultValue={task.helper || ''}
                        key={`helper-${task.id}-${task.helper || ''}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (task.helper || '')) {
                            patchTask(task.id, { helper: v });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </td>

                    <td className="p-1 align-middle">
                      <input
                        className={`${cellInput} text-slate-500`}
                        placeholder="הערות"
                        defaultValue={task.requiredResources || ''}
                        key={`notes-${task.id}-${task.requiredResources || ''}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (task.requiredResources || '')) {
                            patchTask(task.id, { requiredResources: v });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </td>

                    <td className="p-1 align-middle">
                      <div className="flex items-center justify-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setAddingSubFor(task.id);
                            setExpandedSubs((prev) => ({ ...prev, [task.id]: true }));
                            setNewSubTitle('');
                          }}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg"
                          title="הוסף תת-משימה"
                        >
                          <ListTree size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setShowSubTasksForm(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg"
                          title="פרטים נוספים"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('למחוק את המשימה?')) deleteTask(task.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="מחק"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded &&
                    subs.map((st, sIdx) => (
                      <tr key={st.id} className="bg-slate-50/80 border-b border-slate-100">
                        <td className="p-1 text-center">
                          <button
                            onClick={() => toggleSubTask(task, sIdx)}
                            className={`w-4 h-4 mx-auto rounded border-2 flex items-center justify-center ${
                              st.isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {st.isCompleted && <Check size={10} strokeWidth={3} />}
                          </button>
                        </td>
                        <td className="p-1" colSpan={6}>
                          <div className="flex items-center gap-2 pr-6">
                            <span className="text-slate-300 text-xs">└</span>
                            <input
                              className={`${cellInput} text-sm ${st.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}
                              defaultValue={st.title}
                              key={`st-${st.id}-${st.title}`}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== st.title) renameSubTask(task, sIdx, v);
                                else if (!v) e.target.value = st.title;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                          </div>
                        </td>
                        <td className="p-1 text-center">
                          <button
                            onClick={() => removeSubTask(task, sIdx)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded"
                            title="מחק תת-משימה"
                          >
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}

                  {isExpanded && (
                    <tr className="bg-sky-50/50 border-b border-sky-100">
                      <td />
                      <td className="p-1" colSpan={7}>
                        <div className="flex items-center gap-2 pr-6">
                          <Plus size={12} className="text-sky-500 shrink-0" />
                          <input
                            autoFocus={addingSubFor === task.id}
                            className={`${cellInput} text-sm placeholder:text-sky-400/80`}
                            placeholder="תת-משימה חדשה — Enter להוספה"
                            value={addingSubFor === task.id ? newSubTitle : ''}
                            onFocus={() => setAddingSubFor(task.id)}
                            onChange={(e) => {
                              setAddingSubFor(task.id);
                              setNewSubTitle(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addSubTask(task, newSubTitle);
                              }
                              if (e.key === 'Escape') {
                                setAddingSubFor(null);
                                setNewSubTitle('');
                              }
                            }}
                            onBlur={() => {
                              if (newSubTitle.trim() && addingSubFor === task.id) {
                                addSubTask(task, newSubTitle);
                              }
                              setAddingSubFor(null);
                            }}
                          />
                        </div>
                      </td>
                      <td />
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}

              {/* Quick add row */}
              <tr className="bg-sky-50/40 border-t border-sky-100">
                <td className="p-1.5 text-center">
                  <div className="w-5 h-5 mx-auto rounded-full border-2 border-dashed border-sky-300" />
                </td>
                <td className="p-1" colSpan={2}>
                  <div className="flex items-center gap-2">
                    <input
                      ref={quickInputRef}
                      className={`${cellInput} font-semibold text-slate-800 placeholder:text-sky-400/80`}
                      placeholder="+ משימה חדשה — הקלד ולחץ Enter"
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickAdd();
                        }
                      }}
                    />
                    {filterCategory === 'all' && (
                      <select
                        className="text-xs font-bold bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-600 outline-none"
                        value={quickCategory}
                        onChange={(e) => setQuickCategory(e.target.value as TaskCategory)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
                <td colSpan={5} className="p-1 text-[11px] text-slate-400 font-medium">
                  Enter להוספה מהירה
                </td>
                <td className="p-1 text-center">
                  <button
                    onClick={handleQuickAdd}
                    disabled={!quickTitle.trim()}
                    className="p-1.5 text-sky-600 hover:bg-sky-100 rounded-lg disabled:opacity-30"
                    title="הוסף"
                  >
                    <Plus size={16} />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
          כל שדה ניתן לעריכה · השינויים נשמרים אוטומטית · לחץ על החץ / אייקון העץ ליד משימה כדי לפצל לתתי-משימות
        </div>
      </div>

      {/* Advanced edit modal (subtasks + extra fields) */}
      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden p-6 space-y-5 my-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800">פרטים נוספים</h3>
              <button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-900">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4 text-right">
              <div>
                <label className="text-xs font-black text-slate-500">משימה</label>
                <input
                  className="w-full mt-1 p-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-500">עדיפות</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold text-sm"
                    value={editingTask.priority}
                    onChange={(e) => setEditingTask({ ...editingTask, priority: Number(e.target.value) as TaskPriority })}
                  >
                    <option value={1}>נמוכה</option>
                    <option value={3}>רגילה</option>
                    <option value={5}>גבוהה/דחוף</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">תדירות</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold text-sm"
                    value={editingTask.frequency || TaskFrequency.OneTime}
                    onChange={(e) => setEditingTask({ ...editingTask, frequency: e.target.value as TaskFrequency })}
                  >
                    {Object.values(TaskFrequency).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">הכנסה פוטנציאלית (₪)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold text-sm"
                    value={editingTask.potentialRevenue || 0}
                    onChange={(e) => setEditingTask({ ...editingTask, potentialRevenue: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">קלות ביצוע (1–5)</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold text-sm"
                    value={editingTask.easeOfExecution || 3}
                    onChange={(e) => setEditingTask({ ...editingTask, easeOfExecution: Number(e.target.value) })}
                  >
                    <option value={1}>1 - קשה מאוד</option>
                    <option value={2}>2 - קשה</option>
                    <option value={3}>3 - בינוני</option>
                    <option value={4}>4 - קל</option>
                    <option value={5}>5 - קל מאוד</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">ימים בהמתנה</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold text-sm"
                    value={editingTask.waitingDays || 0}
                    onChange={(e) => setEditingTask({ ...editingTask, waitingDays: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">תזכורת</label>
                  <input
                    type="datetime-local"
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold text-sm"
                    value={editingTask.reminderDate || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, reminderDate: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-black text-slate-500">התקדמות: {editingTask.progress}%</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={25}
                    className="w-full mt-1 accent-sky-600"
                    value={editingTask.progress}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        progress: Number(e.target.value),
                        isCompleted: Number(e.target.value) === 100,
                      })
                    }
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-700">תתי משימות</h4>
                  <button
                    type="button"
                    onClick={() => setShowSubTasksForm(!showSubTasksForm)}
                    className="text-xs font-bold text-sky-600 hover:bg-sky-50 px-2 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <Plus size={14} /> הוסף
                  </button>
                </div>
                {(editingTask.subTasks || []).length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {editingTask.subTasks?.map((st, idx) => (
                      <div key={st.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...(editingTask.subTasks || [])];
                              updated[idx] = { ...st, isCompleted: !st.isCompleted, progress: !st.isCompleted ? 100 : 0 };
                              setEditingTask({ ...editingTask, subTasks: updated });
                            }}
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              st.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                            }`}
                          >
                            {st.isCompleted && <Check size={10} className="text-white" />}
                          </button>
                          <span className={`text-sm font-bold truncate ${st.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {st.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingSubTask({ parentTaskId: editingTask.id, subTaskIndex: idx, subTask: { ...st } })}
                            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTask({
                                ...editingTask,
                                subTasks: (editingTask.subTasks || []).filter((_, i) => i !== idx),
                              });
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showSubTasksForm && (
                  <input
                    type="text"
                    autoFocus
                    placeholder="שם תת-משימה... (Enter להוספה)"
                    className="w-full p-2.5 bg-sky-50 border border-sky-200 rounded-xl outline-none focus:ring-2 focus:ring-sky-300 font-bold text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const title = e.currentTarget.value.trim();
                        if (!title) return;
                        setEditingTask({
                          ...editingTask,
                          subTasks: [
                            ...(editingTask.subTasks || []),
                            {
                              id: `st_${Date.now()}`,
                              title,
                              isCompleted: false,
                              priority: TaskPriority.Medium,
                              estimatedTimeMin: 15,
                              progress: 0,
                            },
                          ],
                        });
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  updateTask(editingTask.id, editingTask);
                  setEditingTask(null);
                }}
                className="w-full bg-sky-600 text-white py-3 rounded-xl font-black hover:bg-sky-700 transition-all"
              >
                שמור
              </button>
              <button type="button" onClick={() => setEditingTask(null)} className="w-full py-2 font-bold text-slate-400 hover:text-slate-600">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSubTask && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 my-8">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-800">עריכת תת-משימה</h3>
              <button type="button" onClick={() => setEditingSubTask(null)} className="text-slate-400 hover:text-slate-900">
                <X size={22} />
              </button>
            </div>
            <input
              className="w-full p-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-sky-200 font-bold"
              value={editingSubTask.subTask.title}
              onChange={(e) =>
                setEditingSubTask({ ...editingSubTask, subTask: { ...editingSubTask.subTask, title: e.target.value } })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-slate-500">עדיפות</label>
                <select
                  className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                  value={editingSubTask.subTask.priority}
                  onChange={(e) =>
                    setEditingSubTask({
                      ...editingSubTask,
                      subTask: { ...editingSubTask.subTask, priority: Number(e.target.value) },
                    })
                  }
                >
                  <option value={1}>נמוכה</option>
                  <option value={3}>רגילה</option>
                  <option value={5}>גבוהה</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500">דקות</label>
                <input
                  type="number"
                  min={0}
                  className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                  value={editingSubTask.subTask.estimatedTimeMin}
                  onChange={(e) =>
                    setEditingSubTask({
                      ...editingSubTask,
                      subTask: { ...editingSubTask.subTask, estimatedTimeMin: Number(e.target.value) },
                    })
                  }
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const parentTask = tasks.find((t) => t.id === editingSubTask.parentTaskId);
                if (parentTask) {
                  const updatedSubTasks = [...(parentTask.subTasks || [])];
                  updatedSubTasks[editingSubTask.subTaskIndex] = editingSubTask.subTask;
                  updateTask(editingSubTask.parentTaskId, { subTasks: updatedSubTasks });
                  if (editingTask?.id === editingSubTask.parentTaskId) {
                    setEditingTask({ ...editingTask, subTasks: updatedSubTasks });
                  }
                }
                setEditingSubTask(null);
              }}
              className="w-full bg-sky-600 text-white py-3 rounded-xl font-black hover:bg-sky-700"
            >
              שמור תת-משימה
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksBoard;
