import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppEvent } from '../types';
import { localDateKey } from '../services/secretaryDesk';
import { summarizeCalendarDays } from '../services/secretaryCalendar';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const monthOf = (key: string) => { const [year, month] = key.split('-').map(Number); return new Date(year, month - 1, 1, 12); };
const fullDate = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); };

const SecretaryCalendar: React.FC<{ events: AppEvent[]; today: string }> = ({ events, today }) => {
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const days = useMemo(() => summarizeCalendarDays(events), [events]);
  const selectedDay = days.get(selected);
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1, 12).getDay();
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= lastDay ? localDateKey(new Date(month.getFullYear(), month.getMonth(), day, 12)) : '';
  });
  const moveMonth = (offset: number) => { const next = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12); setMonth(next); setSelected(localDateKey(next)); };
  const goToday = () => { setMonth(monthOf(today)); setSelected(today); };

  return <section className="h-full min-h-0 flex flex-col rounded-2xl border border-sky-200 bg-sky-50/60 p-3 shadow-sm" aria-labelledby="secretary-calendar-heading">
    <div className="flex items-center justify-between gap-1 shrink-0">
      <h2 id="secretary-calendar-heading" className="font-black text-sky-950 flex items-center gap-1"><CalendarDays size={18} className="text-sky-700" /> לוח שנה</h2>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="חודש קודם" className="rounded-lg p-1 hover:bg-slate-100"><ChevronRight size={17} /></button>
        <span className="text-xs font-black text-center min-w-[80px]">{month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={() => moveMonth(1)} aria-label="חודש הבא" className="rounded-lg p-1 hover:bg-slate-100"><ChevronLeft size={17} /></button>
        <button type="button" onClick={goToday} className="rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700">היום</button>
      </div>
    </div>
    <div className="mt-2 rounded-xl bg-sky-100 px-3 py-2 shrink-0" aria-live="polite">
      <p className="text-xs font-bold text-sky-900">{fullDate(selected)}</p>
      <div className="flex flex-wrap items-baseline gap-x-4 text-sky-900"><p><strong className="text-lg">{selectedDay?.booked.length || 0}</strong> <span className="text-xs font-bold">אירועים שוריינו</span></p><p><strong className="text-lg">{(selectedDay?.clickers || 0).toLocaleString('he-IL')}</strong> <span className="text-xs font-bold">קליקרים מוזמנים</span></p>{!!selectedDay?.clickaorim && <p className="text-xs font-bold">{selectedDay.clickaorim} קליקאורים</p>}{!!selectedDay?.pending.length && <p className="text-xs text-amber-800">{selectedDay.pending.length} ממתינים לאישור</p>}</div>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 shrink-0">{WEEKDAYS.map(day => <div key={day} className="py-1">{day}</div>)}</div>
    <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
      {cells.map((key, index) => {
        if (!key) return <div key={`blank-${index}`} aria-hidden="true" />;
        const day = days.get(key); const bookings = day?.booked.length || 0; const clickers = day?.clickers || 0;
        return <button key={key} type="button" onClick={() => setSelected(key)} aria-pressed={selected === key} aria-label={`${fullDate(key)}: ${bookings} אירועים שוריינו, ${clickers} קליקרים מוזמנים${day?.pending.length ? `, ${day.pending.length} ממתינים לאישור` : ''}`} className={`min-w-0 min-h-0 overflow-hidden rounded-lg border px-1 py-0.5 text-right leading-tight ${selected === key ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-300' : 'border-slate-100 bg-slate-50/70 hover:border-violet-300'}`}>
          <span className={`block text-xs font-black ${key === today ? 'text-violet-700' : 'text-slate-700'}`}>{Number(key.slice(-2))}</span>
          <span className="block text-[9px] font-bold text-slate-700 whitespace-nowrap">{bookings} אירועים</span>
          <span className="block text-[9px] text-slate-500 whitespace-nowrap">{clickers.toLocaleString('he-IL')} קליקרים</span>
          {!!day?.pending.length && <span className="block text-[9px] text-amber-700 whitespace-nowrap">{day.pending.length} לאישור</span>}
        </button>;
      })}
    </div>
    <p className="pt-1 text-[10px] leading-tight text-slate-500 shrink-0">סך הקליקרים שהוזמנו ליום; זמינות תלויה גם בשעות האירועים.</p>
  </section>;
};
export default SecretaryCalendar;
