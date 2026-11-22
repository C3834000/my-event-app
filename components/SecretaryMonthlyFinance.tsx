import React, { useMemo } from 'react';
import type { AppEvent } from '../types';
import { summarizeSecretaryMonthlyFinance } from '../services/secretaryMonthlyFinance';

const money = (amount: number) => `₪${amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

const SecretaryMonthlyFinance: React.FC<{ events: AppEvent[]; today: string; ready: boolean }> = ({ events, today, ready }) => {
  const totals = useMemo(() => summarizeSecretaryMonthlyFinance(events, today), [events, today]);
  const [year, month] = today.split('-').map(Number);
  const monthName = new Date(year, month - 1, 1, 12).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  return <section aria-label={`כספים לחודש ${monthName}`} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
    <div className="grid grid-cols-3 gap-3">
      <div className="min-w-0"><p className="text-[11px] font-bold text-slate-500">אירועים משוריינים ל{monthName}</p><p className="text-base font-black text-violet-800">{ready ? money(totals.booked) : '—'}</p></div>
      <div className="min-w-0"><p className="text-[11px] font-bold text-slate-500">הזמנות שנוצרו החודש</p><p className="text-base font-black text-sky-700">{ready && (totals.datedBookings > 0 || totals.undatedBookings === 0) ? money(totals.created) : '—'}</p></div>
      <div className="min-w-0"><p className="text-[11px] font-bold text-slate-500">שולם לפי תאריך תשלום החודש</p><p className="text-base font-black text-emerald-700">{ready ? money(totals.paid) : '—'}</p></div>
    </div>
    <p className="text-[10px] leading-tight text-slate-500">ההזמנות לפי מועד יצירת הרשומה, כולל ייבוא; התשלום לפי התאריך הרשום, שעשוי להיות מוסכם, ללא פירוט תשלומים חלקיים.{ready && totals.undatedBookings > 0 ? ` ${totals.undatedBookings} הזמנות ללא תאריך יצירה אינן כלולות.` : ''}{ready && totals.undatedPayments > 0 ? ` ${totals.undatedPayments} תשלומים ללא תאריך אינם כלולים.` : ''}</p>
  </section>;
};

export default SecretaryMonthlyFinance;
