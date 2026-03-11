
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Phone, Mail, Search, ChevronDown, ChevronUp, MessageCircle, Send, Plus, Upload, X, Calendar, Loader2, Edit, ExternalLink, DollarSign, ListTodo } from 'lucide-react';
import { Customer } from '../types';
import { parseCSV } from '../services/utils';
import { EventStatus, PaymentStatus, EventType } from '../types';
import { Link } from 'react-router-dom';

const CustomersBoard: React.FC = () => {
  const { customers, events, tasks, addCustomer, importCustomers, addEvent, sendPortalEmailForCustomer, updateCustomer, addTask } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showDebtOnly, setShowDebtOnly] = useState(false);
  const [expandedLetters, setExpandedLetters] = useState<Record<string, boolean>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [sendingPortalId, setSendingPortalId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [creatingTaskFor, setCreatingTaskFor] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '', notes: '' });
  const [newTask, setNewTask] = useState({ title: '', category: 'כללי' as any, priority: 3 });

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const regex = new RegExp(`(${search.trim()})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-200 font-black">{part}</mark> : part
    );
  };

  const filtered = customers.filter(c => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term || (
      c.name.toLowerCase().includes(term) || 
      c.phone.includes(term) || 
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.companyName && c.companyName.toLowerCase().includes(term))
    );
    
    if (!matchesSearch) return false;
    
    if (showDebtOnly) {
      const cEvents = events.filter(ev => ev.customerId === c.id || ev.phone === c.phone || (ev.email && ev.email === c.email));
      const totalDebt = cEvents.reduce((sum, ev) => sum + (ev.amount - (ev.paidAmount || 0)), 0);
      return totalDebt > 0;
    }
    
    return true;
  });

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

  React.useEffect(() => {
    if (searchTerm.trim()) {
      const next: Record<string, boolean> = {};
      Object.keys(grouped).forEach(l => next[l] = true);
      setExpandedLetters(next);
    }
  }, [searchTerm, grouped]);

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
      console.error('❌ שגיאה בשליחת פורטל:', e);
      alert('שגיאה בשליחת המייל או שלא הוגדר אימייל ללקוח.');
    } finally {
      setSendingPortalId(null);
    }
  };

  const handleCreateTask = () => {
    if (!creatingTaskFor || !newTask.title.trim()) return;
    const taskId = `t_${Date.now()}`;
    addTask({
      id: taskId,
      title: newTask.title,
      category: newTask.category,
      priority: newTask.priority,
      isCompleted: false,
      progress: 0,
      estimatedTimeMin: 30,
    });
    const updatedTaskIds = [...(creatingTaskFor.taskIds || []), taskId];
    updateCustomer(creatingTaskFor.id, { taskIds: updatedTaskIds });
    setNewTask({ title: '', category: 'כללי', priority: 3 });
    setCreatingTaskFor(null);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
           <div><h2 className="text-3xl font-bold text-slate-800">לקוחות (B)</h2><p className="text-slate-500">מאגר CRM וניהול תקשורת</p></div>
           <div className="flex flex-wrap gap-2">
                <button onClick={() => setIsAddingNew(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg flex items-center gap-2"><Plus size={18}/> הוסף לקוח</button>
                <input type="file" ref={fileInputRef} onChange={async (e) => { const file = e.target.files?.[0]; if(file) { importCustomers(await parseCSV(file)); alert('ייבוא לקוחות הושלם!'); } }} className="hidden" accept=".csv" />
                <button onClick={() => fileInputRef.current?.click()} className="bg-white border px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm"><Upload size={18} /> ייבוא</button>
                <button 
                  onClick={() => setShowDebtOnly(!showDebtOnly)} 
                  className={`px-4 py-2 rounded-xl font-bold transition-all ${showDebtOnly ? 'bg-red-500 text-white shadow-lg' : 'bg-white border text-slate-700'}`}
                >
                  {showDebtOnly ? '✓ חובות בלבד' : 'הצג חובות'}
                </button>
                <button onClick={() => toggleAll(true)} className="text-xs font-bold text-purple-600 hover:underline">פתח הכל</button>
                <button onClick={() => toggleAll(false)} className="text-xs font-bold text-slate-400 hover:underline">כווץ הכל</button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" placeholder="חפש לפי שם, טלפון או מייל..." 
                    className="w-full pr-10 pl-20 py-3 bg-white border rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-purple-100"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm.trim() && (
                  <>
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-black">
                      {filtered.length} תוצאות
                    </div>
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                      title="נקה חיפוש"
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
            </div>
            <button 
                onClick={() => { setIsSyncing(true); setTimeout(() => setIsSyncing(false), 2000); }}
                className="bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-green-700 transition-all"
            >
                {isSyncing ? <span className="animate-spin text-lg">↻</span> : <MessageCircle size={18} />}
                {isSyncing ? 'מסנכרן...' : 'סנכרן וואטסאפ'}
            </button>
        </div>

        {searchTerm.trim() && filtered.length === 0 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-8 text-center">
            <p className="text-xl font-bold text-yellow-800">לא נמצאו לקוחות התואמים לחיפוש "{searchTerm}"</p>
            <button onClick={() => setSearchTerm('')} className="mt-4 bg-yellow-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-yellow-700">נקה חיפוש</button>
          </div>
        )}

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
                                const cEvents = events.filter(ev => ev.customerId === c.id);
                                const totalPaid = cEvents.reduce((sum, ev) => sum + (ev.paidAmount || 0), 0);
                                const totalDebt = cEvents.reduce((sum, ev) => sum + (ev.amount - (ev.paidAmount || 0)), 0);
                                const isExpanded = expandedCustomer === c.id;
                                const isSearchMatch = searchTerm.trim().length > 0;
                                return (
                                    <div key={c.id} className={`p-5 transition-all ${isSearchMatch ? 'bg-purple-50/50 border-r-4 border-purple-500' : 'hover:bg-slate-50/50'}`}>
                                        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                            <div className="flex-1 space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <h4 className="text-lg font-bold text-slate-800">{highlightText(c.name, searchTerm)}</h4>
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
                                                {isExpanded && (
                                                    <div className="mt-3 space-y-4">
                                                        {/* Events */}
                                                        {cEvents.length > 0 && (
                                                            <div className="space-y-2">
                                                                <h5 className="text-xs font-bold text-slate-600 uppercase">📅 אירועים ({cEvents.length})</h5>
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

                                                        {/* Tasks */}
                                                        {(() => {
                                                            const customerTasks = (c.taskIds || []).map(tid => tasks.find(t => t.id === tid)).filter(Boolean) as any[];
                                                            return (
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <h5 className="text-xs font-bold text-slate-600 uppercase">✅ משימות ({customerTasks.length})</h5>
                                                                        <button
                                                                            onClick={() => setCreatingTaskFor(c)}
                                                                            className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                                                                        >
                                                                            <Plus size={14} />
                                                                            צור משימה חדשה
                                                                        </button>
                                                                    </div>
                                                                    {customerTasks.map((task: any) => (
                                                                        <div key={task.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-200">
                                                                            <div className="flex-1">
                                                                                <div className="font-bold text-sm text-slate-800">{task.title}</div>
                                                                                <div className="text-xs text-slate-500">{task.category}</div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                {task.isCompleted ? (
                                                                                    <span className="text-xs font-bold bg-green-500 text-white px-2 py-1 rounded">✓ הושלמה</span>
                                                                                ) : task.progress > 0 ? (
                                                                                    <span className="text-xs font-bold bg-blue-500 text-white px-2 py-1 rounded">⏳ {task.progress}%</span>
                                                                                ) : (
                                                                                    <span className="text-xs font-bold bg-slate-300 text-slate-700 px-2 py-1 rounded">⏸️ ממתינה</span>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const updatedTaskIds = (c.taskIds || []).filter(tid => tid !== task.id);
                                                                                        updateCustomer(c.id, { taskIds: updatedTaskIds });
                                                                                    }}
                                                                                    className="text-red-500 hover:bg-red-50 p-1 rounded transition-all"
                                                                                    title="נתק משימה"
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setEditingCustomer(c)} className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" title="ערוך לקוח"><Edit size={18}/></button>
                                                <button onClick={() => window.open(`mailto:${c.email}`, '_blank')} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="שלח מייל"><Mail size={18}/></button>
                                                <button onClick={() => handleSendPortal(c)} disabled={sendingPortalId === c.id} className="p-2.5 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors" title="שלח פורטל במייל">{sendingPortalId === c.id ? <Loader2 size={18} className="animate-spin"/> : <Send size={18}/>}</button>
                                                <button onClick={() => handleWhatsApp(c.phone)} className="p-2.5 text-green-600 hover:bg-green-50 rounded-xl transition-colors" title="וואטסאפ"><MessageCircle size={18}/></button>
                                                <Link to={`/book?customerId=${c.id}&skipPortal=true`} className="p-2.5 text-orange-600 hover:bg-orange-50 rounded-xl transition-colors flex items-center justify-center" title="צור אירוע"><Calendar size={18}/></Link>
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

        {creatingTaskFor && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">משימה חדשה – {creatingTaskFor.name}</h3>
                    <button onClick={() => { setCreatingTaskFor(null); setNewTask({ title: '', category: 'כללי', priority: 3 }); }}><X size={24}/></button>
                  </div>
                  <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400">שם המשימה</label>
                        <input className="w-full p-3 border rounded-lg font-bold" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="הקלד שם משימה..."/>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400">קטגוריה</label>
                        <select className="w-full p-3 border rounded-lg font-bold" value={newTask.category} onChange={e => setNewTask({...newTask, category: e.target.value as any})}>
                          <option value="קליכיף">קליכיף</option>
                          <option value="אישי">אישי</option>
                          <option value="בית">בית</option>
                          <option value="תוכנית מדע">תוכנית מדע</option>
                          <option value="שיווק">שיווק</option>
                          <option value="כללי">כללי</option>
                          <option value="דחוף / לסיווג">דחוף / לסיווג</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400">עדיפות (1=נמוך, 5=גבוה)</label>
                        <input type="number" min="1" max="5" className="w-full p-3 border rounded-lg font-bold" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: Number(e.target.value)})}/>
                      </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => { setCreatingTaskFor(null); setNewTask({ title: '', category: 'כללי', priority: 3 }); }} className="px-4 py-2 font-bold text-slate-400">ביטול</button>
                    <button onClick={handleCreateTask} className="bg-purple-600 text-white px-8 py-2 rounded-xl font-bold">צור משימה</button>
                  </div>
              </div>
          </div>
        )}
    </div>
  );
};

export default CustomersBoard;
