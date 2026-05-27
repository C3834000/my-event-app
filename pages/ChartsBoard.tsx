import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, Calendar, Tag, RefreshCw, Wallet, Clock, AlertCircle, CalendarClock, Users, Phone } from 'lucide-react';
import { PaymentStatus } from '../types';

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

export default function ChartsBoard() {
  const { events, customers } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);

  const getActualRevenue = (ev: any): number => {
    return Math.max(ev.paidAmount || 0, 0);
  };

  // הכנסות לפי חודש
  const revenueByMonth = useMemo(() => {
    const monthMap: Record<string, number> = {};
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0) {
        const date = new Date(ev.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + revenue;
      }
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({
        month: new Date(month + '-01').toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        revenue
      }));
  }, [events]);

  // הכנסות לפי סוג אירוע
  const revenueByType = useMemo(() => {
    const typeMap: Record<string, number> = {};
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0) {
        typeMap[ev.eventType] = (typeMap[ev.eventType] || 0) + revenue;
      }
    });
    return Object.entries(typeMap).map(([type, revenue]) => ({ type, revenue }));
  }, [events]);

  // הכנסות לפי תג
  const revenueByTag = useMemo(() => {
    const tagMap: Record<string, number> = {};
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0 && ev.tag) {
        tagMap[ev.tag] = (tagMap[ev.tag] || 0) + revenue;
      }
    });
    return Object.entries(tagMap).map(([tag, revenue]) => ({ tag, revenue }));
  }, [events]);

  // מספר אירועים לפי חודש
  const eventsByMonth = useMemo(() => {
    const monthMap: Record<string, number> = {};
    events.forEach(ev => {
      const date = new Date(ev.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthMap[monthKey] = (monthMap[monthKey] || 0) + 1;
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString('he-IL', { month: 'short', year: 'numeric' }),
        count
      }));
  }, [events]);

  // סטטיסטיקות כלליות
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let paidEventsCount = 0;
    
    events.forEach(ev => {
      const revenue = getActualRevenue(ev);
      if (revenue > 0) {
        totalRevenue += revenue;
        paidEventsCount++;
      }
    });
    
    const totalEvents = events.length;
    const avgRevenue = paidEventsCount > 0 ? totalRevenue / paidEventsCount : 0;
    
    console.log('📊 דוחות - סטטיסטיקות:', {
      totalRevenue,
      totalEvents,
      paidEventsCount,
      avgRevenue,
      sampleEvents: events.slice(0, 3).map(e => ({ id: e.id, amount: e.amount, paidAmount: e.paidAmount, paymentStatus: e.paymentStatus }))
    });
    
    return { totalRevenue, totalEvents, avgRevenue, paidEvents: paidEventsCount };
  }, [events]);

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
    const todayStr = today.toISOString().split('T')[0];

    const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endMonth.setHours(23, 59, 59, 999);

    const dow = today.getDay(); // 0 = ראשון
    const startWeek = new Date(today);
    startWeek.setDate(today.getDate() - dow);
    const endWeek = new Date(startWeek);
    endWeek.setDate(startWeek.getDate() + 6);
    endWeek.setHours(23, 59, 59, 999);

    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const addDaysIso = (iso: string, days: number) => {
      const d = new Date(iso);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    // אתחול דליי לחודשים: חודש שעבר + נוכחי + 5 קדימה
    const monthBuckets: Record<string, { received: number; expected: number }> = {};
    for (let i = -1; i <= 5; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      monthBuckets[monthKey(d)] = { received: 0, expected: 0 };
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

      // ===== חלק ששולם בפועל =====
      if (paid > 0) {
        const recDateStr = ev.paymentDate || ev.date;
        if (recDateStr) {
          const recDate = new Date(recDateStr);
          const mk = monthKey(recDate);
          if (mk in monthBuckets) {
            monthBuckets[mk].received += paid;
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
        } else if (ev.date && ev.date >= todayStr) {
          expectedDate = ev.date;
        }

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
          const mk = monthKey(ed);
          if (mk in monthBuckets) {
            monthBuckets[mk].expected += outstanding;
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

    // רק תקבולים מהיום ואילך
    const futureInflows = inflows
      .filter(x => x.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 40);

    undatedItems.sort((a, b) => b.amount - a.amount);

    const monthlyData = Object.entries(monthBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mk, vals]) => ({
        monthKey: mk,
        label: new Date(mk + '-01').toLocaleDateString('he-IL', {
          month: 'short',
          year: '2-digit',
        }),
        received: Math.round(vals.received),
        expected: Math.round(vals.expected),
      }));

    return {
      receivedThisMonth,
      receivedThisWeek,
      expectedThisMonth,
      expectedThisWeek,
      undatedTotal,
      totalOutstanding,
      monthlyData,
      futureInflows,
      undatedItems,
      byCustomer,
    };
  }, [events, customers]);

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
        <button onClick={() => setRefreshKey(k => k + 1)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-all">
          <RefreshCw size={18} /> רענן נתונים
        </button>
      </div>

      {stats.totalEvents === 0 ? (
        <div className="bg-gradient-to-br from-slate-50 to-purple-50 p-12 rounded-2xl border-2 border-purple-100 text-center">
          <p className="text-xl font-bold text-slate-500">אין אירועים במערכת עדיין</p>
          <p className="text-sm text-slate-400 mt-2">הוסף אירועים כדי לראות דוחות וגרפים</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-slate-50 to-purple-50 p-6 rounded-2xl border-2 border-purple-100 mb-4">
            <p className="text-sm text-slate-600 font-bold text-center">
              הדוחות מבוססים על <span className="text-purple-700 font-black">{stats.totalEvents}</span> אירועים במערכת, 
              מתוכם <span className="text-green-700 font-black">{stats.paidEvents}</span> אירועים ששולמו 
              בסכום כולל של <span className="text-purple-700 font-black">₪{stats.totalRevenue.toLocaleString()}</span>
            </p>
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

        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-6 rounded-2xl border-2 border-pink-200">
          <div className="flex items-center gap-3 mb-2">
            <Tag size={24} className="text-pink-600" />
            <span className="text-sm font-black text-pink-600">אירועים ששולמו</span>
          </div>
          <p className="text-3xl font-black text-pink-800">{stats.paidEvents}</p>
          <p className="text-xs text-pink-600 mt-2 font-bold">{Math.round((stats.paidEvents / stats.totalEvents) * 100)}% מכלל האירועים</p>
        </div>
      </div>

      {/* ============ תזרים מזומנים ============ */}
      <div className="bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 p-6 rounded-3xl border-2 border-emerald-200 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Wallet size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">תזרים מזומנים</h2>
            <p className="text-sm text-slate-600 font-bold">תקבולים בפועל וצפי כניסות לפי תאריך</p>
          </div>
        </div>

        {/* כרטיסי סיכום */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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

          <div className="bg-white p-4 rounded-2xl border-2 border-rose-200 shadow-md col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-rose-600" />
              <span className="text-xs font-black text-rose-600">יתרה ללא תאריך</span>
            </div>
            <p className="text-2xl font-black text-rose-800">₪{cashflow.undatedTotal.toLocaleString()}</p>
            <p className="text-[10px] text-rose-600 font-bold mt-1">{cashflow.undatedItems.length} אירועים בחוץ</p>
          </div>
        </div>

        {/* גרף עמודות מוערמות לפי חודש */}
        <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 mb-6">
          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <CalendarClock size={22} className="text-emerald-500" />
            תזרים חודשי – נכנס בפועל + צפי
            <span className="text-xs text-slate-500 font-bold mr-2">(חודש שעבר → 5 חודשים קדימה)</span>
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cashflow.monthlyData} margin={{ bottom: 10, right: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 'bold' }} />
              <YAxis
                tick={{ fontSize: 11, fontWeight: 'bold' }}
                tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '2px solid #10b981',
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  direction: 'rtl',
                }}
                formatter={(value: number, name: string) => [
                  `₪${value.toLocaleString()}`,
                  name === 'received' ? 'נכנס בפועל' : 'צפי',
                ]}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Legend
                formatter={(v) => (v === 'received' ? 'נכנס בפועל' : 'צפי להיכנס')}
                wrapperStyle={{ fontWeight: 'bold' }}
              />
              <Bar dataKey="received" stackId="cash" fill="#10b981" />
              <Bar dataKey="expected" stackId="cash" fill="#f59e0b" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* סיכום לפי לקוח */}
        <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 mb-6">
          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Users size={22} className="text-purple-500" />
            סיכום לפי לקוח – ממי אמור להיכנס כסף
            <span className="text-xs text-slate-500 font-bold mr-2">
              ({cashflow.byCustomer.length} לקוחות עם יתרה פתוחה)
            </span>
          </h3>
          {cashflow.byCustomer.length === 0 ? (
            <p className="text-sm text-slate-400 font-bold py-8 text-center">
              אין יתרות פתוחות 🎉
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm" dir="rtl">
                <thead className="sticky top-0 bg-gradient-to-l from-purple-50 to-pink-50 z-10 shadow-sm">
                  <tr className="border-b-2 border-purple-200">
                    <th className="text-right py-2 px-2 text-[11px] font-black text-slate-500 w-8">#</th>
                    <th className="text-right py-2 px-2 text-[11px] font-black text-slate-600">לקוח</th>
                    <th className="text-right py-2 px-2 text-[11px] font-black text-slate-600">טלפון</th>
                    <th className="text-center py-2 px-2 text-[11px] font-black text-slate-600">אירועים</th>
                    <th className="text-right py-2 px-2 text-[11px] font-black text-amber-700">צפי</th>
                    <th className="text-right py-2 px-2 text-[11px] font-black text-rose-700">ללא תאריך</th>
                    <th className="text-right py-2 px-2 text-[11px] font-black text-purple-700">סה"כ פתוח</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflow.byCustomer.map((c, idx) => (
                    <tr
                      key={c.customerKey}
                      className={`border-b border-slate-100 hover:bg-purple-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                    >
                      <td className="py-2 px-2 text-[11px] font-black text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-2 text-sm font-black text-slate-800 max-w-[200px] truncate">
                        {c.customerName}
                      </td>
                      <td className="py-2 px-2">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            title={c.phone}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-colors"
                          >
                            <Phone size={12} />
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center text-xs font-bold text-slate-600">{c.eventCount}</td>
                      <td className="py-2 px-2 text-sm font-black text-amber-700 whitespace-nowrap">
                        {c.totalExpected > 0 ? `₪${c.totalExpected.toLocaleString()}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 px-2 text-sm font-black text-rose-700 whitespace-nowrap">
                        {c.totalUndated > 0 ? `₪${c.totalUndated.toLocaleString()}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 px-2 text-sm font-black text-purple-800 whitespace-nowrap">
                        ₪{c.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* רשימות פירוט */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* תקבולים צפויים */}
          <div className="bg-white p-5 rounded-2xl shadow-md border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <Clock size={20} className="text-amber-500" />
              תקבולים צפויים – הימים הקרובים
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
                    {/* תאריך */}
                    <div className="text-[11px] font-black text-slate-700 shrink-0 w-14 text-center bg-white rounded-md py-1 border border-slate-200">
                      {new Date(item.date).toLocaleDateString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </div>
                    {/* שם + אירוע + סטטוס – שורה אחת */}
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 truncate">{item.customerName}</span>
                      <span className="text-xs text-slate-400 truncate hidden sm:inline" title={item.eventTitle}>
                        · {item.eventTitle}
                      </span>
                      <StatusChip status={item.paymentStatus} />
                    </div>
                    {/* טלפון – אייקון בלבד */}
                    {item.phone && (
                      <a
                        href={`tel:${item.phone}`}
                        title={item.phone}
                        className="shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-colors"
                      >
                        <Phone size={12} />
                      </a>
                    )}
                    {/* סכום */}
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
        </div>

        {/* פוטר סיכום */}
        <div className="mt-6 bg-white/60 backdrop-blur p-4 rounded-2xl border border-emerald-200 text-center">
          <p className="text-sm font-bold text-slate-700">
            סה"כ יתרה פתוחה (כל החובות):{' '}
            <span className="text-lg font-black text-rose-700">
              ₪{cashflow.totalOutstanding.toLocaleString()}
            </span>
            {' · '}
            מתוכה ללא תאריך מוגדר:{' '}
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
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
            <Calendar size={24} className="text-purple-500" />
            הכנסות לפי חודש
          </h2>
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
                formatter={(value: number) => [`₪${value.toLocaleString()}`, 'הכנסה']}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Bar dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
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
                  <span className="font-black text-slate-900 shrink-0">₪{entry.revenue.toLocaleString()}</span>
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
    </div>
  );
}
