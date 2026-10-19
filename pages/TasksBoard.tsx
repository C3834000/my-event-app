import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Task, TaskCategory, TaskPriority, TaskFrequency, SubTask } from '../types';
import { Check, Trash2, Plus, Edit, X, Upload, Search, ChevronDown, ListTree } from 'lucide-react';
import { parseCSV } from '../services/utils';
import {
  TASK_CATEGORIES,
  TOP_CATEGORIES,
  TOP_DEFAULT_CATEGORY,
  TopCategoryId,
  buildTasksSeed,
  getTopCategory,
} from '../data/tasksSeed';
import TaskCard from '../components/TaskCard';

const TIME_PRESETS = [
  { label: '10 דק׳', min: 10 },
  { label: '15 דק׳', min: 15 },
  { label: '30 דק׳', min: 30 },
  { label: 'שעה', min: 60 },
  { label: '1.5 ש׳', min: 90 },
  { label: '2 ש׳', min: 120 },
  { label: '3 ש׳', min: 180 },
];

const DAY_NAMES = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfWeekSunday = (d: Date) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
};

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const formatShortDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;

const nextWeekStartDate = () => {
  const d = startOfDay(new Date());
  const untilSat = d.getDay() === 6 ? 0 : 6 - d.getDay();
  d.setDate(d.getDate() + untilSat + 1);
  return toDateKey(d);
};

const compareTasks = (a: Task, b: Task) => {
  if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
  if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
  return (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
};

const isHiddenTask = (task: Task) => {
  if (task.isCompleted) return true;
  if (task.category === 'ארכיון' || task.category === 'רעיונות') return true;
  const top = getTopCategory(task.category);
  return top === 'hidden' || top === 'רעיונות';
};

type TaskTimeGroup = {
  key: string;
  label: string;
  kind: 'day' | 'week' | 'other';
  tasks: Task[];
};

const buildTimeGroups = (list: Task[]): TaskTimeGroup[] => {
  const today = startOfDay(new Date());
  const thisWeekStart = startOfWeekSunday(today);
  const thisWeekEnd = addDays(thisWeekStart, 6);

  type Bucket = { key: string; label: string; kind: TaskTimeGroup['kind']; sort: number; tasks: Task[] };
  const buckets = new Map<string, Bucket>();

  const ensure = (key: string, label: string, kind: TaskTimeGroup['kind'], sort: number) => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, kind, sort, tasks: [] };
      buckets.set(key, b);
    }
    return b;
  };

  for (const task of list) {
    if (!task.dueDate) {
      ensure('nodate', 'בלי תאריך', 'other', 9_000_000).tasks.push(task);
      continue;
    }
    const due = startOfDay(new Date(task.dueDate + 'T12:00:00'));
    if (Number.isNaN(due.getTime())) {
      ensure('nodate', 'בלי תאריך', 'other', 9_000_000).tasks.push(task);
      continue;
    }

    const dueKey = toDateKey(due);
    const weekStart = startOfWeekSunday(due);

    if (due < thisWeekStart) {
      const weekEnd = addDays(weekStart, 6);
      const key = `past-${toDateKey(weekStart)}`;
      ensure(
        key,
        `שבוע שעבר · ${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`,
        'week',
        weekStart.getTime() - 1_000_000_000_000,
      ).tasks.push(task);
    } else if (due <= thisWeekEnd) {
      const name = DAY_NAMES[due.getDay()];
      const isToday = dueKey === toDateKey(today);
      const label = isToday ? `היום · ${name} ${formatShortDate(due)}` : `${name} ${formatShortDate(due)}`;
      ensure(`day-${dueKey}`, label, 'day', due.getTime()).tasks.push(task);
    } else {
      const weekEnd = addDays(weekStart, 6);
      const nextWeekStart = addDays(thisWeekStart, 7);
      const isNext = toDateKey(weekStart) === toDateKey(nextWeekStart);
      const key = `week-${toDateKey(weekStart)}`;
      const label = isNext
        ? `שבוע הבא · ${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`
        : `שבוע ${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`;
      ensure(key, label, 'week', weekStart.getTime()).tasks.push(task);
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.sort - b.sort)
    .map(({ key, label, kind, tasks }) => ({
      key,
      label,
      kind,
      tasks: [...tasks].sort(compareTasks),
    }));
};

type TodayView = {
  focus: Task[];
  overdue: Task[];
  weekRest: Task[];
  todayKey: string;
};

const buildTodayView = (list: Task[]): TodayView => {
  const today = startOfDay(new Date());
  const todayKey = toDateKey(today);
  const weekEndKey = toDateKey(addDays(startOfWeekSunday(today), 6));
  const overdueStart = toDateKey(addDays(today, -14));

  const dueToday = list.filter((t) => !t.isCompleted && t.dueDate === todayKey).sort(compareTasks);
  const focus = dueToday.slice(0, 5);
  const focusIds = new Set(focus.map((t) => t.id));

  const overdue = list
    .filter((t) => {
      if (t.isCompleted || !t.dueDate) return false;
      return t.dueDate < todayKey && t.dueDate >= overdueStart;
    })
    .sort(compareTasks);

  const weekRest = list
    .filter((t) => {
      if (t.isCompleted || !t.dueDate) return false;
      if (focusIds.has(t.id)) return false;
      return t.dueDate >= todayKey && t.dueDate <= weekEndKey;
    })
    .sort(compareTasks);

  return { focus, overdue, weekRest, todayKey };
};

type CleanupReason = 'באיחור מעל 14 יום' | 'בלי כותרת' | 'כפילות';

const cleanupRows = (tasks: Task[]): { task: Task; reasons: CleanupReason[] }[] => {
  const todayKey = toDateKey(startOfDay(new Date()));
  const cutoff = toDateKey(addDays(startOfDay(new Date()), -14));
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const key = t.title.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows: { task: Task; reasons: CleanupReason[] }[] = [];
  for (const task of tasks) {
    const reasons: CleanupReason[] = [];
    if (!task.isCompleted && task.dueDate && task.dueDate < cutoff && task.dueDate < todayKey) {
      reasons.push('באיחור מעל 14 יום');
    }
    if (task.title.trim() === 'משימה') reasons.push('בלי כותרת');
    if ((counts.get(task.title.trim()) || 0) > 1) reasons.push('כפילות');
    if (reasons.length) rows.push({ task, reasons });
  }
  return rows;
};

type BoardView = 'today' | 'week' | 'all';

const TasksBoard: React.FC = () => {
  const { tasks, addTask, updateTask, toggleTask, deleteTask, importTasks, importTaskObjects } = useApp();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showSubTasksForm, setShowSubTasksForm] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState<{ parentTaskId: string; subTaskIndex: number; subTask: SubTask } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [topFilter, setTopFilter] = useState<TopCategoryId | 'all'>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [view, setView] = useState<BoardView>('today');
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...TOP_CATEGORIES.map((c) => c.id), 'archive'].map((id) => [id, true])),
  );
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupSelected, setCleanupSelected] = useState<string[]>([]);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCategory, setQuickCategory] = useState<TaskCategory>('כללי');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const todayKey = toDateKey(startOfDay(new Date()));

  const visibleTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      const pickedIdeas = topFilter === 'רעיונות' && !task.isCompleted;
      if (!showHidden && !pickedIdeas && isHiddenTask(task)) return false;
      if (topFilter !== 'all' && getTopCategory(task.category) !== topFilter) return false;
      if (!q) return true;
      const blob = [task.title, task.category, task.notes, task.helper, ...(task.subTasks || []).map((s) => s.title)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [tasks, searchTerm, topFilter, showHidden]);

  const summarySource = useMemo(
    () => tasks.filter((t) => showHidden || !isHiddenTask(t)),
    [tasks, showHidden],
  );
  const summary = useMemo(() => buildTodayView(summarySource), [summarySource]);
  const todayView = useMemo(() => buildTodayView(visibleTasks), [visibleTasks]);

  const weekGroups = useMemo(() => {
    const weekEndKey = toDateKey(addDays(startOfWeekSunday(new Date()), 6));
    const inWeek = visibleTasks.filter((t) => t.dueDate && t.dueDate >= todayKey && t.dueDate <= weekEndKey);
    return buildTimeGroups(inWeek);
  }, [visibleTasks, todayKey]);

  const groupedSections = (list: Task[]) => {
    const sections: { key: string; label: string; tasks: Task[] }[] = TOP_CATEGORIES.map((meta) => ({
      key: meta.id,
      label: meta.id,
      tasks: list.filter((t) => getTopCategory(t.category) === meta.id).sort(compareTasks),
    })).filter((s) => s.tasks.length > 0);
    const archived = list.filter((t) => getTopCategory(t.category) === 'hidden').sort(compareTasks);
    if (archived.length) sections.push({ key: 'archive', label: 'ארכיון', tasks: archived });
    return sections;
  };

  const allSections = useMemo(() => groupedSections(visibleTasks), [visibleTasks]);

  const restSections = useMemo(() => {
    const shown = new Set([...todayView.focus, ...todayView.overdue, ...todayView.weekRest].map((t) => t.id));
    return groupedSections(visibleTasks.filter((t) => !shown.has(t.id)));
  }, [visibleTasks, todayView]);

  const chipCounts = useMemo(() => {
    const base = tasks.filter((t) => showHidden || !t.isCompleted);
    const map = Object.fromEntries(TOP_CATEGORIES.map((c) => [c.id, 0])) as Record<TopCategoryId, number>;
    for (const t of base) {
      const top = getTopCategory(t.category);
      if (top !== 'hidden') map[top] += 1;
    }
    return map;
  }, [tasks, showHidden]);

  const junk = useMemo(() => cleanupRows(tasks), [tasks]);

  const categoryOptions = (current: TaskCategory): TaskCategory[] =>
    TASK_CATEGORIES.includes(current) ? TASK_CATEGORIES : [current, ...TASK_CATEGORIES];

  const handleLoadSeed = () => {
    const existing = new Set<string>(tasks.map((t) => t.title.trim()));
    const toAdd = buildTasksSeed(existing);
    if (!toAdd.length) {
      alert('כל המשימות מהרשימה כבר קיימות.');
      return;
    }
    if (!confirm(`להוסיף ${toAdd.length} משימות מהרשימה?`)) return;
    const n = importTaskObjects(toAdd);
    alert(`נוספו ${n} משימות.`);
  };

  const handleQuickAdd = () => {
    const title = quickTitle.trim();
    if (!title) return;
    const category = topFilter === 'all' ? quickCategory : TOP_DEFAULT_CATEGORY[topFilter];
    addTask({
      id: Date.now().toString(),
      title,
      isCompleted: false,
      priority: category === 'דחוף' || category === 'דחוף / לסיווג' ? TaskPriority.High : TaskPriority.Medium,
      category,
      estimatedTimeMin: 30,
      progress: 0,
      frequency: TaskFrequency.OneTime,
      subTasks: [],
    });
    setQuickTitle('');
    quickInputRef.current?.focus();
  };

  const pinToday = (task: Task) => updateTask(task.id, { dueDate: todayKey });

  const applyCleanup = (ids: string[], action: 'done' | 'next' | 'archive' | 'delete') => {
    if (!ids.length) return;
    if (action === 'delete') {
      const msg = ids.length === 1 ? 'למחוק את המשימה?' : `למחוק ${ids.length} משימות?`;
      if (!confirm(msg)) return;
      ids.forEach((id) => deleteTask(id));
    } else if (action === 'done') {
      ids.forEach((id) => updateTask(id, { isCompleted: true, progress: 100 }));
    } else if (action === 'next') {
      const due = nextWeekStartDate();
      ids.forEach((id) => updateTask(id, { dueDate: due }));
    } else {
      ids.forEach((id) => updateTask(id, { category: 'ארכיון' }));
    }
    setCleanupSelected((prev) => prev.filter((id) => !ids.includes(id)));
  };

  const renderCards = (list: Task[]) => (
    <div className="space-y-2">
      {list.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          todayKey={todayKey}
          onToggle={() => toggleTask(task.id)}
          onOpen={() => {
            setEditingTask(task);
            setShowSubTasksForm(false);
          }}
          onPinToday={() => pinToday(task)}
        />
      ))}
    </div>
  );

  const now = new Date();
  const headerLine = `${DAY_NAMES[now.getDay()]} ${formatShortDate(now)} · ${summary.focus.length} בפוקוס · ${summary.overdue.length} באיחור`;

  const tabs: { id: BoardView; label: string }[] = [
    { id: 'today', label: 'היום' },
    { id: 'week', label: 'השבוע' },
    { id: 'all', label: 'הכל' },
  ];

  const tabBar = (fixed: boolean) => (
    <div className={fixed ? 'fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex md:hidden' : 'hidden md:flex gap-1'}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setView(tab.id)}
          className={
            fixed
              ? `flex-1 py-3 text-sm font-black ${view === tab.id ? 'text-sky-700' : 'text-slate-400'}`
              : `px-4 py-1.5 rounded-full text-sm font-black ${view === tab.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-3 dir-rtl pb-24 md:pb-8">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-800 truncate">{headerLine}</p>
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const result = importTasks(await parseCSV(file));
              alert(
                result.added
                  ? `יובאו ${result.added} משימות${result.skipped ? ` · ${result.skipped} דולגו` : ''}`
                  : 'לא יובאו משימות חדשות. שורות בלי כותרת וכותרות שכבר קיימות דולגות.',
              );
            }}
          />
          <button
            type="button"
            onClick={() => {
              setCleanupOpen(true);
              setCleanupSelected([]);
            }}
            className="text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg"
          >
            לניקוי{junk.length ? ` ${junk.length}` : ''}
          </button>
          <button type="button" onClick={handleLoadSeed} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="טען רשימה">
            <ListTree size={16} />
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="ייבוא">
            <Upload size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="חיפוש משימה..."
            className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-sky-300 text-sm font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 shrink-0">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-slate-700" />
          הצג מוסתרים
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TOP_CATEGORIES.map((cat) => {
          const on = topFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setTopFilter(on ? 'all' : cat.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${on ? cat.chipOn : cat.chip}`}
            >
              {cat.id}
              <span className="opacity-70"> {chipCounts[cat.id]}</span>
            </button>
          );
        })}
      </div>

      {tabBar(false)}

      {visibleTasks.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
          <p className="text-slate-400 font-bold text-sm">אין משימות להצגה</p>
        </div>
      )}

      {view === 'today' && visibleTasks.length > 0 && (
        <div className="space-y-3">
          {todayView.focus.length > 0 && renderCards(todayView.focus)}
          {todayView.overdue.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button type="button" onClick={() => setOverdueOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-black text-rose-700">
                <span>באיחור · {todayView.overdue.length}</span>
                <ChevronDown size={16} className={overdueOpen ? 'rotate-180' : ''} />
              </button>
              {overdueOpen && <div className="px-2 pb-2">{renderCards(todayView.overdue)}</div>}
            </section>
          )}
          {todayView.weekRest.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button type="button" onClick={() => setWeekOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-black text-slate-600">
                <span>השבוע · {todayView.weekRest.length}</span>
                <ChevronDown size={16} className={weekOpen ? 'rotate-180' : ''} />
              </button>
              {weekOpen && <div className="px-2 pb-2">{renderCards(todayView.weekRest)}</div>}
            </section>
          )}
          {restSections.map((section) => {
            const open = !!openGroups[section.key];
            return (
              <section key={section.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-black text-slate-700"
                >
                  <span>
                    {section.label}
                    <span className="text-slate-400 font-bold"> {section.tasks.length}</span>
                  </span>
                  <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
                </button>
                {open && <div className="px-2 pb-2">{renderCards(section.tasks)}</div>}
              </section>
            );
          })}
        </div>
      )}

      {view === 'week' && visibleTasks.length > 0 && (
        <div className="space-y-4">
          {weekGroups.length === 0 && <p className="text-sm text-slate-400 font-bold text-center py-6">אין משימות עד סוף השבוע</p>}
          {weekGroups.map((group) => (
            <section key={group.key}>
              <h3 className="text-xs font-black text-slate-500 mb-1.5">{group.label}</h3>
              {renderCards(group.tasks)}
            </section>
          ))}
        </div>
      )}

      {view === 'all' && visibleTasks.length > 0 && (
        <div className="space-y-2">
          {allSections.map((section) => {
            const open = !!openGroups[section.key];
            return (
              <section key={section.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-black text-slate-700"
                >
                  <span>
                    {section.label}
                    <span className="text-slate-400 font-bold"> {section.tasks.length}</span>
                  </span>
                  <ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                {open && <div className="px-2 pb-2">{renderCards(section.tasks)}</div>}
              </section>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl border border-dashed border-sky-200 p-2 flex items-center gap-2">
        <input
          ref={quickInputRef}
          className="flex-1 bg-transparent outline-none text-sm font-bold px-2 py-1.5 placeholder:text-sky-400/80"
          placeholder="+ משימה חדשה — Enter"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleQuickAdd();
            }
          }}
        />
        {topFilter === 'all' && (
          <select
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-600 outline-none max-w-[9rem]"
            value={quickCategory}
            onChange={(e) => setQuickCategory(e.target.value as TaskCategory)}
          >
            {TASK_CATEGORIES.filter((c) => c !== 'ארכיון').map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={handleQuickAdd} disabled={!quickTitle.trim()} className="p-1.5 text-sky-600 disabled:opacity-30" title="הוסף">
          <Plus size={18} />
        </button>
      </div>

      {tabBar(true)}

      <button
        type="button"
        onClick={() => quickInputRef.current?.focus()}
        className="md:hidden fixed bottom-16 left-4 z-40 w-12 h-12 rounded-full bg-sky-600 text-white shadow-lg flex items-center justify-center"
        aria-label="משימה חדשה"
      >
        <Plus size={22} />
      </button>

      {cleanupOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800">לניקוי</h3>
              <button type="button" onClick={() => setCleanupOpen(false)} className="text-slate-400 hover:text-slate-800">
                <X size={20} />
              </button>
            </div>
            <p className="px-4 pt-2 text-[11px] text-slate-500 font-medium">איחור מעל שבועיים, כותרת «משימה», וכפילויות.</p>
            {cleanupSelected.length > 0 && (
              <div className="px-4 py-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => applyCleanup(cleanupSelected, 'done')} className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">בוצע</button>
                <button type="button" onClick={() => applyCleanup(cleanupSelected, 'next')} className="text-xs font-bold bg-sky-50 text-sky-700 px-2 py-1 rounded-lg">לשבוע הבא</button>
                <button type="button" onClick={() => applyCleanup(cleanupSelected, 'archive')} className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">לארכיון</button>
                <button type="button" onClick={() => applyCleanup(cleanupSelected, 'delete')} className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-1 rounded-lg">מחק</button>
              </div>
            )}
            <div className="overflow-y-auto px-3 pb-3 space-y-2">
              {junk.length === 0 && <p className="text-sm text-slate-400 font-bold text-center py-10">אין משימות לניקוי</p>}
              {junk.map(({ task, reasons }) => {
                const checked = cleanupSelected.includes(task.id);
                return (
                  <div key={task.id} className="border border-slate-200 rounded-xl p-2.5">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 accent-slate-700"
                        checked={checked}
                        onChange={() =>
                          setCleanupSelected((prev) => (checked ? prev.filter((id) => id !== task.id) : [...prev, task.id]))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{task.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {reasons.map((r) => (
                            <span key={r} className="text-[10px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded">
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 pr-6">
                      <button type="button" onClick={() => applyCleanup([task.id], 'done')} className="text-[11px] font-bold text-emerald-700 px-1.5 py-0.5">בוצע</button>
                      <button type="button" onClick={() => applyCleanup([task.id], 'next')} className="text-[11px] font-bold text-sky-700 px-1.5 py-0.5">לשבוע הבא</button>
                      <button type="button" onClick={() => applyCleanup([task.id], 'archive')} className="text-[11px] font-bold text-slate-600 px-1.5 py-0.5">לארכיון</button>
                      <button type="button" onClick={() => applyCleanup([task.id], 'delete')} className="text-[11px] font-bold text-rose-600 px-1.5 py-0.5">מחק</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800">פרטים נוספים</h3>
              <button type="button" onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-900">
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
                <div className="col-span-2">
                  <label className="text-xs font-black text-slate-500">תחום</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none font-bold text-sm"
                    value={editingTask.category}
                    onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value as TaskCategory })}
                  >
                    {categoryOptions(editingTask.category).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">תאריך</label>
                  <input
                    type="date"
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                    value={editingTask.dueDate || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">שעה</label>
                  <input
                    type="time"
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                    value={editingTask.dueTime || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, dueTime: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">זמן</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                    value={editingTask.estimatedTimeMin || 0}
                    onChange={(e) => setEditingTask({ ...editingTask, estimatedTimeMin: Number(e.target.value) || 0 })}
                  >
                    <option value={0}>ללא</option>
                    {TIME_PRESETS.map((p) => (
                      <option key={p.min} value={p.min}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">מי יעזור</label>
                  <input
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                    value={editingTask.helper || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, helper: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-black text-slate-500">הערות</label>
                  <textarea
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm min-h-[64px]"
                    value={editingTask.notes || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">עדיפות</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none font-bold text-sm"
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
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl outline-none font-bold text-sm"
                    value={editingTask.frequency || TaskFrequency.OneTime}
                    onChange={(e) => setEditingTask({ ...editingTask, frequency: e.target.value as TaskFrequency })}
                  >
                    {Object.values(TaskFrequency).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">הכנסה פוטנציאלית (₪)</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                    value={editingTask.potentialRevenue || 0}
                    onChange={(e) => setEditingTask({ ...editingTask, potentialRevenue: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">קלות ביצוע (1–5)</label>
                  <select
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
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
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
                    value={editingTask.waitingDays || 0}
                    onChange={(e) => setEditingTask({ ...editingTask, waitingDays: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500">תזכורת</label>
                  <input
                    type="datetime-local"
                    className="w-full mt-1 p-2.5 bg-slate-50 rounded-xl font-bold text-sm"
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
                            onClick={() =>
                              setEditingTask({
                                ...editingTask,
                                subTasks: (editingTask.subTasks || []).filter((_, i) => i !== idx),
                              })
                            }
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
              <button
                type="button"
                onClick={() => {
                  if (!confirm('למחוק את המשימה?')) return;
                  deleteTask(editingTask.id);
                  setEditingTask(null);
                }}
                className="w-full py-2 font-bold text-rose-500 hover:text-rose-700 flex items-center justify-center gap-1"
              >
                <Trash2 size={14} /> מחק
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
                      subTask: { ...editingSubTask.subTask, priority: Number(e.target.value) as TaskPriority },
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
