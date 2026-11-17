import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AppEvent, EventStatus } from '../types';
import { MAX_CLICKER_CAPACITY, capacityUsedDuring, eventToInterval } from '../services/availability';
import {
  HebrewDate,
  hebrewDayLabel,
  hebrewHoliday,
  hebrewMonthDays,
  hebrewMonthLabel,
  startOfHebrewMonth,
  toHebrew,
} from '../utils/hebrewDate';

type Mode = 'gregorian' | 'hebrew';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const eventKey = (ev: AppEvent) => (ev.date ? (ev.date.includes('T') ? ev.date.split('T')[0] : ev.date.slice(0, 10)) : '');

type DayInfo = {
  date: Date;
  key: string;
  heb: HebrewDate;
  holiday: string;
  events: AppEvent[];
  clickers: number;
  /** שיא קליקרים בו-זמנית באותו יום */
  peak: number;
};

/** שיא השימוש בקליקרים באותו יום: בודקים בתחילת כל אירוע כמה קליקרים תפוסים במקביל */
function peakClickers(events: AppEvent[]): number {
  let peak = 0;
  for (const ev of events) {
    const int = eventToInterval(ev);
    if (!int) continue;
    peak = Math.max(peak, capacityUsedDuring(events, int.startMs, int.startMs + 1));
  }
  return peak;
}

/** צבע היום לפי עומס הקליקרים (מתוך המלאי) */
function loadClass(day: DayInfo): string {
  if (!day.events.length) return day.date.getDay() === 6 || day.holiday ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200';
  const ratio = day.peak / MAX_CLICKER_CAPACITY;
  if (ratio >= 0.85) return 'bg-rose-100 border-rose-300';
  if (ratio >= 0.5) return 'bg-amber-100 border-amber-300';
  return 'bg-purple-100 border-purple-300';
}

const CalendarBoard: React.FC = () => {
  const { events, tasks } = useApp();
  const [mode, setMode] = useState<Mode>('gregorian');
  /** תאריך עוגן לחודש המוצג */
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const todayKey = dateKey(new Date());

  const activeEvents = useMemo(() => events.filter((e) => e.status !== EventStatus.Cancelled), [events]);
  const eventsByDay = useMemo(() => {
    const m = new Map<string, AppEvent[]>();
    for (const ev of activeEvents) {
      const k = eventKey(ev);
      if (!k) continue;
      m.set(k, [...(m.get(k) || []), ev]);
    }
    for (const list of m.values()) list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    return m;
  }, [activeEvents]);

  const openTasksByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.isCompleted || !t.dueDate) continue;
      const k = t.dueDate.slice(0, 10);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [tasks]);

  const days: Date[] = useMemo(() => {
    if (mode === 'hebrew') return hebrewMonthDays(startOfHebrewMonth(anchor));
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const out: Date[] = [];
    for (const d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [anchor, mode]);

  const cells: DayInfo[] = useMemo(
    () =>
      days.map((date) => {
        const key = dateKey(date);
        const heb = toHebrew(date);
        const dayEvents = eventsByDay.get(key) || [];
        return {
          date,
          key,
          heb,
          holiday: hebrewHoliday(heb, date),
          events: dayEvents,
          clickers: dayEvents.reduce((s, e) => s + Math.max(0, Number(e.clickersNeeded) || 0), 0),
          peak: peakClickers(dayEvents),
        };
      }),
    [days, eventsByDay],
  );

  const title = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    const greg = (d: Date) => d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const hebFirst = toHebrew(first);
    const hebLast = toHebrew(last);
    const hebRange =
      hebFirst.month === hebLast.month ? hebrewMonthLabel(hebFirst) : `${hebFirst.month}–${hebrewMonthLabel(hebLast)}`;
    const gregRange = greg(first) === greg(last) ? greg(first) : `${first.toLocaleDateString('he-IL', { month: 'long' })}–${greg(last)}`;
    return mode === 'hebrew' ? { main: hebrewMonthLabel(hebFirst), sub: gregRange } : { main: greg(first), sub: hebRange };
  }, [days, mode]);

  const move = (dir: -1 | 1) => {
    setSelectedKey(null);
    if (mode === 'gregorian') {
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1, 12));
      return;
    }
    const start = startOfHebrewMonth(anchor);
    const next = new Date(start);
    next.setDate(next.getDate() + (dir === 1 ? 31 : -1));
    setAnchor(startOfHebrewMonth(next));
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    setAnchor(d);
    setSelectedKey(dateKey(d));
  };

  const monthTotals = useMemo(
    () => ({
      events: cells.reduce((s, c) => s + c.events.length, 0),
      busyDays: cells.filter((c) => c.events.length).length,
    }),
    [cells],
  );

  const leading = days[0].getDay();
  const selected = cells.find((c) => c.key === selectedKey) || null;

  return (
    <div className="w-full space-y-3 dir-rtl pb-16" dir="rtl">
      {/* pr-14 בטלפון: מקום לכפתור התפריט הקבוע בפינה */}
      <div className="flex flex-wrap items-center gap-2 pr-14 lg:pr-0">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="החודש הקודם">
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => move(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="החודש הבא">
            <ChevronLeft size={18} />
          </button>
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-800 leading-tight">{title.main}</h1>
          <p className="text-xs font-bold text-purple-700">{title.sub}</p>
        </div>
        <button type="button" onClick={goToday} className="text-xs font-black px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700">
          היום
        </button>
        <div className="mr-auto flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-bold text-slate-500">
            {monthTotals.events} אירועים ב-{monthTotals.busyDays} ימים
          </span>
          <div className="flex rounded-full bg-slate-100 p-0.5" role="tablist" aria-label="סוג חודש">
            {(['gregorian', 'hebrew'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setSelectedKey(null);
                }}
                className={`px-3 py-1 rounded-full text-xs font-black ${mode === m ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
              >
                {m === 'gregorian' ? 'חודש לועזי' : 'חודש עברי'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`text-center text-[11px] font-black py-1 ${i === 6 ? 'text-blue-600' : 'text-slate-400'}`}>
            {w}
          </div>
        ))}
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {cells.map((c) => {
          const isToday = c.key === todayKey;
          const isShabbat = c.date.getDay() === 6;
          const tasksDue = openTasksByDay.get(c.key) || 0;
          const big = mode === 'hebrew' ? hebrewDayLabel(c.heb) : String(c.date.getDate());
          const small =
            mode === 'hebrew'
              ? c.date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
              : `${hebrewDayLabel(c.heb)}${c.heb.day === 1 ? ` ${c.heb.month}` : ''}`;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelectedKey(c.key === selectedKey ? null : c.key)}
              className={`relative text-right rounded-xl border p-1.5 sm:p-2 min-h-[76px] sm:min-h-[104px] flex flex-col gap-0.5 transition-shadow hover:shadow-md ${loadClass(c)} ${isToday ? 'ring-2 ring-sky-500' : ''} ${selectedKey === c.key ? 'ring-2 ring-slate-800' : ''}`}
              aria-label={`${c.date.toLocaleDateString('he-IL')} ${hebrewDayLabel(c.heb)} ${c.heb.month}: ${c.events.length} אירועים, ${c.clickers} קליקרים`}
            >
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-1 leading-tight">
                <span className={`text-sm sm:text-base font-black ${isShabbat ? 'text-blue-700' : 'text-slate-800'}`}>{big}</span>
                <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 sm:truncate">{small}</span>
              </div>
              {c.holiday ? (
                <span className="text-[9px] sm:text-[10px] font-bold text-rose-600 leading-tight sm:truncate">{c.holiday}</span>
              ) : isShabbat ? (
                <span className="hidden sm:inline text-[10px] font-bold text-blue-600">שבת</span>
              ) : null}
              {c.events.length > 0 && (
                <div className="mt-auto space-y-0.5">
                  <p className="text-[10px] sm:text-xs font-black text-slate-800 leading-tight">
                    {c.events.length}
                    <span className="hidden sm:inline"> {c.events.length === 1 ? 'אירוע' : 'אירועים'}</span>
                    <span className="sm:hidden"> אר׳</span>
                  </p>
                  <p className="text-[10px] sm:text-xs font-bold text-slate-700 leading-tight" title={`שיא בו-זמנית: ${c.peak} מתוך ${MAX_CLICKER_CAPACITY}`}>
                    <span className="hidden sm:inline">🖱️ </span>
                    {c.clickers.toLocaleString('he-IL')}
                    <span className="hidden sm:inline text-slate-500 font-medium"> קליקרים</span>
                    <span className="sm:hidden text-slate-500"> קל׳</span>
                  </p>
                </div>
              )}
              {tasksDue > 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] font-bold text-sky-700" title={`${tasksDue} משימות פתוחות ליום הזה`}>
                  📋{tasksDue}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-100 border border-purple-300" /> יש אירועים
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> חצי מהמלאי ומעלה בו-זמנית
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" /> כמעט מלא (85%+)
        </span>
        <span>מלאי: {MAX_CLICKER_CAPACITY.toLocaleString('he-IL')} קליקרים · 📋 משימות פתוחות</span>
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 md:inset-auto md:left-6 md:bottom-6 md:w-[420px] z-[80] bg-white rounded-t-3xl md:rounded-2xl shadow-2xl border border-slate-200 max-h-[70vh] flex flex-col" role="dialog" aria-label="אירועי היום">
          <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <div>
              <h2 className="font-black text-slate-800">
                {selected.date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <p className="text-xs font-bold text-purple-700">
                {hebrewDayLabel(selected.heb)} {hebrewMonthLabel(selected.heb)}
                {selected.holiday ? ` · ${selected.holiday}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedKey(null)} className="text-slate-400 hover:text-slate-800" aria-label="סגור">
              <X size={20} />
            </button>
          </div>
          <div className="px-4 py-2 text-sm font-bold text-slate-700 border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
            <span>{selected.events.length} אירועים</span>
            <span>🖱️ {selected.clickers} קליקרים</span>
            <span className={selected.peak / MAX_CLICKER_CAPACITY >= 0.85 ? 'text-rose-600' : 'text-emerald-700'}>
              פנוי בשיא: {Math.max(0, MAX_CLICKER_CAPACITY - selected.peak)}
            </span>
          </div>
          <div className="overflow-y-auto p-3 space-y-2">
            {selected.events.length === 0 && (
              <p className="text-sm font-bold text-slate-400 text-center py-6 flex flex-col items-center gap-1">
                <CalendarDays size={24} /> אין אירועים ביום הזה: כל המלאי פנוי
              </p>
            )}
            {selected.events.map((ev) => (
              <Link
                key={ev.id}
                to={`/events?eventId=${encodeURIComponent(ev.id)}`}
                className="block rounded-xl border border-purple-100 bg-purple-50/60 hover:bg-purple-100 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-800 text-sm truncate">{ev.title}</span>
                  <span className="shrink-0 text-xs font-black text-purple-700">🖱️ {Number(ev.clickersNeeded) || 0}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500 flex flex-wrap gap-x-3">
                  {ev.startTime && (
                    <span>
                      🕒 {ev.startTime}
                      {ev.endTime ? `–${ev.endTime}` : ''}
                    </span>
                  )}
                  {ev.location && <span className="truncate">📍 {ev.location}</span>}
                  {ev.status && <span>{ev.status}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarBoard;
