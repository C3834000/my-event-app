
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CustomForm, FormField, FormFieldType } from '../types';
import { Plus, Trash2, Settings2, Eye, Copy, CheckCircle2, Layout, Sparkles, GripVertical, Type, Hash, Calendar, Clock, Mail, Phone, ChevronRight, X, Save, AlertCircle } from 'lucide-react';

const FormsManagement: React.FC = () => {
  const { customForms, addCustomForm, updateCustomForm, deleteCustomForm } = useApp();
  const [selectedFormId, setSelectedFormId] = useState<string | null>(customForms[0]?.id || null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedForm = customForms.find(f => f.id === selectedFormId);
  const currentUrl = new URL(window.location.href);
  const getBookingLink = (id: string) => `${currentUrl.origin}${currentUrl.pathname}#/book?formId=${id}`;

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(getBookingLink(id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateNewForm = () => {
    const newId = `form_${Date.now()}`;
    const newForm: CustomForm = {
      id: newId,
      title: 'טופס חדש ללא שם',
      description: 'תאר בקצרה מה מטרת הטופס...',
      isActive: true,
      autoConfirm: false,
      themeColor: '#4f46e5',
      fields: [
        { id: `f_${Date.now()}_1`, type: 'text', label: 'שם מלא', required: true, mapping: 'name' }
      ]
    };
    addCustomForm(newForm);
    setSelectedFormId(newId);
    setIsCreating(false);
  };

  const addField = (formId: string) => {
    if (!selectedForm) return;
    const newFields: FormField[] = [
      ...selectedForm.fields,
      { id: `f_${Date.now()}`, type: 'text', label: 'שדה חדש', required: false }
    ];
    updateCustomForm(formId, { fields: newFields });
  };

  const removeField = (formId: string, fieldId: string) => {
    if (!selectedForm) return;
    updateCustomForm(formId, {
      fields: selectedForm.fields.filter(f => f.id !== fieldId)
    });
  };

  const updateField = (formId: string, fieldId: string, updates: Partial<FormField>) => {
    if (!selectedForm) return;
    updateCustomForm(formId, {
      fields: selectedForm.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
    });
  };

  const getFieldIcon = (type: FormFieldType) => {
    switch(type) {
      case 'text': return <Type size={16} />;
      case 'number': return <Hash size={16} />;
      case 'date': return <Calendar size={16} />;
      case 'time': return <Clock size={16} />;
      case 'email': return <Mail size={16} />;
      case 'tel': return <Phone size={16} />;
      default: return <Type size={16} />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">ניהול טפסים</h2>
          <p className="text-slate-500 font-medium">בנייה והפצה של טפסי הרשמה והזמנה חכמים</p>
        </div>
        <button 
          onClick={handleCreateNewForm}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl font-bold"
        >
          <Plus size={20} />
          צור טופס חדש
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar: Forms List */}
        <div className="w-full lg:w-80 space-y-4">
           <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">הטפסים שלך</h3>
           <div className="space-y-2">
              {customForms.map(form => (
                 <button
                   key={form.id}
                   onClick={() => setSelectedFormId(form.id)}
                   className={`w-full text-right p-4 rounded-2xl border transition-all flex flex-col gap-1 relative overflow-hidden group ${
                     selectedFormId === form.id 
                     ? 'bg-white border-purple-500 shadow-lg shadow-purple-50 ring-1 ring-purple-500' 
                     : 'bg-white border-slate-200 hover:border-purple-300'
                   }`}
                 >
                    <span className={`font-bold ${selectedFormId === form.id ? 'text-purple-700' : 'text-slate-800'}`}>{form.title}</span>
                    <span className="text-[10px] text-slate-400 truncate">{form.description}</span>
                    <div className="flex items-center gap-2 mt-2">
                       <span className={`w-1.5 h-1.5 rounded-full ${form.isActive ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{form.fields.length} שדות</span>
                    </div>
                    {selectedFormId === form.id && (
                       <div className="absolute top-0 right-0 w-1.5 h-full bg-purple-500"></div>
                    )}
                 </button>
              ))}
           </div>
        </div>

        {/* Main Workspace: Builder */}
        {selectedForm ? (
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-8">
             
             {/* Builder Column */}
             <div className="xl:col-span-7 space-y-6">
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-8">
                   <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-start">
                         <div className="flex-1">
                            <input 
                              value={selectedForm.title}
                              onChange={(e) => updateCustomForm(selectedForm.id, { title: e.target.value })}
                              className="text-2xl font-black text-slate-800 w-full bg-transparent border-b-2 border-transparent focus:border-purple-200 outline-none pb-1"
                              placeholder="שם הטופס..."
                            />
                            <textarea 
                              value={selectedForm.description}
                              onChange={(e) => updateCustomForm(selectedForm.id, { description: e.target.value })}
                              className="text-sm text-slate-500 w-full bg-transparent border-none outline-none resize-none mt-2"
                              placeholder="תיאור קצר של הטופס..."
                              rows={2}
                            />
                         </div>
                         <div className="flex gap-2">
                            <button 
                              onClick={() => deleteCustomForm(selectedForm.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                               <Trash2 size={20} />
                            </button>
                         </div>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">מבנה הטופס</h4>
                        <button 
                          onClick={() => addField(selectedForm.id)}
                          className="text-xs font-bold text-purple-600 flex items-center gap-1 hover:underline"
                        >
                          <Plus size={14} /> הוסף שדה
                        </button>
                      </div>

                      <div className="space-y-3">
                         {selectedForm.fields.map((field, index) => (
                            <div key={field.id} className="group bg-slate-50 rounded-2xl border border-slate-100 p-4 transition-all hover:bg-white hover:border-purple-200 hover:shadow-md">
                               <div className="flex items-center gap-4">
                                  <div className="text-slate-300 cursor-move">
                                     <GripVertical size={20} />
                                  </div>
                                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <input 
                                       value={field.label}
                                       onChange={(e) => updateField(selectedForm.id, field.id, { label: e.target.value })}
                                       placeholder="תווית השדה"
                                       className="font-bold text-slate-800 bg-transparent outline-none focus:text-purple-600"
                                     />
                                     <div className="flex items-center gap-2">
                                        <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2 flex-1">
                                           {getFieldIcon(field.type)}
                                           <select 
                                             value={field.type}
                                             onChange={(e) => updateField(selectedForm.id, field.id, { type: e.target.value as FormFieldType })}
                                             className="bg-transparent text-xs font-bold text-slate-600 outline-none w-full appearance-none cursor-pointer"
                                           >
                                              <option value="text">טקסט</option>
                                              <option value="number">מספר</option>
                                              <option value="date">תאריך</option>
                                              <option value="time">שעה</option>
                                              <option value="email">אימייל</option>
                                              <option value="tel">טלפון</option>
                                           </select>
                                        </div>
                                        <button 
                                           onClick={() => updateField(selectedForm.id, field.id, { required: !field.required })}
                                           className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all ${field.required ? 'bg-red-50 text-red-600 border-red-100' : 'bg-white text-slate-400 border-slate-200'}`}
                                        >
                                           חובה
                                        </button>
                                     </div>
                                  </div>
                                  <button 
                                    onClick={() => removeField(selectedForm.id, field.id)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                     <Trash2 size={16} />
                                  </button>
                               </div>
                               
                               <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 border-t border-slate-100 pt-3">
                                  <span>מיפוי נתונים:</span>
                                  <select 
                                    value={field.mapping || ''}
                                    onChange={(e) => updateField(selectedForm.id, field.id, { mapping: e.target.value })}
                                    className="bg-transparent outline-none text-purple-600 hover:underline"
                                  >
                                     <option value="">בחר שדה במערכת (אופציונלי)...</option>
                                     <option value="name">שם לקוח</option>
                                     <option value="phone">טלפון לקוח</option>
                                     <option value="email">אימייל לקוח</option>
                                     <option value="eventTitle">שם האירוע</option>
                                     <option value="date">תאריך</option>
                                     <option value="startTime">שעת התחלה</option>
                                     <option value="location">מיקום</option>
                                     <option value="clickersNeeded">כמות קליקרים</option>
                                  </select>
                               </div>
                            </div>
                         ))}
                      </div>

                      <button 
                        onClick={() => addField(selectedForm.id)}
                        className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition-all font-bold flex items-center justify-center gap-2"
                      >
                         <Plus size={20} />
                         הוסף שדה חדש לטופס
                      </button>
                   </div>
                </div>
             </div>

             {/* Preview & Actions Column */}
             <div className="xl:col-span-5 space-y-6">
                
                {/* Deployment Box */}
                <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden">
                   <div className="relative z-10">
                      <h4 className="text-xl font-black mb-6 flex items-center gap-2">
                        <Sparkles size={24} className="text-purple-400" />
                        פרסום והפצה
                      </h4>
                      <div className="space-y-6">
                         <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">קישור ציבורי ללקוח</label>
                            <div className="flex items-center gap-2">
                               <div className="flex-1 bg-white/10 px-4 py-3 rounded-xl text-xs font-mono truncate text-slate-300">
                                  {getBookingLink(selectedForm.id)}
                               </div>
                               <button 
                                 onClick={() => handleCopy(selectedForm.id)}
                                 className={`p-3 rounded-xl transition-all ${copied ? 'bg-green-500' : 'bg-white/10 hover:bg-white/20'}`}
                               >
                                  {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                               </button>
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                            <a 
                              href={getBookingLink(selectedForm.id)} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-900/50"
                            >
                               <Eye size={18} />
                               תצוגה חיה
                            </a>
                            <button className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 py-3 rounded-xl font-bold transition-all">
                               <Settings2 size={18} />
                               הגדרות
                            </button>
                         </div>
                      </div>
                   </div>
                   <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                </div>

                {/* Mini Preview Card */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
                   <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">תצוגה מקדימה מהירה</h4>
                   <div className="border border-slate-100 rounded-2xl p-6 bg-slate-50 space-y-4 max-h-[400px] overflow-y-auto">
                      <div className="text-center">
                         <h5 className="font-bold text-slate-800">{selectedForm.title}</h5>
                         <p className="text-[10px] text-slate-400 mt-1">{selectedForm.description}</p>
                      </div>
                      <div className="space-y-3">
                         {selectedForm.fields.map(field => (
                            <div key={field.id} className="space-y-1">
                               <label className="text-[10px] font-bold text-slate-700">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                               <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400">
                                  {field.placeholder || `הזן ${field.label}...`}
                               </div>
                            </div>
                         ))}
                      </div>
                      <button type="button" disabled className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-bold mt-4 opacity-50 cursor-not-allowed">שלח הזמנה</button>
                   </div>
                </div>
             </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-40 text-center">
             <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-6">
                <Layout size={40} />
             </div>
             <h3 className="text-xl font-bold text-slate-400">בחר טופס מהרשימה או צור אחד חדש</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormsManagement;
