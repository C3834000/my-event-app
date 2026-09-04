
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { EventStatus, PaymentStatus, EventType, AppEvent, PaymentMethod } from '../types';
import { Plus, Search, Calendar as CalendarIcon, Download, X, MapPin, Users, Clock, ChevronDown, ChevronUp, MousePointer2, Info, Upload, Edit, UserPlus, FileCheck } from 'lucide-react';
import { exportToCSV, parseCSV } from '../services/utils';
import { useSearchParams } from 'react-router-dom';
import EditEventModal from '../components/EditEventModal';
import { EVENT_TAGS } from '../constants/eventBoard';
import { giDocTypeName } from '../services/greenInvoice';
import { eventHasOpenBalance, eventYearKey } from '../services/eventKpi';

const TODAY_KEY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const YEAR_START_KEY = () => `${new Date().getFullYear()}-01-01`;
const normalizeEventTag = (tag?: string) => {
  const raw = (tag || 'קליכיף').trim() || 'קליכיף';
  return raw
    .replace(/"/g, '״')
    .replace(/'/g, '׳')
    .replace('גפן תשפ״ה', 'גפן תשפ״ה')
    .replace('גפן תשפ"ה', 'גפן תשפ״ה')
    .replace('גפן תשפ"ד', 'גפן תשפ״ד')
    .replace('זה"ב - עיריית י-ם', 'זה״ב - עיריית י-ם');
};

const getBusinessCategory = (event: AppEvent) => normalizeEventTag(event.tag);
const isFutureEvent = (event: AppEvent) => dateKey(event.date) >= TODAY_KEY();

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

const eventBoardGroupKey = (event: AppEvent) => {
  if (isFutureEvent(event)) return '01 · אירועים עתידיים';
  if (eventHasOpenBalance(event)) return '02 · גבייה פתוחה';
  return `03 · ארכיון · ${eventYearKey(event)} · ${getBusinessCategory(event)}`;
};

const eventBoardGroupLabel = (group: string) => group.replace(/^\d{2} · /, '');

const getHeaderBg = (category: string) => {
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

const EVENT_FILTERS_STORAGE_KEY = 'ME_CFM_EVENT_BOARD_FILTERS_V2';

const dateKey = (value?: string) => (value || '').slice(0, 10);

/** נרמול לחיפוש לפי סכום: מסיר פסיקים, רווחים וסימן ₪ */
const digitsOnly = (v: string) => v.replace(/[,₪\s]/g, '');

/** התאמה חלקית של סכום — "429" ימצא גם 4,290 וגם 14,290, עם או בלי פסיקים */
const amountMatches = (searchRaw: string, event: AppEvent): boolean => {
  const q = digitsOnly(searchRaw.trim());
  if (!q || !/^\d+$/.test(q)) return false;
  return String(event.amount ?? '').includes(q) || String(event.paidAmount ?? '').includes(q);
};

const MultiSelectFilter: React.FC<{
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  getCount?: (option: string) => number;
}> = ({ label, options, selected, onChange, getCount }) => {
  const [open, setOpen] = useState(false);
  // סט ריק = הכל נבחר (אין סינון) — מוצג כ"הכל מסומן"
  const allSelected = selected.size === 0 || selected.size === options.length;
  const summary = allSelected ? 'הכל' : `${selected.size} נבחרו`;

  const toggle = (option: string) => {
    // כשהסט ריק (=הכל), ביטול סימון אחד יוצר "הכל חוץ ממנו"
    const base = selected.size === 0 ? new Set(options) : new Set(selected);
    if (base.has(option)) base.delete(option);
    else base.add(option);
    // אם חזרנו למצב שהכל מסומן — חוזרים לסט ריק (=ללא סינון)
    onChange(base.size === options.length ? new Set() : base);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`bg-white border rounded-lg px-2.5 py-1.5 text-right shadow-sm transition-all flex items-center gap-1.5 ${allSelected ? 'border-slate-200 hover:border-purple-300' : 'border-purple-400 bg-purple-50'}`}
      >
        <span className="text-[11px] font-black text-slate-400">{label}:</span>
        <span className={`text-xs font-black truncate ${allSelected ? 'text-slate-700' : 'text-purple-700'}`}>{summary}</span>
        <ChevronDown size={13} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-40 top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button type="button" onClick={() => onChange(new Set())} className="text-xs font-black bg-purple-50 text-purple-700 rounded-lg py-2">סמן הכל</button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-black bg-slate-50 text-slate-600 rounded-lg py-2">סגור</button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {options.map(option => {
              const checked = selected.size === 0 || selected.has(option);
              return (
                <label key={option} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(option)}
                    className="w-4 h-4 accent-purple-600 shrink-0"
                  />
                  <span className="text-xs font-bold text-slate-700 flex-1 break-words">{option}</span>
                  {getCount && <span className="text-[10px] font-black text-slate-400">{getCount(option)}</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const EventRow: React.FC<{ event: AppEvent; onEdit: (ev: AppEvent) => void; onCreateTask?: (event: AppEvent) => void }> = ({ event, onEdit, onCreateTask }) => {
  const { getCustomerById, updateEvent, tasks } = useApp();
  const linkedTask = tasks.find(t => t.id === event.taskId);
  const customer = getCustomerById(event.customerId);
  const debt = event.amount - event.paidAmount;
  const isPaid = [PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck, PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider].includes(event.paymentStatus);
  const showDebt = !isPaid && debt > 0;
  const businessCategory = getBusinessCategory(event);

  return (
      <div id={`event-row-${event.id}`} className="bg-white border-b border-slate-100 px-3 py-2.5 sm:px-4 hover:bg-slate-50 transition-colors group rounded-lg sm:rounded-none">
          <div className="flex flex-col gap-1.5">
              {/* שורה 1: ID + שם + תגיות + עריכה */}
              <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{event.externalId || 'ID לא זמין'}</span>
                      <h4 className="text-sm sm:text-base font-bold text-slate-800 break-words">{event.title}</h4>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${EVENT_TAGS[businessCategory] || 'bg-slate-400 text-white'}`}>{businessCategory}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${EVENT_TYPE_STYLES[event.eventType] || 'bg-slate-500 text-white'}`}>{event.eventType}</span>
                      {event.clickersNeeded > 0 && (
                         <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md text-[11px] font-bold border border-indigo-200">
                            <MousePointer2 size={11} /> {event.clickersNeeded} קליקרים
                         </span>
                       )}
                  </div>
                  <button type="button" onClick={() => onEdit(event)} className="p-1.5 hover:bg-purple-100 text-slate-400 hover:text-purple-600 rounded-lg transition-colors shrink-0"><Edit size={17} /></button>
              </div>

              {/* שורה 2: לקוח · טלפון · תאריך · שעות · סכום · חוב */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span className="flex items-center gap-1.5 min-w-0">
                     <Users size={14} className="text-purple-500 shrink-0" />
                     <span className="font-medium truncate max-w-[14rem]">{customer?.name || event.title || 'לא משויך ללקוח'}</span>
                  </span>
                  {event.phone && (
                      <a href={`tel:${event.phone}`} className="flex items-center gap-1 font-medium hover:text-purple-600">📞 {event.phone}</a>
                  )}
                  <span className="flex items-center gap-1.5 font-bold text-slate-800">
                      <CalendarIcon size={14} className="text-blue-500 shrink-0" />
                      {new Date(event.date).toLocaleDateString('he-IL')}
                      {event.hebrewDate && <span className="text-xs text-slate-500 italic font-normal">({event.hebrewDate})</span>}
                  </span>
                  <span className="flex items-center gap-1 text-slate-600">
                      <Clock size={13} className="text-green-500 shrink-0" />
                      {event.startTime} - {event.endTime}
                  </span>
                  <span className="font-bold text-slate-800">₪{event.amount.toLocaleString()}</span>
                  {showDebt && <span className="text-xs text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">חוב: ₪{debt.toLocaleString()}</span>}
                  {event.paymentDate && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        שולם: {new Date(event.paymentDate + 'T12:00:00').toLocaleDateString('he-IL')}
                      </span>
                  )}
              </div>

              {/* שורה אופציונלית: מייל / מיקום / הערות / מסמך ח"י */}
              {(event.email || event.location || event.notes || event.giDocId) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {event.email && (
                        <a href={`mailto:${event.email}`} className="flex items-center gap-1 hover:text-purple-600 truncate max-w-[16rem]">📧 {event.email}</a>
                    )}
                    {event.location && (
                        <span className="flex items-center gap-1 min-w-0">
                           <MapPin size={12} className="text-purple-500 shrink-0" />
                           <span className="truncate max-w-[18rem]">{event.location}</span>
                        </span>
                    )}
                    {event.notes && (
                        <span className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 min-w-0">
                           <Info size={11} className="text-amber-600 shrink-0" />
                           <span className="font-medium truncate max-w-[22rem]" title={event.notes}>{event.notes}</span>
                        </span>
                    )}
                    {event.giDocId && (
                      <span
                        className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer hover:bg-emerald-100"
                        onClick={() => onEdit(event)}
                        title="פתח לפרטי מסמך"
                      >
                        <FileCheck size={12} />
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
                    )}
                </div>
              )}

              {/* שורה 3: סטטוסים + משימה */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <select 
                    value={event.paymentStatus}
                    onChange={(e) => updateEvent(event.id, { paymentStatus: e.target.value as PaymentStatus })}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border-0 outline-none cursor-pointer w-full sm:w-44 ${PAYMENT_STATUS_STYLES[event.paymentStatus]}`}
                  >
                      {Object.values(PaymentStatus).map(s => <option key={s} value={s} className="bg-white text-slate-800">{s}</option>)}
                  </select>
                  <select
                    value={event.invoiceSent || ''}
                    onChange={(e) => updateEvent(event.id, { invoiceSent: e.target.value || undefined })}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border-0 outline-none cursor-pointer transition-all w-full sm:w-44 ${
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
                  {linkedTask ? (
                    <span className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1 text-xs min-w-0">
                      <span className="font-bold text-purple-600 shrink-0">📋</span>
                      <span className="font-bold text-slate-800 truncate max-w-[14rem]" title={linkedTask.title}>{linkedTask.title}</span>
                      {linkedTask.isCompleted ? (
                        <span className="font-bold bg-green-500 text-white px-1.5 py-0.5 rounded shrink-0">✓</span>
                      ) : linkedTask.progress > 0 ? (
                        <span className="font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded shrink-0">{linkedTask.progress}%</span>
                      ) : (
                        <span className="font-bold bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded shrink-0">⏸️</span>
                      )}
                      <button 
                        type="button"
                        onClick={() => updateEvent(event.id, { taskId: undefined })}
                        className="text-red-500 hover:bg-red-50 p-0.5 rounded transition-all shrink-0"
                        title="נתק משימה"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCreateTask?.(event)}
                      className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-2.5 py-1.5 rounded-lg border border-purple-300 transition-all flex items-center gap-1"
                    >
                      <Plus size={13} />
                      משימה
                    </button>
                  )}
              </div>
          </div>
      </div>
  );
};

const EventsBoard: React.FC = () => {
  const { events, customers, getCustomerById, importEvents, addTask, updateEvent, applyPaymentDatesFromImport, reloadFromCloud } = useApp();
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
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<Set<string>>(new Set());
  const [selectedEventStatuses, setSelectedEventStatuses] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(YEAR_START_KEY());
  const [dateTo, setDateTo] = useState(TODAY_KEY());
  const [newTask, setNewTask] = useState({ title: '', category: 'כללי' as any, priority: 3 });
  const [cloudRefreshing, setCloudRefreshing] = useState(false);
  
  const ALL_EVENT_TYPE_VALUES = Object.values(EventType);

  const allEventTypes = useMemo(() => {
    const types = new Set<string>(ALL_EVENT_TYPE_VALUES);
    events.forEach(e => { if (e.eventType) types.add(e.eventType); });
    return Array.from(types);
  }, [events]);

  const allPaymentStatuses = useMemo(() => {
    const s = new Set<string>(Object.values(PaymentStatus));
    events.forEach(e => { if (e.paymentStatus) s.add(e.paymentStatus); });
    return Array.from(s);
  }, [events]);

  const allEventStatuses = useMemo(() => {
    const s = new Set<string>(Object.values(EventStatus));
    events.forEach(e => { if (e.status) s.add(e.status); });
    return Array.from(s);
  }, [events]);

  useEffect(() => {
    void reloadFromCloud().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EVENT_FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.years)) setSelectedYears(new Set(saved.years));
      if (Array.isArray(saved.categories)) setSelectedCategories(new Set(saved.categories));
      if (Array.isArray(saved.eventTypes)) setSelectedEventTypes(new Set(saved.eventTypes));
      if (Array.isArray(saved.paymentStatuses)) setSelectedPaymentStatuses(new Set(saved.paymentStatuses));
      if (Array.isArray(saved.eventStatuses)) setSelectedEventStatuses(new Set(saved.eventStatuses));
      if (typeof saved.dateFrom === 'string') setDateFrom(saved.dateFrom || YEAR_START_KEY());
      if (typeof saved.dateTo === 'string') setDateTo(saved.dateTo || TODAY_KEY());
    } catch {
      // Ignore invalid saved filters.
    }
  }, []);

  // שמירה אוטומטית של הסינונים בכל שינוי — אין צורך בכפתור "שמירת בחירה"
  const skipFirstFilterSave = useRef(true);
  useEffect(() => {
    if (skipFirstFilterSave.current) { skipFirstFilterSave.current = false; return; }
    localStorage.setItem(EVENT_FILTERS_STORAGE_KEY, JSON.stringify({
      years: Array.from(selectedYears),
      categories: Array.from(selectedCategories),
      eventTypes: Array.from(selectedEventTypes),
      paymentStatuses: Array.from(selectedPaymentStatuses),
      eventStatuses: Array.from(selectedEventStatuses),
      dateFrom,
      dateTo,
    }));
  }, [selectedYears, selectedCategories, selectedEventTypes, selectedPaymentStatuses, selectedEventStatuses, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setSelectedYears(new Set());
    setSelectedCategories(new Set());
    setSelectedEventTypes(new Set());
    setSelectedPaymentStatuses(new Set());
    setSelectedEventStatuses(new Set());
    // בלי טווח תאריכים — אחרת אירועים משנים קודמות / מעבר להיום נשארים מוסתרים
    setDateFrom('');
    setDateTo('');
    setViewMode('all');
    localStorage.removeItem(EVENT_FILTERS_STORAGE_KEY);
  };

  /** מנקה סינונים ופותח קבוצות כדי להציג תוצאות חיפוש מוסתרות */
  const revealHiddenSearchResults = () => {
    clearAllFilters();
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[k] = false;
      });
      return next;
    });
    const firstId = hiddenByFilters[0]?.id;
    if (firstId) {
      window.setTimeout(() => {
        const el = document.getElementById(`event-row-${firstId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2', 'rounded-xl');
        window.setTimeout(() => el?.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2', 'rounded-xl'), 2500);
      }, 150);
    }
  };

  const filtered = useMemo(() => {
      return events.filter(e => {
        const cust = e.customerId ? getCustomerById(e.customerId) : undefined;
        const s = searchTerm.toLowerCase();
        const title = String(e.title || '').toLowerCase();
        const match =
          !s ||
          title.includes(s) ||
          (cust?.name || '').toLowerCase().includes(s) ||
          String(e.externalId || '').toLowerCase().includes(s) ||
          String(e.phone || '').includes(searchTerm.trim()) ||
          String(e.email || '').toLowerCase().includes(s) ||
          amountMatches(searchTerm, e);
        const yearMatch = selectedYears.size === 0 || selectedYears.has(eventYearKey(e));
        const categoryMatch = selectedCategories.size === 0 || selectedCategories.has(getBusinessCategory(e));
        const typeMatch = selectedEventTypes.size === 0 || selectedEventTypes.has(e.eventType || '');
        // תאימות לסינון ישן: «לא שולם» ≡ «טרם שולם»
        const paymentStatusMatch =
          selectedPaymentStatuses.size === 0 ||
          selectedPaymentStatuses.has(e.paymentStatus || '') ||
          (e.paymentStatus === PaymentStatus.NotPaid && selectedPaymentStatuses.has('לא שולם')) ||
          (e.paymentStatus === 'לא שולם' && selectedPaymentStatuses.has(PaymentStatus.NotPaid));
        const eventStatusMatch = selectedEventStatuses.size === 0 || selectedEventStatuses.has(e.status || '');
        const eventDate = dateKey(e.date);
        const dateMatch = isFutureEvent(e) || ((!dateFrom || eventDate >= dateFrom) && (!dateTo || eventDate <= dateTo));
        const modeMatch = viewMode === 'all' || eventHasOpenBalance(e);
        return match && yearMatch && categoryMatch && typeMatch && paymentStatusMatch && eventStatusMatch && dateMatch && modeMatch;
      });
  }, [events, searchTerm, getCustomerById, viewMode, selectedYears, selectedCategories, selectedEventTypes, selectedPaymentStatuses, selectedEventStatuses, dateFrom, dateTo]);

  /** אירועים שתואמים לחיפוש אבל מוסתרים בגלל סינון פעיל */
  const hiddenByFilters = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return [] as AppEvent[];
    const filteredIds = new Set(filtered.map(e => e.id));
    return events.filter(e => {
      if (filteredIds.has(e.id)) return false;
      const title = String(e.title || '').toLowerCase();
      const cust = e.customerId ? getCustomerById(e.customerId) : undefined;
      return (
        title.includes(s) ||
        (cust?.name || '').toLowerCase().includes(s) ||
        String(e.phone || '').includes(searchTerm.trim()) ||
        amountMatches(searchTerm, e)
      );
    });
  }, [searchTerm, events, filtered, getCustomerById]);

  const groupedEvents = useMemo(() => {
      const groups: Record<string, AppEvent[]> = {};
      
      filtered.forEach(e => {
          const groupName = eventBoardGroupKey(e);
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(e);
      });
      
      return Object.keys(groups).sort((a, b) => {
          const rankA = a.slice(0, 2);
          const rankB = b.slice(0, 2);
          if (rankA !== rankB) return rankA.localeCompare(rankB);
          const partsA = a.split(' · ');
          const partsB = b.split(' · ');
          const yearA = partsA[2] || '';
          const yearB = partsB[2] || '';
          const categoryA = partsA[3] || partsA[1] || '';
          const categoryB = partsB[3] || partsB[1] || '';
          if (rankA === '04' && yearA !== yearB) return yearB.localeCompare(yearA);
          if (categoryA === 'לבדיקה') return -1;
          if (categoryB === 'לבדיקה') return 1;
          return a.localeCompare(b);
      }).reduce((obj: any, key) => {
          obj[key] = groups[key].sort((a, b) => {
              const da = dateKey(a.date);
              const db = dateKey(b.date);
              const ascending = key.startsWith('01') || key.startsWith('02') || viewMode === 'unpaid';
              if (da !== db) return ascending ? da.localeCompare(db) : db.localeCompare(da);
              return b.id.localeCompare(a.id);
          });
          return obj;
      }, {});
  }, [filtered, viewMode]);

  useEffect(() => {
    setCollapsedGroups(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(groupedEvents).forEach(key => {
        if (next[key] === undefined) {
          next[key] = false;
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
    events.forEach(e => cats.add(getBusinessCategory(e)));
    return Array.from(cats).sort();
  }, [events]);

  const allYears = useMemo(() => {
    const years = new Set<string>();
    events.forEach(e => years.add(eventYearKey(e)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [events]);

  const totalRevenueFiltered = useMemo(() => {
    const eventsToCount = Object.values(groupedEvents).flat();
    return eventsToCount.reduce((sum, e: AppEvent) => sum + (e.paidAmount || 0), 0);
  }, [groupedEvents]);

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
    <div className="space-y-4">
      {/* אזור עליון קבוע — כותרת, חיפוש וסינון לא נגללים עם הרשימה */}
      <div className="sticky top-0 z-30 bg-slate-50 -mx-4 md:-mx-8 -mt-4 md:-mt-8 px-4 md:px-8 pt-4 md:pt-5 pb-3 border-b border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800">אירועים</h2>
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-1.5 rounded-xl shadow flex items-baseline gap-2">
              <span className="text-xs font-bold opacity-90">סך הכנסות</span>
              <span className="text-lg font-black">₪{totalRevenueFiltered.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if(file) { importEvents(await parseCSV(file)); alert('ייבוא וסנכרון הושלם!'); } }} className="hidden" accept=".csv" />
            <input type="file" ref={paymentCsvRef} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const rows = await parseCSV(file); const n = applyPaymentDatesFromImport(rows as Record<string, unknown>[]); alert(n ? `עודכנו תאריכי תשלום ל-${n} אירועים` : 'לא נמצאו התאמות. וודאו שיש בעמודות Item ID ותאריך תשלום, ושהמזהה תואם לאירוע.'); } finally { e.target.value = ''; } }} className="hidden" accept=".csv" />
            <button
              type="button"
              onClick={() => setEventModal({ type: 'new', draftKey: Date.now() })}
              className="bg-purple-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-bold shadow hover:bg-purple-700 transition-all"
            >
              <Plus size={16} /> הוסף אירוע
            </button>
            <button
              type="button"
              disabled={cloudRefreshing}
              onClick={async () => {
                setCloudRefreshing(true);
                try {
                  await reloadFromCloud();
                } catch (e) {
                  alert((e as Error).message || 'רענון מהענן נכשל');
                } finally {
                  setCloudRefreshing(false);
                }
              }}
              className="bg-white border px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-bold shadow-sm hover:bg-slate-50 transition-all disabled:opacity-60"
            >
              <Download size={16} /> {cloudRefreshing ? 'מרענן…' : 'רענן מהענן'}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white border px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-bold shadow-sm hover:bg-slate-50 transition-all"><Upload size={16} /> ייבוא</button>
            <button type="button" title="קובץ נתוני אירועים: Item ID + תאריך תשלום" onClick={() => paymentCsvRef.current?.click()} className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-bold shadow-sm hover:bg-amber-100 transition-all"><CalendarIcon size={16} /> תאריכי תשלום</button>
            <button onClick={() => setViewMode(v => v === 'all' ? 'unpaid' : 'all')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all shadow-sm ${viewMode === 'unpaid' ? 'bg-red-500 text-white' : 'bg-white text-slate-700 border'}`}>
              {viewMode === 'unpaid' ? 'הצג הכל' : 'הצג חובות'}
            </button>
          </div>
        </div>

        {/* חיפוש + סינונים בשורה אחת */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input type="text" placeholder="חפש שם, ID, תגית או סכום..." className="w-full pr-8 pl-3 py-1.5 text-sm bg-white border rounded-lg outline-none shadow-sm focus:ring-2 focus:ring-purple-100" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>
          <MultiSelectFilter
            label="שנים"
            options={allYears}
            selected={selectedYears}
            onChange={setSelectedYears}
            getCount={(year) => events.filter(e => eventYearKey(e) === year).length}
          />
          <MultiSelectFilter
            label="תחומים"
            options={allCategories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            getCount={(cat) => events.filter(e => getBusinessCategory(e) === cat).length}
          />
          <MultiSelectFilter
            label="סוג"
            options={allEventTypes}
            selected={selectedEventTypes}
            onChange={setSelectedEventTypes}
            getCount={(type) => events.filter(e => e.eventType === type).length}
          />
          <MultiSelectFilter
            label="תשלום"
            options={allPaymentStatuses}
            selected={selectedPaymentStatuses}
            onChange={setSelectedPaymentStatuses}
            getCount={(status) => events.filter(e => e.paymentStatus === status || (status === PaymentStatus.NotPaid && e.paymentStatus === 'לא שולם')).length}
          />
          <MultiSelectFilter
            label="סטטוס"
            options={allEventStatuses}
            selected={selectedEventStatuses}
            onChange={setSelectedEventStatuses}
            getCount={(status) => events.filter(e => e.status === status).length}
          />
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-xs font-bold border-0 outline-none w-[7.5rem]"
              title="מתאריך (ריק = ללא הגבלה)"
            />
            <span className="text-xs text-slate-400">עד</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs font-bold border-0 outline-none w-[7.5rem]"
              title="עד תאריך (ריק = ללא הגבלה)"
            />
          </div>
          <button type="button" onClick={clearAllFilters} className="text-xs font-black bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200">ניקוי</button>
          <div className="flex gap-1.5 mr-auto">
              <button onClick={() => toggleAllGroups(false)} className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1.5 rounded-lg">פתח הכל</button>
              <button onClick={() => toggleAllGroups(true)} className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg">כווץ הכל</button>
          </div>
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

      {hiddenByFilters.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-black text-amber-900">
              נמצאו {hiddenByFilters.length} אירועים שתואמים לחיפוש אבל מוסתרים בגלל הסינון הפעיל
            </p>
            <p className="text-xs font-bold text-amber-800 mt-1">
              {hiddenByFilters.slice(0, 5).map(e => e.title).join(' · ')}
              {hiddenByFilters.length > 5 ? '…' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={revealHiddenSearchResults}
            className="shrink-0 bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-amber-700"
          >
            נקה סינונים והצג
          </button>
        </div>
      )}

      {searchTerm.trim() && filtered.length === 0 && hiddenByFilters.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold text-slate-600">
          לא נמצא אירוע תואם בנתונים שנטענו. נסו «רענן מהענן» או בדקו את החיפוש.
        </div>
      )}

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
                        <span className="px-3 py-1.5 rounded-full text-xs font-black bg-white/30 text-white backdrop-blur-sm shadow-sm">{eventBoardGroupLabel(group)}</span>
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
