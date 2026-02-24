
import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { EventStatus, PaymentStatus, EventType, AppEvent, PaymentMethod } from '../types';
import { Plus, Search, FileText, Calendar as CalendarIcon, Download, X, Save, MapPin, Users, Clock, ChevronDown, ChevronUp, MousePointer2, Info, Upload, Edit, Trash2 } from 'lucide-react';
import { exportToCSV, parseCSV } from '../services/utils';
import { Link } from 'react-router-dom';

const EVENT_TAGS: Record<string, string> = {
  'קליכיף': 'bg-blue-500 text-white',
  'יתרון ירושלמי': 'bg-red-300 text-slate-800',
  'גפן תשפ״ה': 'bg-purple-700 text-white',
  'גפן תשפ״ד': 'bg-teal-400 text-white',
  'פידבק': 'bg-gray-400 text-white',
  'זה״ב - עיריית י-ם': 'bg-orange-400 text-white',
  'מרכז הבמה': 'bg-purple-500 text-white',
  'חיות דקדושה': 'bg-green-700 text-white'
};

const CATEGORY_COLORS: string[] = [
  'bg-sky-100 text-sky-800 border border-sky-200',
  'bg-violet-100 text-violet-800 border border-violet-200',
  'bg-amber-100 text-amber-800 border border-amber-200',
  'bg-emerald-100 text-emerald-800 border border-emerald-200',
  'bg-rose-100 text-rose-800 border border-rose-200',
  'bg-teal-100 text-teal-800 border border-teal-200',
  'bg-indigo-100 text-indigo-800 border border-indigo-200',
  'bg-lime-100 text-lime-800 border border-lime-200',
  'bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200',
  'bg-slate-100 text-slate-700 border border-slate-200',
];
const getCategoryStyle = (category: string) => {
  const idx = Math.abs(category.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[idx];
};

const HEADER_BG_COLORS: string[] = [
  'bg-gradient-to-r from-blue-400 to-sky-400',
  'bg-gradient-to-r from-purple-400 to-violet-400',
  'bg-gradient-to-r from-pink-400 to-rose-400',
  'bg-gradient-to-r from-orange-400 to-amber-400',
  'bg-gradient-to-r from-green-400 to-emerald-400',
  'bg-gradient-to-r from-teal-400 to-cyan-400',
  'bg-gradient-to-r from-indigo-400 to-blue-400',
  'bg-gradient-to-r from-red-400 to-pink-400',
  'bg-gradient-to-r from-yellow-400 to-orange-400',
  'bg-gradient-to-r from-lime-400 to-green-400',
];

const getHeaderBg = (category: string) => {
  if (category === '🆕 אירועים חדשים') return 'bg-gradient-to-r from-purple-500 to-pink-500';
  const idx = Math.abs(category.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % HEADER_BG_COLORS.length;
  return HEADER_BG_COLORS[idx];
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  [PaymentStatus.NotPaid]: 'bg-[#c4c4c4] text-white',
  [PaymentStatus.PaidCash]: 'bg-[#9cd326] text-white',
  [PaymentStatus.Paid]: 'bg-[#00c875] text-white',
  [PaymentStatus.PaidTransferL]: 'bg-[#579bfc] text-white',
  [PaymentStatus.PaidPartial]: 'bg-[#ff753e] text-white',
  [PaymentStatus.PaidCredit]: 'bg-[#cab641] text-white',
  [PaymentStatus.Net30]: 'bg-[#0086c0] text-white',
  [PaymentStatus.PaidCheck]: 'bg-[#e23344] text-white',
  [PaymentStatus.Net60]: 'bg-[#5559df] text-white',
  [PaymentStatus.PaidTransferH]: 'bg-[#a25ddc] text-white',
  [PaymentStatus.PaidTransferM]: 'bg-[#ffad46] text-white',
  [PaymentStatus.PaidProvider]: 'bg-[#bb3354] text-white',
};

const EVENT_TYPE_STYLES: Record<string, string> = {
  [EventType.ClickAurimProgram]: 'bg-[#0086c0] text-white',
  [EventType.ClickersProgram]: 'bg-[#579bfc] text-white',
  [EventType.ClickForYouAurim]: 'bg-[#ffad46] text-white',
  [EventType.ClickForYouClickers]: 'bg-[#a25ddc] text-white',
  [EventType.TalkClick]: 'bg-[#00c875] text-white',
  [EventType.PhoneClick]: 'bg-[#e23344] text-white',
};

const EventRow: React.FC<{ event: AppEvent; onEdit: (ev: AppEvent) => void }> = ({ event, onEdit }) => {
  const { getCustomerById, updateEvent, tasks } = useApp();
  const linkedTask = tasks.find(t => t.id === event.taskId);
  const customer = getCustomerById(event.customerId);
  const debt = event.amount - event.paidAmount;
  const isPaid = [PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck, PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider].includes(event.paymentStatus);
  const showDebt = !isPaid && debt > 0;

  return (
      <div className="bg-white border-b border-slate-100 p-5 hover:bg-slate-50 transition-colors group">
          <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{event.externalId || 'ID לא זמין'}</span>
                              <h4 className="text-lg font-bold text-slate-800">{event.title}</h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`text-xs font-bold px-3 py-1 rounded-lg ${EVENT_TAGS[event.tag] || 'bg-slate-400 text-white'}`}>{event.tag}</span>
                            <span className={`text-xs font-bold px-3 py-1 rounded-lg ${EVENT_TYPE_STYLES[event.eventType] || 'bg-slate-500 text-white'}`}>{event.eventType}</span>
                            {event.clickersNeeded > 0 && (
                               <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold border border-indigo-200">
                                  <MousePointer2 size={12} /> {event.clickersNeeded} קליקרים
                               </span>
                             )}
                          </div>
                      </div>
                      <button onClick={() => onEdit(event)} className="p-2.5 hover:bg-purple-100 text-slate-400 hover:text-purple-600 rounded-xl transition-colors"><Edit size={20} /></button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                         <Users size={16} className="text-purple-500" />
                         <span className="font-medium">{customer?.name || event.title || 'לא משויך ללקוח'}</span>
                      </div>
                      {event.phone && (
                          <div className="flex items-center gap-2 text-slate-600">
                             <span className="text-purple-500">📞</span>
                             <span className="font-medium">{event.phone}</span>
                          </div>
                      )}
                      {event.email && (
                          <div className="flex items-center gap-2 text-slate-600">
                             <span className="text-purple-500">📧</span>
                             <span className="font-medium text-xs">{event.email}</span>
                          </div>
                      )}
                      {event.location && (
                          <div className="flex items-center gap-2 text-slate-600">
                             <MapPin size={16} className="text-purple-500" />
                             <span className="font-medium">{event.location}</span>
                          </div>
                      )}
                      {event.notes && (
                          <div className="md:col-span-2 lg:col-span-3 flex items-start gap-2 text-slate-600 bg-amber-50 p-2 rounded-lg border border-amber-100">
                             <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                             <span className="text-xs font-medium">{event.notes}</span>
                          </div>
                      )}
                  </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
                  <div className="space-y-1.5 lg:w-48">
                      <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
                          <CalendarIcon size={16} className="text-blue-500" />
                          {new Date(event.date).toLocaleDateString('he-IL')}
                      </div>
                      {event.hebrewDate && <div className="text-xs text-slate-500 italic pr-6">{event.hebrewDate}</div>}
                      <div className="text-sm text-slate-600 flex items-center gap-1.5 pr-6">
                          <Clock size={14} className="text-green-500" />
                          {event.startTime} - {event.endTime}
                      </div>
                  </div>

                  <div className="space-y-1.5 lg:w-32">
                     <div className="text-lg font-bold text-slate-800">₪{event.amount.toLocaleString()}</div>
                     {showDebt && <div className="text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded">חוב: ₪{debt.toLocaleString()}</div>}
                  </div>

                  <div className="lg:w-56">
                      <select 
                        value={event.paymentStatus}
                        onChange={(e) => updateEvent(event.id, { paymentStatus: e.target.value as PaymentStatus })}
                        className={`w-full text-xs font-bold p-2.5 rounded-lg border-0 outline-none cursor-pointer ${PAYMENT_STATUS_STYLES[event.paymentStatus]}`}
                      >
                          {Object.values(PaymentStatus).map(s => <option key={s} value={s} className="bg-white text-slate-800">{s}</option>)}
                      </select>
                  </div>
              </div>

              {/* Linked Task */}
              <div className="border-t border-slate-100 pt-3 mt-3">
                {linkedTask ? (
                  <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-purple-600 mb-1">📋 משימה מקושרת:</div>
                      <div className="text-sm font-bold text-slate-800">{linkedTask.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {linkedTask.isCompleted ? (
                        <span className="text-xs font-bold bg-green-500 text-white px-3 py-1 rounded-lg">✓ הושלמה</span>
                      ) : linkedTask.progress > 0 ? (
                        <span className="text-xs font-bold bg-blue-500 text-white px-3 py-1 rounded-lg">⏳ {linkedTask.progress}%</span>
                      ) : (
                        <span className="text-xs font-bold bg-slate-300 text-slate-700 px-3 py-1 rounded-lg">⏸️ ממתינה</span>
                      )}
                      <button 
                        onClick={() => updateEvent(event.id, { taskId: undefined })}
                        className="text-red-500 hover:bg-red-50 p-1 rounded transition-all"
                        title="נתק משימה"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <select
                    value={event.taskId || ''}
                    onChange={(e) => updateEvent(event.id, { taskId: e.target.value || undefined })}
                    className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:border-purple-300 transition-all"
                  >
                    <option value="">🔗 קשר למשימה...</option>
                    {tasks.filter(t => !t.isCompleted).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.category})
                      </option>
                    ))}
                  </select>
                )}
              </div>
          </div>
      </div>
  );
};

const EditEventModal: React.FC<{ event?: Partial<AppEvent>; onClose: () => void; isNew?: boolean; preselectedCustomerId?: string }> = ({ event, onClose, isNew, preselectedCustomerId }) => {
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
      hebrewDate: event?.hebrewDate || ''
    });
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerList, setShowCustomerList] = useState(false);
    const [showAddCustomer, setShowAddCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
    const filteredCustomers = useMemo(() => {
      const q = customerSearch.trim().toLowerCase();
      if (!q) return customers.slice(0, 20);
      return customers.filter(c => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || c.email.toLowerCase().includes(q)).slice(0, 20);
    }, [customers, customerSearch]);

    const handleSave = async () => {
      if (isNew) {
        addEvent(formData);
      } else {
        updateEvent(formData.id, formData);
        try { await sendEventUpdateEmail(formData); } catch (_) {}
      }
      onClose();
    };
    const handleAddCustomer = () => {
      if (!newCustomer.name.trim()) return;
      const c = { id: `c_${Date.now()}`, name: newCustomer.name.trim(), phone: newCustomer.phone.trim() || '-', email: newCustomer.email.trim() };
      addCustomer(c);
      setFormData((prev: any) => ({ ...prev, customerId: c.id, title: `אירוע – ${c.name}`, phone: c.phone, email: c.email }));
      setNewCustomer({ name: '', phone: '', email: '' });
      setShowAddCustomer(false);
      setShowCustomerList(false);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                    <h3 className="text-xl font-bold">{isNew ? 'הוספת אירוע חדש' : 'עריכת אירוע'}</h3>
                    <button onClick={onClose}><X size={24} /></button>
                </div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto">
                    <div className="md:col-span-2 space-y-1 relative">
                      <label className="text-xs font-bold text-slate-400">שיוך ללקוח (חיפוש לפי שם)</label>
                      <div className="flex gap-2">
                        <input className="flex-1 p-2 bg-slate-50 border rounded-lg" placeholder="הקלד שם, טלפון או אימייל..." value={showCustomerList || !formData.customerId ? customerSearch : (getCustomerById(formData.customerId)?.name || customerSearch)} onChange={e => { setCustomerSearch(e.target.value); setShowCustomerList(true); if (!e.target.value) setFormData((prev: any) => ({ ...prev, customerId: '', title: prev.title, phone: prev.phone, email: prev.email })); }} onFocus={() => setShowCustomerList(true)} onBlur={() => setTimeout(() => setShowCustomerList(false), 200)} />
                        <button type="button" onClick={() => setShowAddCustomer(true)} className="p-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 shrink-0" title="הוסף לקוח חדש"><Plus size={20}/></button>
                      </div>
                      {showCustomerList && !showAddCustomer && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                          <button type="button" onClick={() => { setFormData((prev: any) => ({ ...prev, customerId: '', title: prev.title, phone: prev.phone, email: prev.email })); setShowCustomerList(false); setCustomerSearch(''); }} className="w-full p-2 text-right text-slate-500 hover:bg-slate-50 text-sm font-bold">ללא לקוח</button>
                          {filteredCustomers.map(c => (
                            <button type="button" key={c.id} onClick={() => { setFormData(prev => ({ ...prev, customerId: c.id, title: `אירוע – ${c.name}`, phone: c.phone, email: c.email })); setShowCustomerList(false); setCustomerSearch(''); }} className="w-full p-2 text-right hover:bg-purple-50 text-sm font-bold border-t border-slate-100">{c.name} – {c.phone}</button>
                          ))}
                        </div>
                      )}
                      {showAddCustomer && (
                        <div className="mt-2 p-4 bg-purple-50 rounded-xl border border-purple-100 space-y-2">
                          <input className="w-full p-2 border rounded-lg text-sm" placeholder="שם מלא" value={newCustomer.name} onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} />
                          <input className="w-full p-2 border rounded-lg text-sm" placeholder="טלפון" value={newCustomer.phone} onChange={e => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))} />
                          <input className="w-full p-2 border rounded-lg text-sm" placeholder="אימייל" value={newCustomer.email} onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} />
                          <div className="flex gap-2">
                            <button type="button" onClick={handleAddCustomer} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold">הוסף ולשייך</button>
                            <button type="button" onClick={() => { setShowAddCustomer(false); setNewCustomer({ name: '', phone: '', email: '' }); }} className="text-slate-500 text-sm font-bold">ביטול</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400">שם האירוע / המזמין</label><input className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">טלפון</label><input className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">אימייל</label><input className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">סכום (₪)</label><input type="number" className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">תאריך</label><input type="date" className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">תאריך עברי</label><input className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.hebrewDate} onChange={e => setFormData({...formData, hebrewDate: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">סוג אירוע</label><select className="w-full p-2 border rounded-lg" value={formData.eventType} onChange={e => setFormData({...formData, eventType: e.target.value as any})}>{Object.values(EventType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">תג אירוע</label><select className="w-full p-2 border rounded-lg" value={formData.tag} onChange={e => setFormData({...formData, tag: e.target.value})}>{Object.keys(EVENT_TAGS).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">מס׳ משתתפים / קליקרים</label><input type="number" className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.clickersNeeded || 0} onChange={e => setFormData({...formData, clickersNeeded: Number(e.target.value)})} placeholder="50"/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">שעת התחלה</label><input type="time" step="900" min="00:00" max="23:45" className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})}/></div>
                    <div className="space-y-1"><label className="text-xs font-bold text-slate-400">שעת סיום</label><input type="time" step="900" min="00:00" max="23:45" className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})}/></div>
                    <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400">כתובת</label><input className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}/></div>
                    <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400">הערות</label><textarea className="w-full p-2 bg-slate-50 border rounded-lg" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})}/></div>
                </div>
                <div className="p-6 bg-slate-50 border-t flex justify-between items-center">
                    {!isNew ? <button onClick={() => { if(confirm('מחק אירוע?')) { deleteEvent(formData.id); onClose(); } }} className="text-red-500 hover:text-red-700 flex items-center gap-1 font-bold"><Trash2 size={18}/> מחק אירוע</button> : <div></div>}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 font-bold text-slate-400">ביטול</button>
                        <button onClick={handleSave} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold shadow-lg">שמור</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EventsBoard: React.FC = () => {
  const { events, getCustomerById, importEvents } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEvent, setEditingEvent] = useState<AppEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'all' | 'unpaid'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  
  React.useEffect(() => {
      const initialState: Record<string, boolean> = {};
      Object.keys(groupedEvents).forEach(key => {
          initialState[key] = key !== '🆕 אירועים חדשים';
      });
      setCollapsedGroups(initialState);
  }, []);

  const filtered = useMemo(() => {
      return events.filter(e => {
        const cust = getCustomerById(e.customerId);
        const s = searchTerm.toLowerCase();
        const match = e.title.toLowerCase().includes(s) || cust?.name.toLowerCase().includes(s) || (e.externalId || '').toLowerCase().includes(s);
        return viewMode === 'all' ? match : (match && e.paymentStatus !== PaymentStatus.Paid);
      });
  }, [events, searchTerm, getCustomerById, viewMode]);

  const groupedEvents = useMemo(() => {
      const groups: Record<string, AppEvent[]> = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      filtered.forEach(e => {
          const eventDate = new Date(e.date);
          eventDate.setHours(0, 0, 0, 0);
          const isFutureEvent = eventDate >= today;
          
          const groupName = isFutureEvent ? '🆕 אירועים חדשים' : ((e as any).category || e.tag || 'כללי');
          
          // סינון קטגוריות אם יש בחירה
          if (selectedCategories.size > 0 && !selectedCategories.has(groupName)) {
            return;
          }
          
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(e);
      });
      
      return Object.keys(groups).sort((a, b) => {
          if (a === '🆕 אירועים חדשים') return -1;
          if (b === '🆕 אירועים חדשים') return 1;
          if (a === 'לבדיקה') return -1;
          if (b === 'לבדיקה') return 1;
          return a.localeCompare(b);
      }).reduce((obj: any, key) => {
          obj[key] = groups[key].sort((a, b) => {
              return b.id.localeCompare(a.id);
          });
          return obj;
      }, {});
  }, [filtered, selectedCategories]);

  const toggleGroup = (group: string) => {
      setCollapsedGroups(prev => ({...prev, [group]: !prev[group]}));
  };

  const toggleAllGroups = (collapse: boolean) => {
      const next: Record<string, boolean> = {};
      Object.keys(groupedEvents).forEach(k => next[k] = collapse);
      setCollapsedGroups(next);
  };

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    events.forEach(e => {
      const eventDate = new Date(e.date);
      eventDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isFutureEvent = eventDate >= today;
      const groupName = isFutureEvent ? '🆕 אירועים חדשים' : ((e as any).category || e.tag || 'כללי');
      cats.add(groupName);
    });
    return Array.from(cats).sort();
  }, [events]);

  const totalRevenueFiltered = useMemo(() => {
    const eventsToCount = selectedCategories.size === 0 
      ? Object.values(groupedEvents).flat()
      : Object.entries(groupedEvents)
          .filter(([cat]) => selectedCategories.has(cat))
          .map(([, list]) => list).flat();
    return eventsToCount.reduce((sum, e: AppEvent) => sum + (e.paidAmount || 0), 0);
  }, [groupedEvents, selectedCategories]);

  const toggleCategoryFilter = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-slate-800">אירועים</h2>
              <p className="text-slate-500">ניהול לוח זמנים, סיווגים וגבייה</p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg">
              <div className="text-xs font-bold opacity-90">סך הכנסות</div>
              <div className="text-2xl font-black">₪{totalRevenueFiltered.toLocaleString()}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if(file) { importEvents(await parseCSV(file)); alert('ייבוא וסנכרון הושלם!'); } }} className="hidden" accept=".csv" />
          <Link to="/book?skipPortal=true" className="bg-purple-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-lg hover:bg-purple-700 transition-all"><Plus size={18} /> הוסף אירוע</Link>
          <button onClick={() => fileInputRef.current?.click()} className="bg-white border px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm hover:bg-slate-50 transition-all"><Upload size={18} /> ייבוא</button>
          <button onClick={() => setViewMode(v => v === 'all' ? 'unpaid' : 'all')} className={`px-4 py-2 rounded-xl font-bold transition-all shadow-sm ${viewMode === 'unpaid' ? 'bg-red-500 text-white' : 'bg-white text-slate-700 border'}`}>
            {viewMode === 'unpaid' ? 'הצג הכל' : 'הצג חובות'}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="חפש לפי שם, ID או תגית..." className="w-full pr-10 pl-4 py-3 bg-white border rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-purple-100" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>
          <div className="flex gap-2">
              <button onClick={() => toggleAllGroups(false)} className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-2 rounded-lg">פתח הכל</button>
              <button onClick={() => toggleAllGroups(true)} className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">כווץ הכל</button>
          </div>
      </div>

      {/* Category Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-slate-700">🏷️ סנן קטגוריות:</h3>
          <div className="flex gap-2">
            <button onClick={() => setSelectedCategories(new Set(allCategories))} className="text-xs font-bold text-blue-600 hover:underline">בחר הכל</button>
            <button onClick={() => setSelectedCategories(new Set())} className="text-xs font-bold text-slate-500 hover:underline">נקה הכל</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => toggleCategoryFilter(cat)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                selectedCategories.size === 0 || selectedCategories.has(cat)
                  ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                  : 'bg-slate-100 text-slate-400 border-2 border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedEvents).map(([group, list]: [string, any]) => {
            const totalRevenue = list.reduce((sum: number, e: AppEvent) => sum + (e.paidAmount || 0), 0);
            const totalAmount = list.reduce((sum: number, e: AppEvent) => sum + e.amount, 0);
            
            return (
            <div key={group} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button 
                    onClick={() => toggleGroup(group)}
                    className={`w-full flex items-center justify-between py-3 px-5 ${getHeaderBg(group)} hover:opacity-90 transition-all shadow-sm`}
                >
                    <div className="flex items-center gap-4">
                        <span className="px-3 py-1.5 rounded-full text-xs font-black bg-white/30 text-white backdrop-blur-sm shadow-sm">{group}</span>
                        <span className="text-sm font-bold text-white/95">{list.length} אירועים</span>
                        <span className="text-sm font-black text-white/95">💰 ₪{totalRevenue.toLocaleString()}</span>
                        {totalAmount > totalRevenue && (
                            <span className="text-xs font-bold text-white/80">/ ₪{totalAmount.toLocaleString()}</span>
                        )}
                    </div>
                    {collapsedGroups[group] ? <ChevronDown size={22} className="text-white" /> : <ChevronUp size={22} className="text-white" />}
                </button>
                {!collapsedGroups[group] && (
                    <div className="divide-y divide-slate-50">
                        {list.map((e: AppEvent) => <EventRow key={e.id} event={e} onEdit={setEditingEvent} />)}
                    </div>
                )}
            </div>
        )})}
      </div>

      {editingEvent && <EditEventModal event={editingEvent} onClose={() => setEditingEvent(null)} />}
    </div>
  );
};

export default EventsBoard;
