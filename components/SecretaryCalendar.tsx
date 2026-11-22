import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Package, UserRound } from 'lucide-react';
import { EventType, type AppEvent, type Customer } from '../types';
import { localDateKey } from '../services/secretaryDesk';
import { summarizeCalendarDays, type SecretaryCalendarDay } from '../services/secretaryCalendar';
import SecretaryDialog from './SecretaryDialog';
import { bookingStatusLabel } from '../services/bookingApproval';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const monthOf = (key: string) => { const [year, month] = key.split('-').map(Number); return new Date(year, month - 1, 1, 12); };
const fullDate = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };

const equipment = (event: AppEvent) => {
  const count = Number(event.clickersNeeded);
  if (!Number.isFinite(count) || count <= 0) return '';
  if ([EventType.ClickAurimProgram, EventType.ClickForYouAurim].includes(event.eventType)) return `${count.toLocaleString('he-IL')} קליקאורים`;
  if ([EventType.ClickersProgram, EventType.ClickForYouClickers].includes(event.eventType)) return `${count.toLocaleString('he-IL')} קליקרים`;
  return '';
};

const CalendarDayDetails: React.FC<{ date: string; day?: SecretaryCalendarDay; customers: Customer[]; onClose: () => void }> = ({ date, day, customers, onClose }) => {
  const dayEvents = [
    ...(day?.booked || []).map(event => ({ event, pending: false })),
    ...(day?.pending || []).map(event => ({ event, pending: true })),
  ].sort((a, b) => {
    if (!a.event.startTime) return b.event.startTime ? 1 : 0;
    if (!b.event.startTime) return -1;
    return a.event.startTime.localeCompare(b.event.startTime);
  });

  return <SecretaryDialog title={`אירועים ל${fullDate(date)}`} onClose={onClose}>
    {dayEvents.length === 0 ? <p className="text-sm text-slate-600">אין אירועים רשומים ליום זה.</p> : <>
      <p className="mb-3 text-sm text-slate-600">{dayEvents.length} אירועים · {day?.booked.length || 0} שוריינו{day?.pending.length ? ` · ${day.pending.length} ממתינים לאישור` : ''}</p>
      <ul className="space-y-3">
        {dayEvents.map(({ event, pending }) => {
          const customer = customers.find(item => item.id === event.customerId);
          const quantity = equipment(event);
          return <li key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="min-w-0 break-words font-bold text-slate-900">{event.title || 'אירוע ללא שם'}</h4>
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${pending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{bookingStatusLabel(event.status)}</span>
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <p className="flex items-center gap-1.5"><Clock size={15} className="shrink-0" />{event.startTime || event.endTime ? <span dir="ltr">{event.startTime || '—'}{event.endTime ? `–${event.endTime}` : ''}</span> : 'שעה לא צוינה'}</p>
              {customer?.name && <p className="flex items-center gap-1.5"><UserRound size={15} className="shrink-0" />{customer.name}</p>}
              {event.location && <p className="flex items-start gap-1.5"><MapPin size={15} className="mt-0.5 shrink-0" /><span className="break-words">{event.location}</span></p>}
              {event.eventType && <p>{event.eventType}</p>}
              {quantity && <p className="flex items-center gap-1.5"><Package size={15} className="shrink-0" />{quantity}</p>}
            </div>
            <Link to={`/events?eventId=${encodeURIComponent(event.id)}`} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-sky-700 hover:underline">פתיחת פרטי האירוע <ChevronLeft size={15} /></Link>
          </li>;
        })}
      </ul>
    </>}
  </SecretaryDialog>;
};

const SecretaryCalendar: React.FC<{ events: AppEvent[]; customers: Customer[]; today: string }> = ({ events, customers, today }) => {
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [detailsDate, setDetailsDate] = useState<string | null>(null);
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
    <style>{`@media (max-height: 650px) {
      .secretary-calendar-cell { padding: 1px 2px; }
      .secretary-calendar-date { display: flex; align-items: center; justify-content: space-between; font-size: 9px; line-height: 9px; }
      .secretary-calendar-inline-events { display: inline; font-size: 8px; line-height: 8px; }
      .secretary-calendar-events { display: none; }
      .secretary-calendar-clickers { font-size: 8px; line-height: 8px; }
      .secretary-calendar-pending { position: absolute; top: 2px; left: 2px; width: 5px; height: 5px; overflow: hidden; font-size: 0; background: #d97706; border-radius: 9999px; }
    }`}</style>
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
        const day = days.get(key);
        const bookings = day?.booked.length || 0;
        const pending = day?.pending.length || 0;
        const clickers = day?.clickers || 0;
        const eventCount = bookings + pending;
        return <button key={key} type="button" onClick={() => { setSelected(key); setDetailsDate(key); }} aria-pressed={selected === key} aria-haspopup="dialog" aria-label={`${fullDate(key)}: ${bookings} אירועים שוריינו, ${clickers} קליקרים מוזמנים${pending ? `, ${pending} ממתינים לאישור` : ''}`} className={`secretary-calendar-cell relative min-w-0 min-h-0 overflow-hidden rounded-lg border px-1 py-0.5 text-right leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-700 ${eventCount ? 'border-sky-400 bg-sky-200 hover:bg-sky-300' : 'border-slate-100 bg-slate-50/70 hover:border-violet-300'} ${selected === key ? 'ring-2 ring-inset ring-violet-600' : ''}`}>
          <span className={`secretary-calendar-date block text-xs font-black ${key === today ? 'text-violet-700' : 'text-slate-700'}`}>{Number(key.slice(-2))}<span className="secretary-calendar-inline-events hidden font-bold text-slate-700">{eventCount} איר׳</span></span>
          <span className="secretary-calendar-events block text-[9px] font-bold text-slate-700 whitespace-nowrap">{eventCount} <span className="xl:hidden">איר׳</span><span className="hidden xl:inline">אירועים</span></span>
          <span className="secretary-calendar-clickers block text-[9px] text-slate-600 whitespace-nowrap">{clickers.toLocaleString('he-IL')} <span className="xl:hidden">קל׳</span><span className="hidden xl:inline">קליקרים</span></span>
          {!!pending && <span className="secretary-calendar-pending block text-[9px] text-amber-700 whitespace-nowrap">{pending} לאישור</span>}
        </button>;
      })}
    </div>
    <p className="pt-1 text-[10px] leading-tight text-slate-600 shrink-0">ימים כחולים כוללים אירועים · לחצו על יום לפירוט<br />סך הקליקרים שהוזמנו ליום; זמינות תלויה גם בשעות האירועים.</p>
    {detailsDate && <CalendarDayDetails date={detailsDate} day={days.get(detailsDate)} customers={customers} onClose={() => setDetailsDate(null)} />}
  </section>;
};
export default SecretaryCalendar;
