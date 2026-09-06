// ============================================================================
// מסך מסמכים — שלב ראשון: העלאה ידנית, רשימה, עריכת פרטים, אישור וכפילויות.
// לא מחובר לדוחות/מיסים — מאגר עצמאי לבדיקה.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, Eye, Edit, Trash2, CheckCircle2, AlertTriangle,
  RotateCcw, X, KeyRound, Loader2,
} from 'lucide-react';
import {
  FinanceDocument, DocSuspect, DOC_TYPES, DocDirection,
  sha256OfFile, initUpload, uploadToSignedUrl, createDocument,
  listDocuments, updateDocument, deleteDocument, getDocumentFileUrl,
  getDocsApiKey, setDocsApiKey,
} from '../services/documents';

const nis = (v?: number | null) =>
  v == null ? '—' : '₪' + Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('he-IL') : '—';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ידני',
  email: 'מייל',
  drive: 'Drive',
  folder: 'תיקייה',
  greeninvoice: 'ח"י',
};

const monthKeyNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type EditState = { doc: FinanceDocument; suspects: DocSuspect[] } | null;

const DocumentsBoard: React.FC = () => {
  const [apiKey, setApiKeyState] = useState(getDocsApiKey());
  const [keyInput, setKeyInput] = useState('');
  const [docs, setDocs] = useState<FinanceDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadDirection, setUploadDirection] = useState<DocDirection>('expense');
  const [monthFilter, setMonthFilter] = useState('');       // '' = הכל
  const [directionFilter, setDirectionFilter] = useState<'' | DocDirection>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'needs_review' | 'confirmed'>('');
  const [editing, setEditing] = useState<EditState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!getDocsApiKey()) return;
    setLoading(true);
    setLoadError('');
    try {
      const rows = await listDocuments({
        direction: directionFilter || undefined,
        reviewStatus: statusFilter || undefined,
        monthKey: monthFilter || undefined,
      });
      setDocs(rows);
    } catch (e) {
      setLoadError((e as Error).message || 'טעינה נכשלה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [apiKey, monthFilter, directionFilter, statusFilter]);

  const saveKey = () => {
    if (!keyInput.trim()) return;
    setDocsApiKey(keyInput);
    setApiKeyState(keyInput.trim());
    setKeyInput('');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg('');
    const messages: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const hash = await sha256OfFile(file);
        const init = await initUpload(file, hash);
        if (init.duplicate) {
          messages.push(`⚠ ${file.name}: הקובץ כבר קיים במאגר (${init.existing?.counterparty || init.existing?.fileName || init.existing?.id}) — לא נוצר כפול`);
          continue;
        }
        if (!init.uploadUrl || !init.path) throw new Error('לא התקבלה כתובת העלאה');
        await uploadToSignedUrl(init.uploadUrl, file);
        const { suspects } = await createDocument({
          direction: uploadDirection,
          filePath: init.path,
          fileHash: hash,
          fileName: file.name,
          fileMime: file.type,
          fileSize: file.size,
          reviewStatus: 'needs_review',
        } as Partial<FinanceDocument> & { direction: DocDirection }, { kind: 'manual', ref: file.name });
        messages.push(`✓ ${file.name} הועלה${suspects.length ? ` (חשד לכפילות מול ${suspects.length} מסמכים)` : ''}`);
      } catch (e) {
        messages.push(`✗ ${file.name}: ${(e as Error).message}`);
      }
    }
    setUploadMsg(messages.join('\n'));
    setUploading(false);
    await load();
  };

  const toggleApprove = async (doc: FinanceDocument) => {
    const next = doc.reviewStatus === 'confirmed' ? 'needs_review' : 'confirmed';
    try {
      await updateDocument(doc.id, { reviewStatus: next });
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, reviewStatus: next } : d));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const openFile = async (doc: FinanceDocument) => {
    try {
      const url = await getDocumentFileUrl(doc.id);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const remove = async (doc: FinanceDocument) => {
    if (!confirm(`למחוק את המסמך «${doc.fileName || doc.docNumber || doc.id}»? הקובץ יימחק גם מהאחסון.`)) return;
    try {
      await deleteDocument(doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const stats = useMemo(() => ({
    total: docs.length,
    needsReview: docs.filter(d => d.reviewStatus === 'needs_review').length,
    suspects: docs.filter(d => d.duplicateSuspect).length,
  }), [docs]);

  // ── מסך הגדרת מפתח גישה ──────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-4">
        <div className="flex items-center gap-3">
          <KeyRound size={28} className="text-purple-600" />
          <h2 className="text-2xl font-bold text-slate-800">מאגר מסמכים — מפתח גישה</h2>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          הגישה למאגר המסמכים מאובטחת במפתח משותף. יש להגדיר את המשתנה
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded mx-1">DOCS_API_KEY</span>
          ב-Netlify (Environment variables), ולהזין כאן את אותו ערך. המפתח נשמר מקומית בדפדפן בלבד.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
            placeholder="הדבק את מפתח הגישה..."
            className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-purple-500 outline-none"
          />
          <button onClick={saveKey} className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-purple-700">
            שמור
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* כותרת + העלאה */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800">מסמכים</h2>
          <span className="text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg">
            שלב ניסיון — לא מחובר לדוחות
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
          <select
            value={uploadDirection}
            onChange={e => setUploadDirection(e.target.value as DocDirection)}
            className="text-sm font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
            title="סיווג המסמכים שיועלו"
          >
            <option value="expense">הוצאה</option>
            <option value="income">הכנסה</option>
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-bold shadow hover:bg-purple-700 transition-all disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? 'מעלה…' : 'העלאת PDF / תמונות'}
          </button>
          <button onClick={load} className="bg-white border px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 flex items-center gap-1.5">
            <RotateCcw size={15} /> רענן
          </button>
        </div>
      </div>

      {/* סינון + סיכום קצר */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          className="text-sm font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          title="סינון לפי חודש המסמך (ריק = הכל)"
        />
        {!monthFilter && (
          <button onClick={() => setMonthFilter(monthKeyNow())} className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1.5 rounded-lg">
            החודש הנוכחי
          </button>
        )}
        <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value as '' | DocDirection)} className="text-sm font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">הכנסות והוצאות</option>
          <option value="income">הכנסות</option>
          <option value="expense">הוצאות</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as '' | 'needs_review' | 'confirmed')} className="text-sm font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">כל הסטטוסים</option>
          <option value="needs_review">לבדיקה</option>
          <option value="confirmed">מאושר</option>
        </select>
        <div className="mr-auto flex items-center gap-3 text-xs font-bold text-slate-500">
          <span>{stats.total} מסמכים</span>
          {stats.needsReview > 0 && <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">{stats.needsReview} לבדיקה</span>}
          {stats.suspects > 0 && <span className="text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-200">{stats.suspects} חשד לכפילות</span>}
        </div>
      </div>

      {uploadMsg && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-700 whitespace-pre-line flex justify-between gap-3">
          <span>{uploadMsg}</span>
          <button onClick={() => setUploadMsg('')} className="text-slate-400 hover:text-slate-700 shrink-0"><X size={14} /></button>
        </div>
      )}

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm font-bold text-red-800">
          {loadError}
          <button onClick={() => { setDocsApiKey(''); setApiKeyState(''); }} className="underline mr-3">החלף מפתח גישה</button>
        </div>
      )}

      {/* טבלת מסמכים */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-black border-b border-slate-200">
              <th className="text-right px-3 py-2.5">תאריך</th>
              <th className="text-right px-3 py-2.5">סוג</th>
              <th className="text-right px-3 py-2.5">ספק / לקוח</th>
              <th className="text-right px-3 py-2.5">מס' מסמך</th>
              <th className="text-right px-3 py-2.5">סה"כ</th>
              <th className="text-right px-3 py-2.5">מע"מ</th>
              <th className="text-right px-3 py-2.5">כיוון</th>
              <th className="text-right px-3 py-2.5">מקור</th>
              <th className="text-right px-3 py-2.5">סטטוס</th>
              <th className="text-right px-3 py-2.5">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={10} className="text-center py-8 text-slate-400 font-bold">טוען…</td></tr>
            )}
            {!loading && docs.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-slate-400 font-bold">
                אין מסמכים עדיין — העלו PDF או תמונה כדי להתחיל
              </td></tr>
            )}
            {!loading && docs.map(doc => (
              <tr key={doc.id} className={`hover:bg-slate-50 ${doc.duplicateSuspect ? 'bg-red-50/40' : ''}`}>
                <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{fmtDate(doc.docDate)}</td>
                <td className="px-3 py-2 text-slate-600">{doc.docType || '—'}</td>
                <td className="px-3 py-2 font-bold text-slate-800 max-w-[14rem] truncate" title={doc.counterparty || ''}>
                  {doc.counterparty || <span className="text-slate-400 font-normal">— חסר —</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {doc.docNumber || '—'}
                  {doc.duplicateSuspect && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-700 bg-red-100 px-1.5 py-0.5 rounded mr-1.5" title="קיים מסמך נוסף עם אותו מספר — בדקו אם כפילות">
                      <AlertTriangle size={10} /> כפילות?
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">{nis(doc.totalAmount)}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{nis(doc.vatAmount)}</td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${doc.direction === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>
                    {doc.direction === 'income' ? 'הכנסה' : 'הוצאה'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {(doc.sources || []).map(s => SOURCE_LABELS[s.sourceKind] || s.sourceKind).join(', ') || '—'}
                </td>
                <td className="px-3 py-2">
                  {doc.reviewStatus === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-md"><CheckCircle2 size={11} /> מאושר</span>
                  ) : (
                    <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">לבדיקה</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {doc.filePath && (
                      <button onClick={() => openFile(doc)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="פתח קובץ מקור">
                        <Eye size={15} />
                      </button>
                    )}
                    <button onClick={() => setEditing({ doc, suspects: [] })} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="עריכת פרטים">
                      <Edit size={15} />
                    </button>
                    <button
                      onClick={() => toggleApprove(doc)}
                      className={`p-1.5 rounded-lg ${doc.reviewStatus === 'confirmed' ? 'text-green-600 hover:bg-amber-50 hover:text-amber-600' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'}`}
                      title={doc.reviewStatus === 'confirmed' ? 'החזר לבדיקה' : 'אשר מסמך'}
                    >
                      <CheckCircle2 size={15} />
                    </button>
                    <button onClick={() => remove(doc)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="מחיקה">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditDocumentModal
          doc={editing.doc}
          allDocs={docs}
          onClose={() => setEditing(null)}
          onSaved={(updated, suspects) => {
            setDocs(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
            setEditing(null);
            if (suspects.length > 0) {
              alert(`שימו לב: נמצאו ${suspects.length} מסמכים עם מספר מסמך דומה — בדקו אם מדובר בכפילות:\n` +
                suspects.map(s => `#${s.docNumber} · ${s.counterparty || ''} · ${nis(s.totalAmount)}`).join('\n'));
            }
          }}
        />
      )}
    </div>
  );
};

// ── מודאל עריכת פרטי מסמך ────────────────────────────────────────────────────
const EditDocumentModal: React.FC<{
  doc: FinanceDocument;
  allDocs: FinanceDocument[];
  onClose: () => void;
  onSaved: (doc: FinanceDocument, suspects: DocSuspect[]) => void;
}> = ({ doc, allDocs, onClose, onSaved }) => {
  const [form, setForm] = useState({
    direction: doc.direction,
    docType: doc.docType || '',
    counterparty: doc.counterparty || '',
    docNumber: doc.docNumber || '',
    docDate: doc.docDate || '',
    currency: doc.currency || 'ILS',
    netAmount: doc.netAmount != null ? String(doc.netAmount) : '',
    vatAmount: doc.vatAmount != null ? String(doc.vatAmount) : '',
    totalAmount: doc.totalAmount != null ? String(doc.totalAmount) : '',
    notes: doc.notes || '',
    relatedDocId: doc.relatedDocId || '',
  });
  const [saving, setSaving] = useState(false);

  const isCreditOrCancel = form.docType === 'זיכוי' || form.docType === 'ביטול';
  const numOrNull = (s: string) => {
    const t = s.replace(/,/g, '').trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  // חישוב מע"מ 18% מהסה"כ — רק בלחיצה מפורשת, לא אוטומטית
  const fillVatFromTotal = () => {
    const total = numOrNull(form.totalAmount);
    if (total == null) return;
    const net = total / 1.18;
    setForm(f => ({
      ...f,
      netAmount: net.toFixed(2),
      vatAmount: (total - net).toFixed(2),
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { document, suspects } = await updateDocument(doc.id, {
        direction: form.direction,
        docType: form.docType || null,
        counterparty: form.counterparty || null,
        docNumber: form.docNumber || null,
        docDate: form.docDate || null,
        currency: form.currency || 'ILS',
        netAmount: numOrNull(form.netAmount),
        vatAmount: numOrNull(form.vatAmount),
        totalAmount: numOrNull(form.totalAmount),
        notes: form.notes || null,
        relatedDocId: isCreditOrCancel ? (form.relatedDocId || null) : null,
      });
      onSaved(document, suspects);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-100';
  const label = 'text-xs font-bold text-slate-400 mb-1 block';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <FileText size={20} className="text-purple-600" />
            פרטי מסמך {doc.fileName ? `— ${doc.fileName}` : ''}
          </h3>
          <button onClick={onClose}><X size={22} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={label}>כיוון</label>
            <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as DocDirection }))} className={input}>
              <option value="expense">הוצאה</option>
              <option value="income">הכנסה</option>
            </select>
          </div>
          <div>
            <label className={label}>סוג מסמך</label>
            <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))} className={input}>
              <option value="">— לא ידוע —</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>תאריך המסמך</label>
            <input type="date" value={form.docDate} onChange={e => setForm(f => ({ ...f, docDate: e.target.value }))} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>ספק / לקוח</label>
            <input value={form.counterparty} onChange={e => setForm(f => ({ ...f, counterparty: e.target.value }))} className={input} placeholder="שם הספק (הוצאה) או הלקוח (הכנסה)" />
          </div>
          <div>
            <label className={label}>מס' מסמך</label>
            <input value={form.docNumber} onChange={e => setForm(f => ({ ...f, docNumber: e.target.value }))} className={input} />
          </div>
          <div>
            <label className={label}>סה"כ כולל מע"מ</label>
            <input value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} className={input} inputMode="decimal" />
          </div>
          <div>
            <label className={label}>לפני מע"מ</label>
            <input value={form.netAmount} onChange={e => setForm(f => ({ ...f, netAmount: e.target.value }))} className={input} inputMode="decimal" />
          </div>
          <div>
            <label className={label}>מע"מ</label>
            <div className="flex gap-1.5">
              <input value={form.vatAmount} onChange={e => setForm(f => ({ ...f, vatAmount: e.target.value }))} className={input} inputMode="decimal" />
              <button
                type="button"
                onClick={fillVatFromTotal}
                disabled={!form.totalAmount}
                className="shrink-0 text-[11px] font-black bg-slate-100 text-slate-600 px-2 rounded-lg hover:bg-slate-200 disabled:opacity-40"
                title="חישוב נטו ומע''מ מהסה''כ לפי 18% — פעולה מפורשת, לא אוטומטית"
              >
                18%
              </button>
            </div>
          </div>
          <div>
            <label className={label}>מטבע</label>
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={input}>
              <option value="ILS">₪ ILS</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
            </select>
          </div>
          {isCreditOrCancel && (
            <div className="sm:col-span-2">
              <label className={label}>מסמך מקורי (שהזיכוי/הביטול מתייחס אליו)</label>
              <select value={form.relatedDocId} onChange={e => setForm(f => ({ ...f, relatedDocId: e.target.value }))} className={input}>
                <option value="">— בחר מסמך מקורי —</option>
                {allDocs.filter(d => d.id !== doc.id && d.docType !== 'זיכוי' && d.docType !== 'ביטול').map(d => (
                  <option key={d.id} value={d.id}>
                    {(d.docNumber ? `#${d.docNumber} · ` : '') + (d.counterparty || d.fileName || d.id)} · {nis(d.totalAmount)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">הסכום נשאר חיובי — המשמעות נקבעת לפי סוג המסמך.</p>
            </div>
          )}
          <div className="sm:col-span-3">
            <label className={label}>הערות</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={input} />
          </div>
        </div>

        <p className="text-[11px] text-slate-400">שדות שאינם ידועים אפשר להשאיר ריקים — הם יוצגו כ"חסר" ולא יושלמו אוטומטית.</p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">ביטול</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
            {saving ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentsBoard;
