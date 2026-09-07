// ============================================================================
// מצב מס ותזרים — תמונת מצב אחת ברורה:
// הכנסות (חשבונית ירוקה) · הוצאות (מאגר מסמכים + רישום ידני) · מע"מ דו-חודשי
// · מס הכנסה עם ניכוי במקור וזיכוי תרומות · ביטוח לאומי · תזרים בית.
// כל החישובים הערכה בלבד — לא תחליף לרו"ח.
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator, RefreshCw, TrendingUp, TrendingDown, Landmark, PiggyBank,
  Home, Briefcase, Plus, Trash2, AlertTriangle, CheckCircle2, FileText,
} from 'lucide-react';
import {
  FinanceEntry, FinanceEntryType, FinanceScope, ENTRY_TYPE_LABELS, TaxSettings,
  entryScope, isRecurring, loadFinanceEntriesLocal, loadFinanceEntriesCloud,
  saveFinanceEntries, loadTaxSettings, saveTaxSettings, DEFAULT_TAX_SETTINGS,
} from '../services/financeEntries';
import {
  VAT_RATE, NATIONAL_INSURANCE_RATE, annualIncomeTax, vatFromGross,
  vatPeriodsForYear, donationCredit,
} from '../services/taxCalc';
import { listDocuments, getDocsApiKey, FinanceDocument } from '../services/documents';
import { searchGreenInvoiceIncomeDocuments, GreenInvoiceIncomeDocument } from '../services/greenInvoice';
import { settingsService } from '../services/supabase';

const GI_STORAGE_KEY = 'ME_CFM_GREEN_INVOICE_INCOME_V1';

const fmt = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const fmtSigned = (n: number) => `${n < 0 ? '−' : ''}₪${Math.abs(Math.round(n)).toLocaleString('he-IL')}`;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TaxBoard: React.FC = () => {
  const year = new Date().getFullYear();
  const currentMonthKey = todayIso().slice(0, 7);
  const monthsElapsed = new Date().getMonth() + 1;

  const [entries, setEntries] = useState<FinanceEntry[]>(loadFinanceEntriesLocal);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [giDocs, setGiDocs] = useState<GreenInvoiceIncomeDocument[]>([]);
  const [giLastSync, setGiLastSync] = useState('');
  const [giSyncing, setGiSyncing] = useState(false);
  const [expenseDocs, setExpenseDocs] = useState<FinanceDocument[]>([]);
  const [docsError, setDocsError] = useState('');
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const withholdingRate = taxSettings.withholdingRate;
  const [homeView, setHomeView] = useState(false);
  const [form, setForm] = useState({ type: 'fixedExpense' as FinanceEntryType, scope: 'business' as FinanceScope, label: '', amount: '', date: todayIso() });

  // ── טעינה ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    // עותק מקומי של מסמכי ח"י לטעינה מיידית
    try {
      const raw = localStorage.getItem(GI_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed?.documents)) setGiDocs(parsed.documents);
      if (typeof parsed?.lastSync === 'string') setGiLastSync(parsed.lastSync);
    } catch { /* ignore */ }

    loadFinanceEntriesCloud().then(cloud => {
      if (!active) return;
      if (cloud) setEntries(cloud);
      setEntriesLoaded(true);
    });
    loadTaxSettings().then(t => { if (active) setTaxSettings(t); });

    if (getDocsApiKey()) {
      listDocuments({ direction: 'expense' })
        .then(docs => { if (active) setExpenseDocs(docs); })
        .catch(e => { if (active) setDocsError(String(e?.message || e)); });
    } else {
      setDocsError('חסר מפתח גישה למאגר המסמכים — פתחו פעם אחת את מסך "מסמכים" והזינו אותו');
    }
    return () => { active = false; };
  }, []);

  const persistEntries = (next: FinanceEntry[]) => {
    setEntries(next);
    saveFinanceEntries(next);
  };

  const syncGi = async () => {
    setGiSyncing(true);
    try {
      const result = await searchGreenInvoiceIncomeDocuments({ fromDate: `${year}-01-01`, toDate: `${year}-12-31` });
      if (!result.success) { alert(`שגיאה בסנכרון חשבונית ירוקה: ${result.error || 'לא ידוע'}`); return; }
      const docs = result.documents || [];
      const lastSync = new Date().toISOString();
      setGiDocs(docs);
      setGiLastSync(lastSync);
      localStorage.setItem(GI_STORAGE_KEY, JSON.stringify({ documents: docs, lastSync }));
      // עדכון גם בענן — כדי שלוח הדוחות יראה את אותם נתונים
      try {
        const s = await settingsService.get();
        await settingsService.update({ data: { ...(s?.data || {}), greenInvoiceIncomeDocuments: docs, greenInvoiceIncomeLastSync: lastSync } });
      } catch { /* ignore */ }
    } finally {
      setGiSyncing(false);
    }
  };

  const updateTaxSettings = (patch: Partial<TaxSettings>) => {
    const next = { ...taxSettings, ...patch };
    setTaxSettings(next);
    saveTaxSettings(next);
  };
  const updateWithholding = (v: number) => updateTaxSettings({ withholdingRate: Math.max(0, Math.min(50, v)) });

  // ── חישוב מרכזי ────────────────────────────────────────────────────────────
  const snap = useMemo(() => {
    // הכנסות ח"י לפי חודש (ברוטו, מע"מ, נטו)
    const incomeByMonth = new Map<string, { gross: number; vat: number; net: number }>();
    let grossIncomeYtd = 0, vatOutputYtd = 0, netIncomeYtd = 0;
    for (const d of giDocs) {
      const mk = String(d.date || '').slice(0, 7);
      if (!mk.startsWith(String(year))) continue;
      const gross = Number(d.amount || 0);
      const vat = d.vatAmount != null ? Number(d.vatAmount) : vatFromGross(gross);
      const net = d.netAmount != null ? Number(d.netAmount) : gross - vat;
      const row = incomeByMonth.get(mk) || { gross: 0, vat: 0, net: 0 };
      row.gross += gross; row.vat += vat; row.net += net;
      incomeByMonth.set(mk, row);
      grossIncomeYtd += gross; vatOutputYtd += vat; netIncomeYtd += net;
    }

    // הוצאות ממאגר המסמכים — מאושרים בלבד נכנסים לחישוב
    const confirmedDocs = expenseDocs.filter(d => d.reviewStatus === 'confirmed' && (d.docDate || '').startsWith(String(year)));
    const pendingDocsCount = expenseDocs.filter(d => d.reviewStatus !== 'confirmed').length;
    const docExpenseByMonth = new Map<string, { gross: number; vat: number }>();
    let docExpenseGrossYtd = 0, vatInputYtd = 0;
    for (const d of confirmedDocs) {
      const mk = (d.docDate || '').slice(0, 7);
      const gross = Number(d.totalAmount || 0);
      const vat = Number(d.vatAmount || 0);
      const row = docExpenseByMonth.get(mk) || { gross: 0, vat: 0 };
      row.gross += gross; row.vat += vat;
      docExpenseByMonth.set(mk, row);
      docExpenseGrossYtd += gross; vatInputYtd += vat;
    }

    // רישום ידני — עסק ובית, קבועות נפרשות מהחודש שהוזנו עד סוף השנה
    const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    let manualBusinessYtd = 0, donationsYtd = 0;
    let salaryMonthly = 0, homeFixedMonthly = 0;
    const homeVariableByMonth = new Map<string, number>();
    for (const e of entries) {
      const startMk = (e.date || '').slice(0, 7);
      if (!startMk.startsWith(String(year)) && !isRecurring(e)) continue;
      if (e.type === 'donation') {
        if (startMk.startsWith(String(year))) donationsYtd += e.amount;
        continue;
      }
      if (e.type === 'salary') { salaryMonthly += e.amount; continue; }
      if (entryScope(e) === 'home') {
        if (e.type === 'fixedExpense') homeFixedMonthly += e.amount;
        else homeVariableByMonth.set(startMk, (homeVariableByMonth.get(startMk) || 0) + e.amount);
        continue;
      }
      // עסק
      if (e.type === 'fixedExpense') {
        for (const mk of monthKeys) {
          if (mk <= currentMonthKey && mk >= startMk) manualBusinessYtd += e.amount;
        }
      } else if (startMk <= currentMonthKey && startMk.startsWith(String(year))) {
        manualBusinessYtd += e.amount;
      }
    }

    // ── מע"מ דו-חודשי ──
    const periods = vatPeriodsForYear(year).map(p => {
      const output = p.months.reduce((s, mk) => s + (incomeByMonth.get(mk)?.vat || 0), 0);
      const input = p.months.reduce((s, mk) => s + (docExpenseByMonth.get(mk)?.vat || 0), 0);
      const income = p.months.reduce((s, mk) => s + (incomeByMonth.get(mk)?.gross || 0), 0);
      const isPast = p.months[1] < currentMonthKey;
      const isCurrent = p.months.includes(currentMonthKey);
      return { ...p, output, input, toPay: Math.max(0, output - input), income, isPast, isCurrent };
    });
    const currentPeriod = periods.find(p => p.isCurrent) || periods[0];
    // התקופה שצריך לדווח עליה עכשיו: האחרונה שהסתיימה
    const periodToReport = [...periods].reverse().find(p => p.isPast) || null;

    // ── מס הכנסה שנתי ──
    // הוצאה מוכרת: מהמסמכים — נטו (החלק ללא מע"מ מקוזז); מהרישום הידני — מלא
    const docExpenseNetYtd = docExpenseGrossYtd - vatInputYtd;
    const businessExpensesYtd = docExpenseNetYtd + manualBusinessYtd;
    const taxableYtd = Math.max(0, netIncomeYtd - businessExpensesYtd);
    const annualizedTaxable = monthsElapsed > 0 ? (taxableYtd / monthsElapsed) * 12 : 0;
    const taxBeforeCredits = annualIncomeTax(annualizedTaxable);
    const annualizedDonations = monthsElapsed > 0 ? (donationsYtd / monthsElapsed) * 12 : 0;
    const creditFromDonations = donationCredit(annualizedDonations, annualizedTaxable);
    const taxAfterCredits = Math.max(0, taxBeforeCredits - creditFromDonations);
    // ניכוי במקור: הלקוחות מנכים אחוז מהתשלום (כולל מע"מ)
    const withheldYtd = grossIncomeYtd * (withholdingRate / 100);
    const annualizedWithheld = monthsElapsed > 0 ? (withheldYtd / monthsElapsed) * 12 : 0;
    const taxBalance = taxAfterCredits - annualizedWithheld; // חיובי = חוב, שלילי = החזר צפוי
    const nationalInsurance = annualizedTaxable * NATIONAL_INSURANCE_RATE;

    // ── כמה לשים בצד בחודש ──
    const vatReserveMonthly = periods.reduce((s, p) => s + p.toPay, 0) / 12;
    const taxReserveMonthly = Math.max(0, taxBalance) / 12;
    const biReserveMonthly = nationalInsurance / 12;
    const reserveMonthly = vatReserveMonthly + taxReserveMonthly + biReserveMonthly;

    // ── רווחיות ──
    // נטו חודשי מהעסק: הכנסה נטו ממוצעת − הוצאות − הפרשה למסים
    const avgMonthlyNetIncome = monthsElapsed > 0 ? netIncomeYtd / monthsElapsed : 0;
    const avgMonthlyExpenses = monthsElapsed > 0 ? businessExpensesYtd / monthsElapsed : 0;
    const businessMonthlyProfit = avgMonthlyNetIncome - avgMonthlyExpenses - taxReserveMonthly - biReserveMonthly;
    const annualProfit = businessMonthlyProfit * 12;

    // ── תזרים בית ── (כולל ההפרשה החודשית לסגירת חוב העבר, אם הוגדרה)
    const debtPaymentMonthly = taxSettings.monthlyDebtPayment || 0;
    const homeVariableThisMonth = homeVariableByMonth.get(currentMonthKey) || 0;
    const homeInflow = salaryMonthly + Math.max(0, businessMonthlyProfit);
    const homeOutflow = homeFixedMonthly + homeVariableThisMonth + debtPaymentMonthly;
    const homeBalance = homeInflow - homeOutflow;

    return {
      grossIncomeYtd, vatOutputYtd, netIncomeYtd,
      docExpenseGrossYtd, docExpenseNetYtd, vatInputYtd, manualBusinessYtd, businessExpensesYtd,
      pendingDocsCount, confirmedDocsCount: confirmedDocs.length,
      periods, currentPeriod, periodToReport,
      taxableYtd, annualizedTaxable, taxBeforeCredits, creditFromDonations, taxAfterCredits,
      donationsYtd, withheldYtd, annualizedWithheld, taxBalance, nationalInsurance,
      vatReserveMonthly, taxReserveMonthly, biReserveMonthly, reserveMonthly,
      avgMonthlyNetIncome, avgMonthlyExpenses, businessMonthlyProfit, annualProfit,
      salaryMonthly, homeFixedMonthly, homeVariableThisMonth, homeInflow, homeOutflow, homeBalance,
      debtPaymentMonthly,
    };
  }, [giDocs, expenseDocs, entries, taxSettings, withholdingRate, year, currentMonthKey, monthsElapsed]);

  // ── הוספת רישום מהירה ──────────────────────────────────────────────────────
  const addEntry = () => {
    const amount = Number(String(form.amount).replace(/,/g, ''));
    if (!form.label.trim() || !Number.isFinite(amount) || amount <= 0 || !form.date) return;
    persistEntries([{
      id: `fin_${Date.now()}`,
      type: form.type,
      scope: form.type === 'salary' ? 'home' : form.scope,
      label: form.label.trim(),
      amount,
      date: form.date,
    }, ...entries]);
    setForm(prev => ({ ...prev, label: '', amount: '' }));
  };

  const yearEntries = entries
    .filter(e => isRecurring(e) || (e.date || '').startsWith(String(year)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const kpiCard = (title: string, value: string, sub: string, icon: React.ReactNode, tone: string) => (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{title}</span>
        <span className={tone}>{icon}</span>
      </div>
      <div className="text-2xl font-black text-slate-800">{value}</div>
      <div className="text-[11px] font-bold text-slate-400 leading-snug">{sub}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* כותרת */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="text-indigo-600" size={22} />
          <h1 className="text-xl font-black text-slate-800">מצב מס ותזרים — {year}</h1>
          <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100">הערכה — לא תחליף לרו"ח</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHomeView(v => !v)}
            className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl border transition ${homeView ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}
          >
            {homeView ? <Home size={14} /> : <Briefcase size={14} />}
            {homeView ? 'מבט משק בית' : 'מבט עסק'}
          </button>
          <button
            onClick={syncGi}
            disabled={giSyncing}
            className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={giSyncing ? 'animate-spin' : ''} />
            סנכרון ח"י
          </button>
        </div>
      </div>

      {giLastSync && (
        <div className="text-[11px] font-bold text-slate-400 -mt-3">
          נתוני חשבונית ירוקה עודכנו: {new Date(giLastSync).toLocaleString('he-IL')} · {giDocs.length} מסמכים
        </div>
      )}
      {docsError && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl px-3 py-2">
          <AlertTriangle size={14} /> {docsError}
        </div>
      )}
      {snap.pendingDocsCount > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-800 text-xs font-bold rounded-xl px-3 py-2">
          <FileText size={14} />
          {snap.pendingDocsCount} מסמכי הוצאה ממתינים לאישור במסך המסמכים — הם לא נכללים בחישוב עד שיאושרו
        </div>
      )}

      {!homeView ? (
        <>
          {/* KPI עסק */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpiCard('הכנסות מתחילת השנה (ח"י)', fmt(snap.grossIncomeYtd), `נטו לפני מע"מ: ${fmt(snap.netIncomeYtd)}`, <TrendingUp size={18} />, 'text-emerald-500')}
            {kpiCard('הוצאות מוכרות', fmt(snap.businessExpensesYtd), `${snap.confirmedDocsCount} מסמכים מאושרים + רישום ידני ${fmt(snap.manualBusinessYtd)}`, <TrendingDown size={18} />, 'text-rose-500')}
            {kpiCard(
              snap.periodToReport ? `מע"מ לדיווח (${snap.periodToReport.label})` : 'מע"מ — אין תקופה שהסתיימה',
              snap.periodToReport ? fmt(snap.periodToReport.toPay) : '—',
              snap.periodToReport ? `לדווח עד ${new Date(snap.periodToReport.reportDueDate).toLocaleDateString('he-IL')}` : '',
              <Landmark size={18} />, 'text-indigo-500',
            )}
            {kpiCard('רווח חודשי נקי משוער', fmtSigned(snap.businessMonthlyProfit), `אחרי הוצאות, מע"מ, מס וב"ל · שנתי: ${fmtSigned(snap.annualProfit)}`, <PiggyBank size={18} />, snap.businessMonthlyProfit >= 0 ? 'text-emerald-500' : 'text-rose-500')}
          </div>

          {/* מע"מ דו-חודשי */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h2 className="text-sm font-black text-slate-700 mb-3">מע"מ — דיווח דו-חודשי</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 font-black text-right border-b border-slate-100">
                    <th className="py-2 pl-3">תקופה</th>
                    <th className="py-2 pl-3">הכנסות</th>
                    <th className="py-2 pl-3">מע"מ עסקאות</th>
                    <th className="py-2 pl-3">מע"מ תשומות</th>
                    <th className="py-2 pl-3">לתשלום</th>
                    <th className="py-2 pl-3">מועד דיווח</th>
                    <th className="py-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.periods.map(p => (
                    <tr key={p.key} className={`border-b border-slate-50 font-bold ${p.isCurrent ? 'bg-indigo-50/60' : ''}`}>
                      <td className="py-2 pl-3 text-slate-700">{p.label}</td>
                      <td className="py-2 pl-3 text-slate-600">{fmt(p.income)}</td>
                      <td className="py-2 pl-3 text-slate-600">{fmt(p.output)}</td>
                      <td className="py-2 pl-3 text-emerald-600">−{fmt(p.input).slice(1)}</td>
                      <td className="py-2 pl-3 font-black text-slate-800">{fmt(p.toPay)}</td>
                      <td className="py-2 pl-3 text-slate-500">{new Date(p.reportDueDate).toLocaleDateString('he-IL')}</td>
                      <td className="py-2">
                        {p.isPast
                          ? <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">הסתיימה</span>
                          : p.isCurrent
                            ? <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">נוכחית</span>
                            : <span className="text-[10px] font-black bg-slate-50 text-slate-400 px-2 py-0.5 rounded-md">עתידית</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] font-bold text-slate-400 mt-2">
              מע"מ תשומות — רק ממסמכי הוצאה מאושרים במאגר המסמכים ({fmt(snap.vatInputYtd)} מתחילת השנה)
            </div>
          </div>

          {/* מס הכנסה + ביטוח לאומי */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
              <h2 className="text-sm font-black text-slate-700 mb-1">מס הכנסה — תחזית שנתית</h2>
              {[
                ['רווח חייב במס (שנתי, לפי קצב נוכחי)', fmt(snap.annualizedTaxable)],
                ['מס לפי מדרגות', fmt(snap.taxBeforeCredits)],
                ['זיכוי תרומות (35%)', `−${fmt(snap.creditFromDonations).slice(1)}`],
                ['מס לאחר זיכוי', fmt(snap.taxAfterCredits)],
                [`נוכה במקור (${withholdingRate}% מההכנסות)`, `−${fmt(snap.annualizedWithheld).slice(1)}`],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>{label}</span><span>{value}</span>
                </div>
              ))}
              <div className={`flex items-center justify-between text-sm font-black rounded-xl px-3 py-2 ${snap.taxBalance > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <span>{snap.taxBalance > 0 ? 'צפי חוב מס בסוף השנה' : 'צפי החזר מס בסוף השנה'}</span>
                <span>{fmt(Math.abs(snap.taxBalance))}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 pt-1">
                אחוז ניכוי במקור:
                <input
                  type="number" min={0} max={50}
                  value={withholdingRate}
                  onChange={e => updateWithholding(Number(e.target.value))}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-center"
                />%
                <span className="text-slate-400">· תרומות שנרשמו: {fmt(snap.donationsYtd)}</span>
              </div>
              <p className="text-[11px] font-bold text-amber-600 leading-snug">
                ⚠ לפי נתוני רשות המסים (נתוני עזר לדוח השנתי 2025): 39 מנכים דיווחו עסקאות של 299,111 ₪ — ומס שנוכה בפועל: 0 ₪. הלקוחות משלמים סכום מלא ולא מנכים במקור. לכן המקדמות הדו-חודשיות ({taxSettings.advanceRate}% מהמחזור) הן תשלום המס היחיד מראש — חובה לשלם אותן בפועל, אחרת נצבר חוב.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
              <h2 className="text-sm font-black text-slate-700 mb-1">כמה לשים בצד כל חודש</h2>
              {[
                ['מע"מ (ממוצע חודשי)', snap.vatReserveMonthly],
                ['מס הכנסה (מעבר לניכוי במקור)', snap.taxReserveMonthly],
                ['ביטוח לאומי (הערכה 12%)', snap.biReserveMonthly],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>{label}</span><span>{fmt(value as number)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-black bg-indigo-50 text-indigo-700 rounded-xl px-3 py-2">
                <span>סה"כ הפרשה חודשית מומלצת</span>
                <span>{fmt(snap.reserveMonthly)}</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400 leading-snug">
                אם תפרישו את הסכום הזה לחשבון נפרד כל חודש — לא ייווצר חוב מפתיע לרשויות.
              </p>
            </div>
          </div>

          {/* בור העבר — חובות קיימים */}
          <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-black text-slate-700 flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-500" />
                חובות קיימים לרשויות (בור העבר)
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                נכון ל:
                <input
                  type="date"
                  value={taxSettings.debtAsOf}
                  onChange={e => updateTaxSettings({ debtAsOf: e.target.value })}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-rose-50/60 rounded-xl p-3">
                <div className="text-[11px] font-bold text-slate-500 mb-1">חוב מע"מ</div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-slate-700">₪</span>
                  <input
                    type="number" min={0}
                    value={taxSettings.vatDebt}
                    onChange={e => updateTaxSettings({ vatDebt: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full bg-transparent text-lg font-black text-rose-700 outline-none"
                  />
                </div>
                <div className="text-[10px] font-bold text-slate-400 leading-snug mt-1">
                  פירוק (18/08/26): קרן 36,801 · קביעה 22,708 · קנסות 24,037 · ריבית 9,460 — כמחצית מהחוב הם קנסות וקביעה שניתן לחתוך
                </div>
              </div>
              <div className="bg-rose-50/60 rounded-xl p-3">
                <div className="text-[11px] font-bold text-slate-500 mb-1">חוב מס הכנסה</div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-slate-700">₪</span>
                  <input
                    type="number" min={0}
                    value={taxSettings.incomeTaxDebt}
                    onChange={e => updateTaxSettings({ incomeTaxDebt: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full bg-transparent text-lg font-black text-rose-700 outline-none"
                  />
                </div>
                <div className="text-[10px] font-bold text-slate-400 leading-snug mt-1">
                  דוחות שנתיים 2024 ו-2025 טרם הוגשו — הסכום יתעדכן אחרי ההגשה
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[11px] font-bold text-slate-500 mb-1">סה"כ חוב</div>
                <div className="text-lg font-black text-slate-800">{fmt(taxSettings.vatDebt + taxSettings.incomeTaxDebt)}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">עדכנו את הסכומים כאן אחרי כל תשלום או הסדר</div>
              </div>
              <div className="bg-indigo-50/60 rounded-xl p-3">
                <div className="text-[11px] font-bold text-slate-500 mb-1">הפרשה חודשית לסגירת החוב</div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-slate-700">₪</span>
                  <input
                    type="number" min={0}
                    value={taxSettings.monthlyDebtPayment}
                    onChange={e => updateTaxSettings({ monthlyDebtPayment: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full bg-transparent text-lg font-black text-indigo-700 outline-none"
                    placeholder="0"
                  />
                </div>
                <div className="text-[10px] font-bold text-slate-400 leading-snug mt-1">
                  {taxSettings.monthlyDebtPayment > 0
                    ? `בקצב הזה החוב נסגר בעוד ${Math.ceil((taxSettings.vatDebt + taxSettings.incomeTaxDebt) / taxSettings.monthlyDebtPayment)} חודשים`
                    : 'הזינו סכום כדי לראות תוך כמה חודשים החוב נסגר'}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* KPI בית */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpiCard('נכנס בחודש', fmt(snap.homeInflow), `משכורות ${fmt(snap.salaryMonthly)} + עסק נטו ${fmtSigned(Math.max(0, snap.businessMonthlyProfit))}`, <TrendingUp size={18} />, 'text-emerald-500')}
            {kpiCard('יוצא בחודש (בית)', fmt(snap.homeOutflow), `קבועות ${fmt(snap.homeFixedMonthly)} + שוטפות ${fmt(snap.homeVariableThisMonth)}${snap.debtPaymentMonthly > 0 ? ` + החזר חוב ${fmt(snap.debtPaymentMonthly)}` : ''}`, <TrendingDown size={18} />, 'text-rose-500')}
            {kpiCard('נשאר בחודש', fmtSigned(snap.homeBalance), snap.homeBalance >= 0 ? 'תזרים חיובי' : 'תזרים שלילי — ההוצאות גבוהות מההכנסות', <PiggyBank size={18} />, snap.homeBalance >= 0 ? 'text-emerald-500' : 'text-rose-500')}
            {kpiCard('הפרשה למסים (עסק)', fmt(snap.reserveMonthly), 'כבר מחושבת בתוך "עסק נטו"', <Landmark size={18} />, 'text-indigo-500')}
          </div>
          <p className="text-[11px] font-bold text-slate-400 -mt-2">
            "עסק נטו" = הכנסות נטו ממוצעות פחות הוצאות עסק פחות הפרשה למס וביטוח לאומי. המשכורת מוצגת כפי שהוזנה (נטו לחשבון).
          </p>
        </>
      )}

      {/* ניהול רישומים — משותף לשני המבטים */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-black text-slate-700 mb-3">רישומים קבועים וחד-פעמיים</h2>

        {/* הזנה מהירה */}
        <div className="flex flex-wrap items-center gap-2 mb-3 bg-slate-50 rounded-xl p-2">
          <select
            value={form.type}
            onChange={e => setForm(prev => ({ ...prev, type: e.target.value as FinanceEntryType }))}
            className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="fixedExpense">הוצאה קבועה (חודשית)</option>
            <option value="variableExpense">הוצאה חד-פעמית</option>
            <option value="donation">תרומה</option>
            <option value="salary">משכורת (חודשית)</option>
          </select>
          {form.type !== 'salary' && (
            <select
              value={form.scope}
              onChange={e => setForm(prev => ({ ...prev, scope: e.target.value as FinanceScope }))}
              className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="business">עסק</option>
              <option value="home">בית</option>
            </select>
          )}
          <input
            value={form.label}
            onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addEntry()}
            placeholder="תיאור (חשמל, ארנונה, משכורת רייזי...)"
            className="flex-1 min-w-40 text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5"
          />
          <input
            value={form.amount}
            onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addEntry()}
            placeholder="סכום"
            inputMode="decimal"
            className="w-24 text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5"
          />
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
            className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5"
          />
          <button onClick={addEntry} className="inline-flex items-center gap-1 text-xs font-black bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
            <Plus size={13} /> הוסף
          </button>
        </div>

        {/* טבלת רישומים */}
        {yearEntries.length === 0 ? (
          <div className="text-xs font-bold text-slate-400 text-center py-4">אין רישומים עדיין — הוסיפו את ההוצאות הקבועות והמשכורת למעלה</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 font-black text-right border-b border-slate-100">
                  <th className="py-1.5 pl-3">סוג</th>
                  <th className="py-1.5 pl-3">עסק/בית</th>
                  <th className="py-1.5 pl-3">תיאור</th>
                  <th className="py-1.5 pl-3">סכום</th>
                  <th className="py-1.5 pl-3">מתאריך</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {yearEntries.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 font-bold text-slate-600">
                    <td className="py-1.5 pl-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        e.type === 'donation' ? 'bg-pink-100 text-pink-700'
                        : e.type === 'salary' ? 'bg-emerald-100 text-emerald-700'
                        : e.type === 'fixedExpense' ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'}`}>
                        {ENTRY_TYPE_LABELS[e.type]}
                      </span>
                    </td>
                    <td className="py-1.5 pl-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md ${entryScope(e) === 'home' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {entryScope(e) === 'home' ? <Home size={10} /> : <Briefcase size={10} />}
                        {entryScope(e) === 'home' ? 'בית' : 'עסק'}
                      </span>
                    </td>
                    <td className="py-1.5 pl-3 text-slate-700">{e.label}</td>
                    <td className="py-1.5 pl-3 font-black text-slate-800">{fmt(e.amount)}{isRecurring(e) ? ' / חודש' : ''}</td>
                    <td className="py-1.5 pl-3 text-slate-400">{new Date(e.date).toLocaleDateString('he-IL')}</td>
                    <td className="py-1.5 text-left">
                      <button
                        onClick={() => persistEntries(entries.filter(x => x.id !== e.id))}
                        className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                        title="מחיקה"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entriesLoaded && (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-2">
            <CheckCircle2 size={11} className="text-emerald-500" /> הרישומים נשמרים בענן — זמינים מכל מכשיר
          </div>
        )}
      </div>
    </div>
  );
};

export default TaxBoard;
