
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppEvent, Customer, Lead, Task, EventStatus, PaymentStatus, EventType, TaskPriority, LeadStatus, CustomForm, FormField, TaskCategory, PaymentMethod } from '../types';
import { mockCustomers, mockEvents, mockLeads, mockTasks } from '../services/mockData';
import { sendEmail } from '../services/emailService';
import { 
  customersService, 
  eventsService, 
  leadsService, 
  tasksService, 
  formsService, 
  settingsService,
  migrateFromLocalStorage 
} from '../services/supabase';

interface Activity {
  id: string;
  type: 'email' | 'sync' | 'system';
  message: string;
  timestamp: Date;
}

interface AppSettings {
  portalVideoUrl: string;
  companyName: string;
  contactPhone: string;
}

interface AppContextType {
  userEmail: string;
  events: AppEvent[];
  customers: Customer[];
  leads: Lead[];
  tasks: Task[];
  customForms: CustomForm[];
  activities: Activity[];
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  sendPortalEmailForCustomer: (customerId: string) => Promise<{ success: boolean; email: string; url: string }>;
  addEvent: (event: AppEvent) => void;
  updateEventStatus: (id: string, status: EventStatus) => void;
  updateEvent: (id: string, updates: Partial<AppEvent>) => void;
  deleteEvent: (id: string) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  addLead: (lead: Lead) => void;
  updateLeadStatus: (id: string, status: LeadStatus) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  convertLeadToCustomer: (leadId: string) => void;
  handlePublicBookingSubmit: (data: any, leadId?: string) => Promise<{ eventId: string }>;
  sendBookingEmail: (leadId: string) => Promise<{ success: boolean; email: string; url: string }>;
  sendPortalEmail: (leadId: string) => Promise<{ success: boolean; email: string; url: string }>;
  sendEventUpdateEmail: (event: AppEvent) => Promise<void>;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  updateTaskProgress: (id: string, progress: number) => void;
  deleteTask: (id: string) => void;
  importEvents: (data: any[]) => void;
  importCustomers: (data: any[]) => void;
  importTasks: (data: any[]) => void;
  importLeads: (data: Lead[]) => void;
  getCustomerById: (id: string) => Customer | undefined;
  syncAllEventsWithCustomers: () => void;
  syncRemoteBookings: () => Promise<number>;
  addCustomForm: (form: CustomForm) => void;
  updateCustomForm: (id: string, updates: Partial<CustomForm>) => void;
  deleteCustomForm: (id: string) => void;
  getFormById: (id: string) => CustomForm | undefined;
  kpis: {
    openDebt: number;
    projectedIncome: number;
    totalRevenue: number;
    availableClickers: number;
  };
  integrations: {
    googleCalendar: boolean;
    outlookCalendar: boolean;
  };
  toggleIntegration: (service: 'google' | 'outlook') => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'ME_CFM_STORAGE_V12';

const DEFAULT_FORM: CustomForm = {
  id: 'default-booking',
  title: 'טופס הזמנת אירוע קליכיף',
  description: 'מילוי טופס זה הוא השלב הראשון והחשוב ביותר לשריין את האירוע!',
  isActive: true,
  autoConfirm: false,
  themeColor: '#4f46e5',
  fields: [
    { id: 'f1', type: 'text', label: 'שם מלא המזמין', required: true, mapping: 'name', placeholder: 'ישראל ישראלי' },
    { id: 'f2', type: 'tel', label: 'טלפון נייד (זמין באירוע)', required: true, mapping: 'phone', placeholder: '050-0000000' },
    { id: 'f3', type: 'email', label: 'כתובת דוא"ל לקבלת אישור', required: true, mapping: 'email', placeholder: 'user@example.com' },
    { id: 'f9', type: 'select', label: 'סוג התוכנית המבוקשת', required: true, mapping: 'eventType', options: Object.values(EventType) },
    { id: 'f5', type: 'date', label: 'תאריך האירוע', required: true, mapping: 'date' },
    { id: 'f_heb', type: 'text', label: 'תאריך אירוע עברי', required: true, mapping: 'hebrewDate', placeholder: 'לדוגמה: י כסלו תשפה' },
    { id: 'f6', type: 'time', label: 'שעת התחלה', required: true, mapping: 'startTime' },
    { id: 'f_end', type: 'time', label: 'שעת סיום', required: true, mapping: 'endTime' },
    { id: 'f8', type: 'number', label: 'כמות משתתפים משוערת', required: true, mapping: 'clickersNeeded', placeholder: 'לדוגמה: 50' },
    { id: 'f_amount', type: 'number', label: 'סכום סופי לתשלום', required: true, mapping: 'amount' },
    { id: 'f_pay', type: 'select', label: 'אופן תשלום מועדף', required: true, mapping: 'paymentMethod', options: ['העברה בנקאית', 'כ. אשראי', 'צ\'ק', 'מזומן'] },
    { id: 'f7', type: 'text', label: 'מיקום האירוע', required: true, mapping: 'location' },
    { id: 'f11', type: 'textarea', label: 'הערות חניה וגישה', required: false, mapping: 'notes' },
  ]
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [userEmail] = useState('c3834000@gmail.com');
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customForms, setCustomForms] = useState<CustomForm[]>([DEFAULT_FORM]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    portalVideoUrl: 'https://drive.google.com/drive/home',
    companyName: 'קליכיף',
    contactPhone: '052-9934000'
  });
  const [integrations, setIntegrations] = useState({ googleCalendar: true, outlookCalendar: false });
  const [kpis, setKpis] = useState({ openDebt: 0, projectedIncome: 0, totalRevenue: 0, availableClickers: 500 });

  const loadFromStorage = () => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setEvents(parsed.events || []);
      setCustomers(parsed.customers || []);
      setLeads(parsed.leads || []);
      setTasks(parsed.tasks || []);
      if (parsed.settings) setSettings(parsed.settings);
      if (parsed.customForms?.length) setCustomForms(parsed.customForms);
    } else {
      setEvents(mockEvents);
      setCustomers(mockCustomers);
      setLeads(mockLeads);
      setTasks(mockTasks);
    }
    setIsLoaded(true);
  };

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const dataToSave = { events, customers, leads, tasks, settings, customForms };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
      console.log('💾 נתונים נשמרו ל-localStorage:', {
        eventsCount: events.length,
        customersCount: customers.length,
        leadsCount: leads.length,
        tasksCount: tasks.length
      });
    }
  }, [events, customers, leads, tasks, settings, customForms, isLoaded]);

  const addActivity = (type: Activity['type'], message: string) => {
    setActivities(prev => [{ id: Date.now().toString(), type, message, timestamp: new Date() }, ...prev].slice(0, 15));
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const handlePublicBookingSubmit = async (data: any, leadId?: string) => {
    console.log('🎯 handlePublicBookingSubmit נקרא עם הנתונים:', data, 'leadId:', leadId);
    
    const event: AppEvent = {
        id: `e_${Date.now()}`,
        customerId: '',
        title: `הזמנה מפורטל: ${data.name || 'לקוח'}`,
        date: data.date || new Date().toISOString().split('T')[0],
        startTime: data.startTime || '10:00',
        endTime: data.endTime || '11:30',
        amount: Number(data.amount || 0),
        paidAmount: 0,
        status: EventStatus.Booked,
        paymentStatus: PaymentStatus.NotPaid,
        eventType: data.eventType || EventType.ClickersProgram,
        location: data.location || '',
        tag: 'לבדיקה',
        phone: data.phone || '',
        email: data.email || '',
        clickersNeeded: Number(data.clickersNeeded || 0),
        notes: data.notes || '',
        hebrewDate: data.hebrewDate || ''
    };

    console.log('📅 אירוע חדש נוצר:', event);
    setEvents(prev => {
      const newEvents = [event, ...prev];
      console.log('💾 מספר אירועים אחרי הוספה:', newEvents.length);
      console.log('💾 כל האירועים:', newEvents.map(e => ({ id: e.id, name: e.title, date: e.date })));
      return newEvents;
    });
    addActivity('system', `הזמנה חדשה התקבלה מהפורטל - ${data.name}`);

    const toEmail = (data.email || '').trim();
    if (toEmail) {
      const d = event.date.replace(/-/g, '');
      const start = `${d}T${(event.startTime || '10:00').replace(':', '')}00`;
      const end = `${d}T${(event.endTime || '12:00').replace(':', '')}00`;
      const calTitle = encodeURIComponent(`אירוע קליכיף – ${data.name || 'הזמנה'}`);
      const hebrewDateInfo = event.hebrewDate ? `\\nתאריך עברי: ${event.hebrewDate}` : '';
      const calDetails = encodeURIComponent(`הזמנה דרך פורטל קליכיף${hebrewDateInfo}\\nמיקום: ${event.location || '-'}\\nטלפון: ${event.phone || '-'}\\nאימייל: ${event.email || '-'}\\nקליקרים: ${event.clickersNeeded || 0}\\nלשאלות: ${settings.contactPhone}`);
      const calLocation = encodeURIComponent(event.location || '');
      const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&dates=${start}/${end}&details=${calDetails}&location=${calLocation}`;
      
      // יומן עברי - הבריכה (Hebcal)
      const hebcalUrl = `https://www.hebcal.com/converter?gd=${event.date.split('-')[2]}&gm=${event.date.split('-')[1]}&gy=${event.date.split('-')[0]}&g2h=1`;
      const { success, error } = await sendEmail({
        to: toEmail,
        subject: `✅ אישור הזמנה #${event.id.substring(2, 15)} - ${data.name} - ${new Date(event.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`,
        html: `
          <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; border-radius: 20px;">
            <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 40px;">✅</div>
                <h1 style="color: #1a202c; font-size: 28px; margin: 0; font-weight: 800;">ההזמנה נקלטה בהצלחה!</h1>
                <p style="color: #718096; font-size: 16px; margin: 8px 0 0;">שלום ${data.name || 'לקוח/ה'} 👋</p>
                <div style="background: #f1f5f9; border-radius: 8px; padding: 8px 16px; margin: 12px auto 0; display: inline-block;">
                  <span style="color: #64748b; font-size: 12px; font-weight: 600;">מספר הזמנה:</span>
                  <span style="color: #334155; font-size: 14px; font-weight: 800; margin-right: 8px;">#${event.id.substring(2, 15)}</span>
                </div>
              </div>
              
              <div style="background: linear-gradient(to bottom, #f0f9ff, #e0f2fe); border: 2px solid #0284c7; border-radius: 16px; padding: 24px; margin: 24px 0; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);">
                <h2 style="color: #0c4a6e; font-size: 20px; margin: 0 0 20px; font-weight: 800; text-align: center;">📋 פרטי האירוע שלך</h2>
                <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                  <tr style="background: #f8fafc;"><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0; width: 40%;">👤 שם המזמין:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; border-bottom: 1px solid #e2e8f0;">${data.name || 'לא צוין'}</td></tr>
                  <tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">📞 טלפון:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 700; border-bottom: 1px solid #e2e8f0;">${data.phone || 'לא צוין'}</td></tr>
                  <tr style="background: #f8fafc;"><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">📧 אימייל:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 700; border-bottom: 1px solid #e2e8f0;">${data.email || 'לא צוין'}</td></tr>
                  <tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">📅 תאריך:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; font-size: 16px; border-bottom: 1px solid #e2e8f0;">${new Date(event.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
                  ${event.hebrewDate ? `<tr style="background: #f8fafc;"><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">🗓️ תאריך עברי:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; border-bottom: 1px solid #e2e8f0;">${event.hebrewDate}</td></tr>` : ''}
                  <tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">⏰ שעת התחלה:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; border-bottom: 1px solid #e2e8f0;">${event.startTime}</td></tr>
                  <tr style="background: #f8fafc;"><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">⏰ שעת סיום:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; border-bottom: 1px solid #e2e8f0;">${event.endTime}</td></tr>
                  <tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">📍 מיקום האירוע:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 700; border-bottom: 1px solid #e2e8f0;">${event.location || 'לא צוין'}</td></tr>
                  <tr style="background: #f8fafc;"><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">🎯 סוג האירוע:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 700; border-bottom: 1px solid #e2e8f0;">${event.eventType}</td></tr>
                  ${event.clickersNeeded > 0 ? `<tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">🖱️ מספר קליקרים:</td><td style="padding: 12px 16px; color: #7c3aed; font-weight: 800; font-size: 18px; border-bottom: 1px solid #e2e8f0;">${event.clickersNeeded} קליקרים</td></tr>` : ''}
                  <tr style="background: #dcfce7;"><td style="padding: 14px 16px; color: #166534; font-weight: 700;">💰 סכום לתשלום:</td><td style="padding: 14px 16px; color: #166534; font-weight: 900; font-size: 22px;">₪${event.amount.toLocaleString()}</td></tr>
                  ${event.notes ? `<tr style="background: #fef3c7;"><td colspan="2" style="padding: 14px 16px; color: #92400e; font-weight: 700; vertical-align: top;">📝 הערות: <br/><span style="font-weight: 600;">${event.notes}</span></td></tr>` : ''}
                </table>
              </div>

              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
                <p style="color: white; margin: 0 0 12px; font-size: 14px; font-weight: 600;">הוסף את האירוע ליומן שלך</p>
                <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                  <a href="${googleCalUrl}" style="display: inline-block; background: white; color: #667eea; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">📅 Google Calendar</a>
                  <a href="${hebcalUrl}" target="_blank" style="display: inline-block; background: white; color: #764ba2; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">🗓️ יומן עברי</a>
                </div>
              </div>

              <div style="border-top: 2px solid #e2e8f0; padding-top: 20px; margin-top: 24px;">
                <h3 style="color: #2d3748; font-size: 16px; margin: 0 0 12px; font-weight: 700;">📞 פרטי התקשרות</h3>
                <p style="color: #4a5568; margin: 4px 0;"><strong>שם:</strong> ${data.name || 'לא צוין'}</p>
                <p style="color: #4a5568; margin: 4px 0;"><strong>טלפון:</strong> ${data.phone || 'לא צוין'}</p>
                <p style="color: #4a5568; margin: 4px 0;"><strong>אימייל:</strong> ${data.email || 'לא צוין'}</p>
              </div>

              ${leadId ? `<div style="background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: white; margin: 0 0 16px; font-size: 16px; font-weight: 700;">🚀 המשך לשלב הבא - הכנת החידון!</p>
                <a href="https://my-app-kappa-beige-46.vercel.app/#/portal/${leadId}?step=1" style="display: inline-block; background: white; color: #8b5cf6; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 900; font-size: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">היכנס לפורטל האישי שלך</a>
              </div>` : ''}

              <div style="background: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 600;">💡 <strong>שימו לב:</strong> ההזמנה שלכם שמורה במערכת שלנו. נציג יצור איתכם קשר בהקדם לאישור סופי ותיאום פרטים נוספים.</p>
              </div>

              <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 2px solid #e2e8f0;">
                <p style="color: #718096; margin: 0 0 8px; font-size: 14px;">לשאלות ובירורים:</p>
                <p style="color: #1a202c; font-weight: 800; font-size: 18px; margin: 0 0 4px;">📞 ${settings.contactPhone}</p>
                <p style="color: #718096; margin: 16px 0 0; font-size: 14px;">בברכה,<br/><strong style="color: #667eea; font-size: 16px;">${settings.companyName}</strong></p>
              </div>
            </div>
          </div>
        `,
      });
      if (success) addActivity('email', `מייל אישור הזמנה נשלח ללקוח: ${toEmail}`);
      else addActivity('email', `שליחת מייל נכשלה: ${error || 'לא מוגדר'}`);
    }

    return Promise.resolve({ eventId: event.id });
  };

  const sendPortalEmail = async (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error('Lead not found');

    const portalUrl = `https://my-app-kappa-beige-46.vercel.app/#/portal/${leadId}`;
    const toEmail = (lead.email || '').trim();
    if (toEmail) {
      const { success, error } = await sendEmail({
        to: toEmail,
        subject: `פורטל הלקוח האישי שלך - ${settings.companyName}`,
        html: `
          <div dir="rtl" style="font-family: Heebo, sans-serif;">
            <p>שלום ${lead.name},</p>
            <p>הנה הקישור לפורטל האישי שלך להמשך ההכנה לאירוע:</p>
            <p><a href="${portalUrl}">${portalUrl}</a></p>
            <p>בברכה,<br/>${settings.companyName}</p>
          </div>
        `,
      });
      if (!success) throw new Error(error || 'שליחת המייל נכשלה');
    }
    addActivity('email', `מייל עם קישור לפורטל נשלח ל-${lead.name} (${lead.email})`);
    return { success: true, email: lead.email || '', url: portalUrl };
  };

  const addEvent = (event: AppEvent) => setEvents(prev => [event, ...prev]);
  const updateEventStatus = (id: string, status: EventStatus) => setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  const updateEvent = (id: string, updates: Partial<AppEvent>) => setEvents(prev => prev.map(e => {
    if (e.id !== id) return e;
    const updated = { ...e, ...updates };
    const isPaidStatus = [PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck, PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider].includes(updated.paymentStatus);
    if (isPaidStatus && updates.paymentStatus && updated.paidAmount < updated.amount) {
      updated.paidAmount = updated.amount;
    }
    return updated;
  }));
  const deleteEvent = (id: string) => setEvents(prev => prev.filter(e => e.id !== id));
  const addCustomer = (customer: Customer) => setCustomers(prev => [...prev, customer]);
  const updateCustomer = (id: string, updates: Partial<Customer>) => setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  const getCustomerById = (id: string) => customers.find(c => c.id === id);
  const addLead = (lead: Lead) => setLeads(prev => [...prev, lead]);
  const updateLeadStatus = (id: string, status: LeadStatus) => setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  const updateLead = (id: string, updates: Partial<Lead>) => setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  const convertLeadToCustomer = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const newCustomer: Customer = { id: `c_${Date.now()}`, name: lead.name, phone: lead.phone, email: lead.email || '', notes: `הגיע מליד` };
    setCustomers(prev => [...prev, newCustomer]);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: LeadStatus.Converted } : l));
    addActivity('system', `ליד ${lead.name} הומר ללקוח בהצלחה`);
  };
  const addTask = (task: Task) => setTasks(prev => [task, ...prev]);
  const updateTask = (id: string, updates: Partial<Task>) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  const toggleTask = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted, progress: !t.isCompleted ? 100 : 0 } : t));
  const updateTaskProgress = (id: string, progress: number) => setTasks(prev => prev.map(t => t.id === id ? { ...t, progress, isCompleted: progress === 100 } : t));
  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const syncAllEventsWithCustomers = () => {
    addActivity('sync', 'סנכרון גלובלי של לקוחות ואירועים בוצע');
  };
  const sendBookingEmail = async (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return { success: false, email: '', url: '' };
    const bookUrl = `https://my-app-kappa-beige-46.vercel.app/#/book?leadId=${leadId}`;
    const toEmail = (lead.email || '').trim();
    if (toEmail) {
      const { success, error } = await sendEmail({
        to: toEmail,
        subject: `טופס הזמנת אירוע - ${settings.companyName}`,
        html: `
          <div dir="rtl" style="font-family: Heebo, sans-serif;">
            <p>שלום ${lead.name},</p>
            <p>להשלמת הזמנת האירוע נא למלא את הטופס:</p>
            <p><a href="${bookUrl}">${bookUrl}</a></p>
            <p>בברכה,<br/>${settings.companyName}</p>
          </div>
        `,
      });
      if (!success) throw new Error(error || 'שליחת המייל נכשלה');
    }
    return { success: true, email: toEmail, url: bookUrl };
  };
  const syncRemoteBookings = async () => 0;
  const toggleIntegration = async (service: any) => {
    setIntegrations(prev => ({ ...prev, [service === 'google' ? 'googleCalendar' : 'outlookCalendar']: !prev[service === 'google' ? 'googleCalendar' : 'outlookCalendar'] }));
    return true;
  };
  const addCustomForm = (f: any) => setCustomForms(prev => [...prev, f]);
  const updateCustomForm = (id: string, u: any) => setCustomForms(prev => prev.map(f => f.id === id ? { ...f, ...u } : f));
  const deleteCustomForm = (id: string) => setCustomForms(prev => prev.filter(f => f.id !== id));
  const getFormById = (id: string) => customForms.find(f => f.id === id);

  const importLeads = (data: Lead[]) => {
    const withIds = data.map(l => (l.id ? l : { ...l, id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` }));
    setLeads(prev => [...withIds, ...prev]);
  };

  const sendPortalEmailForCustomer = async (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) throw new Error('Customer not found');
    const portalUrl = `https://my-app-kappa-beige-46.vercel.app/#/portal/${customerId}`;
    const toEmail = (customer.email || '').trim();
    if (toEmail) {
      const { success, error } = await sendEmail({
        to: toEmail,
        subject: `פורטל הלקוח האישי שלך - ${settings.companyName}`,
        html: `<div dir="rtl" style="font-family: Heebo, sans-serif;"><p>שלום ${customer.name},</p><p>הנה הקישור לפורטל האישי שלך:</p><p><a href="${portalUrl}">${portalUrl}</a></p><p>בברכה,<br/>${settings.companyName}</p></div>`,
      });
      if (!success) throw new Error(error || 'שליחת המייל נכשלה');
    }
    addActivity('email', `מייל פורטל נשלח ללקוח ${customer.name}`);
    return { success: true, email: customer.email || '', url: portalUrl };
  };

  const sendEventUpdateEmail = async (event: AppEvent) => {
    const toEmail = (event.email || getCustomerById(event.customerId)?.email || '').trim();
    if (!toEmail) return;
    const custName = getCustomerById(event.customerId)?.name || event.title;
    await sendEmail({
      to: toEmail,
      subject: `עדכון באירוע - ${settings.companyName}`,
      html: `<div dir="rtl" style="font-family: Heebo, sans-serif;"><p>שלום ${custName},</p><p>מעדכנים אותך כי בוצע עדכון באירוע שלך.</p><p><strong>תאריך:</strong> ${event.date} | <strong>שעה:</strong> ${event.startTime}–${event.endTime}</p><p><strong>מיקום:</strong> ${event.location || '-'}</p><p>לשאלות: ${settings.contactPhone}</p><p>בברכה,<br/>${settings.companyName}</p></div>`,
    });
    addActivity('email', `הודעת עדכון אירוע נשלחה ל-${toEmail}`);
  };

  const norm = (s: string) => (s || '').trim().toLowerCase();

  const pick = (row: any, ...keys: string[]) => { for (const k of keys) { const v = row[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return ''; };
    const parseDate = (s: string) => { if (!s) return new Date().toISOString().split('T')[0]; const d = String(s).trim(); const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; if (d.match(/^\d{4}-\d{2}-\d{2}/)) return d.slice(0,10); return new Date().toISOString().split('T')[0]; };
    const importEvents = (data: any[]) => {
    const fixPhone = (val: any): string => {
      if (!val) return '';
      let str = String(val).trim();
      if (/^\d+\.?\d*E\+\d+$/i.test(str)) {
        const num = parseFloat(str);
        str = num.toFixed(0);
      }
      return str;
    };

    const newCusts: Customer[] = [];
    const toAdd: AppEvent[] = [];
    data.forEach((row: any, i: number) => {
      const name = pick(row, 'Name', 'name', 'שם', 'title', 'Title');
      const phoneRaw = fixPhone(pick(row, 'מס\' טלפון: (המס\' שיהיה זמין בעת האירוע)', 'מס\' טלפון', 'phone', 'Phone', 'טלפון', 'tel'));
      const phoneNorm = phoneRaw.replace(/\D/g, '');
      const email = (row['כתובת דוא"ל'] != null ? String(row['כתובת דוא"ל']).trim() : '') || pick(row, 'email', 'Email', 'אימייל', 'mail');
      let c = customers.find(x => (phoneNorm && norm(x.phone).replace(/\D/g, '') === phoneNorm) || (email && norm(x.email) === norm(email)) || (name && norm(x.name) === norm(name)))
        || newCusts.find(x => (phoneNorm && norm(x.phone).replace(/\D/g, '') === phoneNorm) || (email && norm(x.email) === norm(email)) || (name && norm(x.name) === norm(name)));
      if (!c && (name || phoneNorm || email)) {
        c = { id: `c_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`, name: name || 'ללא שם', phone: phoneRaw || '-', email: email || '' };
        newCusts.push(c);
      }
      const customerId = c?.id ?? '';
      const title = name || pick(row, 'title', 'Title', 'שם לחשבונית') || 'אירוע';
      const dateStr = pick(row, 'תאריך קיום האירוע', 'date', 'Date', 'timestamp');
      const date = parseDate(dateStr);
      const amount = Number(pick(row, 'סכום סופי לתשלום', 'סכום לתשלום', 'amount', 'Amount', 'סכום', 'sum') || 0) || 0;
      const statusStr = pick(row, 'Status', 'status', 'סטטוס');
      const paymentStatusStr = pick(row, 'סטטוס תשלום', 'paymentStatus', 'payment');
      
      // המרת סטטוס תשלום
      const mapPaymentStatus = (s: string): PaymentStatus => {
        const lower = s.toLowerCase().trim();
        if (lower.includes('שולם - מזומן')) return PaymentStatus.PaidCash;
        if (lower.includes('שולם - אשראי')) return PaymentStatus.PaidCredit;
        if (lower.includes('שולם -צ\'ק') || lower.includes('שולם - צ\'ק')) return PaymentStatus.PaidCheck;
        if (lower.includes('שולם - העברה מ')) return PaymentStatus.PaidTransferM;
        if (lower.includes('שולם העברה ל')) return PaymentStatus.PaidTransferL;
        if (lower.includes('שולם העברה ה')) return PaymentStatus.PaidTransferH;
        if (lower.includes('שולם')) return PaymentStatus.Paid;
        return PaymentStatus.NotPaid;
      };
      
      const paymentStatus = mapPaymentStatus(paymentStatusStr);
      
      // המרת סטטוס אירוע
      const mapEventStatus = (s: string): EventStatus => {
        const lower = s.toLowerCase().trim();
        if (lower.includes('בוצע ושולם')) return EventStatus.Paid;
        if (lower.includes('בוצע ולא שולם')) return EventStatus.DoneUnpaid;
        return EventStatus.Booked;
      };
      
      const status = mapEventStatus(statusStr);
      
      // חישוב paidAmount - אם שולם, הסכום המלא
      const paidAmount = (status === EventStatus.Paid || paymentStatus !== PaymentStatus.NotPaid) ? amount : 0;
      const eventTypeStr = pick(row, 'סוג אירוע', 'eventType', 'type');
      const eventType = Object.values(EventType).find(v => v === eventTypeStr) || EventType.ClickersProgram;
      const tagStr = pick(row, 'תג אירוע', 'tag', 'תגית');
      const tag = tagStr || 'קליכיף';
      const categoryStr = pick(row, 'קטגוריה', 'category');
      const startTime = (pick(row, 'שעת התחלה משוערת', 'startTime', 'start') || '10:00').slice(0, 5);
      const endTimeRaw = pick(row, 'תאריך אירוע (שעת סיום)', 'endTime', 'end');
      const endTime = endTimeRaw.length <= 5 && endTimeRaw.match(/\d/) ? endTimeRaw.slice(0, 5) : '12:00';
      toAdd.push({
        id: `e_${Date.now()}_${i}`,
        customerId,
        title,
        date,
        startTime: startTime || '10:00',
        endTime: endTime || '12:00',
        amount,
        paidAmount,
        status,
        paymentStatus,
        eventType,
        clickersNeeded: Number(pick(row, 'כמות משתתפים משוערת', 'מס\' משתתפים', 'clickersNeeded', 'clickers') || 0) || 0,
        location: pick(row, 'כתובת האירוע', 'location', 'address', 'מיקום'),
        tag,
        category: categoryStr || undefined,
        phone: phoneRaw || undefined,
        email: email || undefined,
        hebrewDate: pick(row, 'תאריך אירוע עברי', 'תאריך עברי', 'hebrewDate'),
        notes: pick(row, 'הערות', 'notes'),
        externalId: pick(row, 'Item ID', 'Item ID (auto generated)', 'externalId', 'id', 'ID'),
        paymentMethod: Object.values(PaymentMethod).find(v => v === pick(row, 'אופן תשלום', 'paymentMethod')) || undefined,
        termsAccepted: /כן|אני מאשר|true|1/i.test(pick(row, 'אישור תנאי הזמנה', 'termsAccepted')),
      });
    });
    if (newCusts.length) setCustomers(prev => [...newCusts, ...prev]);
    
    setEvents(prev => {
      const existingIds = new Set(prev.map(e => e.externalId).filter(Boolean));
      const uniqueNew = toAdd.filter(e => !e.externalId || !existingIds.has(e.externalId));
      return [...uniqueNew, ...prev];
    });
    
    addActivity('system', `יובאו ${toAdd.length} אירועים${newCusts.length ? ` ו-${newCusts.length} לקוחות חדשים` : ''} וסונכרנו עם לקוחות`);
  };

  const importCustomers = (data: any[]) => {
    const fixPhone = (val: any): string => {
      if (!val) return '';
      let str = String(val).trim();
      if (/^\d+\.?\d*E\+\d+$/i.test(str)) {
        const num = parseFloat(str);
        str = num.toFixed(0);
      }
      return str;
    };

    const toAdd: Customer[] = data.map((row: any, i: number) => ({
      id: (row['Item ID (auto generated)'] ?? row['Item ID'] ?? row.id ?? `c_${Date.now()}_${i}`).toString(),
      name: (row.Name ?? row.name ?? row.שם ?? '').toString().trim() || 'ללא שם',
      phone: fixPhone(row.פלאפון ?? row.phone ?? row.Phone ?? row.טלפון ?? '') || '-',
      email: (row.מייל ?? row.email ?? row.Email ?? row.אימייל ?? '').toString().trim() || '',
      companyName: (row.companyName ?? row.company ?? row.חברה ?? '').toString().trim() || undefined,
      notes: (row.הערות ?? row['איך שמעת עלינו'] ?? row.notes ?? '').toString().trim() || undefined,
    })).filter((c: Customer) => c.name !== 'ללא שם' || c.phone !== '-');
    setCustomers(prev => [...toAdd, ...prev]);
    addActivity('system', `יובאו ${toAdd.length} לקוחות`);
  };

  const importTasks = (data: any[]) => {
    const toAdd: Task[] = data.map((row: any, i: number) => {
      const statusStr = (row.סטטוס ?? row.status ?? row.progress ?? '').toString();
      const progressNum = (() => { const m = statusStr.match(/(\d+)/); return m ? Number(m[1]) : 0; })();
      const isDone = /בוצע\s*100|הושלם|completed|כן/i.test(statusStr);
      return {
        id: (row['Item ID (auto generated)'] ?? row['Item ID'] ?? row.id ?? `t_${Date.now()}_${i}`).toString(),
        title: (row.תיאור ?? row.title ?? row.Title ?? row.כותרת ?? '').toString().trim() || 'משימה',
        isCompleted: isDone,
        priority: [TaskPriority.Low, TaskPriority.Medium, TaskPriority.High][Number(row.עדיפות ?? row.priority ?? 1) - 1] ?? TaskPriority.Medium,
        category: (row.קטגוריה ?? row.category ?? 'כללי') as TaskCategory,
        estimatedTimeMin: Number(row['משך זמן משוער בדקות'] ?? row.estimatedTimeMin ?? row.זמן ?? 0) || 0,
        progress: isDone ? 100 : progressNum,
        dueDate: (row['תאריך יעד'] ?? row.dueDate ?? row.תאריך_יעד ?? '').toString() || undefined,
      };
    });
    setTasks(prev => [...toAdd, ...prev]);
    addActivity('system', `יובאו ${toAdd.length} משימות`);
  };

  useEffect(() => {
    let debt = 0, projected = 0, total = 0, reservedClickers = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    events.forEach(ev => {
      const eventDate = new Date(ev.date);
      eventDate.setHours(0, 0, 0, 0);
      const isPastEvent = eventDate < today;
      const isFutureEvent = eventDate >= today;
      
      // סה"כ הכנסות - כל מה ששולם
      total += ev.paidAmount || 0;
      
      // חוב פתוח - אירועים שבוצעו ולא שולמו במלואם
      const isPaid = [PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck, PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider].includes(ev.paymentStatus);
      if (!isPaid && (ev.amount - (ev.paidAmount || 0)) > 0) {
        debt += (ev.amount - (ev.paidAmount || 0));
      }
      
      // צפי הכנסות - אירועים עתידיים שעדיין לא שולמו
      if (isFutureEvent && !isPaid) {
        projected += (ev.amount - (ev.paidAmount || 0));
      }
      
      // קליקרים תפוסים - אירועים עתידיים
      if (isFutureEvent) {
        reservedClickers += ev.clickersNeeded || 0;
      }
    });
    
    setKpis({ openDebt: debt, projectedIncome: projected, totalRevenue: total, availableClickers: 500 - reservedClickers });
  }, [events]);

  return (
    <AppContext.Provider value={{ 
      userEmail, events, customers, leads, tasks, customForms, activities, settings, updateSettings, sendPortalEmailForCustomer, addEvent, updateEventStatus, updateEvent, deleteEvent,
      addCustomer, updateCustomer, getCustomerById, addLead, updateLeadStatus, updateLead, convertLeadToCustomer, handlePublicBookingSubmit,
      sendBookingEmail, sendPortalEmail, sendEventUpdateEmail, addTask, updateTask, toggleTask, updateTaskProgress, deleteTask, importEvents, importCustomers, importTasks, importLeads, kpis, integrations, toggleIntegration, syncRemoteBookings,
      addCustomForm, updateCustomForm, deleteCustomForm, getFormById, syncAllEventsWithCustomers
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
