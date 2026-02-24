
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Send, Sparkles, ShieldCheck, Heart, Mail, Check, AlertTriangle, X, FileText, Calendar, Clock, MapPin, CreditCard, User } from 'lucide-react';

const TERMS_TEXT = `אישור תנאי הזמנה
1. שעות פעילות המשרד: בין השעות 9:30-18:00 בשאר השעות ובסוף שבוע יינתן רק מענה דחוף. תמיכה, בירורים, שאלות ותיאומים נא לבצע בשעות הפעילות בלבד.

2. הגברה ומקרן הכלולים במחיר מתייחסים לארוע של עד כ 200 איש. כשמס' המשתתפים גבוה יותר מחיר ההגברה וההקרנה משתנה בהתאם. בהשכרת קליק פור יו לא כלול ציוד הגברה והקרנה.

3. הכנת החידון תתבצע באתר הייעודי של חברת קליכיף. מאתר זה גם תתבצע הורדת התוכנה. קישור להורדת החידון והפעלת התוכנה יישלח במייל עם ביצוע התשלום ושליחת אסמכתא. האחריות על תוכן השאלות וסימון התשובות היא על מכין החידון, כולל השאלות שנמצאות במאגר השאלות שלנו.

4. בעת הזמנת האירוע תקבלו קישור להורדת חוברת הוראות וסרטון הדרכה. בהשכרת ערכה, חובה על השוכר לבדוק ולוודא לפחות 12 שעות לפני האירוע שהכל עובד כראוי.

5. תשלום: בהשכרת ערכות קליק פור יו תתאפשר הורדת החידון רק עם ביצוע התשלום ושליחת אסמכתא. בקליכיף אירועים במוסדות חינוך התשלום יבוצע מיד עם סיום האירוע.

6. ניתן לשלם בכ.א. בתוספת של 1.5% מהסך הכללי לתשלום בתיאום מראש בלבד.

7. במקרה של ביטול ארוע מתחייב המזמין לשלם סך 50% משווי הארוע. ביטול תוך שבועיים מתאריך קיום האירוע יחייב את הלקוח בתשלום מלא.

8. עיכוב משמעותי מהשעה שסוכמה בהתחלת ארוע או סיום הארוע יחויב בתוספת תשלום – לפי 100 ₪ לכל חצי שעה.

9. על המזמין למנות אחראי שיספור את הקליקרים. על כל קליקר שיחסר ייגבה תשלום בסך 100 ₪.

10. אם מיקום האירוע הינו במקום שיש שם בעיות חניה נא ציינו זאת בטופס.

11. השוכר מתחייב להחזיר את הערכה למחרת האירוע עד השעה 11:00.

12. המחירים אינם כוללים מע"מ.

13. הלקוח אחראי לוודא את תוכן השאלות. וודאו שיש לכם גיבוי.`;

const BookingForm: React.FC = () => {
  const { handlePublicBookingSubmit, leads, customers, customForms } = useApp();
  const [searchParams] = useSearchParams();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const leadId = searchParams.get('leadId');
  const customerId = searchParams.get('customerId');
  const skipPortal = searchParams.get('skipPortal') === 'true';
  const formConfig = customForms[0]; 

  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (formConfig) {
      const initial: Record<string, any> = {};
      formConfig.fields.forEach(f => {
        initial[f.id] = '';
      });
      const lead = leadId ? leads.find(l => l.id === leadId) : null;
      const customer = customerId ? customers.find(c => c.id === customerId) : null;
      const source = lead || customer;
      if (source) {
        formConfig.fields.forEach(f => {
            if (f.mapping === 'name') initial[f.id] = source.name;
            if (f.mapping === 'phone') initial[f.id] = source.phone;
            if (f.mapping === 'email') initial[f.id] = source.email || '';
        });
      }
      setFormData(initial);
    }
  }, [formConfig, leads, customers, leadId, customerId]);

  const handleInputChange = (fieldId: string, mapping: string | undefined, value: any) => {
    setFormData(prev => {
        const next = { ...prev, [fieldId]: value };
        if (mapping === 'startTime' && value) {
            const [h, m] = value.split(':').map(Number);
            let totalMinutes = (h * 60) + m + 90;
            if (totalMinutes >= 24 * 60) totalMinutes = (23 * 60) + 59;
            const endH = Math.floor(totalMinutes / 60);
            const endM = totalMinutes % 60;
            const roundedM = Math.round(endM / 15) * 15;
            const finalM = roundedM === 60 ? 0 : roundedM;
            const finalH = roundedM === 60 ? endH + 1 : endH;
            const endTimeStr = `${String(Math.min(finalH, 23)).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
            const endField = formConfig.fields.find(f => f.mapping === 'endTime');
            if (endField) next[endField.id] = endTimeStr;
        }
        return next;
    });
  };

  const [submittedEventId, setSubmittedEventId] = React.useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
        setShowTerms(true);
        return;
    }
    setIsLoading(true);
    try {
      const payload: any = {};
      formConfig.fields.forEach(f => {
          if (f.mapping) payload[f.mapping] = formData[f.id];
      });
      const result = await handlePublicBookingSubmit(payload, leadId || undefined, customerId || undefined);
      setSubmittedEventId(result.eventId);
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      alert('שגיאה בשליחת הטופס. נסה שוב או פנה למשרד.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    const eventData = {
      id: submittedEventId,
      name: formData[formConfig.fields.find(f=>f.mapping==='name')?.id || ''] || '',
      email: formData[formConfig.fields.find(f=>f.mapping==='email')?.id || ''] || '',
      phone: formData[formConfig.fields.find(f=>f.mapping==='phone')?.id || ''] || '',
      date: formData[formConfig.fields.find(f=>f.mapping==='date')?.id || ''] || '',
      hebrewDate: formData[formConfig.fields.find(f=>f.mapping==='hebrewDate')?.id || ''] || '',
      startTime: formData[formConfig.fields.find(f=>f.mapping==='startTime')?.id || ''] || '',
      endTime: formData[formConfig.fields.find(f=>f.mapping==='endTime')?.id || ''] || '',
      location: formData[formConfig.fields.find(f=>f.mapping==='location')?.id || ''] || '',
      eventType: formData[formConfig.fields.find(f=>f.mapping==='eventType')?.id || ''] || '',
      clickersNeeded: formData[formConfig.fields.find(f=>f.mapping==='clickersNeeded')?.id || ''] || 0,
      amount: formData[formConfig.fields.find(f=>f.mapping==='amount')?.id || ''] || 0,
      notes: formData[formConfig.fields.find(f=>f.mapping==='notes')?.id || ''] || '',
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-12 px-4 dir-rtl font-sans">
        <div className="max-w-3xl mx-auto">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="w-32 h-32 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <CheckCircle2 size={72} className="text-white animate-in zoom-in duration-300" />
            </div>
            <h1 className="text-5xl font-black text-slate-900 mb-4">🎉 ההזמנה נקלטה בהצלחה!</h1>
            <p className="text-xl text-slate-600 font-bold">שלום {eventData.name}, תודה שבחרת בנו! 👋</p>
            <div className="bg-slate-100 border-2 border-slate-300 rounded-2xl px-6 py-3 inline-block mt-4">
              <span className="text-slate-500 text-sm font-bold">מספר הזמנה:</span>
              <span className="text-slate-900 text-lg font-black mr-2">#{submittedEventId.substring(2, 15)}</span>
            </div>
          </div>

          {/* Email Confirmation Notice */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-3xl p-6 mb-6 shadow-lg">
            <div className="flex items-start gap-4">
              <Mail className="text-green-600 mt-1 shrink-0" size={32} />
              <div className="text-right">
                <h3 className="text-lg font-black text-green-900 mb-2">✅ מייל אישור נשלח אליך!</h3>
                <p className="text-sm font-bold text-green-700">העתק מלא של פרטי ההזמנה נשלח למייל: <span className="underline">{eventData.email}</span></p>
                <p className="text-xs text-green-600 mt-2">בדוק את תיבת הדואר שלך (וגם בספאם למקרה)</p>
              </div>
            </div>
          </div>

          {/* Event Details Card - Same as Email */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-slate-200 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-center">
              <h2 className="text-2xl font-black text-white">📋 פרטי האירוע שלך</h2>
            </div>
            
            <div className="p-8">
              <div className="bg-gradient-to-b from-blue-50 to-sky-50 border-2 border-blue-200 rounded-2xl p-6 shadow-inner">
                <table className="w-full">
                  <tbody className="space-y-2">
                    <tr className="bg-white rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">👤 שם המזמין:</td>
                      <td className="p-4 text-slate-900 font-black text-lg border-b border-slate-200">{eventData.name}</td>
                    </tr>
                    <tr className="bg-slate-50 rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">📞 טלפון:</td>
                      <td className="p-4 text-slate-900 font-bold border-b border-slate-200">{eventData.phone}</td>
                    </tr>
                    <tr className="bg-white rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">📧 אימייל:</td>
                      <td className="p-4 text-slate-900 font-bold border-b border-slate-200">{eventData.email}</td>
                    </tr>
                    <tr className="bg-slate-50 rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">📅 תאריך:</td>
                      <td className="p-4 text-slate-900 font-black text-lg border-b border-slate-200">
                        {new Date(eventData.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </td>
                    </tr>
                    {eventData.hebrewDate && (
                      <tr className="bg-white rounded-xl">
                        <td className="p-4 text-slate-600 font-bold border-b border-slate-200">🗓️ תאריך עברי:</td>
                        <td className="p-4 text-slate-900 font-black border-b border-slate-200">{eventData.hebrewDate}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">⏰ שעת התחלה:</td>
                      <td className="p-4 text-slate-900 font-black text-lg border-b border-slate-200">{eventData.startTime}</td>
                    </tr>
                    <tr className="bg-white rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">⏰ שעת סיום:</td>
                      <td className="p-4 text-slate-900 font-black text-lg border-b border-slate-200">{eventData.endTime}</td>
                    </tr>
                    <tr className="bg-slate-50 rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">📍 מיקום האירוע:</td>
                      <td className="p-4 text-slate-900 font-bold border-b border-slate-200">{eventData.location || 'לא צוין'}</td>
                    </tr>
                    <tr className="bg-white rounded-xl">
                      <td className="p-4 text-slate-600 font-bold border-b border-slate-200">🎯 סוג האירוע:</td>
                      <td className="p-4 text-slate-900 font-bold border-b border-slate-200">{eventData.eventType}</td>
                    </tr>
                    {Number(eventData.clickersNeeded) > 0 && (
                      <tr className="bg-slate-50 rounded-xl">
                        <td className="p-4 text-slate-600 font-bold border-b border-slate-200">🖱️ מספר קליקרים:</td>
                        <td className="p-4 text-purple-600 font-black text-xl border-b border-slate-200">{eventData.clickersNeeded} קליקרים</td>
                      </tr>
                    )}
                    <tr className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
                      <td className="p-5 text-green-700 font-black text-lg">💰 סכום לתשלום:</td>
                      <td className="p-5 text-green-700 font-black text-3xl">₪{Number(eventData.amount).toLocaleString()}</td>
                    </tr>
                    {eventData.notes && (
                      <tr className="bg-amber-50 rounded-xl">
                        <td colSpan={2} className="p-4 text-amber-900 font-bold">
                          <span className="font-black">📝 הערות:</span><br/>
                          <span className="font-semibold">{eventData.notes}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Next Step Button */}
          {!skipPortal && (
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl shadow-2xl p-8 text-center mb-6">
              <h3 className="text-2xl font-black text-white mb-4">🚀 מוכנים להמשיך?</h3>
              <p className="text-purple-100 font-bold text-lg mb-6">עכשיו הזמן להתחיל להכין את החידון שלך!</p>
              <button
                onClick={() => {
                  const portalId = leadId || customerId || submittedEventId;
                  if (portalId) {
                    window.location.href = `/portal/${portalId}?step=1`;
                  }
                }}
                className="bg-white text-purple-600 px-10 py-5 rounded-2xl font-black text-xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300"
              >
                המשך לשלב הבא - הכנת החידון שלך ✨
              </button>
            </div>
          )}

          {skipPortal && (
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-3xl shadow-2xl p-8 text-center mb-6">
              <h3 className="text-2xl font-black text-white mb-4">✅ האירוע נשמר בהצלחה!</h3>
              <p className="text-white/90 font-bold text-lg mb-6">פרטי האירוע נשלחו למייל הלקוח</p>
              <button
                onClick={() => { window.location.href = '/#/customers'; }}
                className="bg-white text-green-600 px-10 py-5 rounded-2xl font-black text-xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300"
              >
                חזור ללוח לקוחות 📋
              </button>
            </div>
          )}

          {/* Important Notice */}
          <div className="bg-amber-50 border-r-4 border-amber-400 rounded-2xl p-6 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="text-3xl">💡</div>
              <div className="text-right">
                <h4 className="font-black text-amber-900 text-lg mb-2">שימו לב:</h4>
                <p className="text-amber-800 font-bold">ההזמנה שלכם שמורה במערכת שלנו. נציג יצור איתכם קשר בהקדם לאישור סופי ותיאום פרטים נוספים.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 dir-rtl font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 space-y-4">
            <h1 className="text-5xl font-black text-slate-900 tracking-tight">{formConfig?.title}</h1>
            <p className="text-slate-500 text-lg max-w-lg mx-auto font-medium">השלב הראשון והכי חשוב כדי לשריין את האירוע המבוקש!</p>
        </div>

        <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-100">
           <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {formConfig?.fields.map(field => (
                    <div key={field.id} className={`space-y-2 ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>
                        <label className="text-sm font-black text-slate-700 block flex items-center gap-2">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {field.type === 'select' ? (
                            <select required={field.required} value={formData[field.id] || ''} onChange={e => handleInputChange(field.id, field.mapping, e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-purple-500 transition-all font-bold">
                                <option value="">בחר...</option>
                                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        ) : field.type === 'textarea' ? (
                            <div className="space-y-1">
                                <textarea required={field.required} placeholder={field.placeholder} value={formData[field.id] || ''} onChange={e => handleInputChange(field.id, field.mapping, e.target.value)} rows={4} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-purple-500 transition-all font-bold resize-none"/>
                                <p className="text-[10px] text-slate-400 font-bold">כאן המקום לציין אם מיקום האירוע הוא במקום עם קשיי חניה או חניה מרוחקת.</p>
                            </div>
                        ) : field.type === 'time' ? (
                            <>
                                <input 
                                    type="time" 
                                    required={field.required} 
                                    step="900"
                                    min="00:00"
                                    max="23:45"
                                    placeholder={field.placeholder}
                                    value={formData[field.id] || ''} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (!val) return handleInputChange(field.id, field.mapping, val);
                                        const [h, m] = val.split(':').map(Number);
                                        if (m % 15 !== 0) {
                                            alert('⏰ נא לבחור שעה ברבעי שעה בלבד (00, 15, 30, 45)');
                                            return;
                                        }
                                        handleInputChange(field.id, field.mapping, val);
                                    }} 
                                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-purple-500 transition-all font-bold"
                                    list={`${field.id}-times`}
                                />
                                <datalist id={`${field.id}-times`}>
                                    {Array.from({ length: 96 }, (_, i) => {
                                        const h = Math.floor(i / 4);
                                        const m = (i % 4) * 15;
                                        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                    }).map(time => <option key={time} value={time} />)}
                                </datalist>
                            </>
                        ) : (
                            <input 
                                type={field.type} 
                                required={field.required} 
                                placeholder={field.placeholder}
                                value={formData[field.id] || ''} 
                                onChange={e => handleInputChange(field.id, field.mapping, e.target.value)} 
                                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-purple-500 transition-all font-bold"
                            />
                        )}
                    </div>
                ))}
              </div>

              {/* Terms Checkbox UI */}
              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200 space-y-6">
                  <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><ShieldCheck size={20} className="text-purple-600"/> אישור תנאי ההזמנה</h3>
                      <button 
                        type="button" 
                        onClick={() => setShowTerms(true)}
                        className="text-purple-600 font-black hover:underline flex items-center gap-1"
                      >
                         <FileText size={18}/> קרא תנאים מלאים
                      </button>
                  </div>
                  <div className="flex items-center gap-4">
                      <input 
                        type="checkbox" 
                        id="terms"
                        required 
                        checked={termsAccepted} 
                        onChange={e => setTermsAccepted(e.target.checked)}
                        className="w-6 h-6 accent-purple-600 rounded-lg cursor-pointer"
                      />
                      <label htmlFor="terms" className="text-sm font-bold text-slate-600 cursor-pointer italic">קראתי את התנאים ואני מאשר אותם</label>
                  </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading} 
                className={`w-full py-6 rounded-[2.5rem] font-black text-2xl shadow-2xl transition-all flex items-center justify-center gap-3 ${termsAccepted ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-200 text-slate-400'}`}
              >
                {isLoading ? <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div> : <> <Send size={28}/> שלח טופס הזמנה ושריין תאריך </>}
              </button>
           </form>
        </div>
      </div>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="my-auto bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                <div className="bg-slate-900 p-8 text-white flex justify-between items-center shrink-0">
                    <h3 className="text-2xl font-black">תנאי הזמנה ושימוש - קליכיף</h3>
                    <button onClick={() => setShowTerms(false)} className="hover:rotate-90 transition-transform"><X size={28} /></button>
                </div>
                <div className="p-8 md:p-12 overflow-y-auto bg-slate-50 text-slate-700 whitespace-pre-line font-medium leading-relaxed text-right scroll-smooth">
                    {TERMS_TEXT}
                </div>
                <div className="p-8 bg-white border-t flex flex-col items-center gap-4 shrink-0">
                    <button 
                        onClick={() => { setTermsAccepted(true); setShowTerms(false); }}
                        className="bg-green-600 text-white px-12 py-5 rounded-2xl font-black text-2xl shadow-xl hover:bg-green-700 transition-all w-full flex items-center justify-center gap-3"
                    >
                        <Check size={28} /> קראתי והבנתי, אני מאשר/ת
                    </button>
                    <button onClick={() => setShowTerms(false)} className="text-slate-400 font-bold hover:underline">סגור ללא אישור</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default BookingForm;
