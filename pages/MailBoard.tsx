import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Email, EmailStatus } from '../types';
import { Mail, RefreshCw, Search, Send, ArrowRight, User, Users, Paperclip, X, Pin, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import LinkedTaskModal from '../components/LinkedTaskModal';

const MAX_SEND_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_SEND_ATTACHMENTS_TOTAL_BYTES = 4 * 1024 * 1024;

/** ממיר קובץ ל-base64 בלי התחילית data:...;base64, (בחתיכות — כדי לא לקרוס על קבצים גדולים) */
async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type Thread = {
  threadId: string;
  messages: Email[];
  customerId: string | null;
  leadId: string | null;
  lastSentAt: string;
  subject: string;
  status: EmailStatus;
};

type Filter = 'all' | 'unassigned' | 'inbound' | 'outbound' | EmailStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'unassigned', label: 'לא משויך' },
  { id: 'open', label: 'פתוח' },
  { id: 'waiting', label: 'ממתין' },
  { id: 'done', label: 'טופל' },
  { id: 'inbound', label: 'נכנס' },
  { id: 'outbound', label: 'נשלח' },
];

const STATUS_LABELS: Record<EmailStatus, string> = { open: 'פתוח', waiting: 'ממתין לתשובה', done: 'טופל' };

const formatDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const stripRe = (subject: string) => subject.replace(/^(re|fw|fwd)\s*:\s*/i, '').trim();

const formatBytes = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MailBoard: React.FC = () => {
  const { emails, customers, leads, getCustomerById, emailsSyncing, syncGmail, replyToEmail, updateEmails, refreshEmails, tasks, addTask, updateTask } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pinOpen, setPinOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handlePickFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const picked = Array.from(fileList);
    for (const f of picked) {
      if (f.size > MAX_SEND_ATTACHMENT_BYTES) {
        showToast(`הקובץ "${f.name}" גדול מדי (מקסימום 3MB לקובץ)`);
        return;
      }
    }
    const nextTotal = [...composeFiles, ...picked].reduce((s, f) => s + f.size, 0);
    if (nextTotal > MAX_SEND_ATTACHMENTS_TOTAL_BYTES) {
      showToast('סך הקבצים המצורפים גדול מדי (מקסימום 4MB בסך הכל)');
      return;
    }
    setComposeFiles((prev) => [...prev, ...picked]);
  };

  const emailsSyncingRef = useRef(emailsSyncing);
  emailsSyncingRef.current = emailsSyncing;

  // הסנכרון מול Gmail רץ ב-cron כל 5 דקות; כאן רק טוענים מחדש מהמסד בשקט —
  // כל 20 שניות כשיש שיחה פתוחה, וכל 60 שניות ברשימה. הרשימה מוצגת מיד מהמטמון המקומי.
  useEffect(() => {
    void refreshEmails();
    const intervalMs = selectedThreadId ? 20000 : 60000;
    const id = window.setInterval(() => void refreshEmails(), intervalMs);
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
        status: (last.status as EmailStatus) || 'open',
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
    const base = threads.filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'unassigned') return !t.customerId && !t.leadId;
      if (filter === 'inbound' || filter === 'outbound') return t.messages.some((m) => m.direction === filter);
      return t.status === filter;
    });
    if (!q) return base;
    return base.filter((t) => {
      const { name } = threadLabel(t);
      const blob = [t.subject, name, ...t.messages.map((m) => `${m.fromEmail} ${m.toEmail} ${m.snippet}`)]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [threads, searchTerm, filter]);

  const selectedThread = threads.find((t) => t.threadId === selectedThreadId) || null;

  // כניסה ממשימה: /mail?threadId=... פותח את השיחה
  const deepLinkThread = searchParams.get('threadId');
  useEffect(() => {
    if (!deepLinkThread || !threads.some((t) => t.threadId === deepLinkThread)) return;
    setSelectedThreadId(deepLinkThread);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('threadId');
      return next;
    }, { replace: true });
  }, [deepLinkThread, threads, setSearchParams]);

  /** משימות שננעצו מכל שיחה */
  const tasksByThread = useMemo(() => {
    const m = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.emailThreadId) continue;
      m.set(t.emailThreadId, [...(m.get(t.emailThreadId) || []), t]);
    }
    return m;
  }, [tasks]);
  const pinnedTasks = selectedThread ? tasksByThread.get(selectedThread.threadId) || [] : [];

  const handleSync = async () => {
    const result = await syncGmail();
    if (result.ok && result.started) {
      showToast('הסנכרון התחיל ברקע — המיילים יופיעו תוך כדקה-שתיים');
    } else if (result.ok) {
      const historyNote = result.backfillComplete === false ? ' · ממשיך למשוך היסטוריה ישנה יותר בהדרגה' : '';
      showToast(`סונכרנו ${result.synced ?? 0} מיילים${result.matched ? ` (${result.matched} שויכו ללקוח)` : ''}${historyNote}`);
    } else {
      showToast(result.hint || result.error || 'הסנכרון נכשל');
    }
  };

  const handleReply = async () => {
    if (!selectedThread || (!replyText.trim() && !composeFiles.length)) return;
    const last = selectedThread.messages[selectedThread.messages.length - 1];
    const toAddress =
      [...selectedThread.messages].reverse().find((m) => m.direction === 'inbound')?.fromEmail || last.toEmail || '';
    if (!toAddress) {
      showToast('לא נמצאה כתובת מייל לשליחה');
      return;
    }
    setSending(true);
    try {
      const attachments = await Promise.all(
        composeFiles.map(async (f) => ({
          filename: f.name,
          contentType: f.type || undefined,
          contentBase64: await fileToBase64(f),
        }))
      );
      const result = await replyToEmail({
        to: toAddress,
        subject: `Re: ${selectedThread.subject}`,
        text: replyText.trim(),
        inReplyToMessageId: last.messageId,
        threadId: selectedThread.threadId,
        customerId: selectedThread.customerId,
        leadId: selectedThread.leadId,
        attachments: attachments.length ? attachments : undefined,
      });
      if (result.ok) {
        setReplyText('');
        setComposeFiles([]);
        showToast('המייל נשלח');
      } else {
        showToast(result.hint || result.error || 'השליחה נכשלה');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto dir-rtl flex flex-col gap-4 h-[calc(100dvh-2rem)] md:h-[calc(100dvh-4rem)]">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm font-bold rounded-xl px-4 py-3 shadow-lg">{toast}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr] flex-1 min-h-0">
        {/* Thread list */}
        <div className={`border-l border-slate-100 flex flex-col min-h-0 ${selectedThread ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                    filter === f.id ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
          <div className="flex-1 min-h-0 overflow-y-auto">
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
                    <span className="font-black text-sm text-slate-800 truncate flex items-center gap-1">
                      {name}
                      {t.messages.some((m) => m.attachments?.length) && (
                        <Paperclip size={11} className="text-slate-400 shrink-0" />
                      )}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(t.lastSentAt)}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 truncate mt-0.5">{t.subject}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {t.messages[t.messages.length - 1]?.direction === 'outbound' ? (
                      <ArrowUpRight size={11} className="inline ml-1 text-sky-600" />
                    ) : (
                      <ArrowDownLeft size={11} className="inline ml-1 text-emerald-600" />
                    )}
                    {t.messages[t.messages.length - 1]?.direction === 'outbound' ? 'נשלח: ' : ''}
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
        <div className={`flex-col min-h-0 ${selectedThread ? 'flex' : 'hidden md:flex'}`}>
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
                <div className="mr-auto shrink-0 flex items-center gap-1.5">
                  {!selectedThread.customerId && !selectedThread.leadId && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        void updateEmails(selectedThread.messages.map((m) => m.id), { customerId: id, leadId: null });
                        e.target.value = '';
                        showToast('השיחה שויכה ללקוח');
                      }}
                      className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 outline-none max-w-[150px]"
                    >
                      <option value="">שייך ללקוח...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                  <select
                    value={selectedThread.status}
                    onChange={(e) => {
                      void updateEmails(selectedThread.messages.map((m) => m.id), { status: e.target.value as EmailStatus });
                    }}
                    className="text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 outline-none"
                  >
                    {(Object.keys(STATUS_LABELS) as EmailStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setPinOpen(true)}
                    className="text-xs font-bold text-purple-700 hover:bg-purple-50 border border-purple-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                    title="צור משימה מהמייל הזה"
                  >
                    <Pin size={13} /> משימה
                  </button>
                  {(selectedThread.customerId || selectedThread.leadId) && (
                  <span className="shrink-0 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-1 rounded-full flex items-center gap-1">
                    {selectedThread.customerId ? <User size={12} /> : <Users size={12} />}
                    {selectedThread.customerId ? 'לקוח' : 'ליד'}
                  </span>
                  )}
                </div>
              </div>

              {pinnedTasks.length > 0 && (
                <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-black text-slate-500">משימות מהמייל:</span>
                  {pinnedTasks.map((t) => (
                    <span key={t.id} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5 text-xs">
                      <Link to={`/tasks?taskId=${encodeURIComponent(t.id)}`} className={`font-bold truncate max-w-[14rem] hover:underline ${t.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        📋 {t.title}
                      </Link>
                      {t.isCompleted && <span className="font-bold text-emerald-600">✓</span>}
                      <button
                        type="button"
                        onClick={() => updateTask(t.id, { emailThreadId: null })}
                        className="text-slate-400 hover:text-rose-500 p-0.5"
                        title="נתק מהמייל"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="p-3 border-b border-slate-100 space-y-2">
                {composeFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {composeFiles.map((f, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 text-xs font-bold bg-sky-50 text-sky-700 border border-sky-100 rounded-full pl-1 pr-2.5 py-1"
                      >
                        <Paperclip size={11} />
                        <span className="truncate max-w-[160px]">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setComposeFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="hover:bg-sky-100 rounded-full p-0.5"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      handlePickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-slate-500 hover:bg-slate-100 rounded-xl shrink-0"
                    title="צרף קובץ"
                  >
                    <Paperclip size={18} />
                  </button>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="כתבו תגובה..."
                    rows={2}
                    className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm outline-none focus:border-sky-300 focus:bg-white"
                  />
                  <button
                    onClick={handleReply}
                    disabled={sending || (!replyText.trim() && !composeFiles.length)}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white p-3 rounded-xl shrink-0"
                    title="שלח תגובה"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
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
                    {!!m.attachments?.length && (
                      <div className={`mt-2 pt-2 border-t space-y-1 ${m.direction === 'outbound' ? 'border-sky-400/40' : 'border-slate-100'}`}>
                        {m.attachments.map((att, i) => (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-1.5 text-xs font-bold hover:underline ${
                              m.direction === 'outbound' ? 'text-sky-100' : 'text-sky-700'
                            }`}
                          >
                            <Paperclip size={12} className="shrink-0" />
                            <span className="truncate">{att.filename}</span>
                            {!!att.size && <span className="opacity-70 shrink-0">({formatBytes(att.size)})</span>}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </>
          )}
        </div>
      </div>
      {pinOpen && selectedThread && (() => {
        const lastInbound = [...selectedThread.messages].reverse().find((m) => m.direction === 'inbound') || selectedThread.messages[selectedThread.messages.length - 1];
        const from = threadLabel(selectedThread).name;
        return (
          <LinkedTaskModal
            heading="נעיצת מייל כמשימה"
            context={`✉️ ${selectedThread.subject || '(ללא נושא)'} · ${from}`}
            defaults={{
              title: `${stripRe(selectedThread.subject || '') || 'מייל'} – ${from}`,
              notes: [`מאת: ${lastInbound?.fromName || lastInbound?.fromEmail || from}`, lastInbound?.snippet || ''].filter(Boolean).join('\n'),
            }}
            link={{ emailThreadId: selectedThread.threadId }}
            onClose={() => setPinOpen(false)}
            onCreate={(task) => {
              addTask(task);
              setPinOpen(false);
              showToast('המייל נעוץ כמשימה בלוח המשימות');
            }}
          />
        );
      })()}
    </div>
  );
};

export default MailBoard;
