
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { EventStatus, PaymentStatus, EventType, AppEvent, PaymentMethod } from '../types';
import { Plus, Search, Calendar as CalendarIcon, Download, X, MapPin, Users, Clock, ChevronDown, ChevronUp, MousePointer2, Info, Upload, Edit, UserPlus, FileCheck } from 'lucide-react';
import { exportToCSV, parseCSV } from '../services/utils';
import { useSearchParams } from 'react-router-dom';
import EditEventModal from '../components/EditEventModal';
import { EVENT_TAGS } from '../constants/eventBoard';
import { giDocTypeName } from '../services/greenInvoice';

const CATEGORY_COLORS: string[] = [
  'bg-sky-100 text-sky-800 border border-sky-200',
  'bg-violet-100 text-violet-800 border border-violet-200',
  'bg-amber-100 text-amber-800 border border-amber-200',
  'bg-emerald-100 text-emerald-800 border border-emerald-200',
  'bg-rose-100 text-rose-800 border border-rose-200',
  'bg-teal-100 text-teal-800 border border-teal-200',
  'bg-indigo-100 text-indigo-800 border border-indigo-200',
  'bg-lime-100 text-lime-800 border border-lime-200',
  'bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200',
  'bg-slate-100 text-slate-700 border border-slate-200',
];
const getCategoryStyle = (category: string) => {
  const idx = Math.abs(category.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[idx];
};

const HEADER_BG_COLORS: string[] = [
  'bg-gradient-to-r from-blue-400 to-sky-400',
  'bg-gradient-to-r from-purple-400 to-violet-400',
  'bg-gradient-to-r from-pink-400 to-rose-400',
  'bg-gradient-to-r from-orange-400 to-amber-400',
  'bg-gradient-to-r from-green-400 to-emerald-400',
  'bg-gradient-to-r from-teal-400 to-cyan-400',
  'bg-gradient-to-r from-indigo-400 to-blue-400',
  'bg-gradient-to-r from-red-400 to-pink-400',
  'bg-gradient-to-r from-yellow-400 to-orange-400',
  'bg-gradient-to-r from-lime-400 to-green-400',
];

/** קבוצת כל האירועים שתאריכם היום או בעתיד (לא "נוספו עכשיו" — רק לפי תאריך) */
const FUTURE_EVENTS_GROUP = '📅 אירועים עתידיים';

const getHeaderBg = (category: string) => {
  if (category === FUTURE_EVENTS_GROUP) return 'bg-gradient-to-r from-purple-500 to-pink-500';
  const idx = Math.abs(category.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % HEADER_BG_COLORS.length;
  return HEADER_BG_COLORS[idx];
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  [PaymentStatus.NotPaid]: 'bg-[#c4c4c4] text-white',
  [PaymentStatus.PaidCash]: 'bg-[#9cd326] text-white',
  [PaymentStatus.Paid]: 'bg-[#00c875] text-white',
  [PaymentStatus.PaidTransferL]: 'bg-[#579bfc] text-white',
  [PaymentStatus.PaidPartial]: 'bg-[#ff753e] text-white',
  [PaymentStatus.PaidCredit]: 'bg-[#cab641] text-white',
  [PaymentStatus.Net30]: 'bg-[#0086c0] text-white',
  [PaymentStatus.PaidCheck]: 'bg-[#e23344] text-white',
  [PaymentStatus.Net60]: 'bg-[#5559df] text-white',
  [PaymentStatus.PaidTransferH]: 'bg-[#a25ddc] text-white',
  [PaymentStatus.PaidTransferM]: 'bg-[#ffad46] text-white',
  [PaymentStatus.PaidProvider]: 'bg-[#bb3354] text-white',
};

const EVENT_TYPE_STYLES: Record<string, string> = {
  [EventType.ClickAurimProgram]: 'bg-[#0086c0] text-white',
  [EventType.ClickersProgram]: 'bg-[#579bfc] text-white',
  [EventType.ClickForYouAurim]: 'bg-[#ffad46] text-white',
  [EventType.ClickForYouClickers]: 'bg-[#a25ddc] text-white',
  [EventType.TalkClick]: 'bg-[#00c875] text-white',
  [EventType.PhoneClick]: 'bg-[#e23344] text-white',
};

const EventRow: React.FC<{ event: AppEvent; onEdit: (ev: AppEvent) => void; onCreateTask?: (event: AppEvent) => void }> = ({ event, onEdit, onCreateTask }) => {
  const { getCustomerById, updateEvent, tasks } = useApp();
  const linkedTask = tasks.find(t => t.id === event.taskId);
  const customer = getCustomerById(event.customerId);
  const debt = event.amount - event.paidAmount;
  const isPaid = [PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck, PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider].includes(event.paymentStatus);
  const showDebt = !isPaid && debt > 0;

  return (
      <div id={`event-row-${event.id}`} className="bg-white border-b border-slate-100 p-4 sm:p-5 hover:bg-slate-50 transition-colors group rounded-lg sm:rounded-none">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row xl:items-start gap-4 xl:gap-6">
              <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded shrink-0">{event.externalId || 'ID לא זמין'}</span>
                              <h4 className="text-base sm:text-lg font-bold text-slate-800 break-words">{event.title}</h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`text-xs font-bold px-3 py-1 rounded-lg ${EVENT_TAGS[event.tag] || 'bg-slate-400 text-white'}`}>{event.tag}</span>
                            <span className={`text-xs font-bold px-3 py-1 rounded-lg ${EVENT_TYPE_STYLES[event.eventType] || 'bg-slate-500 text-white'}`}>{event.eventType}</span>
                            {event.clickersNeeded > 0 && (
                               <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold border border-indigo-200">
                                  <MousePointer2 size={12} /> {event.clickersNeeded} קליקרים
                               </span>
                             )}
                          </div>
                      </div>
                      <button type="button" onClick={() => onEdit(event)} className="p-2.5 hover:bg-purple-100 text-slate-400 hover:text-purple-600 rounded-xl transition-colors shrink-0"><Edit size={20} /></button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-600 min-w-0">
                         <Users size={16} className="text-purple-500 shrink-0" />
                         <span className="font-medium truncate">{customer?.name || event.title || 'לא משויך ללקוח'}</span>
                      </div>
                      {event.phone && (
                          <div className="flex items-center gap-2 text-slate-600 min-w-0">
                             <span className="text-purple-500 shrink-0">📞</span>
                             <a href={`tel:${event.phone}`} className="font-medium truncate hover:text-purple-600">{event.phone}</a>
                          </div>
                      )}
                      {event.email && (
                          <div className="sm:col-span-2 flex items-start gap-2 text-slate-600 min-w-0">
                             <span className="text-purple-500 shrink-0 mt-0.5">📧</span>
                             <a href={`mailto:${event.email}`} className="font-medium text-xs break-all min-w-0 leading-relaxed">{event.email}</a>
                          </div>
                      )}
                      {event.location && (
                          <div className="sm:col-span-2 flex items-center gap-2 text-slate-600 min-w-0">
                             <MapPin size={16} className="text-purple-500 shrink-0" />
                             <span className="font-medium break-words">{event.location}</span>
                          </div>
                      )}
                      {event.paymentDate && (
                          <div className="sm:col-span-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 w-fit">
                            תאריך תשלום: {new Date(event.paymentDate + 'T12:00:00').toLocaleDateString('he-IL')}
                          </div>
                      )}
                      {event.notes && (
                          <div className="sm:col-span-2 flex items-start gap-2 text-slate-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
                             <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                             <span className="text-xs font-medium break-words">{event.notes}</span>
                          </div>
                      )}
                      {event.giDocId && (
                        <div className="sm:col-span-2">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100"
                            onClick={() => onEdit(event)}
                            title="פתח לפרטי מסמך"
                          >
                            <FileCheck size={13} />
                            {giDocTypeName(event.giDocType)}
                            {event.giDocNumber ? ` #${event.giDocNumber}` : ''}
                            {event.giDocUrl && (
                              <a
                                href={event.giDocUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="underline mr-1"
                              >
                                הורד
                              </a>
                            )}
                          </span>
                        </div>
                      )}
                  </div>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap gap-4 xl:flex-nowrap xl:shrink-0 xl:border-s xl:border-slate-200 xl:ps-6 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100">
                  <div className="space-y-1.5 min-w-[9rem]">
                      <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
                          <CalendarIcon size={16} className="text-blue-500 shrink-0" />
                          {new Date(event.date).toLocaleDateString('he-IL')}
                      </div>
                      {event.hebrewDate && <div className="text-xs text-slate-500 italic">{event.hebrewDate}</div>}
                      <div className="text-sm text-slate-600 flex items-center gap-1.5">
                          <Clock size={14} className="text-green-500 shrink-0" />
                          {event.startTime} - {event.endTime}
                      </div>
                  </div>

                  <div className="space-y-1.5 min-w-[5rem]">
                     <div className="text-lg font-bold text-slate-800">₪{event.amount.toLocaleString()}</div>
                     {showDebt && <div className="text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded w-fit">חוב: ₪{debt.toLocaleString()}</div>}
                  </div>

                  <div className="w-full sm:w-auto sm:min-w-[12rem] xl:w-56">
                      <select 
                        value={event.paymentStatus}
                        onChange={(e) => updateEvent(event.id, { paymentStatus: e.target.value as PaymentStatus })}
                        className={`w-full text-xs font-bold p-2.5 rounded-lg border-0 outline-none cursor-pointer ${PAYMENT_STATUS_STYLES[event.paymentStatus]}`}
                      >
                          {Object.values(PaymentStatus).map(s => <option key={s} value={s} className="bg-white text-slate-800">{s}</option>)}
                      </select>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[12rem] xl:w-56">
                      <select
                        value={event.invoiceSent || ''}
                        onChange={(e) => updateEvent(event.id, { invoiceSent: e.target.value || undefined })}
                        className={`w-full text-xs font-bold p-2.5 rounded-lg border-0 outline-none cursor-pointer transition-all ${
                          event.invoiceSent
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <option value="">📄 חשבונית – לא נשלחה</option>
                        <option value="חשבון עסקה">✓ חשבון עסקה</option>
                        <option value="חשבונית מס">✓ חשבונית מס</option>
                        <option value="חשבונית מס/קבלה">✓ חשבונית מס/קבלה</option>
                        <option value="קבלה">✓ קבלה</option>
                      </select>
                  </div>
              </div>
            </div>

              <div className="border-t border-slate-100 pt-3">
                {linkedTask ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-purple-600 mb-1">📋 משימה מקושרת:</div>
                      <div className="text-sm font-bold text-slate-800 break-words">{linkedTask.title}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {linkedTask.isCompleted ? (
                        <span className="text-xs font-bold bg-green-500 text-white px-3 py-1 rounded-lg">✓ הושלמה</span>
                      ) : linkedTask.progress > 0 ? (
                        <span className="text-xs font-bold bg-blue-500 text-white px-3 py-1 rounded-lg">⏳ {linkedTask.progress}%</span>
                      ) : (
                        <span className="text-xs font-bold bg-slate-300 text-slate-700 px-3 py-1 rounded-lg">⏸️ ממתינה</span>
                      )}
                      <button 
                        type="button"
                        onClick={() => updateEvent(event.id, { taskId: undefined })}
                        className="text-red-500 hover:bg-red-50 p-1 rounded transition-all"
                        title="נתק משימה"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onCreateTask?.(event)}
                      className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg border-2 border-purple-300 transition-all flex items-center gap-1"
                    >
                      <Plus size={14} />
                      צור משימה חדשה
                    </button>
                  </div>
                )}
              </div>
          </div>
      </div>
  );
};

const EventsBoard: React.FC = () => {
  const { events, customers, getCustomerById, importEvents, addTask, updateEvent, applyPaymentDatesFromImport } = useApp();
  const [searchParams] = useSearchParams();
  const highlightEventId = searchParams.get('eventId');
  const [searchTerm, setSearchTerm] = useState('');
  const [eventModal, setEventModal] = useState<
    { type: 'edit'; event: AppEvent } | { type: 'new'; preselectedCustomerId?: string; draftKey: number } | null
  >(null);
  const [creatingTaskForEvent, setCreatingTaskForEvent] = useState<AppEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paymentCsvRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'all' | 'unpaid'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());
  const [newTask, setNewTask] = useState({ title: '', category: 'כללי' as any, priority: 3 });
  
  const ALL_EVENT_TYPE_VALUES = Object.values(EventType);

  const allEventTypes = useMemo(() => {
    const types = new Set<string>(ALL_EVENT_TYPE_VALUES);
    events.forEach(e => { if (e.eventType) types.add(e.eventType); });
    return Array.from(types);
  }, [events]);

  const toggleEventTypeFilter = (type: string) => {
    setSelectedEventTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filtered = useMemo(() => {
      return events.filter(e => {
        const cust = getCustomerById(e.customerId);
        const s = searchTerm.toLowerCase();
        const match = e.title.toLowerCase().includes(s) || cust?.name.toLowerCase().includes(s) || (e.externalId || '').toLowerCase().includes(s);
        const typeMatch = selectedEventTypes.size === 0 || selectedEventTypes.has(e.eventType || '');
        return typeMatch && (viewMode === 'all' ? match : (match && e.paymentStatus !== PaymentStatus.Paid));
      });
  }, [events, searchTerm, getCustomerById, viewMode, selectedEventTypes]);

  const groupedEvents = useMemo(() => {
      const groups: Record<string, AppEvent[]> = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      filtered.forEach(e => {
          const eventDate = new Date(e.date);
          eventDate.setHours(0, 0, 0, 0);
          const isFutureEvent = eventDate >= today;
          
          const groupName = isFutureEvent ? FUTURE_EVENTS_GROUP : ((e as any).category || e.tag || 'כללי');
          
          // סינון קטגוריות אם יש בחירה
          if (selectedCategories.size > 0 && !selectedCategories.has(groupName)) {
            return;
          }
          
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(e);
      });
      
      return Object.keys(groups).sort((a, b) => {
          if (a === FUTURE_EVENTS_GROUP) return -1;
          if (b === FUTURE_EVENTS_GROUP) return 1;
          if (a === 'לבדיקה') return -1;
          if (b === 'לבדיקה') return 1;
          return a.localeCompare(b);
      }).reduce((obj: any, key) => {
          obj[key] = groups[key].sort((a, b) => {
              return b.id.localeCompare(a.id);
          });
          return obj;
      }, {});
  }, [filtered, selectedCategories]);

  useEffect(() => {
    setCollapsedGroups(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(groupedEvents).forEach(key => {
        if (next[key] === undefined) {
          next[key] = key !== FUTURE_EVENTS_GROUP;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groupedEvents]);

  useEffect(() => {
    if (!highlightEventId) return;
    // פתיחה אוטומטית של המודל לאירוע הנבחר
    const event = events.find(e => e.id === highlightEventId);
    if (event) setEventModal({ type: 'edit', event });
    // גלילה לשורה
    const t = window.setTimeout(() => {
      const el = document.getElementById(`event-row-${highlightEventId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('ring-4', 'ring-purple-400', 'ring-offset-2', 'rounded-xl');
      window.setTimeout(() => el?.classList.remove('ring-4', 'ring-purple-400', 'ring-offset-2', 'rounded-xl'), 2800);
    }, 400);
    return () => window.clearTimeout(t);
  }, [highlightEventId, events.length]);

  const toggleGroup = (group: string) => {
      setCollapsedGroups(prev => ({...prev, [group]: !prev[group]}));
  };

  const toggleAllGroups = (collapse: boolean) => {
      const next: Record<string, boolean> = {};
      Object.keys(groupedEvents).forEach(k => next[k] = collapse);
      setCollapsedGroups(next);
  };

  const handleCreateTaskForEvent = () => {
    if (!creatingTaskForEvent || !newTask.title.trim()) return;
    const taskId = `t_${Date.now()}`;
    addTask({
      id: taskId,
      title: newTask.title,
      category: newTask.category,
      priority: newTask.priority,
      isCompleted: false,
      progress: 0,
      estimatedTimeMin: 30,
    });
    updateEvent(creatingTaskForEvent.id, { taskId });
    setNewTask({ title: '', category: 'כללי', priority: 3 });
    setCreatingTaskForEvent(null);
  };

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    events.forEach(e => {
      const eventDate = new Date(e.date);
      eventDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isFutureEvent = eventDate >= today;
      const groupName = isFutureEvent ? FUTURE_EVENTS_GROUP : ((e as any).category || e.tag || 'כללי');
      cats.add(groupName);
    });
    return Array.from(cats).sort();
  }, [events]);

  const totalRevenueFiltered = useMemo(() => {
    const eventsToCount = selectedCategories.size === 0 
      ? Object.values(groupedEvents).flat()
      : Object.entries(groupedEvents)
          .filter(([cat]) => selectedCategories.has(cat))
          .map(([, list]) => list).flat();
    return eventsToCount.reduce((sum, e: AppEvent) => sum + (e.paidAmount || 0), 0);
  }, [groupedEvents, selectedCategories]);

  const toggleCategoryFilter = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const matchedCustomersForSearch = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return customers.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.companyName && c.companyName.toLowerCase().includes(q))
    );
  }, [customers, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-slate-800">אירועים</h2>
              <p className="text-slate-500">ניהול לוח זמנים, סיווגים וגבייה</p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg">
              <div className="text-xs font-bold opacity-90">סך הכנסות</div>
              <div className="text-2xl font-black">₪{totalRevenueFiltered.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if(file) { importEvents(await parseCSV(file)); alert('ייבוא וסנכרון הושלם!'); } }} className="hidden" accept=".csv" />
          <input type="file" ref={paymentCsvRef} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const rows = await parseCSV(file); const n = applyPaymentDatesFromImport(rows as Record<string, unknown>[]); alert(n ? `עודכנו תאריכי תשלום ל-${n} אירועים` : 'לא נמצאו התאמות. וודאו שיש בעמודות Item ID ותאריך תשלום, ושהמזהה תואם לאירוע.'); } finally { e.target.value = ''; } }} className="hidden" accept=".csv" />
          <button
            type="button"
            onClick={() => setEventModal({ type: 'new', draftKey: Date.now() })}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg hover:bg-purple-700 transition-all"
          >
            <Plus size={18} /> הוסף אירוע
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white border px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm hover:bg-slate-50 transition-all"><Upload size={18} /> ייבוא</button>
          <button type="button" title="קובץ נתוני אירועים: Item ID + תאריך תשלום" onClick={() => paymentCsvRef.current?.click()} className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm hover:bg-amber-100 transition-all"><CalendarIcon size={18} /> תאריכי תשלום</button>
          <button onClick={() => setViewMode(v => v === 'all' ? 'unpaid' : 'all')} className={`px-4 py-2 rounded-xl font-bold transition-all shadow-sm ${viewMode === 'unpaid' ? 'bg-red-500 text-white' : 'bg-white text-slate-700 border'}`}>
            {viewMode === 'unpaid' ? 'הצג הכל' : 'הצג חובות'}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="חפש לפי שם, ID או תגית..." className="w-full pr-10 pl-4 py-3 bg-white border rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-purple-100" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>
          <div className="flex gap-2">
              <button onClick={() => toggleAllGroups(false)} className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">פתח הכל</button>
              <button onClick={() => toggleAllGroups(true)} className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">כווץ הכל</button>
          </div>
      </div>

      {searchTerm.trim() && matchedCustomersForSearch.length > 0 && (
        <div className="bg-gradient-to-l from-purple-50 to-white border border-purple-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
            <UserPlus size={18} className="text-purple-600" />
            לקוחות תואמים לחיפוש — אירוע חדש בלי טופס הזמנה
          </h3>
          <div className="flex flex-wrap gap-2">
            {matchedCustomersForSearch.map(c => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
              >
                <span className="font-bold text-slate-800">{c.name}</span>
                <span className="text-slate-500 text-xs">{c.phone}</span>
                <button
                  type="button"
                  onClick={() => setEventModal({ type: 'new', preselectedCustomerId: c.id, draftKey: Date.now() })}
                  className="text-xs font-bold bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
                >
                  + אירוע ללקוח
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-700">🏷️ סנן קטגוריות:</h3>
          <div className="flex gap-2">
            <button onClick={() => setSelectedCategories(new Set(allCategories))} className="text-xs font-bold text-blue-600 hover:underline">בחר הכל</button>
            <button onClick={() => setSelectedCategories(new Set())} className="text-xs font-bold text-slate-500 hover:underline">נקה הכל</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => toggleCategoryFilter(cat)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                selectedCategories.size === 0 || selectedCategories.has(cat)
                  ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                  : 'bg-slate-100 text-slate-400 border-2 border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Event Type Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-700">🎯 סנן לפי סוג אירוע:</h3>
          <div className="flex gap-2">
            <button onClick={() => setSelectedEventTypes(new Set(allEventTypes))} className="text-xs font-bold text-green-600 hover:underline">בחר הכל</button>
            <button onClick={() => setSelectedEventTypes(new Set())} className="text-xs font-bold text-slate-500 hover:underline">נקה הכל</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allEventTypes.map(type => {
            const count = events.filter(e => e.eventType === type).length;
            const isActive = selectedEventTypes.size === 0 || selectedEventTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleEventTypeFilter(type)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-green-100 text-green-800 border-2 border-green-300'
                    : 'bg-slate-100 text-slate-400 border-2 border-transparent'
                }`}
              >
                {type}
                <span className={`mr-1 font-black ${isActive ? 'text-green-600' : 'text-slate-400'}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedEvents).map(([group, list]: [string, any]) => {
            const totalRevenue = list.reduce((sum: number, e: AppEvent) => sum + (e.paidAmount || 0), 0);
            const totalAmount = list.reduce((sum: number, e: AppEvent) => sum + e.amount, 0);
            
            return (
            <div key={group} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button 
                    onClick={() => toggleGroup(group)}
                    className={`w-full flex items-center justify-between py-3 px-5 ${getHeaderBg(group)} hover:opacity-90 transition-all shadow-sm`}
                >
                    <div className="flex items-center gap-4">
                        <span className="px-3 py-1.5 rounded-full text-xs font-black bg-white/30 text-white backdrop-blur-sm shadow-sm">{group}</span>
                        <span className="text-sm font-bold text-white/95">{list.length} אירועים</span>
                        <span className="text-sm font-black text-white/95" title="סכום ששולם בפועל מהאירועים בקבוצה">
                          שולם: ₪{totalRevenue.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-white/85" title="סכום חיוב כולל לפני ניכוי שולם">
                          {' '}/ סה״כ חיוב: ₪{totalAmount.toLocaleString()}
                        </span>
                    </div>
                    {collapsedGroups[group] ? <ChevronDown size={22} className="text-white" /> : <ChevronUp size={22} className="text-white" />}
                </button>
                {!collapsedGroups[group] && (
                    <div className="divide-y divide-slate-50">
                        {list.map((e: AppEvent) => (
                          <EventRow
                            key={e.id}
                            event={e}
                            onEdit={ev => setEventModal({ type: 'edit', event: ev })}
                            onCreateTask={setCreatingTaskForEvent}
                          />
                        ))}
                    </div>
                )}
            </div>
        )})}
      </div>

      {eventModal?.type === 'edit' && (
        <EditEventModal event={eventModal.event} onClose={() => setEventModal(null)} />
      )}
      {eventModal?.type === 'new' && (
        <EditEventModal
          key={eventModal.draftKey}
          isNew
          preselectedCustomerId={eventModal.preselectedCustomerId}
          onClose={() => setEventModal(null)}
        />
      )}
      
      {creatingTaskForEvent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold">משימה חדשה – {creatingTaskForEvent.title}</h3>
                  <button onClick={() => { setCreatingTaskForEvent(null); setNewTask({ title: '', category: 'כללי', priority: 3 }); }}><X size={24}/></button>
                </div>
                <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400">שם המשימה</label>
                      <input className="w-full p-3 border rounded-lg font-bold" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="הקלד שם משימה..."/>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400">קטגוריה</label>
                      <select className="w-full p-3 border rounded-lg font-bold" value={newTask.category} onChange={e => setNewTask({...newTask, category: e.target.value as any})}>
                        <option value="קליכיף">קליכיף</option>
                        <option value="אישי">אישי</option>
                        <option value="בית">בית</option>
                        <option value="תוכנית מדע">תוכנית מדע</option>
                        <option value="שיווק">שיווק</option>
                        <option value="כללי">כללי</option>
                        <option value="דחוף / לסיווג">דחוף / לסיווג</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400">עדיפות (1=נמוך, 5=גבוה)</label>
                      <input type="number" min="1" max="5" className="w-full p-3 border rounded-lg font-bold" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: Number(e.target.value)})}/>
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setCreatingTaskForEvent(null); setNewTask({ title: '', category: 'כללי', priority: 3 }); }} className="px-4 py-2 font-bold text-slate-400">ביטול</button>
                  <button onClick={handleCreateTaskForEvent} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold">צור משימה</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default EventsBoard;
