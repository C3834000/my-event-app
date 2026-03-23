import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, Clock, Users, Search, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { eventsService } from '../services/supabase';
import type { AppEvent } from '../types';
import {
  isSlotAvailable,
  suggestNearestSlots,
  halfHourTimeOptions,
  participantStepOptions,
  SLOT_DURATION_MIN,
  MAX_SIMULTANEOUS_PARTICIPANTS,
} from '../services/availability';
import {
  billingParticipantTier,
  priceForParticipantsAndDuration,
} from '../services/pricingTable';

const AvailabilityChecker: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dateStr, setDateStr] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
  const [time, setTime] = useState('10:00');
  const [participants, setParticipants] = useState(50);

  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await eventsService.getAll();
        if (!cancelled) setEvents(Array.isArray(list) ? list : []);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'שגיאה בטעינת היומן');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const timeOptions = useMemo(() => halfHourTimeOptions(), []);
  const participantOptions = useMemo(() => participantStepOptions(), []);

  const checkResult = useMemo(() => {
    if (!checked || submitting) return null;
    return isSlotAvailable(events, dateStr, time, participants);
  }, [checked, submitting, events, dateStr, time, participants]);

  const alternatives = useMemo(() => {
    if (!checked || !checkResult || checkResult.available) return [];
    return suggestNearestSlots(events, dateStr, time, participants, 4);
  }, [checked, checkResult, events, dateStr, time, participants]);

  const billingTier = billingParticipantTier(participants);
  const estimatedPrice = priceForParticipantsAndDuration(participants, 1.5);

  const buildBookHref = (d: string, t: string, p: number) => {
    const q = new URLSearchParams();
    q.set('skipPortal', 'true');
    const lid = searchParams.get('leadId');
    const cid = searchParams.get('customerId');
    if (lid) q.set('leadId', lid);
    else if (cid) q.set('customerId', cid);
    q.set('prefDate', d);
    q.set('prefTime', t);
    q.set('prefParticipants', String(p));
    return `/book?${q.toString()}`;
  };

  const formatDisplayDate = (d: string) => {
    try {
      return new Date(`${d}T12:00:00`).toLocaleDateString('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setChecked(false);
    requestAnimationFrame(() => {
      setChecked(true);
      setSubmitting(false);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 text-white dir-rtl" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-10 pb-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/30 border border-purple-400/40 mb-4">
            <Calendar className="text-purple-200" size={32} />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">בדיקת זמינות</h1>
          <p className="text-purple-200/80 text-sm leading-relaxed">
            בדקו אם התאריך והשעה מתאימים לפני שממלאים את טופס ההזמנה. משך הפעילות בבדיקה: {SLOT_DURATION_MIN} דקות. עד{' '}
            {MAX_SIMULTANEOUS_PARTICIPANTS} משתתפים במקביל במערכת.
          </p>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-12 text-purple-200">
            <Loader2 className="animate-spin" size={36} />
            <span className="font-bold">טוען יומן…</span>
          </div>
        )}

        {loadError && (
          <div className="bg-red-500/20 border border-red-400/50 rounded-2xl p-4 flex gap-3 items-start text-sm mb-6">
            <AlertCircle className="shrink-0 text-red-300" size={22} />
            <div>{loadError}</div>
          </div>
        )}

        {!loading && !loadError && (
          <>
            <form onSubmit={handleCheck} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-6 space-y-5 shadow-xl">
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-purple-100 mb-2">
                  <Calendar size={16} /> תאריך
                </label>
                <input
                  type="date"
                  required
                  value={dateStr}
                  onChange={e => setDateStr(e.target.value)}
                  className="w-full rounded-xl bg-white/95 text-slate-900 px-4 py-3 font-bold border-0 focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-purple-100 mb-2">
                  <Clock size={16} /> שעת התחלה (חצאי שעות)
                </label>
                <select
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full rounded-xl bg-white/95 text-slate-900 px-4 py-3 font-bold border-0 focus:ring-2 focus:ring-purple-400"
                >
                  {timeOptions.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-purple-100 mb-2">
                  <Users size={16} /> מספר משתתפים (צעדים של 10)
                </label>
                <select
                  value={participants}
                  onChange={e => setParticipants(Number(e.target.value))}
                  className="w-full rounded-xl bg-white/95 text-slate-900 px-4 py-3 font-bold border-0 focus:ring-2 focus:ring-purple-400"
                >
                  {participantOptions.map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-l from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg transition-all text-lg"
              >
                <Search size={22} />
                בדוק זמינות
              </button>
            </form>

            <div className="mt-6 bg-amber-500/15 border border-amber-400/30 rounded-2xl p-5 text-sm">
              <p className="font-black text-amber-100 mb-1">מחיר משוער (שעה וחצי, כולל מע״מ)</p>
              <p className="text-amber-50/90">
                לפי <strong>{billingTier}</strong> משתתפים (רמת חיוב לפי עיגול כלפי מעלה):{' '}
                <strong className="text-xl text-white">₪{estimatedPrice.toLocaleString()}</strong>
              </p>
              <p className="text-xs text-amber-100/70 mt-2">
                המחיר הסופי ייקבע בטופס ההזמנה לפי הנתונים שתמלאו שם.
              </p>
            </div>

            {checked && checkResult && (
              <div className="mt-8 space-y-6 animate-in fade-in duration-300">
                {checkResult.available ? (
                  <div className="bg-gradient-to-br from-green-600/40 to-emerald-700/40 border-2 border-green-400/60 rounded-3xl p-6 text-center shadow-xl">
                    <Sparkles className="mx-auto text-yellow-300 mb-3" size={40} />
                    <h2 className="text-2xl font-black text-white mb-2">בינגו! יש לך תאריך ושעה</h2>
                    <p className="text-green-100 mb-4 text-sm leading-relaxed">
                      בחלון הזה יש מקום ל-{participants} המשתתפים שלך (נשארו עד {checkResult.freeCapacity} מקומות פנויים מתוך {MAX_SIMULTANEOUS_PARTICIPANTS}).
                    </p>
                    <p className="text-white/90 text-sm mb-6 font-bold">
                      כנסו לטופס הזמנת אירוע לפני שמישהו אחר יתפוס — רק מה שתמלאו בטופס ייקבע רשמית.
                    </p>
                    <Link
                      to={buildBookHref(dateStr, time, participants)}
                      className="inline-flex items-center justify-center gap-2 bg-white text-green-800 font-black px-8 py-4 rounded-2xl shadow-lg hover:bg-green-50 transition-all text-lg w-full sm:w-auto"
                    >
                      להזמנה עכשיו ←
                    </Link>
                  </div>
                ) : (
                  <div className="bg-orange-500/20 border border-orange-400/40 rounded-3xl p-6">
                    <h2 className="text-xl font-black text-orange-100 mb-2 flex items-center gap-2">
                      <AlertCircle size={24} /> אין מקום בחלון הזה
                    </h2>
                    <p className="text-orange-50/90 text-sm mb-4">
                      לפי היומן שלנו, בזמן הזה נשארו רק <strong>{checkResult.freeCapacity}</strong> מקומות פנויים (צריך{' '}
                      <strong>{participants}</strong>). אפשר לנסות אחת מההצעות הבאות:
                    </p>
                    {alternatives.length === 0 ? (
                      <p className="text-sm text-orange-100/80">לא נמצאו חלונות פנויים בטווח ±2 ימים עם מספר המשתתפים הזה. נסו מספר נמוך יותר או פנו למשרד.</p>
                    ) : (
                      <ul className="space-y-3">
                        {alternatives.map(s => (
                          <li
                            key={`${s.dateStr}-${s.time}`}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/10 rounded-2xl p-4"
                          >
                            <div>
                              <div className="font-black text-white">{formatDisplayDate(s.dateStr)}</div>
                              <div className="text-purple-200 text-sm">התחלה {s.time} ({SLOT_DURATION_MIN} דקות)</div>
                            </div>
                            <Link
                              to={buildBookHref(s.dateStr, s.time, participants)}
                              className="shrink-0 text-center bg-purple-500 hover:bg-purple-400 text-white font-bold px-4 py-2 rounded-xl text-sm"
                            >
                              להזמנה בזמן הזה
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="text-center text-xs text-purple-300/60 mt-10">
              בדיקה אינה שומרת שריון — השריין רק אחרי שליחת טופס ההזמנה.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AvailabilityChecker;
