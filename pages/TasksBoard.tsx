
import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Task, TaskCategory, TaskPriority } from '../types';
import { Star, Check, Trash2, Plus, Edit, X, Save, Clock, Tag, Upload, Search, Filter, Briefcase, User, Home, FlaskConical, TrendingUp, List, AlertTriangle } from 'lucide-react';
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
    header: 'bg-gradient-to-r from-indigo-500 to-blue-600',
    border: 'border-indigo-200'
  },
  'אישי': { 
    badge: 'bg-amber-100 border-amber-200 text-amber-800',
    header: 'bg-gradient-to-r from-amber-500 to-orange-500',
    border: 'border-amber-200'
  },
  'בית': { 
    badge: 'bg-emerald-100 border-emerald-200 text-emerald-800',
    header: 'bg-gradient-to-r from-emerald-500 to-green-600',
    border: 'border-emerald-200'
  },
  'תוכנית מדע': { 
    badge: 'bg-sky-100 border-sky-200 text-sky-800',
    header: 'bg-gradient-to-r from-sky-500 to-cyan-500',
    border: 'border-sky-200'
  },
  'שיווק': { 
    badge: 'bg-violet-100 border-violet-200 text-violet-800',
    header: 'bg-gradient-to-r from-violet-500 to-purple-600',
    border: 'border-violet-200'
  },
  'כללי': { 
    badge: 'bg-slate-100 border-slate-200 text-slate-700',
    header: 'bg-gradient-to-r from-slate-500 to-slate-600',
    border: 'border-slate-200'
  },
  'דחוף / לסיווג': { 
    badge: 'bg-rose-100 border-rose-200 text-rose-800',
    header: 'bg-gradient-to-r from-rose-500 to-red-600',
    border: 'border-rose-200'
  },
};

const getCategoryStyles = (cat: string) => CATEGORY_STYLES[cat] || CATEGORY_STYLES['כללי'];

const TasksBoard: React.FC = () => {
  const { tasks, addTask, updateTask, toggleTask, deleteTask, updateTaskProgress, importTasks } = useApp();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    addTask({ 
        id: Date.now().toString(), 
        title: newTaskTitle, 
        isCompleted: false, 
        priority: 3, 
        category: 'כללי', 
        estimatedTimeMin: 15, 
        progress: 0 
    });
    setNewTaskTitle('');
    setIsFormOpen(false);
  };

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || task.category === filterCategory;
        const matchesStatus = filterStatus === 'all' || 
            (filterStatus === 'completed' ? task.isCompleted : !task.isCompleted);
        return matchesSearch && matchesCategory && matchesStatus;
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 dir-rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-3xl font-bold text-slate-800">משימות</h2><p className="text-slate-500">ניהול סדר יום ומשימות שוטפות</p></div>
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
            <div key={category} className={`bg-white rounded-2xl shadow-lg border-2 ${styles.border} overflow-hidden hover:shadow-xl transition-all`}>
              <button 
                onClick={() => toggleCategory(category)}
                className={`w-full flex items-center justify-between p-6 ${styles.header} hover:opacity-90 transition-all shadow-md`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30 shadow-lg">
                    <Icon size={24} className="text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-white">{category}</div>
                    <div className="text-xs text-white/80 font-bold flex items-center gap-2">
                      <span>{taskList.length} משימות</span>
                      {completedCount > 0 && <span>• ✓ {completedCount}</span>}
                      {urgentCount > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full">🔥 {urgentCount}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCollapsed ? <Plus size={24} className="text-white" /> : <X size={24} className="text-white" />}
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

      {/* Manual Add Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <form onSubmit={handleAddTask} className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-8 space-y-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center"><h3 className="text-xl font-black text-slate-800">משימה חדשה</h3><button type="button" onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors"><X size={24}/></button></div>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-500 mr-2">מה המשימה?</label>
                        <input 
                            autoFocus 
                            required
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold" 
                            value={newTaskTitle} 
                            onChange={e => setNewTaskTitle(e.target.value)}
                            placeholder="לדוגמה: להכין ערכה לביתר עילית..."
                        />
                    </div>
                </div>
                <div className="flex justify-end pt-4"><button type="submit" className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-purple-700 transition-all">הוסף משימה</button></div>
            </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden p-8 space-y-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center"><h3 className="text-xl font-black text-slate-800">עריכת משימה</h3><button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-900 transition-colors"><X size={24}/></button></div>
                <div className="space-y-4 text-right">
                    <div className="space-y-1">
                        <label className="text-xs font-black text-slate-500 mr-2">תיאור</label>
                        <input 
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-purple-200 font-bold" 
                            value={editingTask.title} 
                            onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
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
                        <div className="col-span-2 space-y-1">
                            <label className="text-xs font-black text-slate-500 mr-2">סטטוס ביצוע: {editingTask.progress}%</label>
                            <input type="range" min="0" max="100" step="25" className="w-full h-3 rounded-lg accent-purple-600" value={editingTask.progress} onChange={e => setEditingTask({...editingTask, progress: Number(e.target.value), isCompleted: Number(e.target.value) === 100})} />
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-3 pt-4">
                    <button onClick={() => { updateTask(editingTask.id, editingTask); setEditingTask(null); }} className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-purple-700 transition-all">שמור שינויים</button>
                    <button onClick={() => setEditingTask(null)} className="w-full py-2 font-bold text-slate-400 hover:text-slate-600">ביטול</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TasksBoard;
