import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { emailsService } from '../services/supabase';
import type { Email } from '../types';

/** מציג את הדואר שכבר מסונכרן ל-CRM, ללא הרשאת Google חדשה. */
const SecretaryMail: React.FC = () => {
  const { userEmail, emailsSyncing, syncGmail } = useApp();
  const [emails, setEmails] = useState<Email[]>([]);
  const [emailsLastLoadedAt, setEmailsLastLoadedAt] = useState<string | null>(null);
  const [emailsLoadError, setEmailsLoadError] = useState(false);
  const [message, setMessage] = useState('');

  const refreshEmails = useCallback(async () => {
    try {
      const rows = await emailsService.getAll();
      if (!Array.isArray(rows)) throw new Error('Invalid email response');
      setEmails(rows);
      setEmailsLastLoadedAt(new Date().toISOString());
      setEmailsLoadError(false);
    } catch {
      setEmailsLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refreshEmails();
    const timer = window.setInterval(() => void refreshEmails(), 60000);
    return () => window.clearInterval(timer);
  }, [refreshEmails]); // הקריאה נטענת מחדש מתוך מסד ה-CRM בזמן שהשולחן פתוח

  const { rows, unreadCount, showingUnread } = useMemo(() => {
    const incoming = emails.filter(email => email.direction === 'inbound')
      .sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''));
    const unread = incoming.filter(email => email.isRead === false);
    const group = (items: typeof incoming) => {
      const seen = new Set<string>();
      return items.filter(item => {
        const id = item.threadId || item.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    };
    const threads = group(unread);
    return { rows: (threads.length ? threads : group(incoming)).slice(0, 5), unreadCount: threads.length, showingUnread: threads.length > 0 };
  }, [emails]);

  const requestSync = async () => {
    setMessage('');
    const result = await syncGmail();
    setMessage(result.ok ? (result.started ? 'הסנכרון התחיל ברקע. ההודעות יופיעו לאחר העדכון.' : 'בקשת הסנכרון הושלמה.') : 'לא ניתן להתחיל סנכרון. נסו שוב מלוח המיילים.');
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="secretary-mail-heading">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="secretary-mail-heading" className="font-black text-slate-900 flex items-center gap-2"><Mail size={18} className="text-violet-600" /> דואר קליכיף</h2><p className="text-xs text-slate-500 mt-1" dir="ltr">{userEmail}</p></div>
      <Link to="/mail" className="text-xs font-bold text-violet-700 hover:underline">לכל המיילים</Link>
    </div>
    {emailsLoadError && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">לא ניתן לטעון את הדואר מה־CRM כרגע. ייתכן שהמידע המוצג שמור מעדכון קודם.</p>}
    {!emailsLastLoadedAt && !emailsLoadError && <p className="mt-4 text-sm text-slate-500" role="status">טוענת את הדואר מה־CRM…</p>}
    {(emailsLastLoadedAt || emailsLoadError) && <div className="mt-3">
      <p className="text-xs text-slate-500">{showingUnread ? `${unreadCount} שיחות שלא נקראו` : 'הודעות נכנסות אחרונות'} · מתוך 200 המיילים האחרונים ב־CRM</p>
      {emailsLastLoadedAt && <p className="text-xs text-slate-400 mt-1">תצוגת ה־CRM עודכנה {new Date(emailsLastLoadedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>}
      {rows.length ? <ul className="mt-2 divide-y divide-slate-100">{rows.map(email => <li key={email.id}><Link className="block py-3 hover:text-violet-700" to={`/mail?threadId=${encodeURIComponent(email.threadId || email.id)}`}><p className="font-bold text-sm truncate">{email.subject || '(ללא נושא)'}</p><p className="mt-1 text-xs text-slate-500 truncate" dir="auto">{email.fromName || email.fromEmail || 'שולח לא ידוע'}</p></Link></li>)}</ul> : <p className="py-4 text-sm text-slate-500">{emailsLoadError ? 'אין נתוני דואר זמינים להצגה.' : 'אין הודעות נכנסות בנתונים שנטענו.'}</p>}
    </div>}
    <div className="mt-3 flex flex-wrap gap-3 text-xs">
      <button type="button" onClick={() => void refreshEmails()} className="font-bold text-violet-700 inline-flex items-center gap-1"><RefreshCw size={13} /> רענון התצוגה</button>
      <button type="button" disabled={emailsSyncing} onClick={() => void requestSync()} className="font-bold text-slate-600 disabled:opacity-50">{emailsSyncing ? 'מבקשת סנכרון…' : 'סנכרון מתיבת Gmail'}</button>
    </div>
    {message && <p className="mt-2 text-xs text-slate-600" role="status">{message}</p>}
  </section>;
};

export default SecretaryMail;
