
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  AlertCircle, Briefcase, Calendar as CalendarIcon, 
  CheckCircle2, Check, Zap, Clock, MapPin, Users, Mail, RefreshCw, ArrowLeft, ArrowRight, TrendingUp
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
  const { kpis, tasks, events, toggleTask, activities, customers, updateTask } = useApp();
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
    <div className="space-y-6 animate-fade-in pb-12 dir-rtl">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-slate-800">דשבורד</h2>
        <button onClick={() => { setRefreshKey(k => k + 1); window.location.reload(); }} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-all">
          <RefreshCw size={18} /> רענן נתונים
        </button>
      </div>
      {/* KPI Cards - compact, responsive */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 max-w-4xl" key={refreshKey}>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center group hover:shadow-md transition-all">
             <div className="min-w-0"><p className="text-xs font-medium text-slate-500 truncate">גבייה פתוחה</p><h3 className="text-lg font-bold text-red-600 mt-0.5 truncate">₪{kpis.openDebt.toLocaleString()}</h3></div>
             <div className="p-2 bg-red-50 rounded-lg text-red-500 shrink-0"><AlertCircle size={20} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center group hover:shadow-md transition-all">
             <div className="min-w-0"><p className="text-xs font-medium text-slate-500 truncate">צפי הכנסות</p><h3 className="text-lg font-bold text-blue-600 mt-0.5 truncate">₪{kpis.projectedIncome.toLocaleString()}</h3></div>
             <div className="p-2 bg-blue-50 rounded-lg text-blue-500 shrink-0"><Briefcase size={20} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center group hover:shadow-md transition-all">
             <div className="min-w-0"><p className="text-xs font-medium text-slate-500 truncate">סה״כ הכנסות</p><h3 className="text-lg font-bold text-green-600 mt-0.5 truncate">₪{kpis.totalRevenue.toLocaleString()}</h3></div>
             <div className="p-2 bg-green-50 rounded-lg text-green-500 shrink-0"><TrendingUp size={20} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center group hover:shadow-md transition-all">
             <div className="min-w-0"><p className="text-xs font-medium text-slate-500 truncate">משימות דחופות</p><h3 className="text-lg font-bold text-orange-500 mt-0.5">{tasks.filter(t=>!t.isCompleted && t.priority===5).length}</h3></div>
             <div className="p-2 bg-orange-50 rounded-lg text-orange-500 shrink-0"><Zap size={20} /></div>
          </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* MINI CALENDAR & ACTIVITIES */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><CalendarIcon size={20} className="text-purple-500" /> {monthLabel}</h3>
                <div className="flex gap-1">
                    <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><ArrowRight size={18}/></button>
                    <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><ArrowLeft size={18}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => <div key={d} className="text-center text-xs font-black text-slate-500 py-2 uppercase">{d}</div>)}
              {heatmapGrid.map((item, idx) => {
                 if (!item.day) return <div key={idx} className="aspect-square"></div>;
                 const isSelected = item.date === selectedDate;
                 const hasEvents = item.count > 0;
                 return (
                   <button 
                     key={idx} onClick={() => setSelectedDate(item.date)}
                     className={`aspect-square rounded-xl border flex flex-col items-center justify-center transition-all relative ${
                       isSelected ? 'bg-purple-600 border-purple-600 text-white shadow-lg scale-105 z-10' : 
                       hasEvents ? 'bg-purple-50 border-purple-100 text-purple-700 hover:bg-purple-100' : 'bg-white border-transparent hover:border-slate-200 text-slate-600'
                     }`}
                   >
                      <span className="text-base font-black">{item.day}</span>
                      <span className={`text-[9px] ${isSelected ? 'text-purple-200' : 'text-slate-400'} font-bold leading-tight`}>{item.hebrew}</span>
                      {item.holiday && <span className={`text-[7px] ${isSelected ? 'text-purple-100' : 'text-red-500'} font-black`}>{item.holiday}</span>}
                      {hasEvents && !isSelected && <div className="absolute bottom-1 w-1.5 h-1.5 bg-purple-500 rounded-full"></div>}
                   </button>
                 );
              })}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <RefreshCw size={14} /> פעולות אוטומטיות (מייל ויומן)
              </h3>
              <div className="space-y-4 max-h-[200px] overflow-y-auto custom-scrollbar">
                {activities.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">טרם נרשמו פעולות</p> : 
                  activities.map(act => (
                    <div key={act.id} className="flex gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
                       <div className={`p-1.5 rounded-md ${act.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                          {act.type === 'email' ? <Mail size={12}/> : <RefreshCw size={12}/>}
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-700 leading-tight">{act.message}</p>
                          <span className="text-[8px] text-slate-400">{act.timestamp.toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}</span>
                       </div>
                    </div>
                  ))
                }
              </div>
          </div>
        </div>

        {/* DAY VIEW COLUMN - SCROLLABLE */}
        <div className="xl:col-span-2">
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden h-[480px] flex flex-col">
                <div className="p-4 md:p-5 border-b border-slate-50 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => goAdjacentDay(-1)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-all" title="יום קודם"><ArrowRight size={20}/></button>
                        <div>
                            <h3 className="text-xl font-black text-slate-800">תצוגת יום</h3>
                            <p className="text-slate-500 font-bold text-sm">
                              {selectedDate ? (
                                <>
                                  {new Date(selectedDate).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                  <span className="text-purple-600 mr-2">• {getHebrewDayGematria(new Date(selectedDate))}</span>
                                </>
                              ) : 'בחר תאריך'}
                            </p>
                        </div>
                        <button onClick={() => goAdjacentDay(1)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-all" title="יום הבא"><ArrowLeft size={20}/></button>
                    </div>
                    {selectedDate && (clickersTypes.clickers > 0 || clickersTypes.clickaorim > 0) && (
                        <div className="flex gap-4 text-sm font-bold" title={`${selectedDayEvents.length} אירועים ביום זה`}>
                            <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100">קליקרים: {clickersTypes.clickers} ({selectedDayEvents.filter(e => e.eventType === EventType.ClickersProgram || e.eventType === EventType.ClickForYouClickers).length} אירועים)</span>
                            <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-100">קליקאורים: {clickersTypes.clickaorim} ({selectedDayEvents.filter(e => e.eventType === EventType.ClickAurimProgram || e.eventType === EventType.ClickForYouAurim).length} אירועים)</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 relative custom-scrollbar scroll-smooth">
                    {selectedDayEvents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4 py-20 text-center">
                            <CalendarIcon size={64} opacity={0.3} />
                            <p className="text-xl font-bold">אין אירועים רשומים</p>
                        </div>
                    ) : (
                        <div className="space-y-0 min-h-[800px]">
                            <div className="relative pl-4">
                                {hours.map(hour => (
                                    <div key={hour} className="flex items-start gap-6 border-b border-slate-50 py-6 h-[70px] relative group">
                                        <div className="w-14 text-base font-black text-slate-400 group-hover:text-purple-500 transition-colors">{hour}</div>
                                        <div className="flex-1"></div>
                                    </div>
                                ))}
                                <div className="absolute top-0 right-[5rem] left-0 bottom-0 pointer-events-none">
                                    {selectedDayEvents.map(event => {
                                        const startHour = parseInt(event.startTime.split(':')[0]);
                                        const startMin = parseInt(event.startTime.split(':')[1]);
                                        const endHour = parseInt(event.endTime.split(':')[0]);
                                        const endMin = parseInt(event.endTime.split(':')[1]);
                                        const hourH = 70;
                                        const startPos = ((startHour - 8) * hourH) + (startMin * (hourH / 60));
                                        const durationMin = (endHour * 60 + endMin) - (startHour * 60 + startMin);
                                        const height = durationMin * (hourH / 60);
                                        return (
                                            <div 
                                                key={event.id}
                                                className={`absolute left-0 right-0 p-4 rounded-2xl border-l-4 shadow-xl pointer-events-auto transition-all hover:scale-[1.01] cursor-pointer z-10 ${
                                                    event.status === EventStatus.Paid ? 'bg-green-50 border-green-500 text-green-900' :
                                                    event.status === EventStatus.Booked ? 'bg-blue-50 border-blue-500 text-blue-900' : 'bg-slate-50 border-slate-400 text-slate-900'
                                                }`}
                                                style={{ top: `${startPos}px`, height: `${height}px`, minHeight: '60px' }}
                                            >
                                                <div className="flex justify-between items-start h-full flex-col">
                                                    <div>
                                                        <h4 className="font-black text-base truncate">{event.title}</h4>
                                                        <div className="flex items-center gap-2 mt-1.5 opacity-80 text-xs font-bold">
                                                            <Clock size={14}/> {event.startTime} - {event.endTime} | <MapPin size={14}/> {event.location}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs font-black bg-white/50 px-3 py-1 rounded-lg mt-auto">
                                                       <Users size={14}/> {event.clickersNeeded} קליקרים
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      {/* NEW SECTIONS - Smart Tasks, Activities, Debt Customers */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Smart Tasks */}
        <div className="xl:col-span-1 bg-gradient-to-br from-purple-500 to-blue-600 rounded-3xl p-6 shadow-xl text-white">
          <h3 className="text-xl font-black mb-4 flex items-center gap-2">
            🎯 משימות מומלצות להיום
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
            {smartTasks.map(({ task, score }, idx) => (
              <div key={task.id} className="bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg text-slate-800 hover:scale-105 transition-all relative">
                <div className="absolute -top-2 -right-2 w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white font-black text-sm shadow-lg">
                  {idx + 1}
                </div>
                <h4 className="font-bold text-sm mb-2 pr-4">{task.title}</h4>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold">📊 {Math.round(score)}</span>
                  {task.priority === 5 && <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold">🔥 דחוף</span>}
                  {(task.potentialRevenue || 0) > 0 && <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-bold">💰 ₪{task.potentialRevenue?.toLocaleString()}</span>}
                  {task.estimatedTimeMin > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">⏱️ {task.estimatedTimeMin}'</span>}
                </div>
                <button 
                  onClick={() => updateTask(task.id, { progress: task.progress === 100 ? 0 : 100, isCompleted: task.progress !== 100 })}
                  className="mt-3 w-full bg-purple-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-purple-700 transition-all"
                >
                  {task.isCompleted ? '↩️ בטל' : '✓ סיים'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Activities Log - Enhanced */}
        <div className="xl:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-xl font-black mb-4 flex items-center gap-2 text-slate-800">
            📊 פעילות אחרונה
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {activities.slice(0, 15).map(act => (
              <div key={act.id} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-all">
                <div className={`p-2 rounded-lg ${act.type === 'email' ? 'bg-blue-100 text-blue-600' : act.type === 'sync' ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'}`}>
                  {act.type === 'email' ? <Mail size={16}/> : act.type === 'sync' ? <RefreshCw size={16}/> : <CheckCircle2 size={16}/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 leading-tight">{act.message}</p>
                  <span className="text-[10px] text-slate-400 font-medium">{act.timestamp.toLocaleString('he-IL', {day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Debt Customers */}
        <div className="xl:col-span-1 bg-red-50 rounded-3xl p-6 shadow-lg border-2 border-red-200">
          <h3 className="text-xl font-black mb-4 flex items-center gap-2 text-red-700">
            ⚠️ לקוחות עם חובות
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
            {debtCustomers.map(({ customer, debt, eventsCount }) => (
              <div key={customer.id} className="bg-white rounded-xl p-4 shadow-md border border-red-200 hover:shadow-lg hover:border-red-300 transition-all">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-sm text-slate-800">{customer.name}</h4>
                  <span className="bg-red-500 text-white px-3 py-1 rounded-lg font-black text-sm">₪{debt.toLocaleString()}</span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>📞 {customer.phone}</p>
                  {customer.email && <p>📧 {customer.email}</p>}
                  <p className="text-red-600 font-bold">{eventsCount} אירועים</p>
                </div>
              </div>
            ))}
            {debtCustomers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-green-600 font-bold">🎉 אין חובות פתוחים!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
