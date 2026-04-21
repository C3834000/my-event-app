
import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Save, Bell, Globe, Shield, CreditCard, Mail, User, Building, Check, AlertCircle, Loader2, Calendar, MessageCircle, Upload, FileSpreadsheet, Database, Info, ShieldCheck, RefreshCw, MonitorPlay, FileText } from 'lucide-react';
import { pingGreenInvoice } from '../services/greenInvoice';

const Settings: React.FC = () => {
  const { settings, updateSettings, integrations, toggleIntegration, userEmail, syncAllEventsWithCustomers } = useApp();
  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [greenPingLoading, setGreenPingLoading] = useState(false);

  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    setIsLoading(true);
    setTimeout(() => {
      updateSettings(localSettings);
      setIsLoading(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 800);
  };

  const handleSyncAll = () => {
    setIsLoading(true);
    setTimeout(() => {
        syncAllEventsWithCustomers();
        setIsLoading(false);
        alert('הסנכרון הושלם בהצלחה!');
    }, 1000);
  };

  const handleGreenInvoicePing = async () => {
    setGreenPingLoading(true);
    try {
      const r = await pingGreenInvoice();
      if (r.success) {
        alert(r.message || 'החיבור לחשבונית ירוקה תקין.');
      } else {
        alert([r.error, r.hint].filter(Boolean).join('\n\n'));
      }
    } catch (e) {
      alert((e as Error).message || 'שגיאת רשת');
    } finally {
      setGreenPingLoading(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'כללי', icon: Building },
    { id: 'portal', label: 'פורטל לקוח', icon: MonitorPlay },
    { id: 'integrations', label: 'אינטגרציות', icon: Globe },
    { id: 'data', label: 'ניהול נתונים', icon: Database },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-fade-in dir-rtl">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">הגדרות מערכת</h2>
          <p className="text-slate-500 mt-1">ניהול העדפות, אינטגרציות ופרטי חשבון</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isLoading}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium shadow-lg transition-all ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'}`}
        >
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          ) : showSuccess ? (
             <Check size={20} />
          ) : (
             <Save size={20} />
          )}
          <span>{showSuccess ? 'נשמר!' : 'שמור שינויים'}</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8 mt-8">
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-r-4 ${
                  activeTab === tab.id 
                    ? 'border-purple-500 bg-purple-50 text-purple-700' 
                    : 'border-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
                    <Building size={20} className="text-slate-400" /> פרטי ארגון
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">שם הארגון</label>
                    <input 
                      type="text" 
                      value={localSettings.companyName}
                      onChange={(e) => setLocalSettings({...localSettings, companyName: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">טלפון ליצירת קשר</label>
                    <input 
                      type="text" 
                      value={localSettings.contactPhone}
                      onChange={(e) => setLocalSettings({...localSettings, contactPhone: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
                  <FileText size={20} className="text-emerald-600" /> חשבונית ירוקה (Morning)
                </h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  יצירת מסמכים רצה דרך השרת (Netlify / שרת מקומי) — המפתחות לא נשמרים בדפדפן. נדרש מנוי הכולל API (למשל Best). אפשר לבדוק תחילה בסביבת Sandbox על ידי הגדרת{' '}
                  <code className="text-xs bg-slate-100 px-1 rounded">GREEN_INVOICE_BASE_URL</code> לכתובת{' '}
                  <code className="text-xs bg-slate-100 px-1 rounded">https://sandbox.d.greeninvoice.co.il/api/v1</code>.
                </p>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 text-slate-700 mb-4">
                  <div><span className="text-slate-400">GREEN_INVOICE_API_ID</span> — מזהה מפתח מהמערכת</div>
                  <div><span className="text-slate-400">GREEN_INVOICE_SECRET</span> — סוד (מוצג פעם אחת בלבד)</div>
                  <div><span className="text-slate-400">GREEN_INVOICE_BASE_URL</span> — אופציונלי (ברירת מחדל ייצור)</div>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  יצירת מפתח API:{' '}
                  <a href="https://www.greeninvoice.co.il/help-center/generating-api-key/" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-bold hover:underline">
                    מרכז העזרה — מפתח API
                  </a>
                  {' · '}
                  <a href="https://www.greeninvoice.co.il/api-docs" target="_blank" rel="noopener noreferrer" className="text-purple-600 font-bold hover:underline">
                    תיעוד API
                  </a>
                </p>
                <button
                  type="button"
                  onClick={handleGreenInvoicePing}
                  disabled={greenPingLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {greenPingLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  בדיקת חיבור (אימות מפתח)
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
                  <Calendar size={20} className="text-slate-400" /> יומנים
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium text-slate-700">Google Calendar</span>
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-purple-600"
                      checked={integrations.googleCalendar}
                      onChange={() => toggleIntegration('google')}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium text-slate-700">Outlook Calendar</span>
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-purple-600"
                      checked={integrations.outlookCalendar}
                      onChange={() => toggleIntegration('outlook')}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'portal' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b flex items-center gap-2">
                    <MonitorPlay size={20} className="text-slate-400" /> הגדרות פורטל לקוח
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">לינק לסרטון יוטיוב (Embed)</label>
                    <input 
                      type="text" 
                      placeholder="https://www.youtube.com/embed/..."
                      value={localSettings.portalVideoUrl}
                      onChange={(e) => setLocalSettings({...localSettings, portalVideoUrl: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-200 font-mono text-xs"
                    />
                    <p className="text-[10px] text-slate-400 mt-2 font-bold italic">
                        * שימו לב: יש להשתמש בפורמט Embed (לדוגמה: https://www.youtube.com/embed/VIDEO_ID)
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 border rounded-xl flex items-center gap-4">
                      <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><Info size={20}/></div>
                      <p className="text-xs text-slate-600 font-medium">סרטון זה יופיע בראש עמוד ה"מסע" של כל לקוח שמקבל ממך קישור לפורטל.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="bg-white p-6 rounded-xl border space-y-4">
                <h3 className="font-bold text-slate-800 border-b pb-2">תחזוקת נתונים</h3>
                <button onClick={handleSyncAll} className="w-full bg-slate-50 border border-slate-200 py-3 rounded-xl flex items-center justify-center gap-2 font-bold hover:bg-slate-100">
                    <RefreshCw size={18} /> סנכרן את כל המערכת
                </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
