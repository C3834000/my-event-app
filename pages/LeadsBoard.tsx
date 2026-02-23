
import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { LeadStatus, Lead } from '../types';
import { UserPlus, X, Phone, MessageCircle, Edit, Mail, CheckCircle, Loader2, ExternalLink, Upload } from 'lucide-react';

const LeadsBoard: React.FC = () => {
  const { leads, addLead, convertLeadToCustomer, updateLead, sendPortalEmail, importLeads } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const WHATSAPP_NUMBER = '0529934000';

  const handleViewPortal = (leadId: string) => {
    const base = `${window.location.origin}${window.location.pathname || '/'}`.replace(/\/$/, '');
    window.open(`${base}#/portal/${leadId}`, '_blank');
  };

  const parseCsvRow = (line: string, sep: string): string[] => {
    const out: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' || ch === "'") {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        out.push(cell.trim().replace(/^["']|["']$/g, ''));
        cell = '';
      } else {
        cell += ch;
      }
    }
    out.push(cell.trim().replace(/^["']|["']$/g, ''));
    return out;
  };

  const parseCsv = (text: string): Lead[] => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].includes('"') ? parseCsvRow(lines[0], sep) : lines[0].split(sep).map(h => h.trim());
    const nameIdx = header.findIndex((x: string) => /^(name|שם)$/.test(String(x).replace(/["']/g, '').trim()));
    const phoneIdx = header.findIndex((x: string) => /^(phone|טלפון|telephone|tel)$/.test(String(x).replace(/["']/g, '').trim().toLowerCase()));
    const emailIdx = header.findIndex((x: string) => /^(email|אימייל|mail)$/.test(String(x).replace(/["']/g, '').trim().toLowerCase()));
    const sourceIdx = header.findIndex((x: string) => /^(source|מקור)$/.test(String(x).replace(/["']/g, '').trim().toLowerCase()));
    const notesIdx = header.findIndex((x: string) => /^(notes|הערות)$/.test(String(x).replace(/["']/g, '').trim().toLowerCase()));
    const hasHeader = nameIdx >= 0 || phoneIdx >= 0 || (header.length > 0 && header.some((x: string) => /^(name|שם|phone|טלפון|email|אימייל)$/.test(String(x).replace(/["']/g, '').trim().toLowerCase())));
    const rows = hasHeader ? lines.slice(1) : lines;
    return rows.map((row, i) => {
      const cells = row.includes('"') || row.includes("'") ? parseCsvRow(row, sep) : row.split(sep).map((c: string) => c.trim().replace(/^["']|["']$/g, ''));
      const name = (nameIdx >= 0 ? cells[nameIdx] : cells[0]) ?? '';
      const phone = (phoneIdx >= 0 ? cells[phoneIdx] : cells[1]) ?? '';
      const email = emailIdx >= 0 ? (cells[emailIdx] ?? '') : '';
      const source = sourceIdx >= 0 ? (cells[sourceIdx] ?? 'ייבוא') : 'ייבוא';
      const notes = notesIdx >= 0 ? (cells[notesIdx] ?? '') : '';
      return {
        id: `l_${Date.now()}_${i}`,
        name: String(name).trim(),
        phone: String(phone).trim(),
        email: String(email).trim() || undefined,
        source: String(source).trim() || 'ייבוא',
        notes: String(notes).trim() || undefined,
        status: LeadStatus.New,
      };
    }).filter(l => l.name || l.phone);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const imported = parseCsv(text);
      if (imported.length === 0) {
        alert('לא נמצאו שורות תקינות ב-CSV. נא לבדוק כותרות: name/שם, phone/טלפון, email/אימייל, source/מקור, notes/הערות');
        e.target.value = '';
        return;
      }
      importLeads(imported);
      setSuccessMsg(`יובאו ${imported.length} לידים בהצלחה`);
      setTimeout(() => setSuccessMsg(null), 4000);
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  const [newLead, setNewLead] = useState({
    name: '', phone: '', email: '', source: 'Facebook', notes: '', followUpDate: ''
  });

  const handleSendPortalEmail = async (leadId: string) => {
    setSendingId(leadId);
    try {
      await sendPortalEmail(leadId);
      setSuccessMsg('פורטל הלקוח נשלח בהצלחה למייל!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      alert('שגיאה בשליחת המייל');
    } finally {
      setSendingId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.name) return;
    addLead({
      id: `l_${Date.now()}`,
      status: LeadStatus.New,
      ...newLead
    });
    setIsModalOpen(false);
    setNewLead({ name: '', phone: '', email: '', source: 'Facebook', notes: '', followUpDate: '' });
  };

  const handleWhatsAppShare = (lead: Lead) => {
    const portalUrl = `${window.location.origin}/#/portal/${lead.id}`;
    const message = `היי ${lead.name}, הנה פורטל הלקוח האישי שלך: ${portalUrl}`;
    window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-6 relative pb-10 dir-rtl">
       {successMsg && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-green-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
             <CheckCircle size={24} />
             <span className="font-black text-lg">{successMsg}</span>
          </div>
       )}

       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
           <div>
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight">לידים ומתעניינים</h2>
              <p className="text-slate-500">מעקב אחר לקוחות פוטנציאליים</p>
           </div>
           <div className="flex flex-wrap gap-2">
             <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-slate-100 text-slate-700 border border-slate-300 px-6 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-sm hover:bg-slate-200">
               <Upload size={18} /> ייבוא CSV
             </button>
             <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
             <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg">
               <UserPlus size={18} /> ליד חדש
             </button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {[LeadStatus.New, LeadStatus.Contacted, LeadStatus.Qualified].map(status => {
             const leadsInStatus = leads.filter(l => l.status === status);
             return (
               <div key={status} className="bg-slate-50/50 rounded-2xl p-4 min-h-[500px] border border-slate-200">
                  <h3 className="font-bold text-slate-700 mb-5">{status} ({leadsInStatus.length})</h3>
                  <div className="space-y-4">
                    {leadsInStatus.map(lead => (
                        <div key={lead.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group">
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-slate-800">{lead.name}</h4>
                            <div className="flex gap-1">
                                <button onClick={() => setEditingLead(lead)} className="p-1.5 text-slate-400 hover:text-purple-600"><Edit size={16}/></button>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-500 space-y-1">
                            <div className="flex items-center gap-2"><Phone size={12}/>{lead.phone}</div>
                            {lead.email && <div className="flex items-center gap-2"><Mail size={12}/>{lead.email}</div>}
                          </div>
                          <div className="mt-4 flex flex-col gap-2">
                             <div className="flex gap-2">
                                <button type="button" onClick={() => handleViewPortal(lead.id)} className="flex-1 bg-indigo-50 text-indigo-600 py-2 rounded-lg text-[10px] font-black border border-indigo-100 flex items-center justify-center gap-1">
                                   <ExternalLink size={12}/> צפה בפורטל
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => handleSendPortalEmail(lead.id)} 
                                  disabled={sendingId === lead.id}
                                  className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-lg text-[10px] font-black border border-blue-100 flex items-center justify-center gap-1"
                                >
                                   {sendingId === lead.id ? <Loader2 size={12} className="animate-spin"/> : <Mail size={12}/>}
                                   שלח פורטל
                                </button>
                             </div>
                             <div className="flex gap-2">
                                <button type="button" onClick={() => handleWhatsAppShare(lead)} className="flex-1 bg-green-50 text-green-600 py-2 rounded-lg text-[10px] font-black border border-green-100 flex items-center justify-center gap-1">
                                   <MessageCircle size={12}/> וואטסאפ
                                </button>
                                <button type="button" onClick={() => convertLeadToCustomer(lead.id)} className="flex-1 bg-purple-50 text-purple-600 py-2 rounded-lg text-[10px] font-black border border-purple-100">
                                   המר ללקוח
                                </button>
                             </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
               </div>
             )
           })}
        </div>

        {/* Modal */}
        {(isModalOpen || editingLead) && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <form onSubmit={editingLead ? (e) => { e.preventDefault(); updateLead(editingLead.id, editingLead); setEditingLead(null); } : handleSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold">{editingLead ? 'עריכת ליד' : 'ליד חדש'}</h3>
                        <button type="button" onClick={() => { setIsModalOpen(false); setEditingLead(null); }}><X size={24}/></button>
                    </div>
                    <div className="space-y-4 text-right">
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400">שם מלא</label><input required className="w-full p-2 border rounded-xl font-bold" value={editingLead ? editingLead.name : newLead.name} onChange={e => editingLead ? setEditingLead({...editingLead, name: e.target.value}) : setNewLead({...newLead, name: e.target.value})}/></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400">טלפון</label><input className="w-full p-2 border rounded-xl font-bold" value={editingLead ? editingLead.phone : newLead.phone} onChange={e => editingLead ? setEditingLead({...editingLead, phone: e.target.value}) : setNewLead({...newLead, phone: e.target.value})}/></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400">אימייל</label><input className="w-full p-2 border rounded-xl font-bold" value={editingLead ? editingLead.email : newLead.email} onChange={e => editingLead ? setEditingLead({...editingLead, email: e.target.value}) : setNewLead({...newLead, email: e.target.value})}/></div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="submit" className="w-full bg-purple-600 text-white py-4 rounded-xl font-black text-lg shadow-xl">שמור שינויים</button>
                    </div>
                </form>
            </div>
        )}
    </div>
  );
};

export default LeadsBoard;
