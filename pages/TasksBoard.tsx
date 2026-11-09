import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useSearchParams } from 'react-router-dom';
import { eventForTask } from '../utils/eventTasks';
import { AppEvent, Task, TaskCategory, TaskPriority, TaskFrequency } from '../types';
import { Plus, X, Upload, Search, ChevronDown, ListTree, Tags, MousePointerClick, Lock, LockOpen } from 'lucide-react';
import { parseCSV } from '../services/utils';
import { buildTasksSeed } from '../data/tasksSeed';
import {
  ARCHIVE_SUB,
  CATEGORY_PALETTE,
  FALLBACK_SUB,
  TopCategoryId,
  TopCategoryMeta,
  getTaskCategories,
  getTopCategories,
  getTopCategory,
  isHiddenTop,
  topCategoryMeta,
  useCategoryConfig,
} from '../data/taskCategories';
import CategoryManager from '../components/CategoryManager';
import TaskRow from '../components/TaskRow';
import TaskDetailsPanel from '../components/TaskDetailsPanel';
import MyDayDrawer from '../components/MyDayDrawer';
import { MAX_FOCUS_PER_CATEGORY, canAddFocus, isFocusToday } from '../utils/focus';

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

const compareRest = (a: Task, b: Task, todayKey: string) => {
  if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
  const aOver = !a.isCompleted && !!a.dueDate && a.dueDate < todayKey;
  const bOver = !b.isCompleted && !!b.dueDate && b.dueDate < todayKey;
  if (aOver !== bOver) return aOver ? -1 : 1;
  const ad = a.dueDate || '9999-99-99';
  const bd = b.dueDate || '9999-99-99';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (b.priority || 0) - (a.priority || 0);
};

const taskBlob = (task: Task) =>
  [task.title, task.category, task.notes, task.helper, ...(task.subTasks || []).map((s) => s.title)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const COL_KEY = 'tasks-column-open';
const REST_PAGE = 10;

const readOpenCols = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(COL_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const isHiddenTask = (task: Task) => {
  if (task.isCompleted) return true;
  return isHiddenTop(getTopCategory(task.category));
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

/**
 * נעילת הארכיון. נשמר רק גיבוב SHA-256 של הסיסמה, לא הסיסמה עצמה.
 * זו נעילה בממשק בלבד: המשימות עצמן נטענות לדפדפן כמו כל השאר.
 */
const ARCHIVE_PASSWORD_SHA256 = '1acc92d4092f6b0fcdb8dc6789d0d413630fcfb766045acca0386264b1698837';
const ARCHIVE_UNLOCK_KEY = 'tasks-archive-unlocked';

const sha256Hex = async (text: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
};

const readArchiveUnlocked = () => {
  try {
    return sessionStorage.getItem(ARCHIVE_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
};

const ARCHIVE_META: TopCategoryMeta = (() => {
  const { label: _colorName, ...classes } = CATEGORY_PALETTE.slate;
  return { ...classes, id: '__archive__', label: 'ארכיון', color: 'slate', hidden: true, defaultSub: ARCHIVE_SUB };
})();

const CategoryGroup: React.FC<{
  meta: TopCategoryMeta;
  focus: Task[];
  rest: Task[];
  openCount: number;
  expanded: boolean;
  showAllRest: boolean;
  todayKey: string;
  selectedId: string | null;
  eventTitleByTask?: Map<string, string>;
  onToggleGroup: () => void;
  onShowMore: () => void;
  onToggleTask: (id: string) => void;
  onSelectTask: (task: Task) => void;
  onPin: (task: Task) => void;
  onAdd?: (title: string) => void;
  archive?: boolean;
}> = ({ meta, focus, rest, openCount, expanded, showAllRest, todayKey, selectedId, eventTitleByTask, onToggleGroup, onShowMore, onToggleTask, onSelectTask, onPin, onAdd, archive }) => {
  const [newTitle, setNewTitle] = useState('');
  const submitNew = () => {
    const title = newTitle.trim();
    if (!title || !onAdd) return;
    onAdd(title);
    setNewTitle('');
  };
  const shownRest = showAllRest ? rest : rest.slice(0, REST_PAGE);
  const more = rest.length - shownRest.length;
  const slots = Math.max(0, MAX_FOCUS_PER_CATEGORY - focus.length);
  const row = (task: Task, pinned: boolean) => (
    <TaskRow
      key={task.id}
      task={task}
      meta={meta}
      todayKey={todayKey}
      pinned={pinned}
      selected={selectedId === task.id}
      onSelect={() => onSelectTask(task)}
      onToggle={() => onToggleTask(task.id)}
      onPin={archive ? undefined : () => onPin(task)}
      eventTitle={eventTitleByTask?.get(task.id)}
    />
  );
  return (
    <section className={`shrink-0 rounded-2xl border overflow-hidden ${meta.column}`}>
      <button
        type="button"
        onClick={onToggleGroup}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-white font-extrabold ${meta.header}`}
        aria-expanded={expanded}
      >
        <span className="truncate">{meta.label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {!archive && <span className="text-[11px] font-bold opacity-90">⭐ {focus.length}/{MAX_FOCUS_PER_CATEGORY}</span>}
          <span className="bg-white/25 rounded-full px-2 py-0.5 text-xs font-bold">{openCount}</span>
          <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {onAdd && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-white/70 border-b border-dashed border-slate-200">
          <input
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-bold px-1.5 py-1 placeholder:text-slate-400"
            placeholder={`+ משימה חדשה ב${meta.label} — Enter`}
            aria-label={`משימה חדשה ב${meta.label}`}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitNew();
              }
            }}
          />
          <button type="button" onClick={submitNew} disabled={!newTitle.trim()} className="p-1 text-sky-600 disabled:opacity-30" aria-label="הוסף">
            <Plus size={16} />
          </button>
        </div>
      )}
      {archive ? (
        <p className={`px-3 py-1.5 text-[11px] font-bold text-slate-600 border-b border-dashed ${meta.focusSection}`}>
          כדי להחזיר משימה ללוח, פתח אותה ושנה את התחום.
        </p>
      ) : (
        <div className={`px-2 py-2 space-y-1 ${meta.focusSection} border-b border-dashed`}>
          {focus.map((task) => row(task, true))}
          {slots > 0 && (
            <p className="px-1 text-[11px] font-bold text-slate-500">
              ＋ עוד {slots} {slots === 1 ? 'מקום' : 'מקומות'} בפוקוס. לחץ ★ על משימה
            </p>
          )}
        </div>
      )}
      {expanded && (
        <div className="px-2 py-2 space-y-1">
          {shownRest.length === 0 && <p className="px-1 text-[11px] font-bold text-slate-400">אין משימות נוספות בתצוגה הזו</p>}
          {shownRest.map((task) => row(task, false))}
          {more > 0 && (
            <button type="button" onClick={onShowMore} className="w-full text-xs font-bold text-slate-500 py-1">
              הצג עוד {more}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

type BoardView = 'today' | 'week' | 'all';

const DESKTOP_QUERY = '(min-width: 768px)';

/** פאנל הפרטים מוצג פעם אחת בלבד: בצד בדסקטופ, או במסך מלא בטלפון. */
const useIsDesktop = () => {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
};

const TasksBoard: React.FC = () => {
  const { tasks, events, updateEvent, addTask, updateTask, toggleTask, deleteTask, importTasks, importTaskObjects } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** משימות שנוספו עכשיו נשארות גלויות גם כשהתצוגה («היום»/«השבוע») הייתה מסננת אותן */
  const [justAdded, setJustAdded] = useState<Set<string>>(() => new Set());
  const [archiveUnlocked, setArchiveUnlocked] = useState(readArchiveUnlocked);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const isDesktop = useIsDesktop();

  // כניסה מאירוע: /tasks?taskId=... פותח את המשימה
  const deepLinkTaskId = searchParams.get('taskId');
  useEffect(() => {
    if (!deepLinkTaskId || !tasks.some((t) => t.id === deepLinkTaskId)) return;
    setSelectedId(deepLinkTaskId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('taskId');
      return next;
    }, { replace: true });
  }, [deepLinkTaskId, tasks, setSearchParams]);

  /** אירוע לכל משימה מקושרת (כולל קישור ישן דרך event.taskId) */
  const eventTitleByTask = useMemo(() => {
    const m = new Map<string, string>();
    const byId = new Map<string, AppEvent>(events.map((e) => [e.id, e]));
    for (const e of events) if (e.taskId) m.set(e.taskId, e.title);
    for (const t of tasks) if (t.eventId && byId.has(t.eventId)) m.set(t.id, byId.get(t.eventId)!.title);
    return m;
  }, [events, tasks]);
  const [searchTerm, setSearchTerm] = useState('');
  const [topFilter, setTopFilter] = useState<TopCategoryId | 'all'>('all');
  const [view, setView] = useState<BoardView>('today');
  const [openCols, setOpenCols] = useState<Record<string, boolean>>(readOpenCols);
  const [restExpanded, setRestExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupSelected, setCleanupSelected] = useState<string[]>([]);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCategory, setQuickCategory] = useState<TaskCategory>('כללי');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const catConfig = useCategoryConfig();
  const topCategories = useMemo(() => getTopCategories(), [catConfig]);
  const [showHidden, setShowHidden] = useState(false);
  /** בבחירת קטגוריה מוצגות רק קטגוריות פעילות; מוסתרות — רק כש«הצג מוסתרים» מסומן */
  const taskCategories = useMemo(() => getTaskCategories({ includeHidden: showHidden }), [catConfig, showHidden]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const todayKey = toDateKey(startOfDay(new Date()));
  const weekEndKey = toDateKey(addDays(startOfWeekSunday(new Date()), 6));

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (topFilter === 'all') return;
    const meta = topCategories.find((c) => c.id === topFilter);
    if (!meta || (!showHidden && meta.hidden)) setTopFilter('all');
  }, [showHidden, topFilter, topCategories]);

  useEffect(() => {
    if (!taskCategories.includes(quickCategory)) setQuickCategory(taskCategories.includes('כללי') ? 'כללי' : FALLBACK_SUB);
  }, [taskCategories, quickCategory]);

  const visibleTops = useMemo(() => topCategories.filter((c) => showHidden || !c.hidden), [topCategories, showHidden]);

  const boardCategories = useMemo(
    () => visibleTops.filter((c) => topFilter === 'all' || c.id === topFilter),
    [visibleTops, topFilter],
  );

  const columns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return boardCategories.map((meta) => {
      const inCategory = tasks.filter((t) => getTopCategory(t.category) === meta.id);
      const focus = inCategory.filter((t) => isFocusToday(t, todayKey));
      const focusIds = new Set(focus.map((t) => t.id));
      const rest = inCategory
        .filter((t) => {
          if (focusIds.has(t.id)) return false;
          if (!showHidden && isHiddenTask(t)) return false;
          if (q && !taskBlob(t).includes(q)) return false;
          if (justAdded.has(t.id)) return true;
          if (view === 'today') return (t.priority || 0) >= TaskPriority.High;
          if (view === 'week') {
            const dueThisWeek = !!(t.dueDate && t.dueDate >= todayKey && t.dueDate <= weekEndKey);
            return dueThisWeek || (t.priority || 0) >= TaskPriority.Medium;
          }
          return true;
        })
        .sort((a, b) => compareRest(a, b, todayKey));
      const openCount = inCategory.filter((t) => {
        if (t.isCompleted) return false;
        if (!showHidden && isHiddenTask(t)) return false;
        if (q && !taskBlob(t).includes(q)) return false;
        return true;
      }).length;
      return { meta, focus, rest, openCount };
    });
  }, [tasks, boardCategories, searchTerm, showHidden, view, todayKey, weekEndKey, justAdded]);

  const focusStats = useMemo(() => {
    const all = tasks.filter((t) => isFocusToday(t, todayKey));
    const pills = topCategories.map((meta) => {
      const list = all.filter((t) => getTopCategory(t.category) === meta.id);
      return { meta, done: list.filter((t) => t.isCompleted).length, total: list.length };
    }).filter((p) => p.total > 0);
    return {
      done: all.filter((t) => t.isCompleted).length,
      total: all.length,
      pills,
    };
  }, [tasks, todayKey, topCategories]);

  const chipCounts = useMemo(() => {
    const base = tasks.filter((t) => showHidden || !t.isCompleted);
    const map: Record<TopCategoryId, number> = Object.fromEntries(topCategories.map((c) => [c.id, 0]));
    for (const t of base) {
      const top = getTopCategory(t.category);
      if (top !== 'hidden' && top in map) map[top] += 1;
    }
    return map;
  }, [tasks, showHidden, topCategories]);

  const junk = useMemo(() => cleanupRows(tasks), [tasks]);

  const archiveTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tasks
      .filter((t) => t.category === ARCHIVE_SUB && (!q || taskBlob(t).includes(q)))
      .sort((a, b) => compareRest(a, b, todayKey));
  }, [tasks, searchTerm, todayKey]);
  const archiveCount = useMemo(() => tasks.filter((t) => t.category === ARCHIVE_SUB).length, [tasks]);

  const onArchiveChip = () => {
    if (archiveUnlocked) {
      setArchiveOpen((v) => !v);
      return;
    }
    setPasswordValue('');
    setPasswordError(false);
    setPasswordOpen(true);
  };

  const submitPassword = async () => {
    const ok = (await sha256Hex(passwordValue.trim())) === ARCHIVE_PASSWORD_SHA256;
    if (!ok) {
      setPasswordError(true);
      return;
    }
    try {
      sessionStorage.setItem(ARCHIVE_UNLOCK_KEY, '1');
    } catch {
      // sessionStorage לא זמין — פתוח רק עד רענון
    }
    setArchiveUnlocked(true);
    setArchiveOpen(true);
    setPasswordOpen(false);
    setPasswordValue('');
  };

  const lockArchive = () => {
    try {
      sessionStorage.removeItem(ARCHIVE_UNLOCK_KEY);
    } catch {
      // ignore
    }
    if (selectedId && tasks.find((t) => t.id === selectedId)?.category === ARCHIVE_SUB) setSelectedId(null);
    setArchiveUnlocked(false);
    setArchiveOpen(false);
  };

  const categoryOptions = (current: TaskCategory): TaskCategory[] =>
    taskCategories.includes(current) ? taskCategories : [current, ...taskCategories];

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

  const createTask = (title: string, category: TaskCategory) => {
    const id = Date.now().toString();
    setJustAdded((prev) => new Set(prev).add(id));
    addTask({
      id,
      title,
      isCompleted: false,
      priority: category === 'דחוף' || category === 'דחוף / לסיווג' ? TaskPriority.High : TaskPriority.Medium,
      category,
      estimatedTimeMin: 30,
      progress: 0,
      frequency: TaskFrequency.OneTime,
      subTasks: [],
    });
  };

  const handleQuickAdd = () => {
    const title = quickTitle.trim();
    if (!title) return;
    createTask(title, topFilter === 'all' ? quickCategory : topCategoryMeta(topFilter).defaultSub);
    setQuickTitle('');
    quickInputRef.current?.focus();
  };

  const pinToday = (task: Task) => {
    if (isFocusToday(task, todayKey)) {
      updateTask(task.id, { focusDate: null });
      return;
    }
    const top = getTopCategory(task.category);
    if (top !== 'hidden' && !canAddFocus(tasks, top, todayKey)) {
      setToast('יש כבר 3 משימות פוקוס בקטגוריה הזו');
      return;
    }
    updateTask(task.id, { focusDate: todayKey });
  };

  const toggleColumn = (id: string) => {
    setOpenCols((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      localStorage.setItem(COL_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openTask = (task: Task) => setSelectedId(task.id);
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;
  const selectedTop = selectedTask ? getTopCategory(selectedTask.category) : 'hidden';
  const selectedMeta = selectedTop === 'hidden' ? null : topCategoryMeta(selectedTop);
  const selectedEvent = selectedTask ? eventForTask(events, selectedTask) : undefined;

  const deleteSelected = () => {
    if (!selectedTask || !confirm('למחוק את המשימה?')) return;
    deleteTask(selectedTask.id);
    setSelectedId(null);
  };

  const detailsPanel = (onBack?: () => void) =>
    selectedTask && (
      <TaskDetailsPanel
        task={selectedTask}
        meta={selectedMeta}
        categoryOptions={categoryOptions(selectedTask.category)}
        pinned={isFocusToday(selectedTask, todayKey)}
        onUpdate={(patch) => updateTask(selectedTask.id, patch)}
        onToggle={() => toggleTask(selectedTask.id)}
        onPin={() => pinToday(selectedTask)}
        onDelete={deleteSelected}
        onBack={onBack}
        event={selectedEvent}
        onUnlinkEvent={() => {
          if (!selectedEvent) return;
          updateTask(selectedTask.id, { eventId: null });
          if (selectedEvent.taskId === selectedTask.id) updateEvent(selectedEvent.id, { taskId: undefined });
        }}
      />
    );

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

  const now = new Date();
  const overdueCount = tasks.filter((t) => !t.isCompleted && t.dueDate && t.dueDate < todayKey).length;
  const headerLine = `${DAY_NAMES[now.getDay()]} ${formatShortDate(now)} · ${overdueCount} באיחור`;
  const single = topFilter !== 'all';
  const focusPct = focusStats.total ? Math.round((focusStats.done / focusStats.total) * 100) : 0;

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
    <div className="w-full space-y-3 dir-rtl pb-36">
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
          <button type="button" onClick={() => setCategoriesOpen(true)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="ניהול קטגוריות">
            <Tags size={16} />
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

      <div className="flex gap-1.5 overflow-x-auto flex-nowrap pb-1">
        {visibleTops.map((cat) => {
          const on = topFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setTopFilter(on ? 'all' : cat.id)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${on ? cat.chipOn : cat.chip}`}
            >
              {cat.label}
              <span className="opacity-70"> {chipCounts[cat.id] ?? 0}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onArchiveChip}
          className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border transition-all flex items-center gap-1 ${
            archiveUnlocked && archiveOpen ? ARCHIVE_META.chipOn : ARCHIVE_META.chip
          }`}
          title={archiveUnlocked ? 'הצג / הסתר ארכיון' : 'ארכיון (נדרשת סיסמה)'}
        >
          {archiveUnlocked ? <LockOpen size={12} /> : <Lock size={12} />}
          ארכיון
          {archiveUnlocked && <span className="opacity-70"> {archiveCount}</span>}
        </button>
      </div>

      {tabBar(false)}

      <div className="bg-white rounded-2xl border border-slate-200 px-3 py-2 space-y-2">
        <p className="text-sm font-black text-slate-800">⭐ הפוקוס של היום: {focusStats.done} מתוך {focusStats.total} בוצעו</p>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-emerald-500" style={{ width: `${focusPct}%` }} />
        </div>
        {focusStats.pills.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {focusStats.pills.map((p) => (
              <span
                key={p.meta.id}
                className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${p.total > 0 && p.done === p.total ? p.meta.pillDone : p.meta.pill}`}
              >
                {p.meta.label} {p.done}/{p.total}
              </span>
            ))}
          </div>
        )}
      </div>

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
            {taskCategories.map((c) => (
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

      <div className="md:grid md:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] md:gap-3 md:items-start md:pl-9 min-w-0">
        <div className="flex flex-col gap-3 min-w-0 md:max-h-[calc(100vh-200px)] md:min-h-[540px] md:overflow-y-auto md:pl-1">
          {archiveUnlocked && archiveOpen && (
            <div className="shrink-0 space-y-1">
              <div className="flex justify-end">
                <button type="button" onClick={lockArchive} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1">
                  <Lock size={12} /> נעל ארכיון
                </button>
              </div>
              <CategoryGroup
                archive
                meta={ARCHIVE_META}
                focus={[]}
                rest={archiveTasks}
                openCount={archiveTasks.length}
                expanded={openCols[ARCHIVE_META.id] !== false}
                showAllRest={!!restExpanded[ARCHIVE_META.id]}
                todayKey={todayKey}
                selectedId={selectedId}
                eventTitleByTask={eventTitleByTask}
                onToggleGroup={() => toggleColumn(ARCHIVE_META.id)}
                onShowMore={() => setRestExpanded((prev) => ({ ...prev, [ARCHIVE_META.id]: true }))}
                onToggleTask={(id) => toggleTask(id)}
                onSelectTask={openTask}
                onPin={pinToday}
              />
            </div>
          )}
          {columns.map((col) => (
            <CategoryGroup
              key={col.meta.id}
              meta={col.meta}
              focus={col.focus}
              rest={col.rest}
              openCount={col.openCount}
              expanded={openCols[col.meta.id] !== false}
              showAllRest={single || !!restExpanded[col.meta.id]}
              todayKey={todayKey}
              selectedId={selectedId}
              eventTitleByTask={eventTitleByTask}
              onToggleGroup={() => toggleColumn(col.meta.id)}
              onShowMore={() => setRestExpanded((prev) => ({ ...prev, [col.meta.id]: true }))}
              onToggleTask={(id) => toggleTask(id)}
              onSelectTask={openTask}
              onPin={pinToday}
              onAdd={(title) => createTask(title, col.meta.defaultSub)}
            />
          ))}
        </div>
        <aside className="hidden md:block sticky top-2 h-[calc(100vh-200px)] min-h-[540px] min-w-0">
          {!isDesktop ? null : selectedTask ? (
            detailsPanel()
          ) : (
            <div className="h-full rounded-2xl border border-dashed border-slate-300 bg-white/60 flex flex-col items-center justify-center gap-2 text-slate-400">
              <MousePointerClick size={28} />
              <p className="text-sm font-bold">בחר משימה מהרשימה כדי לראות את כל הפרטים</p>
            </div>
          )}
        </aside>
      </div>

      {selectedTask && !isDesktop && <div className="md:hidden fixed inset-0 z-[95] bg-slate-100 p-2">{detailsPanel(() => setSelectedId(null))}</div>}

      {tabBar(true)}

      <button
        type="button"
        onClick={() => quickInputRef.current?.focus()}
        className="md:hidden fixed bottom-36 left-3 z-40 w-12 h-12 rounded-full bg-sky-600 text-white shadow-lg flex items-center justify-center"
        aria-label="משימה חדשה"
      >
        <Plus size={22} />
      </button>

      {passwordOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" dir="rtl">
          <form
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPassword();
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-800 flex items-center gap-1.5">
                <Lock size={16} /> כניסה לארכיון
              </h3>
              <button type="button" onClick={() => setPasswordOpen(false)} className="text-slate-400 hover:text-slate-800" aria-label="סגור">
                <X size={18} />
              </button>
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              placeholder="סיסמה"
              aria-label="סיסמה"
              className={`w-full p-2.5 bg-slate-50 border rounded-xl outline-none font-bold text-center tracking-widest ${
                passwordError ? 'border-rose-400' : 'border-slate-200 focus:border-sky-300'
              }`}
              value={passwordValue}
              onChange={(e) => {
                setPasswordValue(e.target.value);
                setPasswordError(false);
              }}
            />
            {passwordError && <p className="text-xs font-bold text-rose-600">סיסמה שגויה</p>}
            <button type="submit" disabled={!passwordValue.trim()} className="w-full bg-slate-800 text-white py-2.5 rounded-xl font-black disabled:opacity-40">
              כניסה
            </button>
          </form>
        </div>
      )}

      {categoriesOpen && (
        <CategoryManager tasks={tasks} updateTask={updateTask} onClose={() => setCategoriesOpen(false)} />
      )}

      <MyDayDrawer tasks={tasks} todayKey={todayKey} onToggle={toggleTask} onOpen={openTask} onPinToday={pinToday} />

      {toast && (
        <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

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

    </div>
  );
};

export default TasksBoard;
