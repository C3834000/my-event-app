
import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Task, TaskCategory, TaskPriority, TaskFrequency } from '../types';
import { Star, Check, Trash2, Plus, Edit, X, Save, Clock, Tag, Upload, Search, Filter, Briefcase, User, Home, FlaskConical, TrendingUp, List, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { parseCSV } from '../services/utils';

const CATEGORIES: TaskCategory[] = ['קליכיף', 'אישי', 'בית', 'תוכנית מדע', 'שיווק', 'כללי', 'דחוף / לסיווג'];

const CATEGORY_ICONS: Record<string, any> = {
  'קליכיף': Briefcase,
  'אישי': User,
  'בית': Home,
  'תוכנית מדע': FlaskConical,
  'שיווק': TrendingUp,
  'כללי': List,
  'דחוף / לסיווג': AlertTriangle,
};

const CATEGORY_STYLES: Record<string, { badge: string; header: string; border: string }> = {
  'קליכיף': { 
    badge: 'bg-indigo-100 border-indigo-200 text-indigo-800',
    header: 'bg-gradient-to-r from-indigo-400 to-blue-400',
    border: 'border-indigo-200'
  },
  'אישי': { 
    badge: 'bg-amber-100 border-amber-200 text-amber-800',
    header: 'bg-gradient-to-r from-amber-400 to-orange-400',
    border: 'border-amber-200'
  },
  'בית': { 
    badge: 'bg-emerald-100 border-emerald-200 text-emerald-800',
    header: 'bg-gradient-to-r from-emerald-400 to-green-400',
    border: 'border-emerald-200'
  },
  'תוכנית מדע': { 
    badge: 'bg-sky-100 border-sky-200 text-sky-800',
    header: 'bg-gradient-to-r from-sky-400 to-cyan-400',
    border: 'border-sky-200'
  },
  'שיווק': { 
    badge: 'bg-violet-100 border-violet-200 text-violet-800',
    header: 'bg-gradient-to-r from-violet-400 to-purple-400',
    border: 'border-violet-200'
  },
  'כללי': { 
    badge: 'bg-slate-100 border-slate-200 text-slate-700',
    header: 'bg-gradient-to-r from-slate-400 to-slate-500',
    border: 'border-slate-200'
  },
  'דחוף / לסיווג': { 
    badge: 'bg-rose-100 border-rose-200 text-rose-800',
    header: 'bg-gradient-to-r from-rose-400 to-red-400',
    border: 'border-rose-200'
  },
};

const getCategoryStyles = (cat: string) => CATEGORY_STYLES[cat] || CATEGORY_STYLES['כללי'];

const TasksBoard: React.FC = () => {
  const { tasks, addTask, updateTask, toggleTask, deleteTask, updateTaskProgress, importTasks } = useApp();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showSubTasksForm, setShowSubTasksForm] = useState(false);
  const [editingSubTask, setEditingSubTask] = useState<{ parentTaskId: string; subTaskIndex: number; subTask: any } | null>(null);
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: '',
    category: 'כללי',
    priority: 3,
    estimatedTimeMin: 30,
    progress: 0,
    waitingDays: 0,
    potentialRevenue: 0,
    easeOfExecution: 3,
    requiredResources: '',
    frequency: TaskFrequency.OneTime
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeView, setActiveView] = useState<'board' | 'dashboard'>('board');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title?.trim()) return;
    addTask({ 
        id: Date.now().toString(), 
        title: newTask.title.trim(), 
        isCompleted: false, 
        priority: newTask.priority || 3, 
        category: newTask.category || 'כללי', 
        estimatedTimeMin: newTask.estimatedTimeMin || 30, 
        progress: 0,
        waitingDays: newTask.waitingDays || 0,
        potentialRevenue: newTask.potentialRevenue || 0,
        easeOfExecution: newTask.easeOfExecution || 3,
        requiredResources: newTask.requiredResources || '',
        frequency: newTask.frequency || TaskFrequency.OneTime,
        subTasks: []
    });
    setNewTask({
      title: '',
      category: 'כללי',
      priority: 3,
      estimatedTimeMin: 30,
      progress: 0,
      waitingDays: 0,
      potentialRevenue: 0,
      easeOfExecution: 3,
      requiredResources: '',
      frequency: TaskFrequency.OneTime
    });
    setIsFormOpen(false);
  };

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const [selectedTaskCategories, setSelectedTaskCategories] = useState<Set<string>>(new Set());

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
        const matchesStatus = filterStatus === 'all' || 
            (filterStatus === 'completed' ? task.isCompleted : !task.isCompleted);
        const matchesCategoryFilter = selectedTaskCategories.size === 0 || selectedTaskCategories.has(task.category);
        return matchesSearch && matchesCategory && matchesStatus && matchesCategoryFilter;
    }).sort((a, b) => {
        // משימות שהושלמו בסוף
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        // משימות שעבר תאריך היעד למעלה
        const aOverdue = a.dueDate && new Date(a.dueDate) < new Date() && !a.isCompleted;
        const bOverdue = b.dueDate && new Date(b.dueDate) < new Date() && !b.isCompleted;
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        // לפי עדיפות
        return b.priority - a.priority;
    });
  }, [tasks, searchTerm, filterCategory, filterStatus]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    filteredTasks.forEach(t => {
        const cat = t.category || 'כללי';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(t);
    });
    return groups;
  }, [filteredTasks]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({...prev, [cat]: !prev[cat]}));
  };

  const toggleAllCategories = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    Object.keys(groupedTasks).forEach(k => next[k] = collapse);
    setCollapsedCategories(next);
  };

  React.useEffect(() => {
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    
    const initialState: Record<string, boolean> = {};
    Object.entries(groupedTasks).forEach(([cat, taskList]) => {
      const hasUrgent = taskList.some((t: Task) => !t.isCompleted && t.priority === 5);
      const hasThisWeek = taskList.some((t: Task) => {
        if (t.isCompleted || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate <= weekEnd;
      });
      initialState[cat] = !(hasUrgent || hasThisWeek || cat === 'דחוף / לסיווג');
    });
    setCollapsedCategories(initialState);
  }, [groupedTasks]);

  const taskStats = useMemo(() => {
    const completed = filteredTasks.filter(t => t.isCompleted).length;
    const pending = filteredTasks.filter(t => !t.isCompleted && t.progress === 0).length;
    const inProgress = filteredTasks.filter(t => !t.isCompleted && t.progress > 0).length;
    return { completed, pending, inProgress };
  }, [filteredTasks]);

  const calculateTaskScore = (task: Task): number => {
    const today = new Date();
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    
    let score = 0;
    score += task.priority * 20;
    score += ((task.potentialRevenue || 0) / 1000) * 10;
    score += (task.easeOfExecution || 3) * 8;
    score += (60 - (task.estimatedTimeMin || 30)) / 10;
    if (daysUntilDue <= 3) score += 50;
    else if (daysUntilDue <= 7) score += 30;
    else if (daysUntilDue <= 14) score += 10;
    score += (task.waitingDays || 0) * 2;
    
    return score;
  };

  const smartSortedTasks = useMemo(() => {
    const openTasks = tasks.filter(t => !t.isCompleted);
    return openTasks.map(t => ({ task: t, score: calculateTaskScore(t) }))
      .sort((a, b) => b.score - a.score);
  }, [tasks]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 dir-rtl">
      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl shadow-lg p-2 flex gap-2 border border-slate-100">
        <button 
          onClick={() => setActiveView('board')}
          className={`flex-1 py-3 px-6 rounded-xl font-black text-sm transition-all ${activeView === 'board' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          📋 לוח משימות
        </button>
        <button 
          onClick={() => setActiveView('dashboard')}
          className={`flex-1 py-3 px-6 rounded-xl font-black text-sm transition-all ${activeView === 'dashboard' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          🎯 שולחן עבודה חכם
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-3xl font-bold text-slate-800">{activeView === 'board' ? 'משימות' : 'שולחן עבודה חכם'}</h2>
              <p className="text-slate-500">{activeView === 'board' ? 'ניהול סדר יום ומשימות שוטפות' : 'תכנון יום ותעדוף משימות אוטומטי'}</p>
            </div>
            <div className="flex gap-2">
              <div className="bg-green-100 border border-green-300 text-green-700 px-3 py-2 rounded-lg shadow-sm">
                <div className="text-xs font-bold">✓ הושלמו</div>
                <div className="text-xl font-black">{taskStats.completed}</div>
              </div>
              <div className="bg-blue-100 border border-blue-300 text-blue-700 px-3 py-2 rounded-lg shadow-sm">
                <div className="text-xs font-bold">⏳ בתהליך</div>
                <div className="text-xl font-black">{taskStats.inProgress}</div>
              </div>
              <div className="bg-slate-100 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg shadow-sm">
                <div className="text-xs font-bold">⏸️ בהמתנה</div>
                <div className="text-xl font-black">{taskStats.pending}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setIsFormOpen(true)} className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 hover:bg-purple-700 transition-all"><Plus size={20}/> משימה חדשה</button>
            <input type="file" ref={fileInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if(file) { importTasks(await parseCSV(file)); alert('ייבוא משימות הושלם!'); } }} className="hidden" accept=".csv" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm hover:bg-slate-50 transition-all"><Upload size={18} /> ייבוא</button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                  type="text" 
                  placeholder="חפש משימה..." 
                  className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-transparent rounded-xl outline-none focus:bg-white focus:border-purple-300 transition-all font-bold"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
              />
          </div>
          <div className="flex gap-2 shrink-0">
              <select 
                value={filterCategory} 
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-slate-50 border-none px-4 py-2 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-purple-100"
              >
                  <option value="all">כל הקטגוריות</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-slate-50 border-none px-4 py-2 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-purple-100"
              >
                  <option value="all">הכל</option>
                  <option value="open">פתוחות</option>
                  <option value="completed">בוצעו</option>
              </select>
          </div>
      </div>

      {/* Category Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-700">🏷️ סנן קטגוריות:</h3>
          <div className="flex gap-2">
            <button onClick={() => setSelectedTaskCategories(new Set(CATEGORIES))} className="text-xs font-bold text-blue-600 hover:underline">בחר הכל</button>
            <button onClick={() => setSelectedTaskCategories(new Set())} className="text-xs font-bold text-slate-500 hover:underline">נקה הכל</button>
            <button onClick={() => toggleAllCategories(false)} className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-all">פתח הכל</button>
            <button onClick={() => toggleAllCategories(true)} className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all">כווץ הכל</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setSelectedTaskCategories(prev => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat);
                  else next.add(cat);
                  return next;
                });
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                selectedTaskCategories.size === 0 || selectedTaskCategories.has(cat)
                  ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                  : 'bg-slate-100 text-slate-400 border-2 border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'dashboard' ? (
        /* Smart Dashboard View */
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-purple-500 to-blue-600 rounded-3xl p-8 text-white shadow-2xl">
            <h3 className="text-3xl font-black mb-2">🎯 תוכנית עבודה מומלצת להיום</h3>
            <p className="text-white/80 text-sm">המשימות מסודרות לפי: עדיפות, כסף פוטנציאלי, קלות ביצוע, זמן קצר, תאריך יעד וזמן המתנה</p>
          </div>

          {smartSortedTasks.slice(0, 10).map(({ task, score }, idx) => {
            const styles = getCategoryStyles(task.category);
            const Icon = CATEGORY_ICONS[task.category] || List;
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
            
            return (
              <div key={task.id} className={`bg-white rounded-2xl p-6 shadow-lg border-2 ${styles.border} hover:shadow-xl transition-all relative`}>
                <div className="absolute -top-3 -right-3 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-black text-lg shadow-xl">
                  {idx + 1}
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${styles.badge}`}>
                        <Icon size={20} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-lg text-slate-800">{task.title}</h4>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${styles.badge}`}>{task.category}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                        <div className="text-xs text-purple-600 font-bold mb-1">📊 ציון חכם</div>
                        <div className="text-lg font-black text-purple-700">{Math.round(score)}</div>
                      </div>
                      {task.priority === 5 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                          <div className="text-xs text-red-600 font-bold mb-1">🔥 עדיפות</div>
                          <div className="text-lg font-black text-red-700">גבוהה</div>
                        </div>
                      )}
                      {(task.potentialRevenue || 0) > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                          <div className="text-xs text-green-600 font-bold mb-1">💰 הכנסה</div>
                          <div className="text-lg font-black text-green-700">₪{task.potentialRevenue?.toLocaleString()}</div>
                        </div>
                      )}
                      {task.estimatedTimeMin > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <div className="text-xs text-blue-600 font-bold mb-1">⏱️ זמן</div>
                          <div className="text-lg font-black text-blue-700">{task.estimatedTimeMin} דק'</div>
                        </div>
                      )}
                      {(task.easeOfExecution || 0) > 0 && (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
                          <div className="text-xs text-teal-600 font-bold mb-1">😊 קלות</div>
                          <div className="text-lg font-black text-teal-700">{task.easeOfExecution}/5</div>
                        </div>
                      )}
                      {task.dueDate && (
                        <div className={`${isOverdue ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-3`}>
                          <div className={`text-xs ${isOverdue ? 'text-red-600' : 'text-amber-600'} font-bold mb-1`}>📅 יעד</div>
                          <div className={`text-sm font-black ${isOverdue ? 'text-red-700' : 'text-amber-700'}`}>{new Date(task.dueDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</div>
                        </div>
                      )}
                    </div>

                    {task.requiredResources && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
                        <div className="text-xs text-slate-600 font-bold mb-1">🔧 משאבים נדרשים:</div>
                        <div className="text-sm text-slate-700">{task.requiredResources}</div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingTask(task)} className="flex-1 bg-purple-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-md">ערוך משימה</button>
                      <button onClick={() => toggleTask(task.id)} className="bg-green-500 text-white py-3 px-4 rounded-xl font-bold hover:bg-green-600 transition-all shadow-md">
                        {task.isCompleted ? '↩️ בטל' : '✓ סיים'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Regular Board View */
        <div className="space-y-4">
        {filteredTasks.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 text-center space-y-4">
                <Filter className="mx-auto text-slate-300" size={48} />
                <p className="text-slate-400 font-bold">לא נמצאו משימות התואמות לסינון</p>
                <button onClick={() => { setSearchTerm(''); setFilterCategory('all'); setFilterStatus('all'); }} className="text-purple-600 font-black hover:underline">נקה הכל</button>
            </div>
        ) : Object.entries(groupedTasks).map(([category, taskList]) => {
          const isCollapsed = collapsedCategories[category];
          const styles = getCategoryStyles(category);
          const Icon = CATEGORY_ICONS[category] || List;
          const completedCount = taskList.filter(t => t.isCompleted).length;
          const urgentCount = taskList.filter(t => !t.isCompleted && t.priority === 5).length;
          
          return (
            <div key={category} className={`bg-white rounded-xl shadow-sm border-2 ${styles.border} overflow-hidden hover:shadow-md transition-all`}>
              <button 
                onClick={() => toggleCategory(category)}
                className={`w-full flex items-center justify-between py-3 px-5 ${styles.header} hover:opacity-90 transition-all shadow-sm`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/25 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/30 shadow-sm">
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-white">{category}</div>
                    <div className="text-xs text-white/85 font-bold flex items-center gap-2">
                      <span>{taskList.length} משימות</span>
                      {completedCount > 0 && <span>• ✓ {completedCount}</span>}
                      {urgentCount > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full">🔥 {urgentCount}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronDown size={22} className="text-white" /> : <ChevronUp size={22} className="text-white" />}
                </div>
              </button>
              {!isCollapsed && (
                <div className="p-4 space-y-3 bg-slate-50/30">
                  {taskList.filter(t => !t.isCompleted).length > 0 && (
                    <div className="text-xs font-black text-slate-400 px-2 mb-2">פתוחות ({taskList.filter(t => !t.isCompleted).length})</div>
                  )}
                  {taskList.filter(t => !t.isCompleted).map((task, idx) => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                    const styles = getCategoryStyles(category);
                    return (
                      <div key={task.id} className={`p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 group transition-all shadow-md hover:shadow-xl hover:scale-[1.01] border-2 ${isOverdue ? 'bg-red-50 border-red-400 hover:border-red-500' : `bg-white ${styles.border} hover:${styles.border}`}`}>
                        <div className="flex items-start md:items-center gap-4 flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600 shrink-0">
                              {idx + 1}
                            </div>
                            <button 
                              onClick={() => toggleTask(task.id)} 
                              className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 shadow-md hover:shadow-lg hover:scale-105 ${task.isCompleted ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-slate-300 hover:border-purple-500 hover:bg-purple-50'}`}
                            >
                              {task.isCompleted && <Check size={18} strokeWidth={4} />}
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-bold text-base transition-all mb-2 ${task.isCompleted ? 'line-through opacity-70 text-slate-500' : 'text-slate-900'}`}>{task.title}</h4>
                            <div className="flex flex-wrap gap-2 items-center">
                               {task.estimatedTimeMin > 0 && <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 border border-slate-200 shadow-sm"><Clock size={13}/> {task.estimatedTimeMin} דק׳</span>}
                               {task.priority === 5 && !task.isCompleted && <span className="text-xs font-black bg-red-500 text-white px-3 py-1.5 rounded-lg shadow-md animate-pulse">🔥 דחוף</span>}
                               {!task.isCompleted && task.progress > 0 && (
                                 <div className="flex items-center gap-2">
                                   <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                     <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${task.progress}%` }}></div>
                                   </div>
                                   <span className="text-xs font-bold text-purple-700">{task.progress}%</span>
                                 </div>
                               )}
                               {task.dueDate && <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border shadow-sm ${isOverdue ? 'bg-red-100 text-red-800 border-red-300' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>📅 {new Date(task.dueDate).toLocaleDateString('he-IL')}</span>}
                               {isOverdue && <span className="text-xs font-black bg-red-600 text-white px-3 py-1.5 rounded-lg shadow-md animate-pulse">⚠️ איחור!</span>}
                            </div>
                            {/* Sub-tasks Display */}
                            {(task.subTasks || []).length > 0 && (
                              <div className="mt-3 space-y-1.5 pr-6">
                                {task.subTasks?.map(st => (
                                  <div key={st.id} className="flex items-center gap-2 text-xs">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${st.isCompleted ? 'bg-green-400 border-green-500' : 'border-slate-300'}`}>
                                      {st.isCompleted && <Check size={10} className="text-white" strokeWidth={3} />}
                                    </div>
                                    <span className={`${st.isCompleted ? 'line-through text-slate-400' : 'text-slate-600'} font-medium`}>{st.title}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingTask(task)} className="p-2.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all border border-transparent hover:border-purple-200 shadow-sm"><Edit size={18}/></button>
                          <button onClick={() => deleteTask(task.id)} className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-200 shadow-sm"><Trash2 size={18}/></button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {taskList.filter(t => t.isCompleted).length > 0 && (
                    <>
                      <div className="pt-4 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t-2 border-slate-200"></div>
                          <span className="text-xs font-black text-slate-400 px-2">הושלמו ({taskList.filter(t => t.isCompleted).length})</span>
                          <div className="flex-1 border-t-2 border-slate-200"></div>
                        </div>
                      </div>
                      {taskList.filter(t => t.isCompleted).map((task, idx) => {
                        const styles = getCategoryStyles(category);
                        return (
                          <div key={task.id} className="p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 group transition-all shadow-sm hover:shadow-md border-2 bg-slate-50 border-slate-200 opacity-60">
                            <div className="flex items-start md:items-center gap-4 flex-1 min-w-0">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center text-xs font-black text-green-700 shrink-0">
                                  ✓
                                </div>
                                <button 
                                  onClick={() => toggleTask(task.id)} 
                                  className="w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 shadow-md hover:shadow-lg hover:scale-105 bg-green-500 border-green-600 text-white"
                                >
                                  <Check size={18} strokeWidth={4} />
                                </button>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-base transition-all mb-2 line-through text-slate-500">{task.title}</h4>
                                <div className="flex flex-wrap gap-2 items-center">
                                   {task.completedDate && <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-lg border border-green-200 shadow-sm">✓ הושלם: {new Date(task.completedDate).toLocaleDateString('he-IL')}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingTask(task)} className="p-2.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all border border-transparent hover:border-purple-200 shadow-sm"><Edit size={18}/></button>
                              <button onClick={() => deleteTask(task.id)} className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-200 shadow-sm"><Trash2 size={18}/></button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {/* Manual Add Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <form onSubmit={handleAddTask} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200 my-8">
                <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-slate-800">משימה חדשה</h3><button type="button" onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors"><X size={24}/></button></div>
                <div className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-500 mr-2">מה המשימה? *</label>
                        <input 
                            autoFocus 
                            required
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold" 
                            value={newTask.title || ''} 
                            onChange={e => setNewTask({...newTask, title: e.target.value})}
                            placeholder="לדוגמה: להכין ערכה לביתר עילית..."
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">קטגוריה</label>
                            <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.category} onChange={e => setNewTask({...newTask, category: e.target.value as TaskCategory})}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">עדיפות</label>
                            <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: Number(e.target.value) as TaskPriority})}>
                                <option value={1}>נמוכה</option>
                                <option value={3}>רגילה</option>
                                <option value={5}>גבוהה/דחוף</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">משך זמן משוער (דקות)</label>
                            <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.estimatedTimeMin} onChange={e => setNewTask({...newTask, estimatedTimeMin: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">כמה זה מחכה (ימים)</label>
                            <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.waitingDays} onChange={e => setNewTask({...newTask, waitingDays: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">כמה כסף זה יכול להכניס (₪)</label>
                            <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.potentialRevenue} onChange={e => setNewTask({...newTask, potentialRevenue: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">כמה קל לי לעשות את זה (1-5)</label>
                            <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.easeOfExecution} onChange={e => setNewTask({...newTask, easeOfExecution: Number(e.target.value)})}>
                                <option value={1}>1 - קשה מאוד</option>
                                <option value={2}>2 - קשה</option>
                                <option value={3}>3 - בינוני</option>
                                <option value={4}>4 - קל</option>
                                <option value={5}>5 - קל מאוד</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">תדירות</label>
                            <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.frequency} onChange={e => setNewTask({...newTask, frequency: e.target.value as TaskFrequency})}>
                                <option value={TaskFrequency.OneTime}>{TaskFrequency.OneTime}</option>
                                <option value={TaskFrequency.Daily}>{TaskFrequency.Daily}</option>
                                <option value={TaskFrequency.Weekly}>{TaskFrequency.Weekly}</option>
                                <option value={TaskFrequency.Monthly}>{TaskFrequency.Monthly}</option>
                                <option value={TaskFrequency.Periodic}>{TaskFrequency.Periodic}</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">תאריך יעד</label>
                            <input type="date" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={newTask.dueDate || ''} onChange={e => setNewTask({...newTask, dueDate: e.target.value})} />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">משאבים נדרשים</label>
                            <textarea className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" rows={3} value={newTask.requiredResources || ''} onChange={e => setNewTask({...newTask, requiredResources: e.target.value})} placeholder="למשל: מחשב, זמן צוות, תקציב פרסום..." />
                        </div>
                    </div>
                </div>
                <div className="flex justify-end pt-4"><button type="submit" className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-purple-700 transition-all">הוסף משימה</button></div>
            </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden p-8 space-y-6 animate-in zoom-in-95 duration-200 my-8">
                <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-slate-800">עריכת משימה</h3><button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-900 transition-colors"><X size={24}/></button></div>
                <div className="space-y-6 text-right">
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-500 mr-2">תיאור המשימה</label>
                        <input 
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold" 
                            value={editingTask.title} 
                            onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">קטגוריה</label>
                            <select 
                                className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" 
                                value={editingTask.category} 
                                onChange={e => setEditingTask({...editingTask, category: e.target.value as any})}
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">עדיפות</label>
                            <select 
                                className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" 
                                value={editingTask.priority} 
                                onChange={e => setEditingTask({...editingTask, priority: Number(e.target.value) as any})}
                            >
                                <option value={1}>נמוכה</option>
                                <option value={3}>רגילה</option>
                                <option value={5}>גבוהה/דחוף</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">משך זמן משוער (דקות)</label>
                            <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingTask.estimatedTimeMin} onChange={e => setEditingTask({...editingTask, estimatedTimeMin: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">כמה זה מחכה (ימים)</label>
                            <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingTask.waitingDays || 0} onChange={e => setEditingTask({...editingTask, waitingDays: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">כמה כסף זה יכול להכניס (₪)</label>
                            <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingTask.potentialRevenue || 0} onChange={e => setEditingTask({...editingTask, potentialRevenue: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">כמה קל לי לעשות את זה (1-5)</label>
                            <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingTask.easeOfExecution || 3} onChange={e => setEditingTask({...editingTask, easeOfExecution: Number(e.target.value)})}>
                                <option value={1}>1 - קשה מאוד</option>
                                <option value={2}>2 - קשה</option>
                                <option value={3}>3 - בינוני</option>
                                <option value={4}>4 - קל</option>
                                <option value={5}>5 - קל מאוד</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">תדירות</label>
                            <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingTask.frequency || TaskFrequency.OneTime} onChange={e => setEditingTask({...editingTask, frequency: e.target.value as TaskFrequency})}>
                                <option value={TaskFrequency.OneTime}>{TaskFrequency.OneTime}</option>
                                <option value={TaskFrequency.Daily}>{TaskFrequency.Daily}</option>
                                <option value={TaskFrequency.Weekly}>{TaskFrequency.Weekly}</option>
                                <option value={TaskFrequency.Monthly}>{TaskFrequency.Monthly}</option>
                                <option value={TaskFrequency.Periodic}>{TaskFrequency.Periodic}</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">תאריך יעד</label>
                            <input 
                                type="date"
                                className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" 
                                value={editingTask.dueDate || ''} 
                                onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">תזכורת</label>
                            <input 
                                type="datetime-local"
                                className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" 
                                value={editingTask.reminderDate || ''} 
                                onChange={e => setEditingTask({...editingTask, reminderDate: e.target.value})}
                            />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">משאבים נדרשים</label>
                            <textarea className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" rows={2} value={editingTask.requiredResources || ''} onChange={e => setEditingTask({...editingTask, requiredResources: e.target.value})} placeholder="למשל: מחשב, זמן צוות, תקציט פרסום..." />
                        </div>
                        <div className="col-span-2 space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">סטטוס ביצוע: {editingTask.progress}%</label>
                            <input type="range" min="0" max="100" step="25" className="w-full h-3 rounded-lg accent-purple-600" value={editingTask.progress} onChange={e => setEditingTask({...editingTask, progress: Number(e.target.value), isCompleted: Number(e.target.value) === 100})} />
                        </div>
                    </div>

                    {/* Sub-tasks Section */}
                    <div className="border-t-2 border-slate-100 pt-6 mt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-black text-slate-700">📝 תתי משימות</h4>
                            <button 
                                type="button"
                                onClick={() => setShowSubTasksForm(!showSubTasksForm)} 
                                className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg transition-all flex items-center gap-1"
                            >
                                <Plus size={14} />
                                הוסף תת-משימה
                            </button>
                        </div>
                        {(editingTask.subTasks || []).length > 0 && (
                            <div className="space-y-2 mb-4">
                                {editingTask.subTasks?.map((st, idx) => (
                                    <div key={st.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = [...(editingTask.subTasks || [])];
                                                        updated[idx] = {...st, isCompleted: !st.isCompleted, progress: !st.isCompleted ? 100 : 0};
                                                        setEditingTask({...editingTask, subTasks: updated});
                                                    }}
                                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${st.isCompleted ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-purple-400'}`}
                                                >
                                                    {st.isCompleted && <Check size={14} className="text-white" />}
                                                </button>
                                                <span className={`font-bold text-sm ${st.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>{st.title}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                {st.estimatedTimeMin > 0 && <span>⏱️ {st.estimatedTimeMin} דק'</span>}
                                                {(st.potentialRevenue || 0) > 0 && <span>💰 ₪{st.potentialRevenue?.toLocaleString()}</span>}
                                                {st.priority === 5 && <span className="text-red-600 font-bold">⚡ דחוף</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditingSubTask({ parentTaskId: editingTask.id, subTaskIndex: idx, subTask: {...st} })}
                                                className="text-purple-500 hover:bg-purple-50 p-2 rounded transition-all"
                                                title="ערוך תת-משימה"
                                            >
                                                <Edit size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = (editingTask.subTasks || []).filter((_, i) => i !== idx);
                                                    setEditingTask({...editingTask, subTasks: updated});
                                                }}
                                                className="text-red-500 hover:bg-red-50 p-2 rounded transition-all"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {showSubTasksForm && (
                            <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-4 space-y-3">
                                <input 
                                    type="text"
                                    placeholder="שם תת-משימה..."
                                    className="w-full p-3 bg-white border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-300 font-bold text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const title = e.currentTarget.value.trim();
                                            if (!title) return;
                                            const newSubTask = {
                                                id: `st_${Date.now()}`,
                                                title,
                                                isCompleted: false,
                                                priority: 3 as TaskPriority,
                                                estimatedTimeMin: 15,
                                                progress: 0
                                            };
                                            setEditingTask({...editingTask, subTasks: [...(editingTask.subTasks || []), newSubTask]});
                                            e.currentTarget.value = '';
                                        }
                                    }}
                                />
                                <p className="text-xs text-purple-700 font-bold">💡 הקש Enter להוספה מהירה</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col gap-3 pt-4">
                    <button type="button" onClick={() => { updateTask(editingTask.id, editingTask); setEditingTask(null); }} className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-purple-700 transition-all">שמור שינויים</button>
                    <button type="button" onClick={() => setEditingTask(null)} className="w-full py-2 font-bold text-slate-400 hover:text-slate-600">ביטול</button>
                </div>
            </div>
        </div>
      )}

      {/* Edit SubTask Modal */}
      {editingSubTask && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200 my-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800">✏️ עריכת תת-משימה</h3>
              <button type="button" onClick={() => setEditingSubTask(null)} className="text-slate-400 hover:text-slate-900 transition-colors"><X size={24}/></button>
            </div>
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-500 mr-2">תיאור התת-משימה</label>
                <input 
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold" 
                  value={editingSubTask.subTask.title} 
                  onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, title: e.target.value}})}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">עדיפות</label>
                  <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingSubTask.subTask.priority} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, priority: Number(e.target.value)}})}>
                    <option value={1}>נמוכה</option>
                    <option value={3}>רגילה</option>
                    <option value={5}>גבוהה/דחוף</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">משך זמן (דקות)</label>
                  <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingSubTask.subTask.estimatedTimeMin} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, estimatedTimeMin: Number(e.target.value)}})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">כמה זה מחכה (ימים)</label>
                  <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingSubTask.subTask.waitingDays || 0} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, waitingDays: Number(e.target.value)}})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">כמה כסף (₪)</label>
                  <input type="number" min="0" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingSubTask.subTask.potentialRevenue || 0} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, potentialRevenue: Number(e.target.value)}})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">קלות ביצוע (1-5)</label>
                  <select className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingSubTask.subTask.easeOfExecution || 3} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, easeOfExecution: Number(e.target.value)}})}>
                    <option value={1}>1 - קשה מאוד</option>
                    <option value={2}>2 - קשה</option>
                    <option value={3}>3 - בינוני</option>
                    <option value={4}>4 - קל</option>
                    <option value={5}>5 - קל מאוד</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">תאריך יעד</label>
                  <input type="date" className="w-full p-3 bg-slate-50 border-none rounded-xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" value={editingSubTask.subTask.dueDate || ''} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, dueDate: e.target.value}})} />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">משאבים נדרשים</label>
                  <textarea className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold text-sm" rows={2} value={editingSubTask.subTask.requiredResources || ''} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, requiredResources: e.target.value}})} placeholder="למשל: מחשב, זמן צוות..." />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-black text-slate-500 mr-2">סטטוס ביצוע: {editingSubTask.subTask.progress}%</label>
                  <input type="range" min="0" max="100" step="25" className="w-full h-3 rounded-lg accent-purple-600" value={editingSubTask.subTask.progress} onChange={e => setEditingSubTask({...editingSubTask, subTask: {...editingSubTask.subTask, progress: Number(e.target.value), isCompleted: Number(e.target.value) === 100}})} />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <button 
                type="button"
                onClick={() => {
                  const parentTask = tasks.find(t => t.id === editingSubTask.parentTaskId);
                  if (parentTask) {
                    const updatedSubTasks = [...(parentTask.subTasks || [])];
                    updatedSubTasks[editingSubTask.subTaskIndex] = editingSubTask.subTask;
                    updateTask(editingSubTask.parentTaskId, { subTasks: updatedSubTasks });
                    if (editingTask?.id === editingSubTask.parentTaskId) {
                      setEditingTask({...editingTask, subTasks: updatedSubTasks});
                    }
                  }
                  setEditingSubTask(null);
                }}
                className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-purple-700 transition-all"
              >
                שמור תת-משימה
              </button>
              <button type="button" onClick={() => setEditingSubTask(null)} className="w-full py-2 font-bold text-slate-400 hover:text-slate-600">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksBoard;
