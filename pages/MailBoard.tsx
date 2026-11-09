import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Email } from '../types';
import { Mail, RefreshCw, Search, Send, ArrowRight, User, Users } from 'lucide-react';

type Thread = {
  threadId: string;
  messages: Email[];
  customerId: string | null;
  leadId: string | null;
  lastSentAt: string;
  subject: string;
};

const formatDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const stripRe = (subject: string) => subject.replace(/^(re|fw|fwd)\s*:\s*/i, '').trim();

const MailBoard: React.FC = () => {
  const { emails, customers, leads, getCustomerById, emailsSyncing, syncGmail, replyToEmail } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const emailsSyncingRef = useRef(emailsSyncing);
  emailsSyncingRef.current = emailsSyncing;

  // סנכרון "חי": מיד כשנכנסים לעמוד, ואז ברקע — כל 20 שניות כשיש שיחה פתוחה (מעקב אחרי תכתובת פעילה),
  // וכל 60 שניות כשרק מסתכלים על הרשימה. בלי זה, מיילים חדשים היו מחכים עד לריצת ה-cron (כל 5 דקות).
  useEffect(() => {
    if (!emailsSyncingRef.current) void syncGmail();
    const intervalMs = selectedThreadId ? 20000 : 60000;
    const id = window.setInterval(() => {
      if (!emailsSyncingRef.current) void syncGmail();
    }, intervalMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const threads = useMemo<Thread[]>(() => {
    const byThread = new Map<string, Email[]>();
    for (const e of emails) {
      const key = e.threadId || e.id;
      const list = byThread.get(key) || [];
      list.push(e);
      byThread.set(key, list);
    }
    const result: Thread[] = [];
    for (const [threadId, messages] of byThread) {
      const sorted = [...messages].sort((a, b) => (a.sentAt || '').localeCompare(b.sentAt || ''));
      const last = sorted[sorted.length - 1];
      const withMatch = sorted.find((m) => m.customerId || m.leadId) || last;
      result.push({
        threadId,
        messages: sorted,
        customerId: withMatch.customerId || null,
        leadId: withMatch.leadId || null,
        lastSentAt: last.sentAt || last.createdAt || '',
        subject: stripRe(last.subject || '(ללא נושא)'),
      });
    }
    return result.sort((a, b) => (b.lastSentAt || '').localeCompare(a.lastSentAt || ''));
  }, [emails]);

  const threadLabel = (t: Thread): { name: string; sub: string } => {
    if (t.customerId) {
      const c = getCustomerById(t.customerId);
      if (c) return { name: c.name, sub: c.email };
    }
    if (t.leadId) {
      const l = leadById.get(t.leadId);
      if (l) return { name: l.name, sub: l.email || '' };
    }
    const other = t.messages.find((m) => m.direction === 'inbound')?.fromEmail || t.messages[0]?.toEmail || '';
    return { name: other || 'לא ידוע', sub: 'לא משויך ללקוח' };
  };

  const filteredThreads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const { name } = threadLabel(t);
      const blob = [t.subject, name, ...t.messages.map((m) => `${m.fromEmail} ${m.toEmail} ${m.snippet}`)]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [threads, searchTerm]);

  const selectedThread = threads.find((t) => t.threadId === selectedThreadId) || null;

  const handleSync = async () => {
    const result = await syncGmail();
    if (result.ok) {
      showToast(`סונכרנו ${result.synced ?? 0} מיילים${result.matched ? ` (${result.matched} שויכו ללקוח)` : ''}`);
    } else {
      showToast(result.hint || result.error || 'הסנכרון נכשל');
    }
  };

  const handleReply = async () => {
    if (!selectedThread || !replyText.trim()) return;
    const last = selectedThread.messages[selectedThread.messages.length - 1];
    const toAddress =
      [...selectedThread.messages].reverse().find((m) => m.direction === 'inbound')?.fromEmail || last.toEmail || '';
    if (!toAddress) {
      showToast('לא נמצאה כתובת מייל לשליחה');
      return;
    }
    setSending(true);
    try {
      const result = await replyToEmail({
        to: toAddress,
        subject: `Re: ${selectedThread.subject}`,
        text: replyText.trim(),
        inReplyToMessageId: last.messageId,
        threadId: selectedThread.threadId,
        customerId: selectedThread.customerId,
        leadId: selectedThread.leadId,
      });
      if (result.ok) {
        setReplyText('');
        showToast('המייל נשלח');
      } else {
        showToast(result.hint || result.error || 'השליחה נכשלה');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 dir-rtl pb-8">
      <div className="rounded-2xl bg-gradient-to-l from-slate-800 to-sky-900 text-white px-5 py-5 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-sky-200 text-xs font-bold mb-1">תיבת הדואר</div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">מיילים לפי לקוח</h2>
            <p className="text-sky-100/90 text-sm mt-1 font-medium">
              {threads.length} שיחות · {emails.length} מיילים
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={emailsSyncing}
            className="bg-sky-400 hover:bg-sky-300 disabled:opacity-60 text-slate-900 px-4 py-2 rounded-xl font-black flex items-center gap-2 text-sm shadow transition-all shrink-0"
          >
            <RefreshCw size={16} className={emailsSyncing ? 'animate-spin' : ''} />
            {emailsSyncing ? 'מסנכרן...' : 'סנכרן מיילים'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="bg-slate-800 text-white text-sm font-bold rounded-xl px-4 py-3 shadow-lg">{toast}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] min-h-[60vh]">
        {/* Thread list */}
        <div className={`border-l border-slate-100 flex flex-col ${selectedThread ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="חיפוש שיחה..."
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-sky-300 text-sm font-bold"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 && (
              <div className="p-10 text-center text-slate-400">
                <Mail className="mx-auto mb-2" size={32} />
                <p className="text-sm font-bold">אין עדיין מיילים. לחצו "סנכרן מיילים".</p>
              </div>
            )}
            {filteredThreads.map((t) => {
              const { name, sub } = threadLabel(t);
              const unmatched = !t.customerId && !t.leadId;
              return (
                <button
                  key={t.threadId}
                  onClick={() => setSelectedThreadId(t.threadId)}
                  className={`w-full text-right p-3 border-b border-slate-50 hover:bg-sky-50/60 transition-colors ${
                    selectedThreadId === t.threadId ? 'bg-sky-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-slate-800 truncate">{name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(t.lastSentAt)}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 truncate mt-0.5">{t.subject}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {t.messages[t.messages.length - 1]?.snippet}
                  </p>
                  {unmatched && (
                    <span className="inline-block mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                      לא משויך ללקוח
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread detail */}
        <div className={`flex-col ${selectedThread ? 'flex' : 'hidden md:flex'}`}>
          {!selectedThread && (
            <div className="flex-1 flex items-center justify-center text-slate-300">
              <div className="text-center">
                <Mail size={48} className="mx-auto mb-2" />
                <p className="font-bold text-sm">בחרו שיחה כדי לראות אותה</p>
              </div>
            </div>
          )}
          {selectedThread && (
            <>
              <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => setSelectedThreadId(null)}
                  className="md:hidden p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  <ArrowRight size={18} />
                </button>
                <div className="min-w-0">
                  <p className="font-black text-slate-800 truncate">{threadLabel(selectedThread).name}</p>
                  <p className="text-xs text-slate-500 truncate">{selectedThread.subject}</p>
                </div>
                {(selectedThread.customerId || selectedThread.leadId) && (
                  <span className="mr-auto shrink-0 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-1 rounded-full flex items-center gap-1">
                    {selectedThread.customerId ? <User size={12} /> : <Users size={12} />}
                    {selectedThread.customerId ? 'לקוח' : 'ליד'}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
                {selectedThread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                      m.direction === 'outbound'
                        ? 'bg-sky-600 text-white mr-auto rounded-bl-sm'
                        : 'bg-white text-slate-800 ml-auto rounded-br-sm border border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className={`text-[11px] font-black ${m.direction === 'outbound' ? 'text-sky-100' : 'text-slate-500'}`}>
                        {m.direction === 'outbound' ? 'נשלח' : m.fromName || m.fromEmail}
                      </span>
                      <span className={`text-[10px] shrink-0 ${m.direction === 'outbound' ? 'text-sky-200' : 'text-slate-400'}`}>
                        {formatDateTime(m.sentAt)}
                      </span>
                    </div>
                    {/* מציגים טקסט בלבד (לא HTML גולמי מהמייל) כדי למנוע הרצת קוד זדוני שהגיע מהשולח */}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.bodyText || m.snippet}</p>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-slate-100 flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="כתבו תגובה..."
                  rows={2}
                  className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:border-sky-300 focus:bg-white"
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white p-3 rounded-xl shrink-0"
                  title="שלח תגובה"
                >
                  <Send size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MailBoard;
