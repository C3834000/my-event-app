import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { EventStatus, PaymentStatus, EventType, AppEvent } from '../types';
import { Plus, X, FileText, Trash2, Loader2, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import {
  buildGreenInvoiceParamsFromEvent,
  createGreenInvoiceDocument,
  convertGreenInvoiceDocument,
  giDocTypeName,
  giAllowedConversions,
} from '../services/greenInvoice';
import { EVENT_TAGS } from '../constants/eventBoard';

export interface EditEventModalProps {
  event?: Partial<AppEvent>;
  onClose: () => void;
  isNew?: boolean;
  preselectedCustomerId?: string;
}

const EditEventModal: React.FC<EditEventModalProps> = ({ event, onClose, isNew, preselectedCustomerId }) => {
  const { updateEvent, deleteEvent, addEvent, addCustomer, customers, getCustomerById, sendEventUpdateEmail } = useApp();
  const initialCustomerId = preselectedCustomerId || event?.customerId || '';
  const initialCust = initialCustomerId ? getCustomerById(initialCustomerId) : null;
  const [formData, setFormData] = useState<any>({
    id: event?.id || `e_${Date.now()}`,
    customerId: initialCustomerId,
    title: event?.title || (initialCust ? `אירוע – ${initialCust.name}` : ''),
    date: event?.date || new Date().toISOString().split('T')[0],
    startTime: event?.startTime || '10:00',
    endTime: event?.endTime || '12:00',
    amount: event?.amount || 0,
    paidAmount: event?.paidAmount || 0,
    status: event?.status || EventStatus.Booked,
    paymentStatus: event?.paymentStatus || PaymentStatus.NotPaid,
    eventType: event?.eventType || EventType.ClickersProgram,
    clickersNeeded: event?.clickersNeeded || 0,
    location: event?.location || '',
    tag: event?.tag || 'קליכיף',
    notes: event?.notes || '',
    phone: event?.phone || initialCust?.phone || '',
    email: event?.email || initialCust?.email || '',
    hebrewDate: event?.hebrewDate || '',
    paymentDate: event?.paymentDate || '',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [greenInvoiceLoading, setGreenInvoiceLoading] = useState(false);
  const [greenInvoiceDocType, setGreenInvoiceDocType] = useState(320);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertTargetType, setConvertTargetType] = useState<number | null>(null);
  // GI document state (persisted per event)
  const [giDoc, setGiDoc] = useState({
    id: event?.giDocId || '',
    number: event?.giDocNumber ?? null as number | null,
    type: event?.giDocType ?? null as number | null,
    date: event?.giDocDate || '',
    url: event?.giDocUrl || '',
  });
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 20);
    return customers
      .filter(
        c =>
          c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || c.email.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [customers, customerSearch]);

  const handleSave = async () => {
    if (isNew) {
      addEvent(formData);
    } else {
      updateEvent(formData.id, formData);
      try {
        await sendEventUpdateEmail(formData);
      } catch (_) {}
    }
    onClose();
  };
  const handleAddCustomer = () => {
    if (!newCustomer.name.trim()) return;
    const c = {
      id: `c_${Date.now()}`,
      name: newCustomer.name.trim(),
      phone: newCustomer.phone.trim() || '-',
      email: newCustomer.email.trim(),
    };
    addCustomer(c);
    setFormData((prev: any) => ({ ...prev, customerId: c.id, phone: c.phone, email: c.email }));
    setNewCustomer({ name: '', phone: '', email: '' });
    setShowAddCustomer(false);
    setShowCustomerList(false);
  };

  const applyGiResult = (r: Awaited<ReturnType<typeof createGreenInvoiceDocument>>, docType: number) => {
    if (!r.success) return;
    const url = r.url?.he || r.url?.origin || r.url?.en || '';
    const newGi = { id: r.id || '', number: r.number ?? null, type: docType, date: new Date().toISOString().slice(0, 10), url };
    setGiDoc(newGi);
    if (!isNew && formData.id) {
      updateEvent(formData.id, {
        giDocId: newGi.id,
        giDocNumber: newGi.number ?? undefined,
        giDocType: newGi.type,
        giDocDate: newGi.date,
        giDocUrl: newGi.url,
      } as Partial<AppEvent>);
    }
  };

  const handleGreenInvoice = async () => {
    const cust = formData.customerId ? getCustomerById(formData.customerId) : null;
    const clientName = (cust?.name || '').trim();
    if (!clientName) {
      alert('יש לשייך לקוח לאירוע לפני הפקת מסמך.');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      alert('נדרש סכום חיובי (שדה סכום) להפקת מסמך.');
      return;
    }
    if (!confirm(`להפיק מסמך בחשבונית ירוקה עבור ${clientName} בסך \u20AA${Number(formData.amount)}?`)) return;
    setGreenInvoiceLoading(true);
    try {
      const clientEmail = (formData.email?.trim() || cust?.email?.trim()) || undefined;
      const params = buildGreenInvoiceParamsFromEvent(
        { ...(formData as AppEvent), email: clientEmail ?? formData.email },
        clientName,
        { documentType: greenInvoiceDocType },
      );
      const r = await createGreenInvoiceDocument(params);
      if (r.success) {
        applyGiResult(r, greenInvoiceDocType);
        const link = r.url?.he || r.url?.origin || r.url?.en;
        const lines = [
          `מסמך נוצר בהצלחה.`,
          r.number != null ? `מספר מסמך: ${r.number}` : '',
          link ? `קישור הורדה: ${link}` : '',
          r.emailSent ? `המסמך נשלח למייל הלקוח.` : '',
        ].filter(Boolean);
        alert(lines.join('\n'));
      } else {
        alert([r.error, r.hint].filter(Boolean).join('\n\n'));
      }
    } catch (e) {
      alert((e as Error).message || 'שגיאה');
    } finally {
      setGreenInvoiceLoading(false);
    }
  };

  const handleConvertDocument = async (targetType: number) => {
    if (!giDoc.id) return;
    setConvertTargetType(targetType);
    const cust = formData.customerId ? getCustomerById(formData.customerId) : null;
    const clientEmail = (formData.email?.trim() || cust?.email?.trim()) || undefined;
    const targetLabel = giDocTypeName(targetType);
    if (!confirm(`ליצור ${targetLabel} מתוך מסמך מס' ${giDoc.number}?`)) { setConvertTargetType(null); return; }
    setConvertLoading(true);
    try {
      const r = await convertGreenInvoiceDocument(giDoc.id, targetType, clientEmail);
      if (r.success) {
        applyGiResult(r, targetType);
        const link = r.url?.he || r.url?.origin || r.url?.en;
        const lines = [
          `${targetLabel} נוצר בהצלחה.`,
          r.number != null ? `מספר מסמך: ${r.number}` : '',
          link ? `קישור הורדה: ${link}` : '',
          r.emailSent ? `המסמך נשלח למייל הלקוח.` : '',
        ].filter(Boolean);
        alert(lines.join('\n'));
      } else {
        alert([r.error, r.hint].filter(Boolean).join('\n\n'));
      }
    } catch (e) {
      alert((e as Error).message || 'שגיאה');
    } finally {
      setConvertLoading(false);
      setConvertTargetType(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <h3 className="text-xl font-bold">{isNew ? 'הוספת אירוע חדש' : 'עריכת אירוע'}</h3>
          <button type="button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
          <div className="md:col-span-2 space-y-1 relative">
            <label className="text-xs font-bold text-slate-400">שיוך ללקוח (חיפוש לפי שם)</label>
            <div className="flex gap-2">
              <input
                className="flex-1 p-2 bg-slate-50 border rounded-lg"
                placeholder="הקלד שם, טלפון או אימייל..."
                value={showCustomerList || !formData.customerId ? customerSearch : getCustomerById(formData.customerId)?.name || customerSearch}
                onChange={e => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerList(true);
                  if (!e.target.value) setFormData((prev: any) => ({ ...prev, customerId: '', title: prev.title, phone: prev.phone, email: prev.email }));
                }}
                onFocus={() => setShowCustomerList(true)}
                onBlur={() => setTimeout(() => setShowCustomerList(false), 200)}
              />
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="p-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 shrink-0"
                title="הוסף לקוח חדש"
              >
                <Plus size={20} />
              </button>
            </div>
            {showCustomerList && !showAddCustomer && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev: any) => ({ ...prev, customerId: '', title: prev.title, phone: prev.phone, email: prev.email }));
                    setShowCustomerList(false);
                    setCustomerSearch('');
                  }}
                  className="w-full p-2 text-right text-slate-500 hover:bg-slate-50 text-sm font-bold"
                >
                  ללא לקוח
                </button>
                {filteredCustomers.map(c => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, customerId: c.id, phone: c.phone, email: c.email }));
                      setShowCustomerList(false);
                      setCustomerSearch('');
                    }}
                    className="w-full p-2 text-right hover:bg-purple-50 text-sm font-bold border-t border-slate-100"
                  >
                    {c.name} – {c.phone}
                  </button>
                ))}
              </div>
            )}
            {showAddCustomer && (
              <div className="mt-2 p-4 bg-purple-50 rounded-xl border border-purple-100 space-y-2">
                <input
                  className="w-full p-2 border rounded-lg text-sm"
                  placeholder="שם מלא"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                />
                <input
                  className="w-full p-2 border rounded-lg text-sm"
                  placeholder="טלפון"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                />
                <input
                  className="w-full p-2 border rounded-lg text-sm"
                  placeholder="אימייל"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={handleAddCustomer} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                    הוסף ולשייך
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCustomer(false);
                      setNewCustomer({ name: '', phone: '', email: '' });
                    }}
                    className="text-slate-500 text-sm font-bold"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-400">שם האירוע / המזמין</label>
            <input
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">טלפון</label>
            <input
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">אימייל</label>
            <input
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">סכום (₪)</label>
            <input
              type="number"
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">תאריך</label>
            <input
              type="date"
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">תאריך תשלום בפועל</label>
            <input
              type="date"
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.paymentDate || ''}
              onChange={e => setFormData({ ...formData, paymentDate: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">תאריך עברי</label>
            <input
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.hebrewDate}
              onChange={e => setFormData({ ...formData, hebrewDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">סוג אירוע</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.eventType}
              onChange={e => setFormData({ ...formData, eventType: e.target.value as any })}
            >
              {Object.values(EventType).map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">תג אירוע</label>
            <select
              className="w-full p-2 border rounded-lg"
              value={formData.tag}
              onChange={e => setFormData({ ...formData, tag: e.target.value })}
            >
              {Object.keys(EVENT_TAGS).map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">מס׳ משתתפים / קליקרים</label>
            <input
              type="number"
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.clickersNeeded || 0}
              onChange={e => setFormData({ ...formData, clickersNeeded: Number(e.target.value) })}
              placeholder="50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">שעת התחלה</label>
            <input
              type="time"
              step={900}
              min="00:00"
              max="23:45"
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.startTime}
              onChange={e => setFormData({ ...formData, startTime: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">שעת סיום</label>
            <input
              type="time"
              step={900}
              min="00:00"
              max="23:45"
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.endTime}
              onChange={e => setFormData({ ...formData, endTime: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-400">כתובת</label>
            <input
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-400">הערות</label>
            <textarea
              className="w-full p-2 bg-slate-50 border rounded-lg"
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          {/* ── Green Invoice Status ─────────────────────────────────── */}
          {!isNew && giDoc.id && (
            <div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                <span className="font-bold text-emerald-800 text-sm">מסמך חשבונית ירוקה נשלח</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div><span className="font-bold">סוג:</span> {giDocTypeName(giDoc.type ?? undefined)}</div>
                {giDoc.number != null && <div><span className="font-bold">מספר:</span> {giDoc.number}</div>}
                {giDoc.date && <div><span className="font-bold">תאריך:</span> {giDoc.date}</div>}
              </div>
              {giDoc.url && (
                <a
                  href={giDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                >
                  <ExternalLink size={13} /> צפה/הורד מסמך
                </a>
              )}
              {/* המרה למסמך אחר */}
              {giAllowedConversions(giDoc.type ?? undefined).length > 0 && (
                <div className="pt-2 border-t border-emerald-200">
                  <p className="text-xs font-bold text-slate-500 mb-2">יצירת מסמך חדש מתוך המסמך הזה:</p>
                  <div className="flex flex-wrap gap-2">
                    {giAllowedConversions(giDoc.type ?? undefined).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleConvertDocument(opt.value)}
                        disabled={convertLoading}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {convertLoading && convertTargetType === opt.value
                          ? <Loader2 size={13} className="animate-spin" />
                          : <RefreshCw size={13} />}
                        צור {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-6 bg-slate-50 border-t flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          {!isNew ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={greenInvoiceDocType}
                onChange={e => setGreenInvoiceDocType(Number(e.target.value))}
                className="p-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-emerald-200"
                title="סוג מסמך"
              >
                <option value={10}>הצעת מחיר</option>
                <option value={300}>חשבון עסקה (דרישת תשלום)</option>
                <option value={305}>חשבונית מס</option>
                <option value={320}>חשבונית מס / קבלה</option>
                <option value={400}>קבלה</option>
              </select>
              <button
                type="button"
                onClick={handleGreenInvoice}
                disabled={greenInvoiceLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
              >
                {greenInvoiceLoading ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                שלח לחשבונית ירוקה
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('מחק אירוע?')) {
                    deleteEvent(formData.id);
                    onClose();
                  }
                }}
                className="text-red-500 hover:text-red-700 flex items-center gap-1 font-bold text-sm px-2"
              >
                <Trash2 size={18} /> מחק אירוע
              </button>
            </div>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 font-bold text-slate-400">
              ביטול
            </button>
            <button type="button" onClick={handleSave} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold shadow-lg">
              שמור
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditEventModal;
