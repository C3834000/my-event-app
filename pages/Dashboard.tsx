
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { settingsService } from '../services/supabase';
import { 
  AlertCircle, Briefcase, Calendar as CalendarIcon, 
  CheckCircle2, Check, Zap, Clock, MapPin, Users, Mail, RefreshCw, ArrowLeft, ArrowRight, TrendingUp,
  Target, PhoneCall, MessageSquare, Facebook, Instagram, Bell, StickyNote, Download, Upload
} from 'lucide-react';
import { EventType, AppEvent } from '../types';
import { Link } from 'react-router-dom';
import { downloadBackupFile, restoreFromAutoBackup } from '../services/autoBackup';
import { numMoney, eventContributesToOpenDebt, todayDateKey } from '../services/eventKpi';

const HOLIDAYS: Record<string, string> = {
  "14-03": "פורים",
  "15-03": "שושן פורים",
  "12-04": "ערב פסח",
  "13-04": "פסח א'",
  "19-04": "שביעי",
  "22-05": "ל״ג בעומר",
  "02-06": "שבועות",
  "23-09": "ערב רה״ש",
  "24-09": "ראש השנה",
  "02-10": "יום כיפור",
  "07-10": "סוכות",
  "14-10": "שמ״ע",
  "14-12": "חנוכה",
};

const getHebrewDayGematria = (date: Date) => {
  const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'short' }).formatToParts(date);
  const dayNum = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  const monthName = parts.find(p => p.type === 'month')?.value || '';
  
  const units = ["", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'"];
  const tens = ["", "י'", "כ'", "ל'"];
  
  let dayGematria = "";
  if (dayNum === 15) dayGematria = 'טו';
  else if (dayNum === 16) dayGematria = 'טז';
  else {
    const t = Math.floor(dayNum / 10);
    const u = dayNum % 10;
    dayGematria = (tens[t] || "") + (units[u] || "");
  }
  if (dayGematria.length === 2 && dayGematria.endsWith("'")) dayGematria = dayGematria.replace("'", "");

  return `${dayGematria} ${monthName}`;
};

const getHebrewMonthName = (date: Date): string => {
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long', year: 'numeric' }).formatToParts(date);
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    return `${month} ${year}`;
  } catch {
    return '';
  }
};

const isShabbat = (date: Date): boolean => date.getDay() === 6;

const getHolidayForDate = (date: Date): string => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return HOLIDAYS[`${dd}-${mm}`] || '';
};

const TaskCard: React.FC<{ task: any; onToggle: (id: string) => void; onUpdate: (id: string, updates: any) => void }> = ({ task, onToggle, onUpdate }) => {
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50/30 transition-all">
      <div className="p-2 cursor-pointer" onClick={() => setShowDetails(!showDetails)}>
        <div className="flex items-start gap-2 mb-1">
          <div className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black ${
            task.priority === 5 ? 'bg-red-500 text-white' : 
            task.priority === 4 ? 'bg-orange-400 text-white' : 
            task.priority === 3 ? 'bg-yellow-400 text-slate-800' : 
            'bg-slate-300 text-slate-700'
          }`}>
            {task.priority === 5 ? 'HIGH' : task.priority === 4 ? 'HIGH' : task.priority === 3 ? 'MED' : 'LOW'}
          </div>
          <h4 className="font-bold text-xs text-slate-800 flex-1">{task.title}</h4>
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
            className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              task.isCompleted ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-purple-500'
            }`}
          >
            {task.isCompleted && <Check size={10} className="text-white" strokeWidth={3}/>}
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          {task.estimatedTimeMin > 0 && <span className="text-slate-600 font-bold">⏱️ {task.estimatedTimeMin}ד'</span>}
          {(task.potentialRevenue || 0) > 0 && <span className="text-green-600 font-bold">💰 ₪{(task.potentialRevenue / 1000).toFixed(0)}K</span>}
          {task.dueDate && <span className="text-orange-600 font-bold">📅 {new Date(task.dueDate).toLocaleDateString('he-IL', {day: 'numeric', month: 'short'})}</span>}
        </div>
      </div>
      {showDetails && (
        <div className="px-2 pb-2 space-y-2 border-t border-slate-200 pt-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {(task.easeOfExecution || 0) > 0 && (
              <div className="bg-teal-50 px-2 py-1 rounded">
                <span className="text-teal-600 font-bold">קלות: {task.easeOfExecution}/5</span>
              </div>
            )}
            {(task.waitingDays || 0) > 0 && (
              <div className="bg-amber-50 px-2 py-1 rounded">
                <span className="text-amber-700 font-bold">ממתין: {task.waitingDays} ימים</span>
              </div>
            )}
          </div>
          {task.requiredResources && (
            <p className="text-[10px] text-slate-600 bg-slate-100 p-2 rounded">
              <span className="font-bold">משאבים:</span> {task.requiredResources}
            </p>
          )}
          <div className="flex gap-1">
            <button 
              onClick={(e) => { e.stopPropagation(); onUpdate(task.id, { progress: 50 }); }}
              className="flex-1 bg-blue-500 text-white py-1 rounded text-[10px] font-bold hover:bg-blue-600"
            >
              בתהליך
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onUpdate(task.id, { progress: 100, isCompleted: true }); }}
              className="flex-1 bg-green-500 text-white py-1 rounded text-[10px] font-bold hover:bg-green-600"
            >
              הושלם
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { kpis, tasks, events, toggleTask, activities, customers, updateTask, leads, uploadAllToCloud } = useApp();
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [dailyNotes, setDailyNotes] = useState<Array<{id: string; text: string; done: boolean}>>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleRestoreFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const backup = JSON.parse(content);
        
        if (backup.data && backup.version) {
          const backupData = typeof backup.data === 'string' ? JSON.parse(backup.data) : backup.data;
          localStorage.setItem('ME_CFM_STORAGE_V12', JSON.stringify(backupData));
          alert(`✅ שוחזרו ${backup.summary?.events || 0} אירועים, ${backup.summary?.customers || 0} לקוחות!`);
          window.location.reload();
        } else {
          alert('❌ קובץ גיבוי לא תקין');
        }
      } catch (err) {
        console.error('❌ שגיאה בשחזור:', err);
        alert('❌ שגיאה בקריאת קובץ הגיבוי');
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreFromCloud = async () => {
    if (!confirm('לשחזר מהענן את העותק האחרון שנשמר בהגדרות? (רק אם הופעל גיבוי אוטומטי לענן)')) return;
    try {
      const s = await settingsService.get();
      const raw = s?.data?.fullStorageBackup as string | undefined;
      if (!raw || typeof raw !== 'string') {
        alert('אין גיבוי מלא שמור בענן. נסו קובץ JSON או לחצו קודם "העלה לענן" ואז חכו כשתי דקות.');
        return;
      }
      localStorage.setItem('ME_CFM_STORAGE_V12', raw);
      const parsed = JSON.parse(raw);
      alert(`שוחזר מענן: ${parsed.events?.length || 0} אירועים, ${parsed.customers?.length || 0} לקוחות, ${parsed.tasks?.length || 0} משימות, ${parsed.leads?.length || 0} לידים`);
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('שגיאה בשחזור מענן');
    }
  };

  const loadInitialBackup = async () => {
    try {
      const response = await fetch('/initial-backup.json');
      const backup = await response.json();
      localStorage.setItem('ME_CFM_STORAGE_V12', JSON.stringify(backup.data));
      alert(`✅ שוחזרו ${backup.summary.events} אירועים, ${backup.summary.customers} לקוחות, ${backup.summary.tasks} משימות!`);
      window.location.reload();
    } catch (err) {
      console.error('❌ שגיאה בטעינת גיבוי ראשוני:', err);
      alert('❌ שגיאה בטעינת הגיבוי');
    }
  };

  const notesInitialized = useRef(false);

  // Load notes: first from localStorage, then from cloud
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dailyNotes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setDailyNotes(parsed);
      }
    } catch (e) { setDailyNotes([]); }

    // Try loading from cloud
    settingsService.get().then(s => {
      if (s?.data?.dailyNotes && Array.isArray(s.data.dailyNotes)) {
        setDailyNotes(s.data.dailyNotes);
        localStorage.setItem('dailyNotes', JSON.stringify(s.data.dailyNotes));
      }
      notesInitialized.current = true;
    }).catch(() => { notesInitialized.current = true; });
  }, []);

  // Save notes to localStorage + cloud on change
  useEffect(() => {
    if (!notesInitialized.current) return;
    try {
      localStorage.setItem('dailyNotes', JSON.stringify(dailyNotes));
      settingsService.get().then(s => {
        const currentData = s?.data || {};
        settingsService.update({ data: { ...currentData, dailyNotes } }).catch(() => {});
      }).catch(() => {});
    } catch (e) { console.error('Error saving daily notes:', e); }
  }, [dailyNotes]);

  // Auto-sync notes from cloud every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      settingsService.get().then(s => {
        if (s?.data?.dailyNotes && Array.isArray(s.data.dailyNotes)) {
          setDailyNotes(s.data.dailyNotes);
          localStorage.setItem('dailyNotes', JSON.stringify(s.data.dailyNotes));
        }
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const changeMonth = (offset: number) => setCurrentDate(new Date(currentYear, currentMonth + offset, 1));

  const { heatmapGrid, monthLabel, hebrewMonthLabel } = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const grid = [];
    for (let i = 0; i < firstDayOfMonth; i++) grid.push({ day: null, date: null, count: 0, hebrew: '', holiday: '', isShabbat: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, currentMonth, d);
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      const hebrewDay = getHebrewDayGematria(date);
      const holiday = getHolidayForDate(date);
      const shabbat = isShabbat(date);
      grid.push({
        day: d, date: dateStr, count: dayEvents.length,
        hebrew: hebrewDay,
        holiday: holiday,
        isShabbat: shabbat
      });
    }
    const gregorianMonth = currentDate.toLocaleString('he-IL', { month: 'long', year: 'numeric' });
    const hebrewMonth = getHebrewMonthName(currentDate);
    return { heatmapGrid: grid, monthLabel: gregorianMonth, hebrewMonthLabel: hebrewMonth };
  }, [events, currentDate, currentYear, currentMonth]);

  const selectedDayEvents = useMemo(() => events.filter(e => e.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)), [events, selectedDate]);
  const debtEventRows = useMemo(() => {
    const todayKey = todayDateKey();
    return events
      .filter(ev => eventContributesToOpenDebt(ev, todayKey))
      .map(ev => ({
        ev,
        debt: Math.max(0, numMoney(ev.amount) - numMoney(ev.paidAmount)),
        customer: customers.find(c => c.id === ev.customerId),
      }))
      .sort((a, b) => b.debt - a.debt);
  }, [events, customers]);

  const dayPlanSlots = useMemo(() => {
    const d = selectedDate;
    if (!d) return [];
    const slots: { hour: number; items: { type: 'event' | 'task'; label: string; id: string; sub?: string }[] }[] = Array.from({ length: 24 }, (_, hour) => ({ hour, items: [] }));
    const parseHm = (t: string) => {
      const [hh, mm] = (t || '0:00').split(':').map(x => parseInt(x, 10) || 0);
      return hh + mm / 60;
    };
    const startHour = (t: string) => Math.min(23, Math.max(0, Math.floor(parseHm(t))));

    selectedDayEvents.forEach(ev => {
      const sh = startHour(ev.startTime);
      const endH = Math.min(23, Math.max(sh, Math.ceil(parseHm(ev.endTime || ev.startTime)) - 1));
      for (let h = sh; h <= endH; h++) {
        slots[h].items.push({ type: 'event', label: ev.title, id: ev.id, sub: `${ev.startTime}–${ev.endTime}` });
      }
    });

    tasks.forEach(t => {
      if (t.isCompleted || !t.dueDate || t.dueDate !== d) return;
      if (t.dueTime) {
        const h = startHour(t.dueTime);
        slots[h].items.push({ type: 'task', label: t.title, id: t.id, sub: 'משימה' });
      }
    });

    tasks.forEach(t => {
      if (t.isCompleted || !t.reminderDate) return;
      const rd = new Date(t.reminderDate);
      if (isNaN(rd.getTime())) return;
      const y = rd.getFullYear();
      const m = String(rd.getMonth() + 1).padStart(2, '0');
      const day = String(rd.getDate()).padStart(2, '0');
      const ds = `${y}-${m}-${day}`;
      if (ds !== d) return;
      const h = rd.getHours();
      slots[h].items.push({ type: 'task', label: t.title, id: t.id, sub: 'תזכורת' });
    });

    return slots;
  }, [selectedDate, selectedDayEvents, tasks]);
  
  const calculateTaskScore = (task: any): number => {
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

  const smartTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const openTasks = tasks.filter(t => !t.isCompleted);
    
    const todayTasks = openTasks.filter(t => t.dueDate === today);
    const urgentTasks = openTasks.filter(t => t.priority === 5).sort((a, b) => calculateTaskScore(b) - calculateTaskScore(a)).slice(0, 5);
    const financialTasks = openTasks.filter(t => (t.potentialRevenue || 0) > 0).sort((a, b) => (b.potentialRevenue || 0) - (a.potentialRevenue || 0)).slice(0, 5);
    const quickTasks = openTasks.filter(t => t.estimatedTimeMin > 0 && t.estimatedTimeMin <= 30).sort((a, b) => a.estimatedTimeMin - b.estimatedTimeMin).slice(0, 5);
    const easyTasks = openTasks.filter(t => (t.easeOfExecution || 0) >= 4).sort((a, b) => (b.easeOfExecution || 0) - (a.easeOfExecution || 0)).slice(0, 5);
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 5);
    
    return { todayTasks, urgentTasks, financialTasks, quickTasks, easyTasks, overdueTasks };
  }, [tasks]);

  const debtCustomers = useMemo(() => {
    const todayKey = todayDateKey();
    return customers.map(c => {
      const cEvents = events.filter(ev => ev.customerId === c.id);
      const totalDebt = cEvents.reduce((sum, ev) => sum + (eventContributesToOpenDebt(ev, todayKey) ? Math.max(0, numMoney(ev.amount) - numMoney(ev.paidAmount)) : 0), 0);
      return { customer: c, debt: totalDebt, eventsCount: cEvents.length };
    }).filter(item => item.debt > 0)
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 8);
  }, [customers, events]);
  const clickersTypes = useMemo(() => {
    let clickers = 0;
    let clickaorim = 0;
    
    selectedDayEvents.forEach(e => {
      const isClickers = e.eventType === EventType.ClickersProgram || e.eventType === EventType.ClickForYouClickers;
      const isClickaorim = e.eventType === EventType.ClickAurimProgram || e.eventType === EventType.ClickForYouAurim;
      
      if (isClickers) {
        clickers += (e.clickersNeeded || 0);
      } else if (isClickaorim) {
        clickaorim += (e.clickersNeeded || 0);
      }
    });
    
    return { clickers, clickaorim };
  }, [selectedDayEvents]);
  const goAdjacentDay = (dir: number) => {
    if (!selectedDate) return;
    // תיקון: שימוש בתאריך מקומי
    const [year, month, day] = selectedDate.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + dir);
    const newDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setSelectedDate(newDateStr);
  };

  const todayGregorian = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayHebrew = getHebrewDayGematria(new Date());

  const hasNoData = events.length === 0 && customers.length === 0;

  return (
    <div className="h-[calc(100vh-2rem)] overflow-hidden dir-rtl flex flex-col gap-3 pb-4">
      {/* Warning if no data */}
      {hasNoData && (
        <div className="shrink-0 bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={24} className="text-red-600 shrink-0"/>
          <div className="flex-1">
            <h3 className="font-black text-red-800 mb-2">⚠️ אין נתונים במערכת!</h3>
            <p className="text-sm text-red-700 mb-3">נראה שהנתונים נמחקו. לחץ על הכפתור להחזרת כל הנתונים שלך!</p>
            <button 
              onClick={loadInitialBackup}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition-all shadow-md"
            >
              🔄 שחזר את כל הנתונים (488 אירועים, 72 לקוחות, 114 משימות)
            </button>
          </div>
        </div>
      )}
      
      {/* Top Header with Date and KPI Cards */}
      <div className="shrink-0">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">לוח בקרה</h2>
            <p className="text-sm text-slate-600 font-bold mt-1">
              {todayGregorian} <span className="text-purple-600">• {todayHebrew}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/check-availability"
              className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-emerald-700 transition-all text-sm"
              title="בדוק זמינות תאריך לפעילות"
            >
              <CalendarIcon size={14} /> בדיקת זמינות
            </Link>
            <button 
              onClick={async () => {
                const btn = document.activeElement as HTMLButtonElement;
                if (btn) btn.disabled = true;
                const result = await uploadAllToCloud();
                if (btn) btn.disabled = false;
                alert(result.success ? `✅ ${result.message}` : `❌ שגיאה: ${result.message}`);
              }} 
              className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all text-sm"
              title="העלה את כל הנתונים המקומיים לענן"
            >
              <Upload size={14} /> העלה לענן
            </button>
            <button 
              onClick={() => {
                downloadBackupFile();
                alert('✅ קובץ גיבוי הורד בהצלחה! שמור אותו במקום בטוח!');
              }} 
              className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-green-700 transition-all text-sm"
              title="הורד גיבוי של כל הנתונים"
            >
              <Download size={14} /> גיבוי
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreFromFile}
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all text-sm"
              title="שחזר מקובץ גיבוי"
            >
              <Upload size={14} /> שחזר
            </button>
            <button
              type="button"
              onClick={() => void handleRestoreFromCloud()}
              className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-indigo-700 transition-all text-sm"
              title="שחזור מ-Supabase (גיבוי אוטומטי לענן אחרי שינוי נתונים)"
            >
              <Upload size={14} /> שחזר מענן
            </button>
            <button onClick={() => setRefreshKey(k => k + 1)} className="flex items-center gap-2 bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-purple-700 transition-all text-sm">
              <RefreshCw size={14} /> רענן
            </button>
          </div>
        </div>
        
        {/* KPI Cards Row */}
        <div className="grid grid-cols-4 gap-3" key={refreshKey}>
          <button
            type="button"
            onClick={() => setDebtModalOpen(true)}
            className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between text-right hover:border-red-200 hover:bg-red-50/40 transition-all cursor-pointer"
          >
            <div>
              <p className="text-[10px] font-bold text-slate-500">יתרת גבייה</p>
              <h3 className="text-xl font-black text-red-600">₪{kpis.openDebt.toLocaleString()}</h3>
              <p className="text-[9px] text-slate-400 mt-0.5">לחץ לרשימת לקוחות לגבייה</p>
            </div>
            <div className="p-2 bg-red-50 rounded-lg text-red-500"><AlertCircle size={18} /></div>
          </button>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500">סה״כ הכנסות</p>
              <h3 className="text-xl font-black text-green-600">₪{kpis.totalRevenue.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-green-50 rounded-lg text-green-500"><TrendingUp size={18} /></div>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500">צפי הכנסות</p>
              <h3 className="text-xl font-black text-blue-600">₪{kpis.projectedIncome.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-500"><Briefcase size={18} /></div>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500">משימות דחופות</p>
              <h3 className="text-xl font-black text-orange-600">{tasks.filter(t=>!t.isCompleted && t.priority===5).length}</h3>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg text-orange-500"><Zap size={18} /></div>
          </div>
        </div>
      </div>

      {/* 3 Column Grid Layout - Fixed Height with Internal Scrolling */}
      <div className="grid grid-cols-3 gap-3 flex-1 overflow-hidden">
        
        {/* COLUMN 1 (Right) - Calendar + Daily Agenda */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Calendar Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3">
            <div className="mb-2">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-black text-slate-700">{monthLabel}</h3>
                <div className="flex gap-1">
                  <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ArrowRight size={14}/></button>
                  <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ArrowLeft size={14}/></button>
                </div>
              </div>
              <p className="text-[9px] text-purple-600 font-bold">{hebrewMonthLabel}</p>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => <div key={d} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>)}
              {heatmapGrid.map((item, idx) => {
                if (!item.day) return <div key={idx} className="aspect-square"></div>;
                const isSelected = item.date === selectedDate;
                const hasEvents = item.count > 0;
                const isShabbatDay = item.isShabbat;
                const hasHoliday = !!item.holiday;
                return (
                  <button 
                    key={idx} onClick={() => setSelectedDate(item.date)}
                    className={`aspect-square rounded text-[11px] font-bold transition-all relative ${
                      isSelected ? 'bg-purple-600 text-white shadow-md' : 
                      hasHoliday ? 'bg-red-100 text-red-700 border border-red-300' :
                      isShabbatDay ? 'bg-blue-100 text-blue-700' :
                      hasEvents ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 
                      'bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                    title={item.holiday || (isShabbatDay ? 'שבת קודש' : '')}
                  >
                    {item.day}
                    {hasHoliday && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"></div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* עדכונים שוטפים (החלפת התצוגה הקודמת של תוכנית יומית) */}
          <div className="bg-yellow-50 rounded-xl border-2 border-yellow-300 p-3 flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="mb-2 shrink-0">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <MessageSquare size={16} className="text-purple-600"/> עדכונים אחרונים שוטפים
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
              <div className="space-y-2">
                {activities.slice(0, 20).map(act => (
                  <div key={act.id} className="flex gap-2 p-2 rounded-lg bg-white/80 border border-yellow-200/80 hover:bg-white transition-all">
                    <div className={`p-1.5 rounded shrink-0 ${act.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                      {act.type === 'email' ? <Mail size={12}/> : <CheckCircle2 size={12}/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-700 leading-tight break-words">{act.message}</p>
                      <span className="text-[8px] text-slate-400">{act.timestamp.toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
                {activities.length === 0 && <p className="text-xs text-slate-400 text-center py-6">אין פעילות עדיין</p>}
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 2 (Center) - תוכנית יומית 24 שעות + משימות חכמות */}
        <div className="flex flex-col gap-3 overflow-hidden min-h-0">
          {/* לוח 24 שעות — היום הנבחר בלוח שנה */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex-[0.85] overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <CalendarIcon size={16} className="text-purple-600"/> תוכנית יומית (24 שעות)
              </h3>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => goAdjacentDay(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="יום קודם"><ArrowRight size={12}/></button>
                <button type="button" onClick={() => goAdjacentDay(1)} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="יום הבא"><ArrowLeft size={12}/></button>
              </div>
            </div>
            {selectedDate && (
              <p className="text-[9px] text-slate-600 font-bold mb-2 shrink-0">
                {new Date(selectedDate).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span className="text-purple-600 mr-1">• {getHebrewDayGematria(new Date(selectedDate))}</span>
              </p>
            )}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 space-y-0.5 pr-1">
              {dayPlanSlots.map(slot => (
                <div key={slot.hour} className="flex gap-2 text-xs border-b border-slate-100/80 py-1">
                  <div className="w-10 shrink-0 font-mono font-bold text-slate-500 tabular-nums">
                    {String(slot.hour).padStart(2, '0')}:00
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    {slot.items.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      slot.items.map((it, idx) => (
                        <div key={`${it.type}-${it.id}-${idx}`} className={`rounded px-2 py-1 ${it.type === 'event' ? 'bg-purple-50 border border-purple-100' : 'bg-amber-50 border border-amber-100'}`}>
                          {it.type === 'event' ? (
                            <Link
                              to={`/events?eventId=${it.id}`}
                              className="font-bold text-purple-700 truncate block hover:text-purple-900 hover:underline"
                            >
                              {it.label}
                            </Link>
                          ) : (
                            <div className="font-bold text-slate-800 truncate">{it.label}</div>
                          )}
                          {it.sub && <div className="text-[10px] text-slate-500">{it.sub}</div>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart Task Board with 6 Categories */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-sm font-black text-slate-800">לוח משימות</h3>
              <div className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">
                <Target size={12}/>
                <span className="text-[10px] font-black">AI Smart Sort</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {/* Today's Tasks */}
                {smartTasks.todayTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black text-purple-700 mb-1.5">🎯 משימות להיום</h4>
                    <div className="space-y-1.5">
                      {smartTasks.todayTasks.map(task => (
                        <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Urgent Tasks */}
                {smartTasks.urgentTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black text-red-700 mb-1.5">🔥 דחוף</h4>
                    <div className="space-y-1.5">
                      {smartTasks.urgentTasks.slice(0, 3).map(task => (
                        <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Financial Tasks */}
                {smartTasks.financialTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black text-green-700 mb-1.5">💰 פוטנציאל כלכלי</h4>
                    <div className="space-y-1.5">
                      {smartTasks.financialTasks.slice(0, 3).map(task => (
                        <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Quick Tasks */}
                {smartTasks.quickTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black text-blue-700 mb-1.5">⚡ קצרות</h4>
                    <div className="space-y-1.5">
                      {smartTasks.quickTasks.slice(0, 3).map(task => (
                        <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Easy Tasks */}
                {smartTasks.easyTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black text-teal-700 mb-1.5">😊 קלות לביצוע</h4>
                    <div className="space-y-1.5">
                      {smartTasks.easyTasks.slice(0, 3).map(task => (
                        <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Overdue Tasks */}
                {smartTasks.overdueTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-black text-orange-700 mb-1.5">⏰ נדחו</h4>
                    <div className="space-y-1.5">
                      {smartTasks.overdueTasks.slice(0, 3).map(task => (
                        <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* COLUMN 3 (Left) - Marketing Hub + Daily Reminders */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Marketing Hub with Tasks */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-black text-slate-800 mb-2 shrink-0">לוח שיווק</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                {/* Marketing Campaigns Summary */}
                <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-blue-700">Leads from Facebook:</span>
                    <span className="text-xs font-black text-blue-700">{leads.filter(l => l.source?.includes('Facebook')).length}</span>
                  </div>
                  <p className="text-[10px] text-blue-600">(High Quality)</p>
                </div>
                
                <div className="bg-pink-50 rounded-lg p-2 border border-pink-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-pink-700">Instagram Campaign</span>
                    <Instagram size={14} className="text-pink-600"/>
                  </div>
                  <p className="text-[10px] text-pink-600">Status: Running</p>
                </div>

                {/* Marketing Tasks with Full Details */}
                <div className="space-y-2 mt-3">
                  <h4 className="text-xs font-black text-purple-700">משימות שיווק</h4>
                  {tasks.filter(t => !t.isCompleted && (t.category === 'שיווק' || t.category === 'קליכיף')).slice(0, 5).map(task => (
                    <TaskCard key={task.id} task={task} onToggle={toggleTask} onUpdate={updateTask} />
                  ))}
                </div>

                {/* Recent Leads */}
                <div className="space-y-2 mt-3">
                  <h4 className="text-xs font-black text-blue-700">לידים אחרונים</h4>
                  {leads.slice(0, 3).map(lead => (
                    <div key={lead.id} className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                      <div className="flex items-start gap-2">
                        <PhoneCall size={10} className="text-blue-600 shrink-0 mt-0.5"/>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{lead.name}</p>
                          <p className="text-[10px] text-slate-500">{lead.phone}</p>
                          {lead.eventDetails && <p className="text-[10px] text-slate-400 truncate mt-0.5">{lead.eventDetails}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Daily Reminders & Notes */}
          <div className="bg-yellow-50 rounded-xl border-2 border-yellow-300 p-3 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-black text-slate-800 mb-2 shrink-0">תזכורת יומית</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                {/* Reminders from Tasks */}
                {tasks.filter(t => !t.isCompleted && t.reminderDate).slice(0, 3).map(task => (
                  <div key={task.id} className="bg-white rounded-lg p-2 border-r-4 border-orange-400 shadow-sm">
                    <div className="flex items-start gap-2">
                      <Bell size={12} className="text-orange-600 shrink-0"/>
                      <p className="text-xs font-bold text-slate-800">{task.title}</p>
                    </div>
                  </div>
                ))}

                {/* Private Notes Section with Checkboxes */}
                <div className="bg-white rounded-lg p-3 border border-yellow-300 mt-3">
                  <h4 className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1">
                    <StickyNote size={12} className="text-yellow-600"/> פתקים
                  </h4>
                  <div className="space-y-2">
                    {dailyNotes.map(note => (
                      <div key={note.id} className="flex items-start gap-2 group">
                        <input 
                          type="checkbox" 
                          checked={note.done}
                          onChange={() => {
                            setDailyNotes(prev => prev.map(n => 
                              n.id === note.id ? {...n, done: !n.done} : n
                            ));
                          }}
                          className="mt-0.5 w-3 h-3 accent-purple-600 shrink-0"
                        />
                        {editingNoteId === note.id ? (
                          <input
                            type="text"
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editingNoteText.trim()) {
                                setDailyNotes(prev => prev.map(n => 
                                  n.id === note.id ? {...n, text: editingNoteText} : n
                                ));
                                setEditingNoteId(null);
                                setEditingNoteText('');
                              } else if (e.key === 'Escape') {
                                setEditingNoteId(null);
                                setEditingNoteText('');
                              }
                            }}
                            onBlur={() => {
                              if (editingNoteText.trim()) {
                                setDailyNotes(prev => prev.map(n => 
                                  n.id === note.id ? {...n, text: editingNoteText} : n
                                ));
                              }
                              setEditingNoteId(null);
                              setEditingNoteText('');
                            }}
                            autoFocus
                            className="flex-1 text-xs px-2 py-1 border border-purple-400 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
                          />
                        ) : (
                          <>
                            <p 
                              className={`text-xs font-bold flex-1 cursor-pointer ${note.done ? 'line-through text-slate-400' : 'text-slate-700'}`}
                              onDoubleClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteText(note.text);
                              }}
                              title="לחץ פעמיים לעריכה"
                            >
                              {note.text}
                            </p>
                            <button
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteText(note.text);
                              }}
                              className="opacity-0 group-hover:opacity-100 shrink-0 text-blue-500 hover:text-blue-700 transition-all"
                              title="ערוך פתק"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDailyNotes(prev => prev.filter(n => n.id !== note.id))}
                              className="opacity-0 group-hover:opacity-100 shrink-0 text-red-500 hover:text-red-700 transition-all"
                              title="מחק פתק"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-1 mt-2">
                      <input 
                        type="text"
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="הוסף תזכורת..."
                        className="flex-1 text-xs px-2 py-1 border border-yellow-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newNoteText.trim()) {
                            setDailyNotes(prev => [...prev, { id: `n_${Date.now()}`, text: newNoteText, done: false }]);
                            setNewNoteText('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (newNoteText.trim()) {
                            setDailyNotes(prev => [...prev, { id: `n_${Date.now()}`, text: newNoteText, done: false }]);
                            setNewNoteText('');
                          }
                        }}
                        className="shrink-0 bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-purple-700 transition-all"
                        title="הוסף פתק"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {debtModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDebtModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800">גבייה פתוחה</h3>
                <p className="text-xs text-slate-500">לפי אירועים — מעבר לכרטיס האירוע, מייל או חיוג</p>
              </div>
              <button type="button" onClick={() => setDebtModalOpen(false)} className="text-slate-400 hover:text-slate-800 text-sm font-bold">סגור</button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {debtEventRows.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">אין חובות פתוחים 🎉</p>
              ) : (
                debtEventRows.map(({ ev, debt, customer }) => {
                  const email = (customer?.email || ev.email || '').trim();
                  const phone = (customer?.phone || ev.phone || '').replace(/\D/g, '');
                  const telHref = phone ? `tel:${phone.startsWith('0') ? phone : phone}` : '';
                  return (
                    <div key={ev.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{ev.title}</p>
                          <p className="text-xs text-slate-500">{customer?.name || 'ללא שם לקוח'}</p>
                        </div>
                        <span className="text-red-600 font-black shrink-0">₪{debt.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link to={`/events?eventId=${ev.id}`} onClick={() => setDebtModalOpen(false)} className="text-xs font-bold bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700">פרטי האירוע</Link>
                        {email && <a href={`mailto:${email}`} className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200">מייל</a>}
                        {telHref && <a href={telHref} className="text-xs font-bold bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100">התקשר</a>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-black text-slate-800">{selectedEvent.title}</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-900">
                <RefreshCw size={20}/>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <CalendarIcon size={18} className="text-purple-600"/>
                <div>
                  <p className="text-slate-500 text-xs font-bold">תאריך</p>
                  <p className="font-black text-slate-800">{new Date(selectedEvent.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  <p className="text-xs text-purple-600 font-bold">{getHebrewDayGematria(new Date(selectedEvent.date))}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Clock size={18} className="text-blue-600"/>
                <div>
                  <p className="text-slate-500 text-xs font-bold">שעות</p>
                  <p className="font-black text-slate-800">{selectedEvent.startTime} - {selectedEvent.endTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <MapPin size={18} className="text-green-600"/>
                <div>
                  <p className="text-slate-500 text-xs font-bold">מיקום</p>
                  <p className="font-bold text-slate-800">{selectedEvent.location || 'לא צוין'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Users size={18} className="text-orange-600"/>
                <div>
                  <p className="text-slate-500 text-xs font-bold">קליקרים</p>
                  <p className="font-black text-slate-800">{selectedEvent.clickersNeeded || 0}</p>
                </div>
              </div>
              {selectedEvent.notes && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs font-bold text-amber-800 mb-1">הערות:</p>
                  <p className="text-xs text-slate-700">{selectedEvent.notes}</p>
                </div>
              )}
            </div>
            <button 
              onClick={() => setSelectedEvent(null)}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition-all"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
