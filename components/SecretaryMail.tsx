import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { emailsService } from '../services/supabase';
import type { Email } from '../types';

const SecretaryMail: React.FC = () => {
  const { userEmail, emailsSyncing, syncGmail } = useApp();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    try { const rows = await emailsService.getAll(); if (!Array.isArray(rows)) throw new Error('Invalid response'); setEmails(rows); setLoaded(true); setError(false); }
    catch { setError(true); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60000); return () => window.clearInterval(timer); }, [refresh]);
  const { rows, unreadCount } = useMemo(() => {
    const incoming = emails.filter(email => email.direction === 'inbound').sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''));
    const group = (items: Email[]) => { const seen = new Set<string>(); return items.filter(item => { const id = item.threadId || item.id; if (seen.has(id)) return false; seen.add(id); return true; }); };
    const unread = group(incoming.filter(email => email.isRead === false));
    return { rows: (unread.length ? unread : group(incoming)).slice(0, 2), unreadCount: unread.length };
  }, [emails]);
  const requestSync = async () => { setMessage(''); const result = await syncGmail(); setMessage(result.ok ? 'הסנכרון התחיל ברקע.' : 'לא ניתן להתחיל סנכרון.'); };
  return <section className="h-full min-h-0 flex flex-col rounded-2xl border border-teal-200 bg-teal-50 p-3 shadow-sm" aria-labelledby="secretary-mail-heading">
    <div className="flex items-center justify-between gap-1 shrink-0"><h2 id="secretary-mail-heading" className="flex items-center gap-1 font-black text-teal-950"><Mail size={17} className="text-teal-700" /> דואר קליכיף</h2><Link to="/mail" className="text-[11px] font-bold text-teal-800">לכל הדואר</Link></div>
    <p className="truncate text-[10px] text-teal-800 shrink-0" dir="ltr">{userEmail} · {unreadCount} שיחות שלא נקראו</p>
    <div className="flex-1 min-h-0 overflow-hidden">{error ? <p className="mt-1 text-xs text-amber-800">לא ניתן לטעון את הדואר כרגע{loaded ? '; מוצג מידע קודם.' : '.'}</p> : !loaded ? <p className="mt-1 text-xs text-teal-700">טוענת דואר…</p> : rows.length ? rows.map(email => <Link key={email.id} to={`/mail?threadId=${encodeURIComponent(email.threadId || email.id)}`} className="block truncate mt-1 text-xs text-teal-950"><strong>{email.subject || '(ללא נושא)'}</strong> · {email.fromName || email.fromEmail || 'שולח לא ידוע'}</Link>) : <p className="mt-1 text-xs text-teal-700">אין הודעות נכנסות בנתונים שנטענו.</p>}</div>
    <div className="flex gap-3 pt-1 text-[10px] font-bold text-teal-800 shrink-0"><button type="button" onClick={() => void refresh()}><RefreshCw size={11} className="inline" /> רענון</button><button type="button" disabled={emailsSyncing} onClick={() => void requestSync()}>{emailsSyncing ? 'מסנכרנת…' : 'סנכרון Gmail'}</button>{message && <span role="status" className="truncate">{message}</span>}</div>
  </section>;
};
export default SecretaryMail;
