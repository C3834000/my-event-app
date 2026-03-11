
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  AlertCircle, Briefcase, Calendar as CalendarIcon, 
  CheckCircle2, Check, Zap, Clock, MapPin, Users, Mail, RefreshCw, ArrowLeft, ArrowRight, TrendingUp,
  Target, PhoneCall, MessageSquare, Facebook, Instagram, Bell, StickyNote
} from 'lucide-react';
import { EventStatus, EventType } from '../types';

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

const Dashboard: React.FC = () => {
  const { kpis, tasks, events, toggleTask, activities, customers, updateTask, leads } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const changeMonth = (offset: number) => setCurrentDate(new Date(currentYear, currentMonth + offset, 1));

  const { heatmapGrid, monthLabel } = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const grid = [];
    for (let i = 0; i < firstDayOfMonth; i++) grid.push({ day: null, date: null, count: 0, hebrew: '', holiday: '' });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, currentMonth, d);
      // תיקון: יצירת תאריך מקומי במקום UTC
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      grid.push({
        day: d, date: dateStr, count: dayEvents.length,
        hebrew: getHebrewDayGematria(date),
        holiday: HOLIDAYS[`${String(d).padStart(2, '0')}-${String(currentMonth + 1).padStart(2, '0')}`] || ''
      });
    }
    return { heatmapGrid: grid, monthLabel: currentDate.toLocaleString('he-IL', { month: 'long', year: 'numeric' }) };
  }, [events, currentDate, currentYear, currentMonth]);

  const selectedDayEvents = useMemo(() => events.filter(e => e.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime)), [events, selectedDate]);
  const displayTasks = useMemo(() => [...tasks].sort((a,b) => (a.isCompleted === b.isCompleted ? 0 : a.isCompleted ? 1 : -1)).slice(0, 5), [tasks]);
  const hours = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
  
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
    const openTasks = tasks.filter(t => !t.isCompleted);
    return openTasks.map(t => ({ task: t, score: calculateTaskScore(t) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [tasks]);

  const debtCustomers = useMemo(() => {
    return customers.map(c => {
      const cEvents = events.filter(ev => ev.customerId === c.id);
      const totalDebt = cEvents.reduce((sum, ev) => sum + (ev.amount - (ev.paidAmount || 0)), 0);
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

  return (
    <div className="h-[calc(100vh-2rem)] overflow-hidden dir-rtl flex flex-col gap-3 pb-4">
      {/* Top Header with KPI Cards */}
      <div className="shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-2xl font-bold text-slate-800">לוח בקרה</h2>
          <button onClick={() => setRefreshKey(k => k + 1)} className="flex items-center gap-2 bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-md hover:bg-purple-700 transition-all text-sm">
            <RefreshCw size={14} /> רענן
          </button>
        </div>
        
        {/* KPI Cards Row */}
        <div className="grid grid-cols-4 gap-3" key={refreshKey}>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500">יתרת גבייה</p>
              <h3 className="text-xl font-black text-red-600">₪{kpis.openDebt.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-red-50 rounded-lg text-red-500"><AlertCircle size={18} /></div>
          </div>
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
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-black text-slate-700">{monthLabel}</h3>
              <div className="flex gap-1">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ArrowRight size={14}/></button>
                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ArrowLeft size={14}/></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => <div key={d} className="text-center text-[9px] font-bold text-slate-400 py-1">{d}</div>)}
              {heatmapGrid.map((item, idx) => {
                if (!item.day) return <div key={idx} className="aspect-square"></div>;
                const isSelected = item.date === selectedDate;
                const hasEvents = item.count > 0;
                return (
                  <button 
                    key={idx} onClick={() => setSelectedDate(item.date)}
                    className={`aspect-square rounded text-[11px] font-bold transition-all ${
                      isSelected ? 'bg-purple-600 text-white shadow-md' : 
                      hasEvents ? 'bg-purple-50 text-purple-700 hover:bg-purple-100' : 
                      'bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daily Agenda Timeline - Internal Scroll */}
          <div className="bg-yellow-50 rounded-xl border-2 border-yellow-300 p-3 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
              <CalendarIcon size={16} className="text-purple-600"/> תוכנית יומית
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {selectedDayEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 py-8">
                  <CalendarIcon size={32} opacity={0.3} />
                  <p className="text-xs font-bold mt-2">אין אירועים רשומים</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map(event => (
                    <div key={event.id} className="bg-white rounded-lg p-3 border-r-4 border-purple-500 shadow-sm hover:shadow-md transition-all">
                      <h4 className="font-bold text-xs text-slate-800 mb-1">{event.title}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600">
                        <Clock size={10}/> {event.startTime}-{event.endTime}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 mt-1">
                        <MapPin size={10}/> {event.location || 'לא צוין'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2 (Center) - Smart Tasks + Activity Stream */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Smart Task Board with Priority Tags */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-sm font-black text-slate-800">לוח משימות</h3>
              <div className="flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">
                <Target size={12}/>
                <span className="text-[10px] font-black">AI Smart Sort</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                {smartTasks.map(({ task, score }, idx) => (
                  <div key={task.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200 hover:border-purple-300 hover:bg-purple-50/30 transition-all">
                    <div className="flex items-start gap-2 mb-2">
                      <div className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-black ${
                        task.priority === 5 ? 'bg-red-500 text-white' : 
                        task.priority === 4 ? 'bg-orange-400 text-white' : 
                        task.priority === 3 ? 'bg-yellow-400 text-slate-800' : 
                        'bg-slate-300 text-slate-700'
                      }`}>
                        {task.priority === 5 ? 'HIGH' : task.priority === 4 ? 'HIGH' : task.priority === 3 ? 'MEDIUM' : 'LOW'}
                      </div>
                      <h4 className="font-bold text-xs text-slate-800 flex-1">{task.title}</h4>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.estimatedTimeMin > 0 && (
                        <span className="text-[9px] text-slate-600 font-bold">⏱️ {task.estimatedTimeMin}ד'</span>
                      )}
                      {(task.potentialRevenue || 0) > 0 && (
                        <span className="text-[9px] text-green-600 font-bold">💰 ₪{(task.potentialRevenue / 1000).toFixed(0)}K</span>
                      )}
                      {task.dueDate && (
                        <span className="text-[9px] text-orange-600 font-bold">📅 {new Date(task.dueDate).toLocaleDateString('he-IL', {day: 'numeric', month: 'short'})}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Stream / Newsfeed */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-black text-slate-800 mb-2 shrink-0">עדכונים אחרונים שוטפים</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                {activities.slice(0, 15).map(act => (
                  <div key={act.id} className="flex gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all">
                    <div className={`p-1.5 rounded ${act.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                      {act.type === 'email' ? <Mail size={12}/> : <CheckCircle2 size={12}/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-700 leading-tight truncate">{act.message}</p>
                      <span className="text-[8px] text-slate-400">{act.timestamp.toLocaleString('he-IL', {day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  </div>
                ))}
                {activities.length === 0 && <p className="text-xs text-slate-400 text-center py-4">אין פעילות</p>}
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3 (Left) - Marketing Hub + Daily Reminders */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Marketing Hub / Leads Center */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-black text-slate-800 mb-2 shrink-0">לוח שיווק</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                {/* Marketing Campaigns/Leads */}
                <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-blue-700">Leads from Facebook:</span>
                    <span className="text-xs font-black text-blue-700">{leads.filter(l => l.source?.includes('Facebook')).length}</span>
                  </div>
                  <p className="text-[9px] text-blue-600">(High Quality)</p>
                </div>
                
                <div className="bg-pink-50 rounded-lg p-2 border border-pink-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-pink-700">Instagram Campaign</span>
                    <Instagram size={14} className="text-pink-600"/>
                  </div>
                  <p className="text-[9px] text-pink-600">Status: Running</p>
                </div>

                {leads.slice(0, 8).map(lead => (
                  <div key={lead.id} className="bg-slate-50 rounded-lg p-2 border border-slate-200 hover:bg-slate-100 transition-all">
                    <div className="flex items-start gap-2">
                      <PhoneCall size={12} className="text-purple-600 shrink-0 mt-0.5"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-800 truncate">{lead.name}</p>
                        <p className="text-[9px] text-slate-500">{lead.phone}</p>
                        {lead.eventDetails && <p className="text-[8px] text-slate-400 truncate mt-0.5">{lead.eventDetails}</p>}
                      </div>
                    </div>
                  </div>
                ))}
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
                      <p className="text-[10px] font-bold text-slate-800">{task.title}</p>
                    </div>
                  </div>
                ))}

                {/* Private Notes Section */}
                <div className="bg-white rounded-lg p-3 border border-yellow-300 mt-3">
                  <h4 className="text-xs font-black text-slate-700 mb-2 flex items-center gap-1">
                    <StickyNote size={12} className="text-yellow-600"/> פתקים
                  </h4>
                  <ul className="space-y-1 text-[10px] text-slate-600">
                    <li>• Check new camera equipment prices</li>
                    <li>• Draft agenda for next week's team meeting</li>
                    <li>• Approve budget for new event space</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
