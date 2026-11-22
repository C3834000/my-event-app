import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EventStatus, type AppEvent, type Customer } from '../types';
import { approvalSendingExpired, bookingCustomerName, bookingStatusLabel, isApprovalSending, isBookingApprovalWork } from '../services/bookingApproval';
import SecretaryDialog from './SecretaryDialog';

const displayDate = (value: string | undefined) => {
  if (!value) return 'לא צוין';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('he-IL');
};

const SecretaryBookings: React.FC<{ events: AppEvent[]; customers: Customer[]; ready: boolean }> = ({ events, customers, ready }) => {
  const { approveBookingRequest } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, [open]);
  const requests = useMemo(() => events.filter(event => isBookingApprovalWork(event.status))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || '')), [events]);
  const pendingCount = requests.filter(event => event.status === EventStatus.PendingApproval).length;
  const emailCount = requests.length - pendingCount;

  const handleApprove = async (event: AppEvent) => {
    if (busy) return;
    setBusy(event.id);
    setMessage('');
    try {
      const result = await approveBookingRequest(event);
      if (result.kind === 'sent') setMessage('האירוע אושר והודעת האישור נשלחה ללקוח.');
      if (result.kind === 'send_failed') setMessage(`האירוע אושר, אך לא ניתן לוודא שהמייל נשלח. בדקו בדואר היוצא ונסו שוב לפי הצורך.${result.error ? ` (${result.error})` : ''}`);
      if (result.kind === 'sent_state_unknown') setMessage('המייל נשלח, אך עדכון הסטטוס לא הושלם. לפני שליחה חוזרת בדקו את הדואר היוצא.');
      if (result.kind === 'conflict') setMessage('הבקשה עודכנה במקום אחר. הנתונים מתרעננים; בדקו את הסטטוס לפני פעולה נוספת.');
    } catch {
      setMessage('לא ניתן לוודא שהאישור נשמר בענן. בדקו את החיבור ואת סטטוס הבקשה לפני שתנסו שוב.');
    } finally {
      setBusy(null);
    }
  };

  return <>
    <button type="button" onClick={() => { setMessage(''); setNow(Date.now()); setOpen(true); }} aria-haspopup="dialog" className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black ${requests.length ? 'bg-amber-300 text-amber-950' : 'bg-slate-700 text-white'}`}>
      בקשות לאישור {ready ? `(${requests.length})` : '(טוען…)'}
    </button>
    {open && <SecretaryDialog title="בקשות להזמנת אירוע" onClose={() => setOpen(false)}>
      <p className="text-sm text-slate-600">{pendingCount} ממתינות לאישור{emailCount ? ` · ${emailCount} אושרו וממתינות להודעה` : ''}</p>
      {message && <p role="status" className="mt-3 rounded-lg bg-sky-50 p-3 text-sm font-bold text-sky-900">{message}</p>}
      {!ready ? <p className="mt-4 text-sm">נתוני האירועים טרם נטענו.</p> : requests.length === 0 ? <p className="mt-4 text-sm text-slate-600">אין בקשות שממתינות לטיפול.</p> : <ul className="mt-4 space-y-4">
        {requests.map(event => {
          const customer = customers.find(item => item.id === event.customerId);
          const sending = isApprovalSending(event.status);
          const expired = sending && approvalSendingExpired(event.status, now);
          const pending = event.status === EventStatus.PendingApproval;
          return <li key={event.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex flex-wrap justify-between gap-2"><h4 className="font-black text-slate-900">{customer?.name || bookingCustomerName(event)}</h4><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{bookingStatusLabel(event.status)}</span></div>
            <dl className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
              <div><dt className="inline font-bold">תאריך: </dt><dd className="inline">{displayDate(event.date)} {event.hebrewDate ? `(${event.hebrewDate})` : ''}</dd></div>
              <div><dt className="inline font-bold">שעות: </dt><dd className="inline" dir="ltr">{event.startTime || '—'}–{event.endTime || '—'}</dd></div>
              <div><dt className="inline font-bold">טלפון: </dt><dd className="inline" dir="ltr">{event.phone || customer?.phone || 'לא צוין'}</dd></div>
              <div><dt className="inline font-bold">דוא״ל: </dt><dd className="inline break-all" dir="ltr">{event.email || 'לא צוין'}</dd></div>
              <div><dt className="inline font-bold">מיקום: </dt><dd className="inline">{event.location || 'לא צוין'}</dd></div>
              <div><dt className="inline font-bold">סוג: </dt><dd className="inline">{event.eventType || 'לא צוין'}</dd></div>
              <div><dt className="inline font-bold">משתתפים: </dt><dd className="inline">{event.clickersNeeded || 0}</dd></div>
              <div><dt className="inline font-bold">סכום: </dt><dd className="inline">₪{Number(event.amount || 0).toLocaleString('he-IL')}</dd></div>
              {event.paymentDate && <div><dt className="inline font-bold">תאריך תשלום: </dt><dd className="inline">{displayDate(event.paymentDate)}</dd></div>}
              {event.paymentMethod && <div><dt className="inline font-bold">אופן תשלום: </dt><dd className="inline">{event.paymentMethod}</dd></div>}
              {event.invoiceName && <div><dt className="inline font-bold">שם לחשבונית: </dt><dd className="inline">{event.invoiceName}</dd></div>}
              {event.notes && <div className="sm:col-span-2"><dt className="inline font-bold">הערות: </dt><dd className="inline whitespace-pre-wrap">{event.notes}</dd></div>}
            </dl>
            {sending && <p className="mt-3 text-xs font-bold text-amber-900">{expired ? 'השליחה הקודמת לא הסתיימה באופן ודאי. בדקו בדואר היוצא לפני שתנסו שוב.' : 'השליחה מתבצעת. אם התהליך נקטע, אפשר לנסות שוב לאחר כמה דקות.'}</p>}
            {event.status === EventStatus.ApprovalEmailPending && <p className="mt-3 text-xs font-bold text-amber-900">האירוע אושר, אך שליחת ההודעה נכשלה או לא אומתה. בדקו בדואר היוצא לפני שליחה חוזרת.</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={!!busy || (sending && !expired)} onClick={() => void handleApprove(event)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy === event.id ? <RefreshCw size={16} className="animate-spin" /> : pending ? <CheckCircle2 size={16} /> : <Mail size={16} />}
                {busy === event.id ? 'שומר ושולח…' : pending ? 'אישור האירוע ושליחת הודעה' : 'שליחת הודעת האישור שוב'}
              </button>
              <Link to={`/events?eventId=${encodeURIComponent(event.id)}`} onClick={() => setOpen(false)} className="text-sm font-bold text-sky-700 hover:underline">עריכת פרטי האירוע</Link>
            </div>
          </li>;
        })}
      </ul>}
    </SecretaryDialog>}
  </>;
};

export default SecretaryBookings;
