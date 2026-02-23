
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Phone, Mail, Search, ChevronDown, ChevronUp, MessageCircle, Send, Plus, Upload, X, Calendar, Loader2, Edit, ExternalLink, DollarSign } from 'lucide-react';
import { Customer } from '../types';
import { parseCSV } from '../services/utils';
import { EventStatus, PaymentStatus, EventType } from '../types';
import { Link } from 'react-router-dom';

const CustomersBoard: React.FC = () => {
  const { customers, events, addCustomer, importCustomers, addEvent, sendPortalEmailForCustomer, updateCustomer } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLetters, setExpandedLetters] = useState<Record<string, boolean>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [sendingPortalId, setSendingPortalId] = useState<string | null>(null);
  const [createEventFor, setCreateEventFor] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '', notes: '' });
  const [newEventForm, setNewEventForm] = useState({ title: '', date: '', startTime: '10:00', endTime: '12:00', amount: 0, location: '', notes: '' });

  const filtered = customers.filter(c => 
    c.name.includes(searchTerm) || c.phone.includes(searchTerm) || c.email.includes(searchTerm)
  );

  const grouped = useMemo(() => {
    const groups: Record<string, Customer[]> = {};
    filtered.forEach(c => {
        const first = c.name.charAt(0);
        if (!groups[first]) groups[first] = [];
        groups[first].push(c);
    });
    return Object.keys(groups).sort().reduce((obj: any, key) => {
        obj[key] = groups[key];
        return obj;
    }, {});
  }, [filtered]);

  const toggleAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    Object.keys(grouped).forEach(l => next[l] = expand);
    setExpandedLetters(next);
  };

  const handleWhatsApp = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/972${clean.startsWith('0') ? clean.substring(1) : clean}`, '_blank');
  };

  const handleAddCust = () => {
    if (!newCust.name) return;
    addCustomer({ id: `c_${Date.now()}`, ...newCust });
    setNewCust({ name: '', phone: '', email: '', notes: '' });
    setIsAddingNew(false);
  };

  const handleUpdateCust = () => {
    if (!editingCustomer) return;
    updateCustomer(editingCustomer.id, editingCustomer);
    setEditingCustomer(null);
  };

  const handleSendPortal = async (c: Customer) => {
    setSendingPortalId(c.id);
    try {
      await sendPortalEmailForCustomer(c.id);
      alert('פורטל נשלח למייל בהצלחה!');
    } catch (e) {
      alert('שגיאה בשליחת המייל או שלא הוגדר אימייל ללקוח.');
    } finally {
      setSendingPortalId(null);
    }
  };

  const handleCreateEventSubmit = () => {
    if (!createEventFor) return;
    addEvent({
      id: `e_${Date.now()}`,
      customerId: createEventFor.id,
      title: newEventForm.title || `אירוע – ${createEventFor.name}`,
      date: newEventForm.date || new Date().toISOString().split('T')[0],
      startTime: newEventForm.startTime || '10:00',
      endTime: newEventForm.endTime || '12:00',
      amount: newEventForm.amount || 0,
      paidAmount: 0,
      status: EventStatus.Booked,
      paymentStatus: PaymentStatus.NotPaid,
      eventType: EventType.ClickersProgram,
      clickersNeeded: 0,
      location: newEventForm.location || '',
      tag: 'קליכיף',
      phone: createEventFor.phone,
      email: createEventFor.email,
      notes: newEventForm.notes || '',
    });
    setCreateEventFor(null);
    setNewEventForm({ title: '', date: '', startTime: '10:00', endTime: '12:00', amount: 0, location: '', notes: '' });
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
           <div><h2 className="text-3xl font-bold text-slate-800">לקוחות (B)</h2><p className="text-slate-500">מאגר CRM וניהול תקשורת</p></div>
           <div className="flex gap-2">
                <button onClick={() => setIsAddingNew(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> הוסף לקוח</button>
                <input type="file" ref={fileInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if(file) { importCustomers(await parseCSV(file)); alert('ייבוא לקוחות הושלם!'); } }} className="hidden" accept=".csv" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-white border px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm"><Upload size={18} /> ייבוא</button>
                <button onClick={() => toggleAll(true)} className="text-xs font-bold text-purple-600 hover:underline">פתח הכל</button>
                <button onClick={() => toggleAll(false)} className="text-xs font-bold text-slate-400 hover:underline">כווץ הכל</button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" placeholder="חפש לפי שם, טלפון או מייל..." 
                    className="w-full pr-10 pl-4 py-3 bg-white border rounded-xl outline-none shadow-sm"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
            <button 
                onClick={() => { setIsSyncing(true); setTimeout(() => setIsSyncing(false), 2000); }}
                className="bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-green-700 transition-all"
            >
                {isSyncing ? <span className="animate-spin text-lg">↻</span> : <MessageCircle size={18} />}
                {isSyncing ? 'מסנכרן...' : 'סנכרן וואטסאפ'}
            </button>
        </div>

        <div className="space-y-4">
            {Object.entries(grouped).map(([letter, list]: [string, any]) => (
                <div key={letter} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <button 
                        onClick={() => setExpandedLetters(prev => ({...prev, [letter]: !prev[letter]}))}
                        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">{letter}</span>
                            <span className="font-bold text-slate-700">{list.length} לקוחות</span>
                        </div>
                        {expandedLetters[letter] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                    {expandedLetters[letter] && (
                        <div className="divide-y divide-slate-100">
                            {list.map((c: Customer) => {
                                const cEvents = events.filter(ev => ev.customerId === c.id || ev.phone === c.phone || (ev.email && ev.email === c.email));
                                const totalPaid = cEvents.reduce((sum, ev) => sum + (ev.paidAmount || 0), 0);
                                const totalDebt = cEvents.reduce((sum, ev) => sum + (ev.amount - (ev.paidAmount || 0)), 0);
                                const isExpanded = expandedCustomer === c.id;
                                return (
                                    <div key={c.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <h4 className="text-lg font-bold text-slate-800">{c.name}</h4>
                                                    <button onClick={() => setExpandedCustomer(isExpanded ? null : c.id)} className="text-xs font-bold text-purple-600 hover:underline">{isExpanded ? 'כווץ' : 'הצג פרטים'}</button>
                                                </div>
                                                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                                                    <span className="flex items-center gap-1.5"><Phone size={14} className="text-purple-500"/>{c.phone}</span>
                                                    <span className="flex items-center gap-1.5"><Mail size={14} className="text-purple-500"/>{c.email}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {totalPaid > 0 && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1 rounded-lg">שולם: ₪{totalPaid.toLocaleString()}</span>}
                                                    {totalDebt > 0 && <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-lg">חוב: ₪{totalDebt.toLocaleString()}</span>}
                                                </div>
                                                {isExpanded && cEvents.length > 0 && (
                                                    <div className="mt-3 space-y-2">
                                                        <h5 className="text-xs font-bold text-slate-600 uppercase">אירועים ({cEvents.length})</h5>
                                                        {cEvents.map(ev => (
                                                            <Link key={ev.id} to="/events" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-purple-50 transition-colors border border-slate-100 group">
                                                                <div className="flex-1">
                                                                    <div className="font-bold text-sm text-slate-800">{ev.title}</div>
                                                                    <div className="text-xs text-slate-500">{new Date(ev.date).toLocaleDateString('he-IL')} • ₪{ev.amount.toLocaleString()}</div>
                                                                </div>
                                                                <ExternalLink size={16} className="text-purple-500 group-hover:text-purple-700" />
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setEditingCustomer(c)} className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" title="ערוך לקוח"><Edit size={18}/></button>
                                                <button onClick={() => window.open(`mailto:${c.email}`, '_blank')} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="שלח מייל"><Mail size={18}/></button>
                                                <button onClick={() => handleSendPortal(c)} disabled={sendingPortalId === c.id} className="p-2.5 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors" title="שלח פורטל במייל">{sendingPortalId === c.id ? <Loader2 size={18} className="animate-spin"/> : <Send size={18}/>}</button>
                                                <button onClick={() => handleWhatsApp(c.phone)} className="p-2.5 text-green-600 hover:bg-green-50 rounded-xl transition-colors" title="וואטסאפ"><MessageCircle size={18}/></button>
                                                <button onClick={() => { setCreateEventFor(c); setNewEventForm({ title: `אירוע – ${c.name}`, date: new Date().toISOString().split('T')[0], startTime: '10:00', endTime: '12:00', amount: 0, location: '', notes: '' }); }} className="p-2.5 text-orange-600 hover:bg-orange-50 rounded-xl transition-colors" title="צור אירוע"><Calendar size={18}/></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>

        {isAddingNew && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                  <div className="flex justify-between items-center"><h3 className="text-xl font-bold">לקוח חדש</h3><button onClick={() => setIsAddingNew(false)}><X size={24}/></button></div>
                  <div className="space-y-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">שם מלא</label><input className="w-full p-2 border rounded-lg" value={newCust.name} onChange={e => setNewCust({...newCust, name: e.target.value})}/></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">טלפון</label><input className="w-full p-2 border rounded-lg" value={newCust.phone} onChange={e => setNewCust({...newCust, phone: e.target.value})}/></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">אימייל</label><input className="w-full p-2 border rounded-lg" value={newCust.email} onChange={e => setNewCust({...newCust, email: e.target.value})}/></div>
                  </div>
                  <div className="flex justify-end gap-3"><button onClick={handleAddCust} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold">שמור</button></div>
              </div>
          </div>
        )}

        {editingCustomer && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                  <div className="flex justify-between items-center"><h3 className="text-xl font-bold">עריכת לקוח</h3><button onClick={() => setEditingCustomer(null)}><X size={24}/></button></div>
                  <div className="space-y-4">
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">שם מלא</label><input className="w-full p-2 border rounded-lg" value={editingCustomer.name} onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}/></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">טלפון</label><input className="w-full p-2 border rounded-lg" value={editingCustomer.phone} onChange={e => setEditingCustomer({...editingCustomer, phone: e.target.value})}/></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">אימייל</label><input className="w-full p-2 border rounded-lg" value={editingCustomer.email} onChange={e => setEditingCustomer({...editingCustomer, email: e.target.value})}/></div>
                      <div className="space-y-1"><label className="text-xs font-bold text-slate-400">הערות</label><textarea className="w-full p-2 border rounded-lg" value={editingCustomer.notes || ''} onChange={e => setEditingCustomer({...editingCustomer, notes: e.target.value})}/></div>
                  </div>
                  <div className="flex justify-end gap-3"><button onClick={() => setEditingCustomer(null)} className="px-4 py-2 font-bold text-slate-400">ביטול</button><button onClick={handleUpdateCust} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold">שמור</button></div>
              </div>
          </div>
        )}

        {createEventFor && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">צור אירוע – {createEventFor.name}</h3>
                <button onClick={() => { setCreateEventFor(null); }}><X size={24}/></button>
              </div>
              <div className="space-y-4">
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400">שם האירוע</label><input className="w-full p-2 border rounded-lg" value={newEventForm.title} onChange={e => setNewEventForm({...newEventForm, title: e.target.value})} placeholder={createEventFor.name}/></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400">תאריך</label><input type="date" className="w-full p-2 border rounded-lg" value={newEventForm.date} onChange={e => setNewEventForm({...newEventForm, date: e.target.value})}/></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400">סכום (₪)</label><input type="number" className="w-full p-2 border rounded-lg" value={newEventForm.amount || ''} onChange={e => setNewEventForm({...newEventForm, amount: Number(e.target.value) || 0})}/></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400">התחלה</label><input type="time" className="w-full p-2 border rounded-lg" value={newEventForm.startTime} onChange={e => setNewEventForm({...newEventForm, startTime: e.target.value})}/></div>
                  <div className="space-y-1"><label className="text-xs font-bold text-slate-400">סיום</label><input type="time" className="w-full p-2 border rounded-lg" value={newEventForm.endTime} onChange={e => setNewEventForm({...newEventForm, endTime: e.target.value})}/></div>
                </div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400">מיקום</label><input className="w-full p-2 border rounded-lg" value={newEventForm.location} onChange={e => setNewEventForm({...newEventForm, location: e.target.value})}/></div>
                <div className="space-y-1"><label className="text-xs font-bold text-slate-400">הערות</label><textarea className="w-full p-2 border rounded-lg" value={newEventForm.notes} onChange={e => setNewEventForm({...newEventForm, notes: e.target.value})}/></div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setCreateEventFor(null)} className="px-4 py-2 font-bold text-slate-400">ביטול</button>
                <button onClick={handleCreateEventSubmit} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold">שמור אירוע</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default CustomersBoard;
