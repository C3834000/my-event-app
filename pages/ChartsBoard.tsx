import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { settingsService } from '../services/supabase';
import { searchGreenInvoiceIncomeDocuments, type GreenInvoiceIncomeDocument } from '../services/greenInvoice';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, Calendar, Tag, RefreshCw, Wallet, Clock, AlertCircle, CalendarClock, Users, Phone, Plus, Trash2, Heart, ReceiptText, Percent, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Minus, Pencil, X } from 'lucide-react';
import { AppEvent, EventStatus, EventType, PaymentStatus } from '../types';
import {
  eventCategoryKey,
  eventYearKey,
  incomeDateKey,
  incomeYearKey,
  parseEventDateKey,
  excludeEventFromKpis,
  numMoney,
  eventOpenAmount,
} from '../services/eventKpi';
import EditEventModal from '../components/EditEventModal';

type CashflowWeekKind = 'received' | 'expected' | 'eventValue';

type CashflowWeekItem = {
  key: string;
  eventId: string;
  eventTitle: string;
  customerName: string;
  phone: string;
  amount: number;
  kind: CashflowWeekKind;
  date: string;
  paymentStatus: string;
};

type CashflowDrilldown = {
  weekKey: string;
  label: string;
  series: 'all' | CashflowWeekKind;
};

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4', '#84cc16'];

/** מיפוי סטטוס תשלום ל-chip צבעוני קומפקטי */
const STATUS_CHIP: Record<string, { bg: string; text: string; short: string }> = {
  [PaymentStatus.NotPaid]:        { bg: 'bg-rose-100',    text: 'text-rose-700',    short: 'לא שולם' },
  [PaymentStatus.PaidCash]:       { bg: 'bg-emerald-100', text: 'text-emerald-700', short: 'מזומן' },
  [PaymentStatus.Paid]:           { bg: 'bg-emerald-100', text: 'text-emerald-700', short: 'שולם' },
  [PaymentStatus.PaidTransferL]:  { bg: 'bg-emerald-100', text: 'text-emerald-700', short: "העב' ל'" },
  [PaymentStatus.PaidPartial]:    { bg: 'bg-orange-100',  text: 'text-orange-700',  short: 'חלקי' },
  [PaymentStatus.PaidCredit]:     { bg: 'bg-emerald-100', text: 'text-emerald-700', short: 'אשראי' },
  [PaymentStatus.Net30]:          { bg: 'bg-amber-100',   text: 'text-amber-800',   short: 'שוטף+30' },
  [PaymentStatus.PaidCheck]:      { bg: 'bg-emerald-100', text: 'text-emerald-700', short: "צ'ק" },
  [PaymentStatus.Net60]:          { bg: 'bg-amber-100',   text: 'text-amber-800',   short: 'שוטף+60' },
  [PaymentStatus.PaidTransferH]:  { bg: 'bg-emerald-100', text: 'text-emerald-700', short: "העב' ח'" },
  [PaymentStatus.PaidTransferM]:  { bg: 'bg-emerald-100', text: 'text-emerald-700', short: "העב' מ'" },
  [PaymentStatus.PaidProvider]:   { bg: 'bg-emerald-100', text: 'text-emerald-700', short: 'ספק' },
};

const StatusChip = ({ status }: { status?: string }) => {
  if (!status) return null;
  const cfg = STATUS_CHIP[status] || { bg: 'bg-slate-100', text: 'text-slate-600', short: status };
  return (
    <span
      className={`shrink-0 inline-block px-1.5 py-0.5 rounded-md text-[10px] font-black whitespace-nowrap ${cfg.bg} ${cfg.text}`}
      title={status}
    >
      {cfg.short}
    </span>
  );
};

const FINANCE_STORAGE_KEY = 'ME_CFM_FINANCE_ENTRIES_V1';
const GREEN_INVOICE_INCOME_STORAGE_KEY = 'ME_CFM_GREEN_INVOICE_INCOME_V1';

type FinanceEntryType = 'fixedExpense' | 'variableExpense' | 'donation';

type FinanceEntry = {
  id: string;
  type: FinanceEntryType;
  label: string;
  amount: number;
  date: string;
};

const VAT_RATE = 0.18;
const NATIONAL_INSURANCE_RATE = 0.12;
const DONATION_CREDIT_RATE = 0.35;
const DONATION_MINIMUM_2026 = 207;
const DONATION_TAXABLE_INCOME_CAP_RATE = 0.3;

const INCOME_TAX_BRACKETS_2026_MONTHLY = [
  { upTo: 7010, rate: 0.10 },
  { upTo: 10060, rate: 0.14 },
  { upTo: 19000, rate: 0.20 },
  { upTo: 25100, rate: 0.31 },
  { upTo: 46690, rate: 0.35 },
  { upTo: 60130, rate: 0.47 },
  { upTo: Infinity, rate: 0.50 },
];

const FINANCE_SOURCES = [
  {
    label: 'מדרגות מס 2026',
    url: 'https://www.capitax.co.il/Attachments/30032026-1.pdf',
  },
  {
    label: 'מע"מ 18%',
    url: 'https://taxsummaries.pwc.com/israel/corporate/other-taxes',
  },
  {
    label: 'זיכוי תרומות 35%',
    url: 'https://www.jpost.com/business-and-innovation/banking-and-finance/article-886526',
  },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const yearStartIso = () => `${new Date().getFullYear()}-01-01`;

const monthKeyFromIso = (iso: string) => (iso || '').slice(0, 7);
const eventDateKey = (event: AppEvent) => parseEventDateKey(event.date) || '';

const getEntryTypeLabel = (type: FinanceEntryType) => {
  if (type === 'fixedExpense') return 'הוצאה קבועה';
  if (type === 'variableExpense') return 'הוצאה שוטפת';
  return 'תרומה';
};

const calculateProgressiveTaxMonthly = (monthlyIncome: number) => {
  let tax = 0;
  let previous = 0;
  for (const bracket of INCOME_TAX_BRACKETS_2026_MONTHLY) {
    const taxableSlice = Math.max(0, Math.min(monthlyIncome, bracket.upTo) - previous);
    tax += taxableSlice * bracket.rate;
    previous = bracket.upTo;
    if (monthlyIncome <= bracket.upTo) break;
  }
  return tax;
};

const calculateProgressiveTaxAnnual = (annualIncome: number) => {
  let tax = 0;
  let previous = 0;
  for (const bracket of INCOME_TAX_BRACKETS_2026_MONTHLY) {
    const annualLimit = Number.isFinite(bracket.upTo) ? bracket.upTo * 12 : Infinity;
    const taxableSlice = Math.max(0, Math.min(annualIncome, annualLimit) - previous);
    tax += taxableSlice * bracket.rate;
    previous = annualLimit;
    if (annualIncome <= annualLimit) break;
  }
  return tax;
};

const getMarginalTaxRate = (monthlyIncome: number) => {
  const bracket = INCOME_TAX_BRACKETS_2026_MONTHLY.find(b => monthlyIncome <= b.upTo);
  return bracket ? bracket.rate : 0;
};

const vatPartFromGross = (grossAmount: number) => grossAmount - (grossAmount / (1 + VAT_RATE));
const grossExpenseNeededForVatOffset = (vatAmount: number) => vatAmount > 0 ? vatAmount * (1 + VAT_RATE) / VAT_RATE : 0;

const MiniMultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  getCount?: (option: string) => number;
}> = ({ label, options, selected, onChange, getCount }) => {
  const [open, setOpen] = useState(false);
  const summary = selected.size === 0 ? 'הכל' : selected.size === options.length ? 'הכל נבחר' : `${selected.size} נבחרו`;
  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="min-w-[10rem] bg-white border border-slate-200 rounded-xl px-3 py-2 text-right shadow-sm hover:border-indigo-300 transition-all"
      >
        <div className="text-[10px] font-black text-slate-400">{label}</div>
        <div className="text-sm font-black text-slate-800 truncate">{summary}</div>
      </button>
      {open && (
        <div className="absolute z-40 top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <button type="button" onClick={() => onChange(new Set(options))} className="text-xs font-black bg-indigo-50 text-indigo-700 rounded-lg py-2">סמן הכל</button>
            <button type="button" onClick={() => onChange(new Set())} className="text-xs font-black bg-slate-50 text-slate-600 rounded-lg py-2">ניקוי הכל</button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs font-black bg-emerald-50 text-emerald-700 rounded-lg py-2">סגור</button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {options.map(option => (
              <label key={option} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(option)}
                  onChange={() => toggle(option)}
                  className="w-4 h-4 accent-indigo-600 shrink-0"
                />
                <span className="text-xs font-bold text-slate-700 flex-1 break-words">{option}</span>
                {getCount && <span className="text-[10px] font-black text-slate-400">{getCount(option)}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function ChartsBoard() {
  const { events, customers, reloadFromCloud } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>([]);
  const [greenInvoiceIncome, setGreenInvoiceIncome] = useState<GreenInvoiceIncomeDocument[]>([]);
  const [greenInvoiceSyncing, setGreenInvoiceSyncing] = useState(false);
  const [greenInvoiceLastSync, setGreenInvoiceLastSync] = useState('');
  const [financeForm, setFinanceForm] = useState({
    type: 'variableExpense' as FinanceEntryType,
    label: '',
    amount: '',
    date: todayIso(),
  });
  const [financeFilters, setFinanceFilters] = useState({
    dateFrom: yearStartIso(),
    dateTo: todayIso(),
    source: 'gi' as 'gi' | 'systemAndGi',
    includePaid: true,
    includeDated: true,
    includeFuture: true,
    includeOccurredUnpaid: true,
  });
  const [reportFilters, setReportFilters] = useState({
    dateFrom: yearStartIso(),
    dateTo: todayIso(),
    dateMode: 'event' as 'event' | 'payment',
  });
  const [selectedReportYears, setSelectedReportYears] = useState<Set<string>>(new Set());
  const [selectedReportCategories, setSelectedReportCategories] = useState<Set<string>>(new Set());
  const [selectedReportEventTypes, setSelectedReportEventTypes] = useState<Set<string>>(new Set());
  const [selectedReportPaymentStatuses, setSelectedReportPaymentStatuses] = useState<Set<string>>(new Set());
  const [selectedReportEventStatuses, setSelectedReportEventStatuses] = useState<Set<string>>(new Set());
  const [cashflowWindowOffset, setCashflowWindowOffset] = useState(0);
  const [cashflowDrilldown, setCashflowDrilldown] = useState<CashflowDrilldown | null>(null);
  const [editingEvent, setEditingEvent] = useState<AppEvent | null>(null);
  const [selectedFinanceMonthIndex, setSelectedFinanceMonthIndex] = useState(() => new Date().getMonth());
  const [financeLoaded, setFinanceLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const saved = localStorage.getItem(FINANCE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setFinanceEntries(parsed);
      }
      const savedGi = localStorage.getItem(GREEN_INVOICE_INCOME_STORAGE_KEY);
      if (savedGi) {
        const parsedGi = JSON.parse(savedGi);
        if (Array.isArray(parsedGi?.documents)) setGreenInvoiceIncome(parsedGi.documents);
        if (typeof parsedGi?.lastSync === 'string') setGreenInvoiceLastSync(parsedGi.lastSync);
      }
    } catch {
      setFinanceEntries([]);
    }

    settingsService.get().then(s => {
      if (!active) return;
      if (Array.isArray(s?.data?.financeEntries)) {
        setFinanceEntries(s.data.financeEntries);
        localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(s.data.financeEntries));
      }
      if (Array.isArray(s?.data?.greenInvoiceIncomeDocuments)) {
        setGreenInvoiceIncome(s.data.greenInvoiceIncomeDocuments);
        const lastSync = typeof s?.data?.greenInvoiceIncomeLastSync === 'string' ? s.data.greenInvoiceIncomeLastSync : '';
        setGreenInvoiceLastSync(lastSync);
        localStorage.setItem(GREEN_INVOICE_INCOME_STORAGE_KEY, JSON.stringify({
          documents: s.data.greenInvoiceIncomeDocuments,
          lastSync,
        }));
      }
      setFinanceLoaded(true);
    }).catch(() => {
      if (active) setFinanceLoaded(true);
    });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!financeLoaded) return;
    localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(financeEntries));
    const timeout = window.setTimeout(() => {
      settingsService.get().then(s => {
        const currentData = s?.data || {};
        settingsService.update({ data: { ...currentData, financeEntries } }).catch(() => {});
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [financeEntries, financeLoaded]);

  useEffect(() => {
    if (!financeLoaded) return;
    localStorage.setItem(GREEN_INVOICE_INCOME_STORAGE_KEY, JSON.stringify({
      documents: greenInvoiceIncome,
      lastSync: greenInvoiceLastSync,
    }));
  }, [greenInvoiceIncome, greenInvoiceLastSync, financeLoaded]);

  const addFinanceEntry = () => {
    const amount = Number(String(financeForm.amount).replace(/,/g, ''));
    if (!financeForm.label.trim() || !Number.isFinite(amount) || amount <= 0 || !financeForm.date) return;
    setFinanceEntries(prev => [{
      id: `fin_${Date.now()}`,
      type: financeForm.type,
      label: financeForm.label.trim(),
      amount,
      date: financeForm.date,
    }, ...prev]);
    setFinanceForm(prev => ({ ...prev, label: '', amount: '' }));
  };

  const deleteFinanceEntry = (id: string) => {
    setFinanceEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const syncGreenInvoiceIncome = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const year = new Date().getFullYear();
    setGreenInvoiceSyncing(true);
    try {
      const result = await searchGreenInvoiceIncomeDocuments({
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
      });
      if (!result.success) {
        if (!silent) alert(`שגיאה בסנכרון חשבונית ירוקה: ${result.error || 'לא ידוע'}`);
        return;
      }
      const docs = result.documents || [];
      const lastSync = new Date().toISOString();
      setGreenInvoiceIncome(docs);
      setGreenInvoiceLastSync(lastSync);
      localStorage.setItem(GREEN_INVOICE_INCOME_STORAGE_KEY, JSON.stringify({ documents: docs, lastSync }));
      settingsService.get().then(s => {
        const currentData = s?.data || {};
        settingsService.update({
          data: {
            ...currentData,
            greenInvoiceIncomeDocuments: docs,
            greenInvoiceIncomeLastSync: lastSync,
          },
        }).catch(() => {});
      }).catch(() => {});
      if (!silent) alert(`סונכרנו ${docs.length} מסמכי הכנסה מחשבונית ירוקה`);
    } finally {
      setGreenInvoiceSyncing(false);
    }
  };

  // סנכרון אוטומטי בכניסה ללוח — אם עברה יותר משעה מהסנכרון האחרון
  const autoSyncDone = useRef(false);
  useEffect(() => {
    if (!financeLoaded || autoSyncDone.current) return;
    autoSyncDone.current = true;
    const lastSyncMs = greenInvoiceLastSync ? new Date(greenInvoiceLastSync).getTime() : 0;
    const oneHourMs = 60 * 60 * 1000;
    if (Date.now() - lastSyncMs > oneHourMs) {
      void syncGreenInvoiceIncome({ silent: true });
    }
  }, [financeLoaded, greenInvoiceLastSync]);

  const getActualRevenue = (ev: AppEvent): number => Math.max(numMoney(ev.paidAmount), 0);
  const getOpenBalance = (ev: AppEvent): number => eventOpenAmount(ev);

  const reportFilterOptions = useMemo(() => {
    const years = new Set<string>();
    const categories = new Set<string>();
    const eventTypes = new Set<string>(Object.values(EventType));
    events.forEach(ev => {
      years.add(eventYearKey(ev));
      if (ev.paymentDate || ev.paidAmount) years.add(incomeYearKey(ev));
      categories.add(eventCategoryKey(ev));
      if (ev.eventType) eventTypes.add(ev.eventType);
    });
    return {
      years: Array.from(years).sort((a, b) => b.localeCompare(a)),
      categories: Array.from(categories).sort(),
      eventTypes: Array.from(eventTypes).sort(),
      paymentStatuses: Object.values(PaymentStatus),
      eventStatuses: Object.values(EventStatus),
    };
  }, [events]);

  const clearReportFilters = () => {
    setReportFilters({ dateFrom: yearStartIso(), dateTo: todayIso(), dateMode: 'event' });
    setSelectedReportYears(new Set());
    setSelectedReportCategories(new Set());
    setSelectedReportEventTypes(new Set());
    setSelectedReportPaymentStatuses(new Set());
    setSelectedReportEventStatuses(new Set());
  };

  const reportEvents = useMemo(() => {
    return events.filter(ev => {
      if (selectedReportYears.size > 0) {
        const year = reportFilters.dateMode === 'payment' ? incomeYearKey(ev) : eventYearKey(ev);
        if (!selectedReportYears.has(year)) return false;
      }
      if (selectedReportCategories.size > 0 && !selectedReportCategories.has(eventCategoryKey(ev))) return false;
      if (selectedReportEventTypes.size > 0 && !selectedReportEventTypes.has(ev.eventType || '')) return false;
      if (selectedReportPaymentStatuses.size > 0 && !selectedReportPaymentStatuses.has(ev.paymentStatus || '')) return false;
      if (selectedReportEventStatuses.size > 0 && !selectedReportEventStatuses.has(ev.status || '')) return false;

      const inRange = (d: string | null | undefined) => {
        if (!d) return false;
        if (reportFilters.dateFrom && d < reportFilters.dateFrom) return false;
        if (reportFilters.dateTo && d > reportFilters.dateTo) return false;
        return true;
      };

      const eventDate = eventDateKey(ev) || null;
      const payDate = incomeDateKey(ev);
      const paid = numMoney(ev.paidAmount);

      if (reportFilters.dateMode === 'payment') {
        return inRange(payDate);
      }
      // במצב תאריך אירוע: גם תשלום שנכנס בטווח (גם אם האירוע עתידי) ייכנס לגרפים
      return inRange(eventDate) || (paid > 0 && inRange(payDate));
    });
  }, [events, reportFilters, selectedReportYears, selectedReportCategories, selectedReportEventTypes, selectedReportPaymentStatuses, selectedReportEventStatuses]);

  // הכנסות לפי חודש — שולם + יתרה פתוחה (כדי שאירועים שלא שולמו לא ייעלמו מהגרף)
  const revenueByMonth = useMemo(() => {
    const monthMap: Record<string, { paid: number; open: number }> = {};
    reportEvents.forEach(ev => {
      if (excludeEventFromKpis(ev)) return;
      const paid = getActualRevenue(ev);
      const open = getOpenBalance(ev);
      if (paid <= 0 && open <= 0) return;
      const monthKey = monthKeyFromIso(
        (paid > 0 ? incomeDateKey(ev) : null) ||
          parseEventDateKey(ev.paymentDate) ||
          eventDateKey(ev) ||
          ev.date
      );
      if (!monthKey) return;
      if (!monthMap[monthKey]) monthMap[monthKey] = { paid: 0, open: 0 };
      monthMap[monthKey].paid += paid;
      monthMap[monthKey].open += open;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month: new Date(month + '-01').toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        paid: Math.round(vals.paid),
        open: Math.round(vals.open),
        revenue: Math.round(vals.paid + vals.open),
      }));
  }, [reportEvents]);

  // הכנסות לפי סוג אירוע
  const revenueByType = useMemo(() => {
    const typeMap: Record<string, { paid: number; open: number }> = {};
    reportEvents.forEach(ev => {
      if (excludeEventFromKpis(ev)) return;
      const paid = getActualRevenue(ev);
      const open = getOpenBalance(ev);
      if (paid <= 0 && open <= 0) return;
      const type = ev.eventType || 'ללא סוג';
      if (!typeMap[type]) typeMap[type] = { paid: 0, open: 0 };
      typeMap[type].paid += paid;
      typeMap[type].open += open;
    });
    return Object.entries(typeMap).map(([type, vals]) => ({
      type,
      paid: Math.round(vals.paid),
      open: Math.round(vals.open),
      revenue: Math.round(vals.paid + vals.open),
    }));
  }, [reportEvents]);

  // הכנסות לפי תג
  const revenueByTag = useMemo(() => {
    const tagMap: Record<string, { paid: number; open: number }> = {};
    reportEvents.forEach(ev => {
      if (excludeEventFromKpis(ev)) return;
      const paid = getActualRevenue(ev);
      const open = getOpenBalance(ev);
      if (paid <= 0 && open <= 0) return;
      const tag = (ev.tag || ev.category || 'כללי').trim() || 'כללי';
      if (!tagMap[tag]) tagMap[tag] = { paid: 0, open: 0 };
      tagMap[tag].paid += paid;
      tagMap[tag].open += open;
    });
    return Object.entries(tagMap).map(([tag, vals]) => ({
      tag,
      paid: Math.round(vals.paid),
      open: Math.round(vals.open),
      revenue: Math.round(vals.paid + vals.open),
    }));
  }, [reportEvents]);

  /** כל האירועים עם יתרה פתוחה — בלי להסתיר בגלל תאריך תשלום שעבר */
  const openBalanceEvents = useMemo(() => {
    return events
      .filter((ev) => {
        if (excludeEventFromKpis(ev)) return false;
        if (selectedReportCategories.size > 0 && !selectedReportCategories.has(eventCategoryKey(ev))) return false;
        if (selectedReportEventTypes.size > 0 && !selectedReportEventTypes.has(ev.eventType || '')) return false;
        if (selectedReportPaymentStatuses.size > 0 && !selectedReportPaymentStatuses.has(ev.paymentStatus || '')) return false;
        if (selectedReportEventStatuses.size > 0 && !selectedReportEventStatuses.has(ev.status || '')) return false;
        return getOpenBalance(ev) > 0;
      })
      .map((ev) => {
        const customer = customers.find((c) => c.id === ev.customerId);
        const open = getOpenBalance(ev);
        const payKey = parseEventDateKey(ev.paymentDate) || '';
        const todayKey = todayIso();
        const bucket = !payKey ? 'undated' : payKey < todayKey ? 'overdue' : 'upcoming';
        return {
          event: ev,
          customerName: customer?.name || ev.title || 'ללא שם',
          phone: customer?.phone || ev.phone || '',
          open,
          bucket,
          sortDate: payKey || eventDateKey(ev) || '9999',
        };
      })
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate) || b.open - a.open);
  }, [
    events,
    customers,
    selectedReportCategories,
    selectedReportEventTypes,
    selectedReportPaymentStatuses,
    selectedReportEventStatuses,
  ]);

  // מספר אירועים לפי חודש
  const eventsByMonth = useMemo(() => {
    const monthMap: Record<string, number> = {};
    reportEvents.forEach(ev => {
      const monthKey = monthKeyFromIso(eventDateKey(ev));
      monthMap[monthKey] = (monthMap[monthKey] || 0) + 1;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        count
      }));
  }, [reportEvents]);

  // סטטיסטיקות כלליות
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalOpen = 0;
    let paidEventsCount = 0;
    let openEventsCount = 0;

    reportEvents.forEach(ev => {
      if (excludeEventFromKpis(ev)) return;
      const revenue = getActualRevenue(ev);
      const open = getOpenBalance(ev);
      if (revenue > 0) {
        totalRevenue += revenue;
        paidEventsCount++;
      }
      if (open > 0) {
        totalOpen += open;
        openEventsCount++;
      }
    });

    const totalEvents = reportEvents.length;
    const avgRevenue = paidEventsCount > 0 ? totalRevenue / paidEventsCount : 0;

    return {
      totalRevenue,
      totalOpen,
      totalEvents,
      avgRevenue,
      paidEvents: paidEventsCount,
      openEvents: openEventsCount,
    };
  }, [reportEvents]);

  const financeSnapshot = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearStartKey = `${currentYear}-01`;
    const currentMonthNumber = now.getMonth() + 1;

    const monthlyMap: Record<string, {
      monthKey: string;
      actualGrossIncome: number;
      actualNetIncome: number;
      datedGrossIncome: number;
      datedNetIncome: number;
      projectedGrossIncome: number;
      projectedNetIncome: number;
      undatedProjectedGrossIncome: number;
      expenses: number;
      donations: number;
    }> = {};
    const ensureMonth = (mk: string) => {
      if (!monthlyMap[mk]) {
        monthlyMap[mk] = {
          monthKey: mk,
          actualGrossIncome: 0,
          actualNetIncome: 0,
          datedGrossIncome: 0,
          datedNetIncome: 0,
          projectedGrossIncome: 0,
          projectedNetIncome: 0,
          undatedProjectedGrossIncome: 0,
          expenses: 0,
          donations: 0,
        };
      }
      return monthlyMap[mk];
    };

    for (let month = 1; month <= 12; month++) {
      ensureMonth(`${currentYear}-${String(month).padStart(2, '0')}`);
    }

    // פילטר תאריכים — אם הוגדר טווח, רק תאריכים בתוכו נכללים
    const inDateRange = (iso: string) => {
      const d = (iso || '').slice(0, 10);
      if (!d) return false;
      if (financeFilters.dateFrom && d < financeFilters.dateFrom) return false;
      if (financeFilters.dateTo && d > financeFilters.dateTo) return false;
      return true;
    };
    const todayIsoStr = now.toISOString().slice(0, 10);

    // סכומים ששולמו — ממסמכי חשבונית ירוקה
    // ברוטו = נטו + מע"מ מתוך המסמך, כדי שקבלות (נטו 0) על חשבוניות שכבר נספרו לא ייספרו פעמיים
    if (financeFilters.includePaid) {
      greenInvoiceIncome.forEach(doc => {
        const rawGross = Math.max(Number(doc.amount || 0), 0);
        const net = doc.netAmount != null ? Math.max(Number(doc.netAmount), 0) : rawGross / (1 + VAT_RATE);
        const vat = doc.vatAmount != null ? Math.max(Number(doc.vatAmount), 0) : Math.max(0, rawGross - net);
        const gross = net + vat;
        const docDate = doc.paymentDate || doc.date || '';
        const docMonth = monthKeyFromIso(docDate);
        if (gross > 0 && docMonth.startsWith(String(currentYear)) && inDateRange(docDate)) {
          const bucket = ensureMonth(docMonth);
          bucket.actualGrossIncome += gross;
          bucket.actualNetIncome += net;
          bucket.datedGrossIncome += gross;
          bucket.datedNetIncome += net;
        }
      });

      // במקור "מערכת + חשבונית ירוקה": מוסיפים גם תשלומים שנרשמו באירועים במערכת
      if (financeFilters.source === 'systemAndGi') {
        reportEvents.forEach(ev => {
          if (ev.status === EventStatus.Cancelled) return;
          const paidGross = Math.max(Number(ev.paidAmount || 0), 0);
          if (paidGross <= 0) return;
          const actualDate = ev.paymentDate || ev.date;
          const actualMonth = monthKeyFromIso(actualDate);
          if (actualMonth.startsWith(String(currentYear)) && inDateRange(actualDate)) {
            const bucket = ensureMonth(actualMonth);
            bucket.actualGrossIncome += paidGross;
            bucket.actualNetIncome += paidGross / (1 + VAT_RATE);
            bucket.datedGrossIncome += paidGross;
            bucket.datedNetIncome += paidGross / (1 + VAT_RATE);
          }
        });
      }
    }

    // יתרות פתוחות מאירועים — לפי סוג הסכום שנבחר בפילטר
    reportEvents.forEach(ev => {
      if (ev.status === EventStatus.Cancelled) return;
      const totalGross = Math.max(Number(ev.amount || 0), 0);
      const paidGross = Math.max(Number(ev.paidAmount || 0), 0);
      const outstandingGross = Math.max(0, totalGross - paidGross);
      if (outstandingGross <= 0) return;

      const eventDateIso = (ev.date || '').slice(0, 10);
      const isFutureEvent = eventDateIso >= todayIsoStr;
      const hasPaymentDate = Boolean(ev.paymentDate);

      // סיווג: תאריך תשלום קיים / אירוע עתידי / התקיים וטרם שולם
      if (hasPaymentDate && !financeFilters.includeDated) return;
      if (!hasPaymentDate && isFutureEvent && !financeFilters.includeFuture) return;
      if (!hasPaymentDate && !isFutureEvent && !financeFilters.includeOccurredUnpaid) return;

      const expectedDate = ev.paymentDate || ev.date;
      const expectedMonth = monthKeyFromIso(expectedDate);
      if (expectedMonth.startsWith(String(currentYear)) && inDateRange(expectedDate)) {
        const bucket = ensureMonth(expectedMonth);
        bucket.projectedGrossIncome += outstandingGross;
        bucket.projectedNetIncome += outstandingGross / (1 + VAT_RATE);
        if (hasPaymentDate) {
          bucket.datedGrossIncome += outstandingGross;
          bucket.datedNetIncome += outstandingGross / (1 + VAT_RATE);
        } else {
          bucket.undatedProjectedGrossIncome += outstandingGross;
        }
      }
    });

    financeEntries.forEach(entry => {
      const mk = monthKeyFromIso(entry.date);
      if (!mk) return;
      if (entry.type === 'fixedExpense') {
        const entryYear = mk.slice(0, 4);
        if (entryYear !== String(currentYear)) return;
        for (let month = 1; month <= 12; month++) {
          ensureMonth(`${currentYear}-${String(month).padStart(2, '0')}`).expenses += entry.amount;
        }
        return;
      }

      const bucket = ensureMonth(mk);
      if (entry.type === 'donation') bucket.donations += entry.amount;
      else bucket.expenses += entry.amount;
    });

    const allYearMonths = Object.values(monthlyMap).filter(row => row.monthKey.startsWith(String(currentYear)));
    const yearMonths = allYearMonths.filter(row => row.monthKey >= yearStartKey && row.monthKey <= currentMonthKey);
    const grossIncomeYtd = yearMonths.reduce((sum, row) => sum + row.actualGrossIncome, 0);
    const datedGrossIncomeYtd = yearMonths.reduce((sum, row) => sum + row.datedGrossIncome, 0);
    const projectedGrossIncomeYtd = yearMonths.reduce((sum, row) => sum + row.projectedGrossIncome, 0);
    const totalForecastGrossYtd = grossIncomeYtd + projectedGrossIncomeYtd;
    const incomeBeforeVatYtd = yearMonths.reduce((sum, row) => sum + row.actualNetIncome, 0);
    const datedIncomeBeforeVatYtd = yearMonths.reduce((sum, row) => sum + row.datedNetIncome, 0);
    const projectedIncomeBeforeVatYtd = yearMonths.reduce((sum, row) => sum + row.projectedNetIncome, 0);
    const totalForecastIncomeBeforeVatYtd = incomeBeforeVatYtd + projectedIncomeBeforeVatYtd;
    const vatOutputYtd = grossIncomeYtd - incomeBeforeVatYtd;
    const forecastVatOutputYtd = totalForecastGrossYtd - totalForecastIncomeBeforeVatYtd;
    const expensesYtd = yearMonths.reduce((sum, row) => sum + row.expenses, 0);
    const expensesAnnual = allYearMonths.reduce((sum, row) => sum + row.expenses, 0);
    const expensesMonthlyAverage = expensesAnnual / 12;
    const donationsYtd = yearMonths.reduce((sum, row) => sum + row.donations, 0);
    const taxableIncomeYtd = Math.max(0, incomeBeforeVatYtd - expensesYtd);
    const forecastTaxableIncomeYtd = Math.max(0, totalForecastIncomeBeforeVatYtd - expensesYtd);
    const averageMonthlyGross = currentMonthNumber > 0 ? grossIncomeYtd / currentMonthNumber : 0;
    const averageMonthlyTaxable = currentMonthNumber > 0 ? taxableIncomeYtd / currentMonthNumber : 0;
    const forecastAverageMonthlyTaxable = currentMonthNumber > 0 ? forecastTaxableIncomeYtd / currentMonthNumber : 0;
    const projectedAnnualTaxable = forecastTaxableIncomeYtd > 0 ? forecastTaxableIncomeYtd / currentMonthNumber * 12 : averageMonthlyTaxable * 12;
    const monthlyIncomeTaxBeforeCredit = calculateProgressiveTaxMonthly(averageMonthlyTaxable);
    const projectedIncomeTaxBeforeCredit = monthlyIncomeTaxBeforeCredit * 12;
    const donationEligibleAmount = donationsYtd >= DONATION_MINIMUM_2026
      ? Math.min(donationsYtd, taxableIncomeYtd * DONATION_TAXABLE_INCOME_CAP_RATE)
      : 0;
    const donationCreditYtd = donationEligibleAmount * DONATION_CREDIT_RATE;
    const projectedDonationCredit = currentMonthNumber > 0 ? donationCreditYtd / currentMonthNumber * 12 : 0;
    const projectedIncomeTaxAfterCredit = Math.max(0, projectedIncomeTaxBeforeCredit - projectedDonationCredit);
    const forecastIncomeTaxBeforeCredit = calculateProgressiveTaxAnnual(projectedAnnualTaxable);
    const forecastIncomeTaxAfterCredit = Math.max(0, forecastIncomeTaxBeforeCredit - projectedDonationCredit);
    const nationalInsuranceYtd = taxableIncomeYtd * NATIONAL_INSURANCE_RATE;
    const forecastNationalInsuranceYtd = forecastTaxableIncomeYtd * NATIONAL_INSURANCE_RATE;
    const effectiveIncomeTaxRate = projectedAnnualTaxable > 0 ? forecastIncomeTaxAfterCredit / projectedAnnualTaxable : 0;
    const marginalTaxRate = getMarginalTaxRate(forecastAverageMonthlyTaxable);

    const annualActualTaxBeforeCredit = calculateProgressiveTaxAnnual(taxableIncomeYtd);
    const datedTaxableIncomeYtd = Math.max(0, datedIncomeBeforeVatYtd - expensesYtd);
    const annualDatedTaxBeforeCredit = calculateProgressiveTaxAnnual(datedTaxableIncomeYtd);
    const annualForecastTaxBeforeCredit = calculateProgressiveTaxAnnual(forecastTaxableIncomeYtd);
    const monthRows = Object.values(monthlyMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const totalActualTaxableForAllocation = monthRows.reduce((sum, row) => sum + Math.max(0, row.actualNetIncome - row.expenses), 0);
    const totalDatedTaxableForAllocation = monthRows.reduce((sum, row) => sum + Math.max(0, row.datedNetIncome - row.expenses), 0);
    const totalForecastTaxableForAllocation = monthRows.reduce((sum, row) => sum + Math.max(0, row.actualNetIncome + row.projectedNetIncome - row.expenses), 0);

    const monthlyTaxPlan = monthRows
      .map(row => {
        const actualVat = row.actualGrossIncome - row.actualNetIncome;
        const datedVat = row.datedGrossIncome - row.datedNetIncome;
        const forecastGrossIncome = row.actualGrossIncome + row.projectedGrossIncome;
        const forecastNetIncome = row.actualNetIncome + row.projectedNetIncome;
        const forecastVat = forecastGrossIncome - forecastNetIncome;
        const expenseVatCredit = vatPartFromGross(row.expenses);
        const netActualVat = Math.max(0, actualVat - expenseVatCredit);
        const netDatedVat = Math.max(0, datedVat - expenseVatCredit);
        const netForecastVat = Math.max(0, forecastVat - expenseVatCredit);
        const actualTaxable = Math.max(0, row.actualNetIncome - row.expenses);
        const datedTaxable = Math.max(0, row.datedNetIncome - row.expenses);
        const forecastTaxable = Math.max(0, forecastNetIncome - row.expenses);
        const actualIncomeTax = totalActualTaxableForAllocation > 0
          ? annualActualTaxBeforeCredit * (actualTaxable / totalActualTaxableForAllocation)
          : 0;
        const datedIncomeTax = totalDatedTaxableForAllocation > 0
          ? annualDatedTaxBeforeCredit * (datedTaxable / totalDatedTaxableForAllocation)
          : 0;
        const forecastIncomeTax = totalForecastTaxableForAllocation > 0
          ? annualForecastTaxBeforeCredit * (forecastTaxable / totalForecastTaxableForAllocation)
          : 0;
        const actualNationalInsurance = actualTaxable * NATIONAL_INSURANCE_RATE;
        const datedNationalInsurance = datedTaxable * NATIONAL_INSURANCE_RATE;
        const forecastNationalInsurance = forecastTaxable * NATIONAL_INSURANCE_RATE;
        const donationNeededForActualTax = actualIncomeTax > 0 ? actualIncomeTax / DONATION_CREDIT_RATE : 0;
        const donationNeededForDatedTax = datedIncomeTax > 0 ? datedIncomeTax / DONATION_CREDIT_RATE : 0;
        const donationNeededForForecastTax = forecastIncomeTax > 0 ? forecastIncomeTax / DONATION_CREDIT_RATE : 0;
        return {
          monthKey: row.monthKey,
          label: new Date(row.monthKey + '-01').toLocaleDateString('he-IL', { month: 'short' }),
          expenses: Math.round(row.expenses),
          expenseVatCredit: Math.round(expenseVatCredit),
          donations: Math.round(row.donations),
          actualGrossIncome: Math.round(row.actualGrossIncome),
          datedGrossIncome: Math.round(row.datedGrossIncome),
          forecastGrossIncome: Math.round(forecastGrossIncome),
          projectedGrossIncome: Math.round(row.projectedGrossIncome),
          undatedProjectedGrossIncome: Math.round(row.undatedProjectedGrossIncome),
          actualVat: Math.round(actualVat),
          datedVat: Math.round(datedVat),
          forecastVat: Math.round(forecastVat),
          netActualVat: Math.round(netActualVat),
          netDatedVat: Math.round(netDatedVat),
          netForecastVat: Math.round(netForecastVat),
          actualIncomeTax: Math.round(actualIncomeTax),
          datedIncomeTax: Math.round(datedIncomeTax),
          forecastIncomeTax: Math.round(forecastIncomeTax),
          actualNationalInsurance: Math.round(actualNationalInsurance),
          datedNationalInsurance: Math.round(datedNationalInsurance),
          forecastNationalInsurance: Math.round(forecastNationalInsurance),
          donationNeededForActualTax: Math.round(donationNeededForActualTax),
          donationNeededForDatedTax: Math.round(donationNeededForDatedTax),
          donationNeededForForecastTax: Math.round(donationNeededForForecastTax),
          expenseNeededForActualVat: Math.round(grossExpenseNeededForVatOffset(netActualVat)),
          expenseNeededForDatedVat: Math.round(grossExpenseNeededForVatOffset(netDatedVat)),
          expenseNeededForForecastVat: Math.round(grossExpenseNeededForVatOffset(netForecastVat)),
          reserveActual: Math.round(netActualVat + actualIncomeTax + actualNationalInsurance),
          reserveDated: Math.round(netDatedVat + datedIncomeTax + datedNationalInsurance),
          reserveForecast: Math.round(netForecastVat + forecastIncomeTax + forecastNationalInsurance),
        };
      });

    const chartData = monthRows
      .map((row, idx, arr) => {
        const runningGross = arr.slice(0, idx + 1).reduce((sum, item) => sum + item.actualGrossIncome, 0);
        const runningForecastGross = arr.slice(0, idx + 1).reduce((sum, item) => sum + item.actualGrossIncome + item.projectedGrossIncome, 0);
        return {
          month: new Date(row.monthKey + '-01').toLocaleDateString('he-IL', { month: 'short' }),
          actualGrossIncome: Math.round(row.actualGrossIncome),
          datedGrossIncome: Math.round(row.datedGrossIncome),
          forecastGrossIncome: Math.round(row.actualGrossIncome + row.projectedGrossIncome),
          monthlyAverage: Math.round(runningGross / (idx + 1)),
          forecastMonthlyAverage: Math.round(runningForecastGross / (idx + 1)),
          netIncome: Math.round(row.actualNetIncome),
          expenses: Math.round(row.expenses),
          donations: Math.round(row.donations),
        };
      });

    return {
      currentMonthKey,
      grossIncomeYtd,
      datedGrossIncomeYtd,
      projectedGrossIncomeYtd,
      totalForecastGrossYtd,
      incomeBeforeVatYtd,
      datedIncomeBeforeVatYtd,
      projectedIncomeBeforeVatYtd,
      totalForecastIncomeBeforeVatYtd,
      vatOutputYtd,
      datedVatOutputYtd: datedGrossIncomeYtd - datedIncomeBeforeVatYtd,
      forecastVatOutputYtd,
      expensesYtd,
      expensesAnnual,
      expensesMonthlyAverage,
      donationsYtd,
      taxableIncomeYtd,
      datedTaxableIncomeYtd,
      forecastTaxableIncomeYtd,
      averageMonthlyGross,
      averageMonthlyTaxable,
      forecastAverageMonthlyTaxable,
      projectedAnnualTaxable,
      projectedIncomeTaxBeforeCredit,
      projectedIncomeTaxAfterCredit,
      annualDatedTaxBeforeCredit,
      forecastIncomeTaxAfterCredit,
      donationEligibleAmount,
      donationCreditYtd,
      projectedDonationCredit,
      nationalInsuranceYtd,
      datedNationalInsuranceYtd: datedTaxableIncomeYtd * NATIONAL_INSURANCE_RATE,
      forecastNationalInsuranceYtd,
      effectiveIncomeTaxRate,
      marginalTaxRate,
      chartData,
      monthlyTaxPlan,
      entriesThisYear: financeEntries
        .filter(entry => entry.date.startsWith(String(currentYear)))
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [reportEvents, financeEntries, greenInvoiceIncome, financeFilters]);

  const monthlyTimelineRows = financeSnapshot.monthlyTaxPlan;
  const selectedFinanceMonth = monthlyTimelineRows[selectedFinanceMonthIndex] || monthlyTimelineRows[0];
  const currentFinanceMonthIndex = Math.min(new Date().getMonth(), Math.max(0, monthlyTimelineRows.length - 1));
  const averageUntilToday = (selector: (row: typeof monthlyTimelineRows[number]) => number) => {
    const rowsUntilToday = monthlyTimelineRows.slice(0, currentFinanceMonthIndex + 1);
    if (rowsUntilToday.length === 0) return 0;
    return rowsUntilToday.reduce((sum, row) => sum + selector(row), 0) / rowsUntilToday.length;
  };
  const TrendBadge = ({ value, average }: { value: number; average: number }) => {
    const diff = Math.round(value - average);
    const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
    const colorClass = diff > 0 ? 'text-emerald-600 bg-emerald-50' : diff < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-500 bg-slate-50';
    return (
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black ${colorClass}`} title={`מול ממוצע עד היום: ₪${Math.round(average).toLocaleString()}`}>
        <Icon size={12} />
        ₪{Math.abs(diff).toLocaleString()}
      </span>
    );
  };
  const MonthlyMetric = ({ label, value, average, valueClass = 'text-slate-900' }: { label: string; value: number; average: number; valueClass?: string }) => (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 border border-slate-100 min-w-0">
      <span className="text-[11px] font-black text-slate-500 truncate">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <TrendBadge value={value} average={average} />
        <span className={`text-sm font-black whitespace-nowrap ${valueClass}`}>₪{Math.round(value).toLocaleString()}</span>
      </span>
    </div>
  );

  /** ====================================================================
   *  תזרים מזומנים — תקבולים בפועל וצפי כניסות
   *  - "נכנס בפועל" = paidAmount, ממוקם לפי paymentDate (או תאריך האירוע אם אין)
   *  - "צפוי להיכנס" = יתרה פתוחה (amount-paidAmount), עם תאריך משוער:
   *      paymentDate → או Net30/Net60 (לפי סטטוס תשלום) → או תאריך אירוע עתידי
   *  - "יתרה ללא תאריך" = יתרה פתוחה שאי אפשר להגדיר לה תאריך (אירוע עבר ללא תשלום מוגדר)
   *  ==================================================================== */
  const cashflow = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // תאריך מקומי (לא UTC) — חשוב להפרדה בין «צפוי» ל«באיחור»
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endMonth.setHours(23, 59, 59, 999);

    const dow = today.getDay(); // 0 = ראשון
    const startWeek = new Date(today);
    startWeek.setDate(today.getDate() - dow);
    const endWeek = new Date(startWeek);
    endWeek.setDate(startWeek.getDate() + 6);
    endWeek.setHours(23, 59, 59, 999);

    const weekStart = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - x.getDay());
      return x;
    };
    const addDays = (d: Date, days: number) => {
      const x = new Date(d);
      x.setDate(x.getDate() + days);
      return x;
    };
    const addMonths = (d: Date, months: number) => {
      const x = new Date(d);
      x.setMonth(x.getMonth() + months);
      return x;
    };
    const isoFromDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const weekKey = (d: Date) => isoFromDate(weekStart(d));

    const addDaysIso = (iso: string, days: number) => {
      const d = new Date(iso);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const centerMonth = new Date(today.getFullYear(), today.getMonth() + cashflowWindowOffset, 1);
    const startWindow = weekStart(addMonths(centerMonth, -1));
    const endWindow = new Date(centerMonth.getFullYear(), centerMonth.getMonth() + 2, 0);
    endWindow.setHours(23, 59, 59, 999);
    const weekBuckets: Record<string, {
      received: number;
      expected: number;
      eventValue: number;
      eventCount: number;
      items: CashflowWeekItem[];
    }> = {};
    const ensureCashflowWeek = (wk: string) => {
      if (!weekBuckets[wk]) {
        weekBuckets[wk] = { received: 0, expected: 0, eventValue: 0, eventCount: 0, items: [] };
      }
      return weekBuckets[wk];
    };

    for (let cursor = new Date(startWindow); cursor <= endWindow; cursor = addDays(cursor, 7)) {
      ensureCashflowWeek(isoFromDate(cursor));
    }

    let receivedThisMonth = 0;
    let receivedThisWeek = 0;
    let expectedThisMonth = 0;
    let expectedThisWeek = 0;
    let undatedTotal = 0;
    let totalOutstanding = 0;

    type InflowItem = {
      key: string;
      date: string;
      eventId: string;
      eventTitle: string;
      customerName: string;
      phone: string;
      amount: number;
      status: 'received' | 'expected';
      eventDate: string;
      paymentStatus: string;
    };
    type UndatedItem = {
      eventId: string;
      eventTitle: string;
      customerName: string;
      phone: string;
      amount: number;
      eventDate: string;
      paymentStatus: string;
    };
    type CustomerSummary = {
      customerKey: string;
      customerName: string;
      phone: string;
      totalExpected: number;
      totalUndated: number;
      eventCount: number;
    };

    const inflows: InflowItem[] = [];
    const undatedItems: UndatedItem[] = [];
    const customerMap: Record<string, CustomerSummary> = {};

    events.forEach(ev => {
      const customer = customers.find(c => c.id === ev.customerId);
      const customerName = customer?.name || ev.title || 'לא ידוע';
      const phone = customer?.phone || ev.phone || '';
      const customerKey = ev.customerId || `evt_${ev.id}`;
      const total = ev.amount || 0;
      const paid = ev.paidAmount || 0;
      const outstanding = Math.max(0, total - paid);
      const evDate = ev.date ? new Date(ev.date) : null;
      if (evDate && evDate >= startWindow && evDate <= endWindow) {
        const bucket = ensureCashflowWeek(weekKey(evDate));
        bucket.eventCount += 1;
        bucket.eventValue += total;
        bucket.items.push({
          key: `${ev.id}-v`,
          eventId: ev.id,
          eventTitle: ev.title,
          customerName,
          phone,
          amount: total,
          kind: 'eventValue',
          date: ev.date,
          paymentStatus: ev.paymentStatus,
        });
      }

      // ===== חלק ששולם בפועל =====
      if (paid > 0) {
        const recDateStr = ev.paymentDate || ev.date;
        if (recDateStr) {
          const recDate = new Date(recDateStr);
          if (recDate >= startWindow && recDate <= endWindow) {
            const bucket = ensureCashflowWeek(weekKey(recDate));
            bucket.received += paid;
            bucket.items.push({
              key: `${ev.id}-r`,
              eventId: ev.id,
              eventTitle: ev.title,
              customerName,
              phone,
              amount: paid,
              kind: 'received',
              date: recDateStr,
              paymentStatus: ev.paymentStatus,
            });
          }
          if (recDate >= startMonth && recDate <= endMonth) receivedThisMonth += paid;
          if (recDate >= startWeek && recDate <= endWeek) receivedThisWeek += paid;
          inflows.push({
            key: `${ev.id}-r`,
            date: recDateStr,
            eventId: ev.id,
            eventTitle: ev.title,
            customerName,
            phone,
            amount: paid,
            status: 'received',
            eventDate: ev.date,
            paymentStatus: ev.paymentStatus,
          });
        }
      }

      // ===== יתרה פתוחה =====
      if (outstanding > 0) {
        totalOutstanding += outstanding;
        let expectedDate: string | null = null;

        if (ev.paymentDate) {
          expectedDate = ev.paymentDate;
        } else if (ev.paymentStatus === PaymentStatus.Net30 && ev.date) {
          expectedDate = addDaysIso(ev.date, 30);
        } else if (ev.paymentStatus === PaymentStatus.Net60 && ev.date) {
          expectedDate = addDaysIso(ev.date, 60);
        }
        // אין השלמה אוטומטית לפי תאריך האירוע:
        // מחיקת תאריך תשלום = «חוב ללא תאריך» (לפי בקשת המשתמש)

        // אגירה לסיכום הלקוח
        if (!customerMap[customerKey]) {
          customerMap[customerKey] = {
            customerKey,
            customerName,
            phone,
            totalExpected: 0,
            totalUndated: 0,
            eventCount: 0,
          };
        }
        customerMap[customerKey].eventCount += 1;

        if (expectedDate) {
          const ed = new Date(expectedDate);
          if (ed >= startWindow && ed <= endWindow) {
            const bucket = ensureCashflowWeek(weekKey(ed));
            bucket.expected += outstanding;
            bucket.items.push({
              key: `${ev.id}-e`,
              eventId: ev.id,
              eventTitle: ev.title,
              customerName,
              phone,
              amount: outstanding,
              kind: 'expected',
              date: expectedDate,
              paymentStatus: ev.paymentStatus,
            });
          }
          if (ed >= startMonth && ed <= endMonth) expectedThisMonth += outstanding;
          if (ed >= startWeek && ed <= endWeek) expectedThisWeek += outstanding;
          customerMap[customerKey].totalExpected += outstanding;
          inflows.push({
            key: `${ev.id}-e`,
            date: expectedDate,
            eventId: ev.id,
            eventTitle: ev.title,
            customerName,
            phone,
            amount: outstanding,
            status: 'expected',
            eventDate: ev.date,
            paymentStatus: ev.paymentStatus,
          });
        } else {
          undatedTotal += outstanding;
          customerMap[customerKey].totalUndated += outstanding;
          undatedItems.push({
            eventId: ev.id,
            eventTitle: ev.title,
            customerName,
            phone,
            amount: outstanding,
            eventDate: ev.date,
            paymentStatus: ev.paymentStatus,
          });
        }
      }
    });

    const byCustomer = Object.values(customerMap)
      .map(c => ({ ...c, total: c.totalExpected + c.totalUndated }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);

    // תקבולים מהיום ואילך (כולל שולם/צפי)
    const futureInflows = inflows
      .filter(x => x.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 120);

    // חוב פתוח שתאריך התשלום שלו כבר עבר — לא נעלם מהמסך
    const overdueInflows = inflows
      .filter(x => x.status === 'expected' && x.date < todayStr)
      .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
      .slice(0, 200);
    const overdueTotal = overdueInflows.reduce((sum, x) => sum + x.amount, 0);

    undatedItems.sort((a, b) => b.amount - a.amount);

    const weeklyData = Object.entries(weekBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, vals]) => {
        const start = new Date(wk + 'T12:00:00');
        const end = addDays(start, 6);
        return {
        weekKey: wk,
        label: `${start.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}-${end.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`,
        received: Math.round(vals.received),
        expected: Math.round(vals.expected),
        eventValue: Math.round(vals.eventValue),
        eventCount: vals.eventCount,
        items: vals.items,
      };
      });
    const activeWeeks = weeklyData.length || 1;
    const totalReceivedInWindow = weeklyData.reduce((sum, row) => sum + row.received, 0);
    const totalEventValueInWindow = weeklyData.reduce((sum, row) => sum + row.eventValue, 0);
    const averageWeeklyIncome = (totalReceivedInWindow + undatedTotal) / activeWeeks;
    const averageMonthlyIncome = (totalReceivedInWindow + undatedTotal) / 3;
    const averageWeeklyEventValue = (totalEventValueInWindow + undatedTotal) / activeWeeks;

    return {
      receivedThisMonth,
      receivedThisWeek,
      expectedThisMonth,
      expectedThisWeek,
      undatedTotal,
      overdueTotal,
      totalOutstanding,
      weeklyData,
      averageWeeklyIncome,
      averageMonthlyIncome,
      averageWeeklyEventValue,
      windowLabel: `${startWindow.toLocaleDateString('he-IL')} - ${endWindow.toLocaleDateString('he-IL')}`,
      centerMonthLabel: centerMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
      futureInflows,
      overdueInflows,
      undatedItems,
      byCustomer,
    };
  }, [events, customers, cashflowWindowOffset]);

  useEffect(() => {
    setCashflowDrilldown(null);
  }, [cashflowWindowOffset]);

  // בפתיחת המסך — משיכת אירועים מהענן כדי שלא יישארו חסרים מקומית
  useEffect(() => {
    void reloadFromCloud().catch(() => {});
    // רק בטעינה ראשונה של המסך
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cashflowDrillItems = useMemo(() => {
    if (!cashflowDrilldown) return [];
    const row = cashflow.weeklyData.find((w) => w.weekKey === cashflowDrilldown.weekKey);
    if (!row?.items?.length) return [];
    const filtered =
      cashflowDrilldown.series === 'all'
        ? row.items
        : row.items.filter((i) => i.kind === cashflowDrilldown.series);
    return [...filtered].sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date));
  }, [cashflow.weeklyData, cashflowDrilldown]);

  const openCashflowWeek = (row: any, series: CashflowDrilldown['series'] = 'all') => {
    const payload = row?.payload || row;
    if (!payload?.weekKey) return;
    setCashflowDrilldown({
      weekKey: payload.weekKey,
      label: payload.label || payload.weekKey,
      series,
    });
  };

  const openEventEditor = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) setEditingEvent(ev);
  };

  const kindLabel = (kind: CashflowWeekKind) =>
    kind === 'received' ? 'נכנס' : kind === 'expected' ? 'צפי' : 'שווי אירוע';

  const kindChipClass = (kind: CashflowWeekKind) =>
    kind === 'received'
      ? 'bg-emerald-100 text-emerald-700'
      : kind === 'expected'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-sky-100 text-sky-700';

  return (
    <div className="p-8 space-y-8" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-xl">
            <TrendingUp size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800">דוחות וגרפים</h1>
            <p className="text-slate-500 font-bold">ניתוח פיננסי מעמיק</p>
          </div>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await reloadFromCloud();
              setRefreshKey((k) => k + 1);
            } catch (e) {
              alert((e as Error).message || 'רענון מהענן נכשל');
            } finally {
              setRefreshing(false);
            }
          }}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-all disabled:opacity-60"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'מרענן…' : 'רענן מהענן'}
        </button>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col xl:flex-row xl:items-end gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-black text-slate-800 mb-1">סינון מתקדם לדוחות</h3>
            <p className="text-xs font-bold text-slate-500 mb-3">
              הכנסות ששולמו נספרות לפי תאריך התשלום בפועל. אירועים וחובות פתוחים נשארים לפי תאריך קיום האירוע.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">טווח תאריכים</span>
                <select
                  value={reportFilters.dateMode}
                  onChange={e => setReportFilters(prev => ({ ...prev, dateMode: e.target.value as 'event' | 'payment' }))}
                  className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="event">לפי תאריך אירוע</option>
                  <option value="payment">לפי תאריך תשלום</option>
                </select>
                <input
                  type="date"
                  value={reportFilters.dateFrom}
                  onChange={e => setReportFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-xs text-slate-400">עד</span>
                <input
                  type="date"
                  value={reportFilters.dateTo}
                  onChange={e => setReportFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <MiniMultiSelect
                label="שנים"
                options={reportFilterOptions.years}
                selected={selectedReportYears}
                onChange={setSelectedReportYears}
                getCount={(year) => events.filter(e => eventYearKey(e) === year || incomeYearKey(e) === year).length}
              />
              <MiniMultiSelect
                label="קטגוריות"
                options={reportFilterOptions.categories}
                selected={selectedReportCategories}
                onChange={setSelectedReportCategories}
                getCount={(cat) => events.filter(e => eventCategoryKey(e) === cat).length}
              />
              <MiniMultiSelect
                label="סוג אירוע"
                options={reportFilterOptions.eventTypes}
                selected={selectedReportEventTypes}
                onChange={setSelectedReportEventTypes}
                getCount={(type) => events.filter(e => e.eventType === type).length}
              />
              <MiniMultiSelect
                label="סטטוס תשלום"
                options={reportFilterOptions.paymentStatuses}
                selected={selectedReportPaymentStatuses}
                onChange={setSelectedReportPaymentStatuses}
                getCount={(status) => events.filter(e => e.paymentStatus === status).length}
              />
              <MiniMultiSelect
                label="סטטוס אירוע"
                options={reportFilterOptions.eventStatuses}
                selected={selectedReportEventStatuses}
                onChange={setSelectedReportEventStatuses}
                getCount={(status) => events.filter(e => e.status === status).length}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={clearReportFilters}
            className="text-xs font-black bg-slate-100 text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-200"
          >
            ניקוי כל הסינונים
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="bg-gradient-to-br from-slate-50 to-purple-50 p-12 rounded-2xl border-2 border-purple-100 text-center">
          <p className="text-xl font-bold text-slate-500">אין אירועים במערכת עדיין</p>
          <p className="text-sm text-slate-400 mt-2">לחצו «רענן מהענן» או הוסיפו אירועים</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-slate-50 to-purple-50 p-6 rounded-2xl border-2 border-purple-100 mb-4">
            <p className="text-sm text-slate-600 font-bold text-center">
              במערכת <span className="text-purple-700 font-black">{events.length}</span> אירועים
              {' · '}בסינון הנוכחי <span className="text-purple-700 font-black">{stats.totalEvents}</span>
              {' · '}שולמו <span className="text-green-700 font-black">{stats.paidEvents}</span>
              {' · '}יתרה פתוחה <span className="text-rose-700 font-black">₪{openBalanceEvents.reduce((s, x) => s + x.open, 0).toLocaleString()}</span>
              {' '}({openBalanceEvents.length} אירועים)
            </p>
          </div>

      {/* חובות פתוחים — בראש הדף, לא רק בתחתית התזרים */}
      <div className="bg-white p-5 rounded-2xl shadow-md border-2 border-red-200 mb-6" key={`open-${refreshKey}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <AlertCircle size={20} className="text-red-500" />
              כל האירועים עם יתרה פתוחה
            </h3>
            <p className="text-[11px] font-bold text-slate-500">
              {openBalanceEvents.length} אירועים · באיחור / צפוי / ללא תאריך · כולל דורון, מוריה וכו׳ אם יש יתרה
            </p>
          </div>
          <div className="text-sm font-black text-rose-700">
            סה״כ ₪{openBalanceEvents.reduce((s, x) => s + x.open, 0).toLocaleString()}
          </div>
        </div>
        {openBalanceEvents.length === 0 ? (
          <p className="text-sm text-slate-400 font-bold py-6 text-center">
            אין יתרות פתוחות בנתונים שנטענו. נסו «רענן מהענן».
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[22rem]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] font-black text-slate-500">
                <tr>
                  <th className="text-right px-3 py-2">מצב</th>
                  <th className="text-right px-3 py-2">ת. תשלום</th>
                  <th className="text-right px-3 py-2">ת. אירוע</th>
                  <th className="text-right px-3 py-2">לקוח / כותרת</th>
                  <th className="text-right px-3 py-2 hidden md:table-cell">אירוע</th>
                  <th className="text-right px-3 py-2">סטטוס</th>
                  <th className="text-right px-3 py-2">יתרה</th>
                  <th className="text-right px-3 py-2">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {openBalanceEvents.map((row) => (
                  <tr key={row.event.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                          row.bucket === 'overdue'
                            ? 'bg-red-100 text-red-700'
                            : row.bucket === 'upcoming'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {row.bucket === 'overdue' ? 'באיחור' : row.bucket === 'upcoming' ? 'צפוי' : 'ללא תאריך'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                      {row.event.paymentDate
                        ? new Date(row.event.paymentDate + 'T12:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                      {row.event.date
                        ? new Date(row.event.date + 'T12:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-black text-slate-800 max-w-[160px] truncate" title={row.customerName}>
                      {row.customerName}
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate hidden md:table-cell" title={row.event.title}>
                      {row.event.title}
                    </td>
                    <td className="px-3 py-2"><StatusChip status={row.event.paymentStatus} /></td>
                    <td className="px-3 py-2 font-black text-rose-700 whitespace-nowrap">₪{row.open.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openEventEditor(row.event.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-black hover:bg-slate-700"
                      >
                        <Pencil size={11} /> עריכה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6" key={refreshKey}>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-2xl border-2 border-purple-200">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign size={24} className="text-purple-600" />
            <span className="text-sm font-black text-purple-600">סה"כ הכנסות</span>
          </div>
          <p className="text-3xl font-black text-purple-800">₪{stats.totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-purple-600 mt-2 font-bold">רק סכומים ששולמו בפועל</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl border-2 border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <Calendar size={24} className="text-blue-600" />
            <span className="text-sm font-black text-blue-600">סה"כ אירועים</span>
          </div>
          <p className="text-3xl font-black text-blue-800">{stats.totalEvents}</p>
          <p className="text-xs text-blue-600 mt-2 font-bold">כל האירועים במערכת</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl border-2 border-green-200">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={24} className="text-green-600" />
            <span className="text-sm font-black text-green-600">ממוצע לאירוע</span>
          </div>
          <p className="text-3xl font-black text-green-800">₪{Math.round(stats.avgRevenue).toLocaleString()}</p>
          <p className="text-xs text-green-600 mt-2 font-bold">מחושב מאירועים ששולמו</p>
        </div>

        <div className="bg-gradient-to-br from-rose-50 to-rose-100 p-6 rounded-2xl border-2 border-rose-200">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle size={24} className="text-rose-600" />
            <span className="text-sm font-black text-rose-600">יתרה פתוחה</span>
          </div>
          <p className="text-3xl font-black text-rose-800">₪{stats.totalOpen.toLocaleString()}</p>
          <p className="text-xs text-rose-600 mt-2 font-bold">{stats.openEvents} אירועים עדיין לא שולמו במלואם</p>
        </div>
      </div>

      {/* ============ לוח תזרים ומסים ============ */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 rounded-3xl border-2 border-indigo-200 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
              <ReceiptText size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800">לוח תזרים ומסים</h2>
              <p className="text-sm text-slate-600 font-bold">
                לעוסק מורשה · ודאי לפי תאריך תשלום מול תחזית מלאה · סכומים כוללים מע"מ
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 max-w-xl">
          <div className="bg-white border-2 border-emerald-200 rounded-2xl px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => void syncGreenInvoiceIncome()}
              disabled={greenInvoiceSyncing}
              className="w-full bg-emerald-600 text-white rounded-xl py-2 px-4 font-black hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {greenInvoiceSyncing ? 'מסנכרן חשבונית ירוקה...' : 'סנכרן הכנסות מחשבונית ירוקה'}
            </button>
            <p className="text-[11px] text-slate-500 font-bold mt-2 text-center">
              {greenInvoiceLastSync
                ? `עודכן לאחרונה: ${new Date(greenInvoiceLastSync).toLocaleString('he-IL')}`
                : 'עדיין לא בוצע סנכרון הכנסות'}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-xs font-bold text-amber-900">
              אומדן ניהולי בלבד. מס הכנסה מחושב לפי מדרגות 2026 על רווח אחרי מע"מ והוצאות, ומוצג כדי לדעת כמה כסף לשמור בצד.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {FINANCE_SOURCES.map(source => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-[11px] font-black text-indigo-700 underline">
                  {source.label}
                </a>
              ))}
            </div>
          </div>
          </div>
        </div>

        {/* ============ פילטרים ============ */}
        <div className="bg-white rounded-3xl border border-indigo-100 shadow-sm p-5 mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1">
                <p className="text-xs font-black text-slate-500 mb-2">טווח תאריכים</p>
                <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2">
                <input
                  type="date"
                  value={financeFilters.dateFrom}
                  onChange={e => setFinanceFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="min-w-[9rem] bg-white text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-100"
                  title="מתאריך"
                />
                <span className="text-xs text-slate-400 font-bold">עד</span>
                <input
                  type="date"
                  value={financeFilters.dateTo}
                  onChange={e => setFinanceFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="min-w-[9rem] bg-white text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-100"
                  title="עד תאריך"
                />
                {(financeFilters.dateFrom || financeFilters.dateTo) && (
                  <button
                    type="button"
                    onClick={() => setFinanceFilters(prev => ({ ...prev, dateFrom: yearStartIso(), dateTo: todayIso() }))}
                    className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100"
                  >
                    חזור לברירת מחדל
                  </button>
                )}
                </div>
              </div>

              <div className="lg:w-72">
                <p className="text-xs font-black text-slate-500 mb-2">מקור נתונים</p>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2">
              <select
                value={financeFilters.source}
                onChange={e => setFinanceFilters(prev => ({ ...prev, source: e.target.value as 'gi' | 'systemAndGi' }))}
                    className="w-full bg-white text-xs font-black border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-100 text-slate-700"
              >
                <option value="gi">חשבונית ירוקה בלבד</option>
                <option value="systemAndGi">נתוני המערכת + חשבונית ירוקה</option>
              </select>
                </div>
            </div>
            </div>

            <div>
              <p className="text-xs font-black text-slate-500 mb-2">סוגי סכומים להצגה</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {([
                  { key: 'includePaid', label: 'סכומים ששולמו' },
                  { key: 'includeDated', label: 'יש תאריך תשלום' },
                  { key: 'includeFuture', label: 'אירועים עתידיים' },
                  { key: 'includeOccurredUnpaid', label: 'התקיימו וטרם שולמו' },
                ] as const).map(opt => (
                  <label
                    key={opt.key}
                    className={`flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border cursor-pointer text-xs font-black transition-all ${
                      financeFilters[opt.key]
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm'
                        : 'bg-slate-50 border-slate-100 text-slate-400'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={financeFilters[opt.key]}
                      onChange={() => setFinanceFilters(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                      className="w-3.5 h-3.5 accent-indigo-600"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-white rounded-3xl border-2 border-blue-200 shadow-md overflow-hidden">
            <div className="bg-blue-600 text-white px-5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <h3 className="text-lg font-black">ודאי</h3>
              <p className="text-xs font-bold text-blue-100 leading-snug">נכנס בפועל או עם תאריך תשלום</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 p-3">
              <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-blue-700 mb-1">תקבולים ודאיים</p>
                <p className="text-lg font-black text-blue-900 break-words">₪{Math.round(financeSnapshot.datedGrossIncomeYtd).toLocaleString()}</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-2.5 border border-purple-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-purple-700 mb-1">מע"מ ודאי</p>
                <p className="text-lg font-black text-purple-900 break-words">₪{Math.round(financeSnapshot.datedVatOutputYtd).toLocaleString()}</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-2.5 border border-rose-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-rose-700 mb-1">מס הכנסה ודאי</p>
                <p className="text-lg font-black text-rose-900 break-words">₪{Math.round(financeSnapshot.annualDatedTaxBeforeCredit).toLocaleString()}</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-2.5 border border-orange-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-orange-700 mb-1">בט"ל ודאי</p>
                <p className="text-lg font-black text-orange-900 break-words">₪{Math.round(financeSnapshot.datedNationalInsuranceYtd).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 rounded-xl p-2.5 border border-slate-800 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-200 mb-1">לשמור ודאי</p>
                <p className="text-lg font-black text-white break-words">
                  ₪{Math.round(financeSnapshot.datedVatOutputYtd + financeSnapshot.annualDatedTaxBeforeCredit + financeSnapshot.datedNationalInsuranceYtd).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border-2 border-amber-200 shadow-md overflow-hidden">
            <div className="bg-amber-500 text-white px-5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <h3 className="text-lg font-black">תחזית</h3>
              <p className="text-xs font-bold text-amber-50 leading-snug">כולל עתידי, לא שולם וללא תאריך</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 p-3">
              <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-amber-700 mb-1">תחזית תקבולים</p>
                <p className="text-lg font-black text-amber-900 break-words">₪{Math.round(financeSnapshot.totalForecastGrossYtd).toLocaleString()}</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-2.5 border border-purple-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-purple-700 mb-1">מע"מ תחזית</p>
                <p className="text-lg font-black text-purple-900 break-words">₪{Math.round(financeSnapshot.forecastVatOutputYtd).toLocaleString()}</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-2.5 border border-rose-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-rose-700 mb-1">מס תחזית</p>
                <p className="text-lg font-black text-rose-900 break-words">₪{Math.round(financeSnapshot.forecastIncomeTaxAfterCredit).toLocaleString()}</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-2.5 border border-orange-100 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-orange-700 mb-1">בט"ל תחזית</p>
                <p className="text-lg font-black text-orange-900 break-words">₪{Math.round(financeSnapshot.forecastNationalInsuranceYtd).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 rounded-xl p-2.5 border border-slate-800 min-w-0 flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-200 mb-1">לשמור תחזית</p>
                <p className="text-lg font-black text-white break-words">
                  ₪{Math.round(financeSnapshot.forecastVatOutputYtd + financeSnapshot.forecastIncomeTaxAfterCredit + financeSnapshot.forecastNationalInsuranceYtd).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-500">סך הוצאות שנתי</p>
              <p className="text-2xl font-black text-slate-900 break-words">₪{Math.round(financeSnapshot.expensesAnnual).toLocaleString()}</p>
            </div>
            <ReceiptText size={26} className="text-slate-400 shrink-0" />
          </div>
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-500">הוצאה חודשית ממוצעת</p>
              <p className="text-2xl font-black text-slate-900 break-words">₪{Math.round(financeSnapshot.expensesMonthlyAverage).toLocaleString()}</p>
            </div>
            <Calendar size={26} className="text-slate-400 shrink-0" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <div className="xl:col-span-2 bg-white p-5 rounded-2xl shadow-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp size={22} className="text-indigo-500" />
              הכנסה חודשית מינואר עד דצמבר
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={financeSnapshot.chartData} margin={{ bottom: 15, right: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                <YAxis tick={{ fontSize: 11, fontWeight: 'bold' }} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '2px solid #6366f1', borderRadius: '12px', fontWeight: 'bold', direction: 'rtl' }}
                  formatter={(value: number, name: string) => [
                    `₪${value.toLocaleString()}`,
                    name === 'actualGrossIncome' ? 'נכנס בפועל'
                      : name === 'datedGrossIncome' ? 'ודאי / מתוארך'
                      : name === 'forecastGrossIncome' ? 'תחזית מלאה'
                      : name === 'monthlyAverage' ? 'ממוצע בפועל'
                      : name === 'forecastMonthlyAverage' ? 'ממוצע תחזית'
                      : name,
                  ]}
                />
                <Legend
                  formatter={(v) => (
                    v === 'actualGrossIncome' ? 'נכנס בפועל'
                      : v === 'datedGrossIncome' ? 'ודאי / מתוארך'
                      : v === 'forecastGrossIncome' ? 'תחזית מלאה'
                      : v === 'monthlyAverage' ? 'ממוצע בפועל'
                      : 'ממוצע תחזית'
                  )}
                  wrapperStyle={{ fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="actualGrossIncome" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} />
                <Line type="monotone" dataKey="datedGrossIncome" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 5, fill: '#0ea5e9' }} />
                <Line type="monotone" dataKey="forecastGrossIncome" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5, fill: '#f59e0b' }} />
                <Line type="monotone" dataKey="monthlyAverage" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: '#6366f1' }} />
                <Line type="monotone" dataKey="forecastMonthlyAverage" stroke="#be123c" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: '#be123c' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <Percent size={22} className="text-rose-500" />
              שיעורי מס מול העיניים
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3">
                <span className="text-sm font-bold text-slate-600">רווח חייב תחזיתי לחודש</span>
                <span className="font-black text-slate-900">₪{Math.round(financeSnapshot.forecastAverageMonthlyTaxable).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center bg-rose-50 rounded-xl p-3">
                <span className="text-sm font-bold text-rose-700">מדרגת מס שולית</span>
                <span className="font-black text-rose-900">{Math.round(financeSnapshot.marginalTaxRate * 100)}%</span>
              </div>
              <div className="flex justify-between items-center bg-orange-50 rounded-xl p-3">
                <span className="text-sm font-bold text-orange-700">שיעור מס הכנסה אפקטיבי</span>
                <span className="font-black text-orange-900">{(financeSnapshot.effectiveIncomeTaxRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center bg-purple-50 rounded-xl p-3">
                <span className="text-sm font-bold text-purple-700">רווח חייב תחזיתי השנה</span>
                <span className="font-black text-purple-900">₪{Math.round(financeSnapshot.forecastTaxableIncomeYtd).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center bg-pink-50 rounded-xl p-3">
                <span className="text-sm font-bold text-pink-700">תרומות שהוכרו לזיכוי</span>
                <span className="font-black text-pink-900">₪{Math.round(financeSnapshot.donationEligibleAmount).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-md border-2 border-indigo-100 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <CalendarClock size={22} className="text-indigo-500" />
              תכנון חודשי מאוחד
              <span className="text-xs text-slate-500 font-bold mr-2">אמת, ודאי ותחזית לפי חודש</span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedFinanceMonthIndex(i => Math.max(0, i - 1))}
                className="bg-slate-100 text-slate-700 rounded-xl px-3 py-2 text-xs font-black hover:bg-slate-200"
              >
                חודש קודם
              </button>
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl px-4 py-2 text-sm font-black">
                {selectedFinanceMonth?.label || '-'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedFinanceMonthIndex(i => Math.min(monthlyTimelineRows.length - 1, i + 1))}
                className="bg-slate-100 text-slate-700 rounded-xl px-3 py-2 text-xs font-black hover:bg-slate-200"
              >
                חודש הבא
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
            {monthlyTimelineRows.map((row, idx) => (
              <button
                key={row.monthKey}
                type="button"
                onClick={() => setSelectedFinanceMonthIndex(idx)}
                className={`min-w-[92px] rounded-2xl border px-3 py-2 text-right transition-all ${
                  idx === selectedFinanceMonthIndex
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50'
                }`}
              >
                <div className="text-xs font-black">{row.label}</div>
                <div className="text-[10px] font-bold opacity-80">₪{row.forecastGrossIncome.toLocaleString()}</div>
              </button>
            ))}
          </div>

          {selectedFinanceMonth && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                  <h4 className="text-xs font-black text-emerald-800 mb-2">אמת חודשית</h4>
                  <div className="space-y-1.5">
                    <MonthlyMetric label="תקבולים בפועל" value={selectedFinanceMonth.actualGrossIncome} average={averageUntilToday(row => row.actualGrossIncome)} valueClass="text-emerald-700" />
                    <MonthlyMetric label="הוצאות" value={selectedFinanceMonth.expenses} average={averageUntilToday(row => row.expenses)} />
                    <MonthlyMetric label={'מע"מ נטו'} value={selectedFinanceMonth.netActualVat} average={averageUntilToday(row => row.netActualVat)} valueClass="text-purple-700" />
                    <MonthlyMetric label="לשמור בפועל" value={selectedFinanceMonth.reserveActual} average={averageUntilToday(row => row.reserveActual)} />
                  </div>
                </div>

                <div className="rounded-2xl bg-blue-50 border border-blue-100 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-black text-blue-800">ודאי / מתוארך</h4>
                    <span className="text-[10px] font-black text-blue-700">
                      {Math.min(100, Math.round((selectedFinanceMonth.datedGrossIncome / Math.max(1, selectedFinanceMonth.forecastGrossIncome)) * 100))}% מהתחזית
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <MonthlyMetric label="הכנסה ודאית" value={selectedFinanceMonth.datedGrossIncome} average={averageUntilToday(row => row.datedGrossIncome)} valueClass="text-blue-700" />
                    <MonthlyMetric label={'מע"מ'} value={selectedFinanceMonth.datedVat} average={averageUntilToday(row => row.datedVat)} valueClass="text-purple-700" />
                    <MonthlyMetric label="מס הכנסה" value={selectedFinanceMonth.datedIncomeTax} average={averageUntilToday(row => row.datedIncomeTax)} valueClass="text-rose-700" />
                    <MonthlyMetric label="לשמור ודאי" value={selectedFinanceMonth.reserveDated} average={averageUntilToday(row => row.reserveDated)} />
                  </div>
                </div>

                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
                  <h4 className="text-xs font-black text-amber-800 mb-2">תחזית חודשית</h4>
                  <div className="space-y-1.5">
                    <MonthlyMetric label="תחזית הכנסה" value={selectedFinanceMonth.forecastGrossIncome} average={averageUntilToday(row => row.forecastGrossIncome)} valueClass="text-amber-700" />
                    <MonthlyMetric label={'מע"מ תחזית'} value={selectedFinanceMonth.forecastVat} average={averageUntilToday(row => row.forecastVat)} valueClass="text-purple-700" />
                    <MonthlyMetric label="מס תחזית" value={selectedFinanceMonth.forecastIncomeTax} average={averageUntilToday(row => row.forecastIncomeTax)} valueClass="text-rose-700" />
                    <MonthlyMetric label="לשמור תחזית" value={selectedFinanceMonth.reserveForecast} average={averageUntilToday(row => row.reserveForecast)} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-100">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2 shrink-0">
              <Heart size={20} className="text-pink-500" />
              הוצאות / תרומות
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 flex-1">
              <select
                value={financeForm.type}
                onChange={(e) => setFinanceForm(prev => ({ ...prev, type: e.target.value as FinanceEntryType }))}
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="fixedExpense">הוצאה קבועה</option>
                <option value="variableExpense">הוצאה שוטפת</option>
                <option value="donation">תרומה</option>
              </select>
              <input
                value={financeForm.label}
                onChange={(e) => setFinanceForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="תיאור"
                className="md:col-span-2 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                value={financeForm.amount}
                onChange={(e) => setFinanceForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder={financeForm.type === 'fixedExpense' ? 'סכום חודשי' : 'סכום'}
                inputMode="decimal"
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                value={financeForm.date}
                onChange={(e) => setFinanceForm(prev => ({ ...prev, date: e.target.value }))}
                type="date"
                className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <button
              type="button"
              onClick={addFinanceEntry}
              className="inline-flex items-center justify-center gap-1 bg-indigo-600 text-white rounded-xl px-4 py-2 text-xs font-black hover:bg-indigo-700 transition-colors shrink-0"
            >
              <Plus size={15} />
              הוסף
            </button>
          </div>
          <div className="mt-3 flex flex-col lg:flex-row lg:items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black shrink-0">
              <span className="bg-amber-50 text-amber-700 rounded-xl px-3 py-1.5">הוצאות: ₪{Math.round(financeSnapshot.expensesYtd).toLocaleString()}</span>
              <span className="bg-pink-50 text-pink-700 rounded-xl px-3 py-1.5">תרומות: ₪{Math.round(financeSnapshot.donationsYtd).toLocaleString()}</span>
            </div>
            {financeSnapshot.entriesThisYear.length === 0 ? (
              <p className="text-xs text-slate-400 font-bold">עדיין לא הוזנו הוצאות או תרומות לשנה הנוכחית</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
                {financeSnapshot.entriesThisYear.slice(0, 18).map(entry => (
                  <div key={entry.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs font-bold whitespace-nowrap">
                    <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                      entry.type === 'donation' ? 'bg-pink-100 text-pink-700' : entry.type === 'fixedExpense' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {getEntryTypeLabel(entry.type)}
                    </span>
                    <span className="text-slate-700">{entry.label}</span>
                    <span className="font-black text-slate-900">₪{entry.amount.toLocaleString()}</span>
                    <button type="button" onClick={() => deleteFinanceEntry(entry.id)} className="inline-flex items-center justify-center w-6 h-6 rounded-full text-rose-600 hover:bg-rose-50">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ תזרים מזומנים ============ */}
      <div className="bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 p-6 rounded-3xl border-2 border-emerald-200 shadow-lg">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 mb-6">
          <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Wallet size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">תזרים מזומנים</h2>
            <p className="text-sm text-slate-600 font-bold">תקבולים בפועל וצפי כניסות לפי תאריך</p>
          </div>
          </div>
          <div className="xl:mr-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCashflowWindowOffset(v => v - 1)}
              className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-50"
            >
              <ChevronRight size={16} /> חודש קודם
            </button>
            <button
              type="button"
              onClick={() => setCashflowWindowOffset(0)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-slate-50"
            >
              חודש נוכחי
            </button>
            <button
              type="button"
              onClick={() => setCashflowWindowOffset(v => v + 1)}
              className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-50"
            >
              חודש הבא <ChevronLeft size={16} />
            </button>
            <span className="bg-emerald-100 text-emerald-800 px-3 py-2 rounded-xl text-xs font-black">
              {cashflow.centerMonthLabel} · {cashflow.windowLabel}
            </span>
          </div>
        </div>

        {/* כרטיסי סיכום */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border-2 border-emerald-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-emerald-600" />
              <span className="text-xs font-black text-emerald-600">נכנס החודש</span>
            </div>
            <p className="text-2xl font-black text-emerald-800">₪{cashflow.receivedThisMonth.toLocaleString()}</p>
            <p className="text-[10px] text-emerald-600 font-bold mt-1">בפועל</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-cyan-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-cyan-600" />
              <span className="text-xs font-black text-cyan-600">נכנס השבוע</span>
            </div>
            <p className="text-2xl font-black text-cyan-800">₪{cashflow.receivedThisWeek.toLocaleString()}</p>
            <p className="text-[10px] text-cyan-600 font-bold mt-1">בפועל</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-amber-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-amber-600" />
              <span className="text-xs font-black text-amber-600">צפי החודש</span>
            </div>
            <p className="text-2xl font-black text-amber-800">₪{cashflow.expectedThisMonth.toLocaleString()}</p>
            <p className="text-[10px] text-amber-600 font-bold mt-1">צפוי להיכנס</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-orange-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-orange-600" />
              <span className="text-xs font-black text-orange-600">צפי השבוע</span>
            </div>
            <p className="text-2xl font-black text-orange-800">₪{cashflow.expectedThisWeek.toLocaleString()}</p>
            <p className="text-[10px] text-orange-600 font-bold mt-1">צפוי להיכנס</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-indigo-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-indigo-600" />
              <span className="text-xs font-black text-indigo-600">ממוצע שבועי</span>
            </div>
            <p className="text-2xl font-black text-indigo-800">₪{Math.round(cashflow.averageWeeklyIncome).toLocaleString()}</p>
            <p className="text-[10px] text-indigo-600 font-bold mt-1">כולל יתרות ללא תאריך</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-purple-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={16} className="text-purple-600" />
              <span className="text-xs font-black text-purple-600">ממוצע חודשי</span>
            </div>
            <p className="text-2xl font-black text-purple-800">₪{Math.round(cashflow.averageMonthlyIncome).toLocaleString()}</p>
            <p className="text-[10px] text-purple-600 font-bold mt-1">כולל יתרות ללא תאריך</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-red-300 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-red-600" />
              <span className="text-xs font-black text-red-600">באיחור</span>
            </div>
            <p className="text-2xl font-black text-red-800">₪{cashflow.overdueTotal.toLocaleString()}</p>
            <p className="text-[10px] text-red-600 font-bold mt-1">{cashflow.overdueInflows.length} אירועים — תאריך תשלום עבר</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-rose-200 shadow-md">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-rose-600" />
              <span className="text-xs font-black text-rose-600">יתרה ללא תאריך</span>
            </div>
            <p className="text-2xl font-black text-rose-800">₪{cashflow.undatedTotal.toLocaleString()}</p>
            <p className="text-[10px] text-rose-600 font-bold mt-1">{cashflow.undatedItems.length} אירועים בחוץ</p>
          </div>
        </div>

        {/* גרף עמודות לפי שבוע */}
        <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 mb-6">
          <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
            <CalendarClock size={22} className="text-emerald-500" />
            תזרים שבועי – 3 חודשים מול העיניים
            <span className="text-xs text-slate-500 font-bold mr-2">חודש קודם, חודש נוכחי וחודש הבא לפי שבוע</span>
          </h3>
          <p className="text-xs text-slate-500 font-bold mb-3">
            לחצו על קוביית שבוע מתחת לגרף (או על העמודה עצמה) כדי לפתוח את טבלת האירועים
          </p>

          <ResponsiveContainer width="100%" height={420}>
            <BarChart
              data={cashflow.weeklyData}
              margin={{ bottom: 8, right: 8, left: 8, top: 8 }}
              onClick={(state: any) => {
                const row = state?.activePayload?.[0]?.payload;
                if (row?.weekKey) openCashflowWeek(row, 'all');
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              {/* תוויות האלכסון הוחלפו בקוביות לחיצות מתחת לגרף */}
              <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} height={4} />
              <YAxis
                width={48}
                tick={{ fontSize: 12, fontWeight: 'bold' }}
                tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  direction: 'rtl',
                  pointerEvents: 'none',
                }}
                formatter={(value: number, name: string) => [
                  `₪${value.toLocaleString()}`,
                  name === 'received' ? 'נכנס בפועל'
                    : name === 'expected' ? 'צפי להיכנס'
                    : name === 'eventValue' ? 'שווי אירועים'
                    : name,
                ]}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload;
                  return `שבוע: ${label}${row?.eventCount ? ` · ${row.eventCount} אירועים` : ''} · בחרו קוביה מתחת לגרף`;
                }}
              />
              <Legend
                formatter={(v) => (
                  v === 'received' ? 'נכנס בפועל'
                    : v === 'expected' ? 'צפי להיכנס'
                    : 'שווי אירועים'
                )}
                wrapperStyle={{ fontWeight: 'bold' }}
              />
              <Bar
                dataKey="received"
                stackId="cash"
                fill="#10b981"
                cursor="pointer"
                onClick={(data: any) => openCashflowWeek(data, 'received')}
              />
              <Bar
                dataKey="expected"
                stackId="cash"
                fill="#f59e0b"
                radius={[8, 8, 0, 0]}
                cursor="pointer"
                onClick={(data: any) => openCashflowWeek(data, 'expected')}
              />
              <Bar
                dataKey="eventValue"
                fill="#38bdf8"
                radius={[8, 8, 0, 0]}
                cursor="pointer"
                onClick={(data: any) => openCashflowWeek(data, 'eventValue')}
              />
            </BarChart>
          </ResponsiveContainer>

          {/* קוביות שבוע במקום התוויות האלכסוניות — מיושרות לעמודות הגרף */}
          <div className="mt-1 flex items-start gap-0" dir="ltr">
            <div className="w-12 shrink-0" aria-hidden />
            <div
              className="flex-1 grid gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(cashflow.weeklyData.length, 1)}, minmax(0, 1fr))` }}
            >
              {cashflow.weeklyData.map((week) => {
                const active = cashflowDrilldown?.weekKey === week.weekKey;
                const hasData = (week.items?.length || 0) > 0 || week.received > 0 || week.expected > 0 || week.eventValue > 0;
                const [startLabel = '', endLabel = ''] = String(week.label || '').split('-');
                return (
                  <button
                    key={week.weekKey}
                    type="button"
                    title={`שבוע ${week.label}${hasData ? ` · ${week.items?.length || 0} שורות` : ' · ללא נתונים'}`}
                    onClick={() => openCashflowWeek(week, 'all')}
                    className={`min-h-[3.25rem] px-0.5 py-1.5 rounded-lg border text-center transition-colors leading-tight ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : hasData
                          ? 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50'
                          : 'bg-slate-50 text-slate-300 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className={`text-[10px] sm:text-[11px] font-black ${active ? 'text-white' : hasData ? 'text-slate-800' : 'text-slate-300'}`}>
                      {startLabel}
                    </div>
                    <div className={`text-[9px] sm:text-[10px] font-bold ${active ? 'text-emerald-100' : hasData ? 'text-slate-400' : 'text-slate-200'}`}>
                      {endLabel}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="w-2 shrink-0" aria-hidden />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-slate-400">כל קוביה = שבוע אחד מתחת לעמודה שלה בגרף</p>
            {cashflowDrilldown && (
              <button
                type="button"
                onClick={() => setCashflowDrilldown(null)}
                className="text-[11px] font-black text-slate-500 hover:text-slate-800"
              >
                נקה בחירה
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-bold">
            <div className="bg-emerald-50 text-emerald-700 rounded-xl px-3 py-2">ממוצע הכנסה שבועית: ₪{Math.round(cashflow.averageWeeklyIncome).toLocaleString()}</div>
            <div className="bg-purple-50 text-purple-700 rounded-xl px-3 py-2">ממוצע הכנסה חודשית: ₪{Math.round(cashflow.averageMonthlyIncome).toLocaleString()}</div>
            <div className="bg-sky-50 text-sky-700 rounded-xl px-3 py-2">ממוצע שווי אירועים שבועי: ₪{Math.round(cashflow.averageWeeklyEventValue).toLocaleString()}</div>
          </div>

          {cashflowDrilldown && (
            <div className="mt-5 border-2 border-emerald-200 rounded-2xl bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-base font-black text-slate-800">
                    אירועי השבוע {cashflowDrilldown.label}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-bold">
                    {cashflowDrillItems.length} שורות · לחצו «עריכה» לפתיחת כרטיס האירוע
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCashflowDrilldown(null)}
                  className="inline-flex items-center gap-1 text-xs font-black text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg"
                >
                  <X size={14} /> סגור
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {([
                  ['all', 'הכל'],
                  ['received', 'נכנס בפועל'],
                  ['expected', 'צפי להיכנס'],
                  ['eventValue', 'שווי אירועים'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCashflowDrilldown((prev) => prev ? { ...prev, series: key } : prev)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-colors ${
                      cashflowDrilldown.series === key
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {cashflowDrillItems.length === 0 ? (
                <p className="text-sm text-slate-400 font-bold py-6 text-center">אין אירועים בסינון הזה לשבוע שנבחר</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-80">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-[11px] font-black text-slate-500">
                      <tr>
                        <th className="text-right px-3 py-2">תאריך</th>
                        <th className="text-right px-3 py-2">סוג</th>
                        <th className="text-right px-3 py-2">לקוח</th>
                        <th className="text-right px-3 py-2 hidden md:table-cell">אירוע</th>
                        <th className="text-right px-3 py-2">סטטוס</th>
                        <th className="text-right px-3 py-2">סכום</th>
                        <th className="text-right px-3 py-2">פעולה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflowDrillItems.map((item) => (
                        <tr key={item.key} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                            {item.date
                              ? new Date(item.date + 'T12:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-black ${kindChipClass(item.kind)}`}>
                              {kindLabel(item.kind)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-black text-slate-800 max-w-[140px] truncate" title={item.customerName}>
                            {item.customerName}
                          </td>
                          <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate hidden md:table-cell" title={item.eventTitle}>
                            {item.eventTitle}
                          </td>
                          <td className="px-3 py-2"><StatusChip status={item.paymentStatus} /></td>
                          <td className="px-3 py-2 font-black text-slate-800 whitespace-nowrap">₪{item.amount.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {item.phone && (
                                <a
                                  href={`tel:${item.phone}`}
                                  title={item.phone}
                                  className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                                >
                                  <Phone size={12} />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => openEventEditor(item.eventId)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-black hover:bg-slate-700"
                              >
                                <Pencil size={11} /> עריכה
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* רשימות פירוט */}
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-6">
          {/* באיחור — תאריך תשלום עבר ועדיין לא שולם */}
          <div className="bg-white p-5 rounded-2xl shadow-md border-2 border-red-200">
            <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
              <AlertCircle size={20} className="text-red-500" />
              באיחור – תאריך תשלום עבר
            </h3>
            <p className="text-[11px] font-bold text-red-600 mb-3">
              סה״כ ₪{cashflow.overdueTotal.toLocaleString()} · {cashflow.overdueInflows.length} אירועים
            </p>
            {cashflow.overdueInflows.length === 0 ? (
              <p className="text-sm text-slate-400 font-bold py-8 text-center">
                אין חובות באיחור 🎉
              </p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {cashflow.overdueInflows.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-red-50 border-red-200"
                  >
                    <div className="text-[11px] font-black text-red-700 shrink-0 w-14 text-center bg-white rounded-md py-1 border border-red-200">
                      {new Date(item.date + 'T12:00:00').toLocaleDateString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 truncate">{item.customerName}</span>
                      <span className="text-xs text-slate-400 truncate hidden sm:inline" title={item.eventTitle}>
                        · {item.eventTitle}
                      </span>
                      <StatusChip status={item.paymentStatus} />
                    </div>
                    {item.phone && (
                      <a
                        href={`tel:${item.phone}`}
                        title={item.phone}
                        className="shrink-0 w-7 h-7 rounded-full bg-white border border-red-200 flex items-center justify-center text-red-600 hover:bg-red-50"
                      >
                        <Phone size={12} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openEventEditor(item.eventId)}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-black hover:bg-slate-700"
                    >
                      <Pencil size={11} /> עריכה
                    </button>
                    <div className="shrink-0 text-sm font-black text-red-700 whitespace-nowrap">
                      ₪{item.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* תקבולים צפויים */}
          <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <Clock size={20} className="text-amber-500" />
              תקבולים צפויים – מהיום והלאה
            </h3>
            {cashflow.futureInflows.length === 0 ? (
              <p className="text-sm text-slate-400 font-bold py-8 text-center">
                אין תקבולים צפויים בקרוב
              </p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {cashflow.futureInflows.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center gap-2 p-2 rounded-lg border ${
                      item.status === 'received'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className="text-[11px] font-black text-slate-700 shrink-0 w-14 text-center bg-white rounded-md py-1 border border-slate-200">
                      {new Date(item.date + 'T12:00:00').toLocaleDateString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 truncate">{item.customerName}</span>
                      <span className="text-xs text-slate-400 truncate hidden sm:inline" title={item.eventTitle}>
                        · {item.eventTitle}
                      </span>
                      <StatusChip status={item.paymentStatus} />
                    </div>
                    {item.phone && (
                      <a
                        href={`tel:${item.phone}`}
                        title={item.phone}
                        className="shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                      >
                        <Phone size={12} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openEventEditor(item.eventId)}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-white text-[10px] font-black hover:bg-slate-700"
                    >
                      <Pencil size={11} /> עריכה
                    </button>
                    <div
                      className={`shrink-0 text-sm font-black whitespace-nowrap ${
                        item.status === 'received' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      ₪{item.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* יתרות ללא תאריך */}
          <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <AlertCircle size={20} className="text-rose-500" />
              כספים בחוץ ללא תאריך מוגדר
            </h3>
            {cashflow.undatedItems.length === 0 ? (
              <p className="text-sm text-slate-400 font-bold py-8 text-center">
                כל היתרות הפתוחות בעלות תאריך תשלום צפוי 🎉
              </p>
            ) : (
              <>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3">
                  <p className="text-xs font-bold text-rose-900">
                    סה"כ ללא תאריך:{' '}
                    <span className="text-base font-black">
                      ₪{cashflow.undatedTotal.toLocaleString()}
                    </span>{' '}
                    ב-{cashflow.undatedItems.length} אירועים
                  </p>
                </div>
                <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                  {cashflow.undatedItems.map((item) => (
                    <div
                      key={item.eventId}
                      className="flex items-center gap-2 p-2 rounded-lg bg-rose-50/60 border border-rose-100"
                    >
                      {/* שם + אירוע + סטטוס */}
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800 truncate">{item.customerName}</span>
                        <span className="text-xs text-slate-400 truncate hidden sm:inline" title={item.eventTitle}>
                          · {item.eventTitle}
                          {item.eventDate && ` · ${new Date(item.eventDate).toLocaleDateString('he-IL')}`}
                        </span>
                        <StatusChip status={item.paymentStatus} />
                      </div>
                      {/* טלפון */}
                      {item.phone && (
                        <a
                          href={`tel:${item.phone}`}
                          title={item.phone}
                          className="shrink-0 w-7 h-7 rounded-full bg-white border border-rose-200 flex items-center justify-center text-rose-600 hover:bg-rose-50 hover:border-rose-400 transition-colors"
                        >
                          <Phone size={12} />
                        </a>
                      )}
                      {/* סכום */}
                      <div className="shrink-0 text-sm font-black text-rose-700 whitespace-nowrap">
                        ₪{item.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* סיכום לפי לקוח */}
          <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <Users size={20} className="text-purple-500" />
              סיכום לפי לקוח
              <span className="text-xs text-slate-500 font-bold mr-1">
                ({cashflow.byCustomer.length})
              </span>
            </h3>
            {cashflow.byCustomer.length === 0 ? (
              <p className="text-sm text-slate-400 font-bold py-8 text-center">
                אין יתרות פתוחות 🎉
              </p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                {cashflow.byCustomer.map((c, idx) => (
                  <div key={c.customerKey} className="rounded-lg border border-purple-100 bg-purple-50/50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 w-5">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-800 truncate">{c.customerName}</div>
                        <div className="text-[10px] font-bold text-slate-500">
                          {c.eventCount} אירועים
                          {c.phone ? ` · ${c.phone}` : ''}
                        </div>
                      </div>
                      <div className="text-sm font-black text-purple-800 whitespace-nowrap">
                        ₪{c.total.toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-black">
                      {c.totalExpected > 0 && (
                        <span className="bg-amber-100 text-amber-700 rounded-lg px-2 py-0.5">
                          צפי ₪{c.totalExpected.toLocaleString()}
                        </span>
                      )}
                      {c.totalUndated > 0 && (
                        <span className="bg-rose-100 text-rose-700 rounded-lg px-2 py-0.5">
                          ללא תאריך ₪{c.totalUndated.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* פוטר סיכום */}
        <div className="mt-6 bg-white/60 backdrop-blur p-4 rounded-2xl border border-emerald-200 text-center">
          <p className="text-sm font-bold text-slate-700">
            סה"כ יתרה פתוחה:{' '}
            <span className="text-lg font-black text-rose-700">
              ₪{cashflow.totalOutstanding.toLocaleString()}
            </span>
            {' · '}
            באיחור:{' '}
            <span className="text-lg font-black text-red-700">
              ₪{cashflow.overdueTotal.toLocaleString()}
            </span>
            {' · '}
            ללא תאריך:{' '}
            <span className="text-lg font-black text-rose-700">
              ₪{cashflow.undatedTotal.toLocaleString()}
            </span>
          </p>
        </div>
      </div>

      {/* גרפים */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* הכנסות לפי חודש */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-2 flex items-center gap-3">
            <Calendar size={24} className="text-purple-500" />
            הכנסות לפי חודש
          </h2>
          <p className="text-xs font-bold text-slate-500 mb-4">סגול = שולם · כתום = יתרה פתוחה (כולל אירועים שטרם שולמו)</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={revenueByMonth} margin={{ bottom: 20, right: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fontWeight: 'bold' }} 
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fontSize: 11, fontWeight: 'bold' }} 
                tickFormatter={(value) => `₪${(value / 1000).toFixed(0)}K`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '2px solid #8b5cf6', 
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  direction: 'rtl'
                }}
                formatter={(value: number, name: string) => [
                  `₪${Number(value || 0).toLocaleString()}`,
                  name === 'paid' ? 'שולם' : name === 'open' ? 'יתרה פתוחה' : name,
                ]}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Legend
                formatter={(v) => (v === 'paid' ? 'שולם' : v === 'open' ? 'יתרה פתוחה' : v)}
                wrapperStyle={{ fontWeight: 'bold' }}
              />
              <Bar dataKey="paid" stackId="rev" fill="#8b5cf6" />
              <Bar dataKey="open" stackId="rev" fill="#f59e0b" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* מספר אירועים לפי חודש */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <TrendingUp size={24} className="text-blue-500" />
            מספר אירועים לפי חודש
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={eventsByMonth} margin={{ bottom: 20, right: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fontWeight: 'bold' }} 
                angle={-15}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11, fontWeight: 'bold' }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '2px solid #3b82f6', 
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  direction: 'rtl'
                }}
                formatter={(value: number) => [`${value}`, 'אירועים']}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* הכנסות לפי סוג אירוע */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <Tag size={24} className="text-pink-500" />
            הכנסות לפי סוג אירוע
          </h2>
          <div className="flex flex-col lg:flex-row gap-6 items-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={revenueByType}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="revenue"
                >
                  {revenueByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '2px solid #ec4899', 
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}
                  formatter={(value: number) => `₪${value.toLocaleString()}`}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 w-full lg:w-auto">
              {revenueByType.map((entry, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="font-bold text-slate-700 flex-1 min-w-0 truncate">{entry.type}</span>
                  <span className="font-black text-slate-900 shrink-0 text-left">
                    ₪{entry.revenue.toLocaleString()}
                    {entry.open > 0 && (
                      <span className="block text-[10px] text-amber-600 font-bold">מתוכם פתוח ₪{entry.open.toLocaleString()}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* הכנסות לפי תג */}
        {revenueByTag.length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-lg border-2 border-slate-100">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <DollarSign size={24} className="text-green-500" />
              הכנסות לפי תג אירוע
            </h2>
            <ResponsiveContainer width="100%" height={Math.max(300, revenueByTag.length * 50)}>
              <BarChart data={revenueByTag} layout="vertical" margin={{ right: 30, left: 150 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fontWeight: 'bold' }} />
                <YAxis 
                  dataKey="tag" 
                  type="category" 
                  tick={{ fontSize: 11, fontWeight: 'bold', textAnchor: 'end' }} 
                  width={140}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '2px solid #10b981', 
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    direction: 'rtl'
                  }}
                  formatter={(value: number) => [`₪${value.toLocaleString()}`, 'הכנסה']}
                  labelFormatter={(label) => `תג: ${label}`}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
        </>
      )}

      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}
