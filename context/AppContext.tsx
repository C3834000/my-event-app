
import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppEvent, Customer, Lead, Task, EventStatus, PaymentStatus, EventType, TaskPriority, LeadStatus, CustomForm, FormField, TaskCategory, PaymentMethod } from '../types';
import { mockCustomers, mockEvents, mockLeads, mockTasks } from '../services/mockData';
import { sendEmail, formatSendEmailError } from '../services/emailService';
import { 
  customersService, 
  eventsService, 
  leadsService, 
  tasksService, 
  formsService, 
  settingsService,
  migrateFromLocalStorage
} from '../services/supabase';
import { buildPaymentDateUpdates } from '../services/paymentDateImport';
import { currentYearKey, eventYearKey, incomeDateKey, parseEventDateKey, todayDateKey, numMoney, isPaidForKpi, excludeEventFromKpis } from '../services/eventKpi';

/** כשמספר הרשומות בענן לא גדול מהמקומי — לא מחליפים רשימה שלמה (הענן עלול להיות ישן ולדרוס עריכה). רק מוסיפים שורות חדשות לפי id (למשל אירוע מהפורטל). */
function mergeNewRowsFromCloud<T extends { id: string }>(local: T[], cloud: T[]): T[] {
  const localIds = new Set(local.map((e) => e.id));
  const newOnes = cloud.filter((e) => !localIds.has(e.id));
  if (newOnes.length === 0) return local;
  return [...newOnes, ...local];
}

/** איחוד ענן + מקומי: כל מה שבענן + מה שיש רק מקומית; אם אותו id — נתוני המקומי דורסים (שינויים אחרונים בדפדפן). מונע החלפת רשימה מלאה כשהענן "גדול יותר" ואיבוד אירועים מקומיים. */
function mergeUnionCloudWithLocalOverlay<T extends { id: string }>(local: T[], cloud: T[]): T[] {
  const byId = new Map<string, T>();
  for (const e of cloud) byId.set(e.id, e);
  for (const e of local) {
    const cur = byId.get(e.id);
    byId.set(e.id, cur ? ({ ...cur, ...e } as T) : e);
  }
  return Array.from(byId.values());
}

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
  handlePublicBookingSubmit: (data: any, leadId?: string, customerId?: string) => Promise<{ eventId: string; customerId: string }>;
  sendBookingEmail: (leadId: string) => Promise<{ success: boolean; email: string; url: string }>;
  sendPortalEmail: (leadId: string) => Promise<{ success: boolean; email: string; url: string }>;
  sendEventUpdateEmail: (event: AppEvent) => Promise<void>;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  updateTaskProgress: (id: string, progress: number) => void;
  deleteTask: (id: string) => void;
  importEvents: (data: any[]) => void;
  /** שורות CSV עם Item ID + תאריך תשלום — מעדכן אירועים לפי externalId */
  applyPaymentDatesFromImport: (rows: Record<string, unknown>[]) => number;
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
  uploadAllToCloud: () => Promise<{ success: boolean; message: string }>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

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
    { id: 'f_invoice_name', type: 'text', label: 'שם לחשבונית', required: false, mapping: 'invoiceName', placeholder: 'אם שונה משם המזמין, כתבו ע"ש מי להפיק' },
    { id: 'f2', type: 'tel', label: 'טלפון נייד (זמין באירוע)', required: true, mapping: 'phone', placeholder: '050-0000000' },
    { id: 'f3', type: 'email', label: 'כתובת דוא"ל לקבלת אישור', required: true, mapping: 'email', placeholder: 'user@example.com' },
    { id: 'f9', type: 'select', label: 'סוג התוכנית המבוקשת', required: true, mapping: 'eventType', options: Object.values(EventType).filter(v => v !== EventType.ClickForYouAurim) },
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

  // Fire-and-forget cloud sync helper – never blocks the UI
  const cloudSync = <T,>(fn: () => Promise<T>) => {
    fn().catch(err => console.warn('☁️ sync:', (err as Error).message));
  };

  const loadFromStorage = async () => {
    console.log('💾 טוען נתונים מ-localStorage...');
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setEvents(parsed.events || []);
      setCustomers(parsed.customers || []);
      setLeads(parsed.leads || []);
      setTasks(parsed.tasks || []);
      if (parsed.settings) setSettings(parsed.settings);
      if (parsed.customForms?.length) setCustomForms(parsed.customForms);
      console.log('✅ נתונים נטענו מ-localStorage:', {
        events: parsed.events?.length || 0,
        customers: parsed.customers?.length || 0,
        leads: parsed.leads?.length || 0,
        tasks: parsed.tasks?.length || 0
      });
    } else {
      setEvents(mockEvents);
      setCustomers(mockCustomers);
      setLeads(mockLeads);
      setTasks(mockTasks);
    }

    const savedActivities = localStorage.getItem('ME_CFM_ACTIVITIES_V1');
    if (savedActivities) {
      try {
        const parsed = JSON.parse(savedActivities);
        setActivities(parsed.activities || []);
      } catch (e) {
        console.error('שגיאה בטעינת Activities');
      }
    }

    setIsLoaded(true);

    // Load activities from cloud
    settingsService.get().then(s => {
      if (s?.data?.activities && Array.isArray(s.data.activities) && s.data.activities.length > 0) {
        setActivities(s.data.activities.map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) })));
      }
    }).catch(() => {});

    // Try to load from cloud (non-blocking); only replace local data if cloud has MORE records
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      const local = savedData ? JSON.parse(savedData) : {};
      const localCounts = {
        events: (local.events || []).length,
        customers: (local.customers || []).length,
        leads: (local.leads || []).length,
        tasks: (local.tasks || []).length,
      };

      const [cloudEvents, cloudCustomers, cloudLeads, cloudTasks] = await Promise.all([
        eventsService.getAll(),
        customersService.getAll(),
        leadsService.getAll(),
        tasksService.getAll(),
      ]);

      console.log('☁️ נטען מהענן:', { events: cloudEvents.length, customers: cloudCustomers.length, leads: cloudLeads.length, tasks: cloudTasks.length });
      console.log('💾 מקומי:', localCounts);

      const localEvents = local.events || [];
      const localCust = local.customers || [];
      const localLeadsArr = local.leads || [];
      const localTasksArr = local.tasks || [];

      if (cloudEvents.length > 0) {
        if (cloudEvents.length > localCounts.events) {
          setEvents(mergeUnionCloudWithLocalOverlay(localEvents as AppEvent[], cloudEvents as AppEvent[]));
        } else {
          setEvents(mergeNewRowsFromCloud(localEvents, cloudEvents));
        }
      }
      if (cloudCustomers.length > 0) {
        if (cloudCustomers.length > localCounts.customers) setCustomers(cloudCustomers);
        else setCustomers(mergeNewRowsFromCloud(localCust, cloudCustomers));
      }
      if (cloudLeads.length > 0) {
        if (cloudLeads.length > localCounts.leads) setLeads(cloudLeads);
        else setLeads(mergeNewRowsFromCloud(localLeadsArr, cloudLeads));
      }
      if (cloudTasks.length > 0) {
        if (cloudTasks.length > localCounts.tasks) setTasks(cloudTasks);
        else setTasks(mergeNewRowsFromCloud(localTasksArr, cloudTasks));
      }

    } catch (err) {
      console.warn('☁️ שגיאה בטעינה מהענן, ממשיך עם localStorage:', (err as Error).message);
    }
  };

  useEffect(() => {
    void loadFromStorage();
  }, []);

  // Auto-sync from cloud every 30 seconds (disabled on public pages like /book and /portal)
  useEffect(() => {
    if (!isLoaded) return;
    const isPublicPage = window.location.hash.startsWith('#/book') || window.location.hash.startsWith('#/portal') || window.location.hash.startsWith('#/add-event');
    if (isPublicPage) return;

    const syncFromCloud = async () => {
      const currentHash = window.location.hash;
      if (currentHash.startsWith('#/book') || currentHash.startsWith('#/portal') || currentHash.startsWith('#/add-event')) return;
      try {
        const [cloudEvents, cloudCustomers, cloudLeads, cloudTasks] = await Promise.all([
          eventsService.getAll(),
          customersService.getAll(),
          leadsService.getAll(),
          tasksService.getAll(),
        ]);
        // אל תדרוס רשימה שלמה כשאותו אורך — הענן עלול להיות לפני commit; רק אם יש יותר שורות בענן או מזג ids חדשים
        setCustomers((prev) => {
          if (cloudCustomers.length === 0) return prev;
          if (cloudCustomers.length > prev.length) return mergeUnionCloudWithLocalOverlay(prev, cloudCustomers);
          return mergeNewRowsFromCloud(prev, cloudCustomers);
        });
        setEvents((prev) => {
          if (cloudEvents.length === 0) return prev;
          if (cloudEvents.length > prev.length) return mergeUnionCloudWithLocalOverlay(prev, cloudEvents);
          return mergeNewRowsFromCloud(prev, cloudEvents);
        });
        setLeads((prev) => {
          if (cloudLeads.length === 0) return prev;
          if (cloudLeads.length > prev.length) return mergeUnionCloudWithLocalOverlay(prev, cloudLeads);
          return mergeNewRowsFromCloud(prev, cloudLeads);
        });
        setTasks((prev) => {
          if (cloudTasks.length === 0) return prev;
          if (cloudTasks.length > prev.length) return mergeUnionCloudWithLocalOverlay(prev, cloudTasks);
          return mergeNewRowsFromCloud(prev, cloudTasks);
        });

        // Sync activities from cloud settings
        const cloudSettings = await settingsService.get();
        if (cloudSettings?.data?.activities?.length > 0) {
          setActivities(cloudSettings.data.activities.map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) })));
        }
      } catch {
        // silent fail - no network or function error
      }
    };
    const interval = setInterval(syncFromCloud, 30000);
    return () => clearInterval(interval);
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    
    const autoRefresh = () => {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        const currentEventsCount = events.length;
        const newEventsCount = parsed.events?.length || 0;
        
        if (newEventsCount > currentEventsCount) {
          console.log('🔄 נתונים חדשים זוהו! מעדכן...');
          setEvents(parsed.events || []);
          setCustomers(parsed.customers || []);
          setLeads(parsed.leads || []);
          setTasks(parsed.tasks || []);
        }
      }
    };
    
    const interval = setInterval(autoRefresh, 10000);
    return () => clearInterval(interval);
  }, [isLoaded, events.length]);

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

  /** גיבוי JSON מלא לשדה settings בענן (מוגבל ~750KB) — שחזור בדשבורד: "שחזר מענן" */
  useEffect(() => {
    if (!isLoaded) return;
    const CLOUD_BACKUP_MAX = 750_000;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw || raw.length > CLOUD_BACKUP_MAX) {
            if (raw && raw.length > CLOUD_BACKUP_MAX) {
              console.warn('גיבוי מלא לענן דולג: הקובץ גדול מדי. הורידו גיבוי ידני.');
            }
            return;
          }
          const s = await settingsService.get();
          const currentData = { ...(s?.data || {}) };
          currentData.fullStorageBackup = raw;
          currentData.fullStorageBackupAt = new Date().toISOString();
          await settingsService.update({ data: currentData });
        } catch (e) {
          console.warn('גיבוי לענן (הגדרות):', (e as Error).message);
        }
      })();
    }, 120_000);
    return () => clearTimeout(t);
  }, [events, customers, leads, tasks, settings, customForms, isLoaded]);

  useEffect(() => {
    if (isLoaded && activities.length > 0) {
      localStorage.setItem('ME_CFM_ACTIVITIES_V1', JSON.stringify({ activities }));
      // Sync activities to cloud settings
      settingsService.get().then(s => {
        const currentData = s?.data || {};
        settingsService.update({ data: { ...currentData, activities } }).catch(() => {});
      }).catch(() => {});
    }
  }, [activities, isLoaded]);

  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      if (now.getHours() === 23 && now.getMinutes() === 59) {
        console.log('🌙 איפוס יומי של פעילויות ב-23:59');
        setActivities([]);
        
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        setTasks(prev => prev.map(t => {
          if (t.dueDate === today && !t.isCompleted) {
            console.log(`📅 משימה "${t.title}" לא הושלמה, נדחית למחר`);
            return { ...t, dueDate: tomorrowStr };
          }
          return t;
        }));
      }
    };
    const interval = setInterval(checkMidnight, 60000);
    return () => clearInterval(interval);
  }, []);

  const addActivity = (type: Activity['type'], message: string) => {
    setActivities(prev => [{ id: Date.now().toString(), type, message, timestamp: new Date() }, ...prev].slice(0, 15));
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...newSettings };
      cloudSync(() => settingsService.update(next));
      return next;
    });
  };

  const handlePublicBookingSubmit = async (data: any, leadId?: string, customerId?: string) => {
    console.log('🎯 handlePublicBookingSubmit נקרא עם הנתונים:', data, 'leadId:', leadId, 'customerId:', customerId);

    // =========================================================================
    // הגנה מפני כפילויות (מונע מקרים כמו "גלים תיירות 3311 אירועים"):
    // 1) אם כבר קיים אירוע עם אותו טלפון + תאריך + שעת התחלה → מחזירים אותו
    // 2) אם אותו טלפון שלח טופס בדקה האחרונה → דחייה (anti-spam / double-click)
    // =========================================================================
    const normPhone = String(data.phone || '').replace(/[^0-9]/g, '');
    const dateKey = data.date || new Date().toISOString().split('T')[0];
    const startKey = data.startTime || '10:00';

    if (normPhone) {
      // 1) כפילות תוכן: אותו טלפון + אותו תאריך + אותה שעת התחלה
      const dup = events.find(e =>
        String(e.phone || '').replace(/[^0-9]/g, '') === normPhone &&
        e.date === dateKey &&
        (e.startTime || '10:00') === startKey
      );
      if (dup) {
        console.warn('🛑 כפילות זוהתה — מחזיר את האירוע הקיים במקום ליצור חדש:', dup.id);
        addActivity('system', `נחסמה כפילות הזמנה מהפורטל (טלפון ${normPhone} בתאריך ${dateKey}) — האירוע הקיים: ${dup.id}`);
        return { eventId: dup.id, customerId: dup.customerId };
      }

      // 2) הגנת קצב: אותו טלפון לא יכול לשלוח שוב תוך 60 שניות
      try {
        const RATE_KEY = 'ME_CFM_BOOKING_RATE_V1';
        const rateRaw = localStorage.getItem(RATE_KEY);
        const rate: Record<string, number> = rateRaw ? JSON.parse(rateRaw) : {};
        const now = Date.now();
        const last = rate[normPhone] || 0;
        if (now - last < 60_000) {
          console.warn('🛑 הגנת קצב: שליחה כפולה תוך פחות מדקה — נדחה');
          throw new Error('כבר שלחתם הזמנה לפני רגע. אנא המתינו דקה ונסו שוב אם צריך.');
        }
        rate[normPhone] = now;
        // ניקוי ערכים ישנים (>24 שעות)
        for (const k of Object.keys(rate)) {
          if (now - rate[k] > 24 * 60 * 60 * 1000) delete rate[k];
        }
        localStorage.setItem(RATE_KEY, JSON.stringify(rate));
      } catch (e) {
        if (e instanceof Error && e.message.includes('המתינו')) throw e;
        // localStorage לא זמין — ממשיכים בלי הגנת קצב
      }
    }

    let finalCustomerId = customerId;
    if (!customerId && !leadId && data.name && data.phone) {
      // אם כבר קיים לקוח עם אותו טלפון — נשתמש בו במקום ליצור כפילות
      const existingCustomer = customers.find(c =>
        String(c.phone || '').replace(/[^0-9]/g, '') === normPhone
      );
      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        console.log('♻️ נמצא לקוח קיים לפי טלפון — לא נוצר חדש:', existingCustomer.id);
      } else {
        const newCustomer: Customer = {
          id: `c_${Date.now()}`,
          name: data.name,
          phone: data.phone,
          email: data.email || '',
        };
        await customersService.create(newCustomer);
        finalCustomerId = newCustomer.id;
        setCustomers((prev) => [newCustomer, ...prev]);
        console.log('👤 לקוח חדש נוצר בענן:', newCustomer);
      }
    }

    const newEventId = `e_${Date.now()}`;
    const event: AppEvent = {
      id: newEventId,
      customerId: finalCustomerId || '',
      /* כותרת נקייה — בלי "הזמנה מפורטל" שמבלבל בכרטיס ובמיילים */
      title: `אירוע – ${data.name || 'לקוח'}`,
      externalId: `H-${newEventId.replace(/^e_/, '')}`,
      date: data.date || new Date().toISOString().split('T')[0],
      startTime: data.startTime || '10:00',
      endTime: data.endTime || '11:30',
      amount: Number(data.amount || 0),
      paidAmount: 0,
      status: EventStatus.Booked,
      paymentStatus: PaymentStatus.NotPaid,
      eventType: data.eventType || EventType.ClickersProgram,
      location: data.location || '',
      tag: finalCustomerId ? 'קליכיף' : 'לבדיקה',
      phone: data.phone || '',
      email: data.email || '',
      clickersNeeded: Number(data.clickersNeeded || 0),
      notes: data.notes || '',
      hebrewDate: data.hebrewDate || '',
      invoiceName: data.invoiceName || '',
    };

    await eventsService.create(event);
    console.log('📅 אירוע נשמר בענן:', event.id);
    setEvents((prev) => [event, ...prev]);
    addActivity('system', `הזמנה חדשה התקבלה מהפורטל - ${data.name}`);
    
    const toEmail = (data.email || '').trim();
    if (toEmail) {
      const d = event.date.replace(/-/g, '');
      const start = `${d}T${(event.startTime || '10:00').replace(':', '')}00`;
      const end = `${d}T${(event.endTime || '12:00').replace(':', '')}00`;
      const calTitle = encodeURIComponent(`אירוע קליכיף – ${data.name || 'הזמנה'}`);
      const hebrewDateInfo = event.hebrewDate ? `\nתאריך עברי: ${event.hebrewDate}` : '';
      const calDetails = encodeURIComponent(`הזמנה דרך פורטל קליכיף${hebrewDateInfo}\nמיקום: ${event.location || '-'}\nטלפון: ${event.phone || '-'}\nאימייל: ${event.email || '-'}\nקליקרים: ${event.clickersNeeded || 0}\nלשאלות: ${settings.contactPhone}`);
      const calLocation = encodeURIComponent(event.location || '');
      const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}&dates=${start}/${end}&details=${calDetails}&location=${calLocation}`;
      
      // יומן עברי - הבריכה (Hebcal)
      const hebcalUrl = `https://www.hebcal.com/converter?gd=${event.date.split('-')[2]}&gm=${event.date.split('-')[1]}&gy=${event.date.split('-')[0]}&g2h=1`;
      const { success, error, hint } = await sendEmail({
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
                  ${event.invoiceName ? `<tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">🧾 שם לחשבונית:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; border-bottom: 1px solid #e2e8f0;">${event.invoiceName}</td></tr>` : ''}
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

              <div style="background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: white; margin: 0 0 16px; font-size: 18px; font-weight: 800; line-height: 1.6;">✨ זה הזמן להתקדם לשלב הכנת החידון שלכם!</p>
                <p style="color: white; margin: 0 0 20px; font-size: 15px; font-weight: 600; opacity: 0.95;">לחצו על הכפתור להמשך מרגש 🎉</p>
                <a href="https://myecrm2026.netlify.app/#/portal/${leadId || finalCustomerId || event.id}?step=1" style="display: inline-block; background: white; color: #8b5cf6; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 19px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); transition: all 0.3s;">🎯 כניסה לפורטל האישי שלכם ←</a>
              </div>

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
      else addActivity('email', `שליחת מייל נכשלה: ${formatSendEmailError(error, hint)}`);
    }

    const adminEmail = userEmail || 'c3834000@gmail.com';
    const addEventUrl = `https://myecrm2026.netlify.app/#/add-event?data=${encodeURIComponent(JSON.stringify({
      id: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      phone: event.phone,
      email: event.email,
      location: event.location,
      amount: event.amount,
      clickersNeeded: event.clickersNeeded,
      eventType: event.eventType,
      hebrewDate: event.hebrewDate,
      notes: event.notes,
      invoiceName: event.invoiceName,
      customerId: finalCustomerId
    }))}`;

    await sendEmail({
      to: adminEmail,
      subject: `🔔 הזמנה חדשה מהפורטל - ${data.name} - ${new Date(event.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`,
      html: `
        <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; border-radius: 20px;">
          <div style="background: white; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 50%; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; font-size: 32px;">🔔</div>
              <h1 style="color: #1a202c; font-size: 24px; margin: 0; font-weight: 800;">הזמנה חדשה מהפורטל!</h1>
              <p style="color: #ef4444; font-size: 14px; margin: 8px 0 0; font-weight: 700;">מס' הזמנה: #${event.id.substring(2, 15)}</p>
            </div>
            
            <div style="background: #fee2e2; border: 2px solid #ef4444; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <h2 style="color: #991b1b; font-size: 18px; margin: 0 0 16px; font-weight: 800; text-align: center;">📋 פרטי האירוע</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700; width: 35%;">👤 שם:</td><td style="padding: 8px; color: #1e293b; font-weight: 800;">${data.name || '-'}</td></tr>
                ${event.invoiceName ? `<tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">🧾 שם לחשבונית:</td><td style="padding: 8px; color: #1e293b; font-weight: 800;">${event.invoiceName}</td></tr>` : ''}
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">📞 טלפון:</td><td style="padding: 8px; color: #1e293b; font-weight: 700;">${data.phone || '-'}</td></tr>
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">📧 אימייל:</td><td style="padding: 8px; color: #1e293b; font-weight: 700;">${data.email || '-'}</td></tr>
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">📅 תאריך:</td><td style="padding: 8px; color: #1e293b; font-weight: 800;">${new Date(event.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
                ${event.hebrewDate ? `<tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">🗓️ תאריך עברי:</td><td style="padding: 8px; color: #1e293b; font-weight: 800;">${event.hebrewDate}</td></tr>` : ''}
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">⏰ שעות:</td><td style="padding: 8px; color: #1e293b; font-weight: 800;">${event.startTime} - ${event.endTime}</td></tr>
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">📍 מיקום:</td><td style="padding: 8px; color: #1e293b; font-weight: 700;">${event.location || '-'}</td></tr>
                <tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">🎯 סוג אירוע:</td><td style="padding: 8px; color: #1e293b; font-weight: 700;">${event.eventType}</td></tr>
                ${event.clickersNeeded > 0 ? `<tr><td style="padding: 8px; color: #7f1d1d; font-weight: 700;">🖱️ קליקרים:</td><td style="padding: 8px; color: #7c3aed; font-weight: 800; font-size: 16px;">${event.clickersNeeded}</td></tr>` : ''}
                <tr style="background: #dcfce7;"><td style="padding: 12px; color: #166534; font-weight: 700;">💰 סכום:</td><td style="padding: 12px; color: #166534; font-weight: 900; font-size: 20px;">₪${event.amount.toLocaleString()}</td></tr>
                ${event.notes ? `<tr><td colspan="2" style="padding: 12px; color: #92400e; background: #fef3c7; font-weight: 700;">📝 הערות: ${event.notes}</td></tr>` : ''}
              </table>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${addEventUrl}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 18px; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);">
                ➕ הוסף ללוח אירועים
              </a>
              <p style="color: #64748b; font-size: 12px; margin: 12px 0 0;">לחיצה על הכפתור תוסיף את האירוע אוטומטית למערכת</p>
            </div>
            
            <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; text-align: center; margin-top: 20px;">
              <p style="color: #475569; margin: 0; font-size: 12px;">הלקוח קיבל אישור למייל שלו</p>
            </div>
          </div>
        </div>
      `,
    });

    return { eventId: event.id, customerId: finalCustomerId || '' };
  };

  const buildPortalEmailHtml = (name: string, portalUrl: string, companyName: string, portalQuery: string) => {
    const BASE = 'https://myecrm2026.netlify.app/#';
    const availabilityUrl = `${BASE}/check-availability?${portalQuery}`;
    const klik4youUrl = `${BASE}/klik4you`;
    const bookUrl = `${BASE}/book?${portalQuery}`;
    const quizPreviewUrl = 'https://quikhiv-trivia.netlify.app/';

    const card = (num: string, badgeColor: string, icon: string, title: string, text: string, btnLabel: string, btnUrl: string, btnColor: string) => `
      <table cellpadding="0" cellspacing="0" width="208" style="display:inline-table;width:208px;vertical-align:top;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;margin:6px;box-shadow:0 6px 18px rgba(76,29,149,0.08);" dir="rtl">
        <tr><td style="padding:16px 14px 6px;text-align:center;">
          <span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background:${badgeColor};color:#ffffff;font-weight:900;font-size:15px;">${num}</span>
        </td></tr>
        <tr><td style="text-align:center;font-size:34px;padding:2px 14px;">${icon}</td></tr>
        <tr><td style="padding:6px 14px 0;text-align:center;">
          <p style="margin:0;color:#1e1b4b;font-weight:900;font-size:15px;line-height:1.4;">${title}</p>
        </td></tr>
        <tr><td style="padding:6px 14px 0;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;min-height:58px;">${text}</p>
        </td></tr>
        <tr><td style="padding:10px 14px 16px;text-align:center;">
          <a href="${btnUrl}" style="display:block;background:${btnColor};color:#ffffff;text-decoration:none;font-weight:900;font-size:13px;padding:12px 8px;border-radius:12px;">${btnLabel}</a>
        </td></tr>
      </table>`;

    const checkItem = (text: string) => `
      <tr>
        <td style="width:22px;vertical-align:top;padding:3px 0;"><span style="display:inline-block;width:18px;height:18px;line-height:18px;border-radius:50%;background:#4f46e5;color:#ffffff;font-size:11px;font-weight:900;text-align:center;">✓</span></td>
        <td style="padding:3px 8px 3px 0;color:#3730a3;font-size:12.5px;font-weight:700;line-height:1.5;">${text}</td>
      </tr>`;

    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef3ff;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff;padding:24px 8px;">
    <tr><td align="center">
      <table width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;background:#faf8ff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(54,28,119,0.16);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#ede9fe 0%,#e0e7ff 100%);padding:30px 24px 22px;text-align:center;">
          <p style="margin:0 0 4px;color:#6d28d9;font-weight:900;font-size:17px;">${companyName}</p>
          <p style="margin:0 0 14px;color:#8b5cf6;font-size:12px;font-weight:700;">חידונים · אירועים · קליקרים</p>
          <h1 style="margin:0 0 10px;color:#1e1b4b;font-size:26px;font-weight:900;line-height:1.35;">שמחים שבחרתם בנו<br/>לקראת הכנת האירוע שלכם</h1>
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
            שלום ${name},<br/>
            כאן תוכלו לבדוק זמינות ומחיר, למלא טופס הזמנה,<br/>או להיכנס לאתר הכנת החידון ולהתרשם מהאפשרויות.
          </p>
        </td></tr>

        <!-- 3 Cards -->
        <tr><td align="center" style="padding:18px 10px 8px;text-align:center;">
          ${card('1', '#2563eb', '🗓️', 'עדיין אין לכם מחיר או תאריך?', 'בדקו זמינות, בחרו תאריך ומספר משתתפים, וקבלו הערכת מחיר ראשונית.', 'בדיקת זמינות ומחיר', availabilityUrl, '#2563eb')}
          ${card('2', '#7c3aed', '📝', 'כבר קיבלתם מחיר ויש לכם תאריך?', 'מלאו את פרטי האירוע כדי שנוכל להתחיל בהכנה.', 'מילוי טופס הזמנת אירוע', bookUrl, '#7c3aed')}
          ${card('3', '#0d9488', '🎮', 'עדיין מתלבטים?', 'היכנסו לאתר הכנת החידון, ראו איך מכינים שאלות ותשובות ומה האפשרויות הקיימות.', 'כניסה לאתר הכנת החידון', quizPreviewUrl, '#0d9488')}
        </td></tr>

        <!-- Booking terms notice -->
        <tr><td style="padding:8px 24px 14px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:2px solid #fdba74;border-radius:18px;" dir="rtl">
            <tr><td style="padding:18px 20px;text-align:right;">
              <p style="margin:0 0 8px;color:#9a3412;font-weight:900;font-size:15px;">חשוב להסדרת ההזמנה</p>
              <p style="margin:0;color:#7c2d12;font-size:13px;line-height:1.7;font-weight:700;">
                כדי לשריין את האירוע באופן מסודר, חובה למלא את טופס הזמנת האירוע ולאשר את תנאי ההזמנה.
                במידה והאירוע מתקדם ללא מילוי הטופס, המשך התהליך וקיום האירוע ייחשבו כאישור מצד המזמין לתנאי ההזמנה.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Klik4You Box -->
        <tr><td style="padding:14px 18px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:18px;" dir="rtl">
            <tr><td style="padding:20px 22px 6px;">
              <p style="margin:0 0 8px;color:#312e81;font-weight:900;font-size:17px;">קליק פור יו — ערכת קליקרים להפעלה עצמית</p>
              <p style="margin:0 0 12px;color:#4338ca;font-size:13px;line-height:1.7;">
                מתאים לאירועים שבהם אין צורך במנחה. אנחנו שולחים אליכם ערכת קליקרים מוכנה,
                אתם מפעילים את החידון בעצמכם עם ציוד מקצועי, והערכה חוזרת אלינו לאחר האירוע.
              </p>
              <table cellpadding="0" cellspacing="0" dir="rtl">
                ${checkItem('מתאים לימי גיבוש, ימי כיף ואירועים משפחתיים')}
                ${checkItem('כולל קליקרים לפי מספר המשתתפים')}
                ${checkItem('כולל מערכת לניהול החידון')}
                ${checkItem('ניתן להכין שאלות ותשובות מראש')}
                ${checkItem('מחזירים את הערכה לאחר האירוע')}
              </table>
            </td></tr>
            <tr><td align="center" style="padding:12px 22px 20px;">
              <a href="${klik4youUrl}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:900;font-size:14px;padding:13px 44px;border-radius:12px;">לפרטים על קליק פור יו</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Personal portal link -->
        <tr><td style="padding:10px 24px 18px;text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;background:#ffffff;border:2px solid #7c3aed;color:#6d28d9;text-decoration:none;font-weight:900;font-size:14px;padding:12px 36px;border-radius:12px;">✨ כניסה לפורטל האישי שלכם</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:18px 24px;text-align:center;">
          <p style="margin:0 0 5px;color:#4c1d95;font-weight:900;font-size:15px;">${companyName}</p>
          <p style="margin:0;color:#64748b;font-size:12px;">המייל הזה נשלח אוטומטית — אין צורך להשיב</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  };

  const sendPortalEmail = async (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error('הליד לא נמצא');

    const portalUrl = `https://myecrm2026.netlify.app/#/portal/${leadId}`;
    const toEmail = (lead.email || '').trim();
    if (!toEmail) throw new Error('לא הוגדר מייל לליד — יש למלא שדה אימייל לפני שליחת הפורטל.');
    const { success, error, hint } = await sendEmail({
      to: toEmail,
      subject: `הוזמנת לחוות את תוכניות ${settings.companyName} 🎯`,
      html: buildPortalEmailHtml(lead.name, portalUrl, settings.companyName, `leadId=${encodeURIComponent(leadId)}`),
    });
    if (!success) throw new Error(formatSendEmailError(error, hint));
    addActivity('email', `מייל עם קישור לפורטל נשלח ל-${lead.name} (${toEmail})`);
    return { success: true, email: toEmail, url: portalUrl };
  };

  const addEvent = (event: AppEvent) => {
    setEvents(prev => [event, ...prev]);
    cloudSync(() => eventsService.create(event));
    console.log('✅ אירוע נוסף:', event.title);
  };
  const updateEventStatus = (id: string, status: EventStatus) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    cloudSync(() => eventsService.update(id, { status }));
  };
  const updateEvent = (id: string, updates: Partial<AppEvent>) => {
    const event = events.find(e => e.id === id);
    if (event && updates.paymentStatus && updates.paymentStatus !== event.paymentStatus) {
      addActivity('system', `סטטוס אירוע עודכן: ${event.title} - ${updates.paymentStatus}`);
    }
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, ...updates };
      const isPaidStatus = [PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck, PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider].includes(updated.paymentStatus);
      if (isPaidStatus && updates.paymentStatus && updated.paidAmount < updated.amount) {
        updated.paidAmount = updated.amount;
      }
      return updated;
    }));
    cloudSync(() => eventsService.update(id, updates));
  };
  const deleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    cloudSync(() => eventsService.delete(id));
  };
  const addCustomer = (customer: Customer) => {
    setCustomers(prev => [...prev, customer]);
    cloudSync(() => customersService.create(customer));
    addActivity('system', `לקוח חדש נוסף: ${customer.name}`);
  };
  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    cloudSync(() => customersService.update(id, updates));
  };
  const getCustomerById = (id: string) => customers.find(c => c.id === id);
  const addLead = (lead: Lead) => {
    const stamped: Lead = { ...lead, lastUpdatedAt: lead.lastUpdatedAt || new Date().toISOString() };
    setLeads(prev => [...prev, stamped]);
    cloudSync(() => leadsService.create(stamped));
    addActivity('system', `ליד חדש נוסף: ${lead.name}`);
  };
  const updateLeadStatus = (id: string, status: LeadStatus) => {
    const patch = { status, lastUpdatedAt: new Date().toISOString() };
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    cloudSync(() => leadsService.update(id, patch));
  };
  const updateLead = (id: string, updates: Partial<Lead>) => {
    const patch = { ...updates, lastUpdatedAt: new Date().toISOString() };
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    cloudSync(() => leadsService.update(id, patch));
  };
  const convertLeadToCustomer = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const newCustomer: Customer = { id: `c_${Date.now()}`, name: lead.name, phone: lead.phone, email: lead.email || '', notes: `הגיע מליד` };
    setCustomers(prev => [...prev, newCustomer]);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: LeadStatus.Converted } : l));
    cloudSync(() => customersService.create(newCustomer));
    cloudSync(() => leadsService.update(leadId, { status: LeadStatus.Converted }));
    addActivity('system', `ליד ${lead.name} הומר ללקוח בהצלחה`);
  };
  const addTask = (task: Task) => {
    setTasks(prev => [task, ...prev]);
    cloudSync(() => tasksService.create(task));
    addActivity('system', `משימה חדשה נוספה: ${task.title}`);
  };
  const updateTask = (id: string, updates: Partial<Task>) => {
    const task = tasks.find(t => t.id === id);
    if (task && updates.isCompleted !== undefined && updates.isCompleted !== task.isCompleted) {
      addActivity('system', `משימה ${updates.isCompleted ? 'הושלמה' : 'בוטלה'}: ${task.title}`);
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    cloudSync(() => tasksService.update(id, updates));
  };
  const toggleTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      const newIsCompleted = !task.isCompleted;
      addActivity('system', `משימה ${newIsCompleted ? 'הושלמה' : 'בוטלה'}: ${task.title}`);
      cloudSync(() => tasksService.update(id, { isCompleted: newIsCompleted, progress: newIsCompleted ? 100 : 0 }));
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted, progress: !t.isCompleted ? 100 : 0 } : t));
  };
  const updateTaskProgress = (id: string, progress: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, progress, isCompleted: progress === 100 } : t));
    cloudSync(() => tasksService.update(id, { progress, isCompleted: progress === 100 }));
  };
  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    cloudSync(() => tasksService.delete(id));
  };
  const syncAllEventsWithCustomers = () => {
    addActivity('sync', 'סנכרון גלובלי של לקוחות ואירועים בוצע');
  };
  const sendBookingEmail = async (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return { success: false, email: '', url: '' };
    const bookUrl = `https://myecrm2026.netlify.app/#/book?leadId=${leadId}`;
    const toEmail = (lead.email || '').trim();
    if (toEmail) {
      const { success, error, hint } = await sendEmail({
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
      if (!success) throw new Error(formatSendEmailError(error, hint));
    }
    return { success: true, email: toEmail, url: bookUrl };
  };
  const syncRemoteBookings = async () => 0;
  const toggleIntegration = async (service: any) => {
    setIntegrations(prev => ({ ...prev, [service === 'google' ? 'googleCalendar' : 'outlookCalendar']: !prev[service === 'google' ? 'googleCalendar' : 'outlookCalendar'] }));
    return true;
  };
  const addCustomForm = (f: any) => {
    setCustomForms(prev => [...prev, f]);
    cloudSync(() => formsService.create(f));
  };
  const updateCustomForm = (id: string, u: any) => {
    setCustomForms(prev => prev.map(f => f.id === id ? { ...f, ...u } : f));
    cloudSync(() => formsService.update(id, u));
  };
  const deleteCustomForm = (id: string) => {
    setCustomForms(prev => prev.filter(f => f.id !== id));
    cloudSync(() => formsService.delete(id));
  };
  const getFormById = (id: string) => customForms.find(f => f.id === id);

  const importLeads = (data: Lead[]) => {
    const withIds = data.map(l => (l.id ? l : { ...l, id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` }));
    setLeads(prev => [...withIds, ...prev]);
    cloudSync(() => leadsService.bulkInsert(withIds));
  };

  const sendPortalEmailForCustomer = async (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) throw new Error('הלקוח לא נמצא');
    const portalUrl = `https://myecrm2026.netlify.app/#/portal/${customerId}`;
    const toEmail = (customer.email || '').trim();
    if (!toEmail) throw new Error('לא הוגדר מייל ללקוח — יש למלא אימייל בכרטיס הלקוח לפני שליחת הפורטל.');
    const { success, error, hint } = await sendEmail({
      to: toEmail,
      subject: `הוזמנת לחוות את תוכניות ${settings.companyName} 🎯`,
      html: buildPortalEmailHtml(customer.name, portalUrl, settings.companyName, `customerId=${encodeURIComponent(customerId)}`),
    });
    if (!success) throw new Error(formatSendEmailError(error, hint));
    addActivity('email', `מייל פורטל נשלח ללקוח ${customer.name} (${toEmail})`);
    return { success: true, email: toEmail, url: portalUrl };
  };

  const sendEventUpdateEmail = async (event: AppEvent) => {
    const toEmail = (event.email || getCustomerById(event.customerId)?.email || '').trim();
    if (!toEmail) return;
    const custName = getCustomerById(event.customerId)?.name || event.title;
    const portalLink = event.customerId ? `<div style="background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%); border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;"><p style="color: white; margin: 0 0 12px; font-size: 16px; font-weight: 700;">✨ זה הזמן להתקדם לשלב הכנת החידון שלכם!</p><a href="https://myecrm2026.netlify.app/#/portal/${event.customerId}?step=1" style="display: inline-block; background: white; color: #8b5cf6; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 900; font-size: 17px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">🎯 כניסה לפורטל האישי שלכם ←</a></div>` : '';
    await sendEmail({
      to: toEmail,
      subject: `עדכון באירוע - ${settings.companyName}`,
      html: `<div dir="rtl" style="font-family: Heebo, sans-serif; max-width: 600px; margin: 0 auto;"><p>שלום ${custName},</p><p>מעדכנים אותך כי בוצע עדכון באירוע שלך.</p><p><strong>תאריך:</strong> ${event.date} | <strong>שעה:</strong> ${event.startTime}–${event.endTime}</p><p><strong>מיקום:</strong> ${event.location || '-'}</p>${portalLink}<p>לשאלות: ${settings.contactPhone}</p><p>בברכה,<br/>${settings.companyName}</p></div>`,
    });
    addActivity('email', `הודעת עדכון אירוע נשלחה ל-${toEmail}`);
  };

  const norm = (s: string) => (s || '').trim().toLowerCase();

  const pick = (row: any, ...keys: string[]) => { for (const k of keys) { const v = row[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return ''; };
  const parseDate = (s: string) => { if (!s) return new Date().toISOString().split('T')[0]; const d = String(s).trim(); const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; if (d.match(/^\d{4}-\d{2}-\d{2}/)) return d.slice(0,10); return new Date().toISOString().split('T')[0]; };

  const applyPaymentDatesFromImport = (rows: Record<string, unknown>[]): number => {
    const updates = buildPaymentDateUpdates(events, rows as Record<string, string>[]);
    if (updates.length === 0) return 0;
    const map = new Map(updates.map(u => [u.id, u.paymentDate]));
    setEvents(prev => prev.map(e => {
      const pd = map.get(e.id);
      return pd ? { ...e, paymentDate: pd } : e;
    }));
    updates.forEach(u => cloudSync(() => eventsService.update(u.id, { paymentDate: u.paymentDate })));
    addActivity('system', `עודכנו תאריכי תשלום ל-${updates.length} אירועים מקובץ`);
    return updates.length;
  };

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
      const invoiceName = pick(row, 'שם לחשבונית', 'invoiceName', 'invoice_name');
      const title = name || pick(row, 'title', 'Title') || invoiceName || 'אירוע';
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
        invoiceName: invoiceName || undefined,
        hebrewDate: pick(row, 'תאריך אירוע עברי', 'תאריך עברי', 'hebrewDate'),
        notes: pick(row, 'הערות', 'notes'),
        externalId: pick(row, 'Item ID', 'Item ID (auto generated)', 'externalId', 'id', 'ID'),
        paymentMethod: Object.values(PaymentMethod).find(v => v === pick(row, 'אופן תשלום', 'paymentMethod')) || undefined,
        termsAccepted: /כן|אני מאשר|true|1/i.test(pick(row, 'אישור תנאי הזמנה', 'termsAccepted')),
      });
    });
    if (newCusts.length) {
      setCustomers(prev => [...newCusts, ...prev]);
      cloudSync(() => customersService.bulkInsert(newCusts));
    }

    const existingIds = new Set(events.map(e => e.externalId).filter(Boolean));
    const uniqueNew = toAdd.filter(e => !e.externalId || !existingIds.has(e.externalId));
    setEvents(prev => [...uniqueNew, ...prev]);
    cloudSync(() => eventsService.bulkInsert(uniqueNew));

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
    cloudSync(() => customersService.bulkInsert(toAdd));
    addActivity('system', `יובאו ${toAdd.length} לקוחות`);
  };

  const parseDateField = (val: any): string | undefined => {
    if (!val) return undefined;
    const s = val.toString().trim();
    if (!s) return undefined;
    // Unix timestamp (seconds) - numbers like 1873644759
    if (/^\d{9,10}$/.test(s)) {
      const d = new Date(Number(s) * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // Unix timestamp (milliseconds) - 13 digits
    if (/^\d{13}$/.test(s)) {
      const d = new Date(Number(s));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    // Already a date string like 2025-01-14 or 2025-01-26 18:00
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return undefined;
  };

  const importTasks = (data: any[]) => {
    const toAdd: Task[] = data.map((row: any, i: number) => {
      const statusStr = (row.סטטוס ?? row.status ?? row.progress ?? '').toString();
      const progressNum = (() => { const m = statusStr.match(/(\d+)/); return m ? Number(m[1]) : 0; })();
      const isDone = /בוצע\s*100|הושלם|completed|כן/i.test(statusStr);
      const rawId = (row['Item ID (auto generated)'] ?? row['Item ID'] ?? row.id ?? '').toString().trim();
      return {
        id: rawId || `t_${Date.now()}_${i}`,
        title: (row.תיאור ?? row.title ?? row.Title ?? row.כותרת ?? '').toString().trim() || 'משימה',
        isCompleted: isDone,
        priority: [TaskPriority.Low, TaskPriority.Medium, TaskPriority.High][Number(row.עדיפות ?? row.priority ?? 1) - 1] ?? TaskPriority.Medium,
        category: (row.קטגוריה ?? row.category ?? 'כללי') as TaskCategory,
        estimatedTimeMin: Number(row['משך זמן משוער בדקות'] ?? row.estimatedTimeMin ?? row.זמן ?? 0) || 0,
        progress: isDone ? 100 : progressNum,
        dueDate: parseDateField(row['תאריך יעד'] ?? row.dueDate ?? row.תאריך_יעד),
      };
    });
    setTasks(prev => [...toAdd, ...prev]);
    cloudSync(() => tasksService.bulkInsert(toAdd));
    addActivity('system', `יובאו ${toAdd.length} משימות`);
  };

  useEffect(() => {
    let debt = 0, projected = 0, total = 0, reservedClickers = 0;
    const todayKey = todayDateKey();
    const dashboardYear = currentYearKey();

    events.forEach(ev => {
      const evYear = eventYearKey(ev);
      const incomeYear = incomeDateKey(ev)?.slice(0, 4);
      if (evYear !== dashboardYear && incomeYear !== dashboardYear) return;

      const paidAmt = numMoney(ev.paidAmount);
      if (incomeYear === dashboardYear) total += paidAmt;

      if (excludeEventFromKpis(ev)) return;
      if (evYear !== dashboardYear) return;

      const evKey = parseEventDateKey(ev.date);
      const isPastEvent = !!evKey && evKey < todayKey;
      const isFutureOrToday = !!evKey && evKey >= todayKey;

      const amt = numMoney(ev.amount);
      const balance = Math.max(0, amt - paidAmt);

      const isPaid = isPaidForKpi(ev.paymentStatus);

      if (isPastEvent && !isPaid && balance > 0) {
        debt += balance;
      }

      if (isFutureOrToday && !isPaid && balance > 0) {
        projected += balance;
      }

      if (isFutureOrToday) {
        reservedClickers += numMoney(ev.clickersNeeded);
      }
    });

    setKpis({ openDebt: debt, projectedIncome: projected, totalRevenue: total, availableClickers: 500 - reservedClickers });
  }, [events]);

  const uploadAllToCloud = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const results = { customers: 0, events: 0, leads: 0, tasks: 0 };
      if (customers.length > 0) { await customersService.bulkInsert(customers); results.customers = customers.length; }
      if (events.length > 0) { await eventsService.bulkInsert(events); results.events = events.length; }
      if (leads.length > 0) { await leadsService.bulkInsert(leads); results.leads = leads.length; }
      if (tasks.length > 0) { await tasksService.bulkInsert(tasks); results.tasks = tasks.length; }
      return { success: true, message: `הועלו: ${results.customers} לקוחות, ${results.events} אירועים, ${results.leads} לידים, ${results.tasks} משימות` };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  };

  return (
    <AppContext.Provider value={{ 
      userEmail, events, customers, leads, tasks, customForms, activities, settings, updateSettings, sendPortalEmailForCustomer, addEvent, updateEventStatus, updateEvent, deleteEvent,
      addCustomer, updateCustomer, getCustomerById, addLead, updateLeadStatus, updateLead, convertLeadToCustomer, handlePublicBookingSubmit,
      sendBookingEmail, sendPortalEmail, sendEventUpdateEmail, addTask, updateTask, toggleTask, updateTaskProgress, deleteTask, importEvents, applyPaymentDatesFromImport, importCustomers, importTasks, importLeads, kpis, integrations, toggleIntegration, syncRemoteBookings,
      addCustomForm, updateCustomForm, deleteCustomForm, getFormById, syncAllEventsWithCustomers, uploadAllToCloud
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
