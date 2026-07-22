
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

/** נרמול ערכים מיובאים / ישנים כדי שיופיעו בלוח ובסינונים */
function normalizeEventRecord<T extends { status?: string; paymentStatus?: string }>(ev: T): T {
  let paymentStatus = ev.paymentStatus;
  if (paymentStatus === 'לא שולם' || paymentStatus === 'לא שולם ') {
    paymentStatus = PaymentStatus.NotPaid;
  }
  return paymentStatus !== ev.paymentStatus ? { ...ev, paymentStatus } : ev;
}

/**
 * הענן הוא מקור האמת.
 * - לכל id שקיים בענן: נתוני הענן (מנורמלים)
 * - ids שקיימים רק מקומית: נשמרים זמנית (ויעלו לענן ברקע) כדי לא לאבד יצירה שעדיין לא הספיקה להישמר
 */
function applyCloudAsSourceOfTruth<T extends { id: string }>(
  local: T[],
  cloud: T[],
  normalize: (row: T) => T = (r) => r
): T[] {
  if (!cloud.length) return local.map(normalize);
  const byId = new Map<string, T>();
  for (const e of cloud) byId.set(e.id, normalize(e));
  for (const e of local) {
    if (!byId.has(e.id)) byId.set(e.id, normalize(e));
  }
  return Array.from(byId.values());
}

/**
 * "מצבות" (tombstones) של רשומות שנמחקו — נשמרות מקומית כדי שהסנכרון:
 * 1. לא יעלה מחדש לענן רשומה מקומית שכבר נמחקה.
 * 2. ימחק מהענן רשומה שמכשיר אחר החזיר בטעות.
 * כך מחיקה נשארת אמינה ועקבית ולא "מתחייה".
 */
const DELETED_IDS_KEY = 'crm_deleted_ids_v1';
type DeletedIdsKind = 'events' | 'customers' | 'leads' | 'tasks';
type DeletedIds = Record<DeletedIdsKind, string[]>;

function loadDeletedIds(): DeletedIds {
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    if (raw) {
      const p = JSON.parse(raw) || {};
      return {
        events: Array.isArray(p.events) ? p.events : [],
        customers: Array.isArray(p.customers) ? p.customers : [],
        leads: Array.isArray(p.leads) ? p.leads : [],
        tasks: Array.isArray(p.tasks) ? p.tasks : [],
      };
    }
  } catch (e) {
    console.warn('קריאת מצבות מחיקה נכשלה:', e);
  }
  return { events: [], customers: [], leads: [], tasks: [] };
}

function recordDeletedIds(kind: DeletedIdsKind, ids: Array<string | undefined | null>) {
  const clean = ids.filter((x): x is string => !!x);
  if (!clean.length) return;
  const cur = loadDeletedIds();
  const set = new Set(cur[kind]);
  clean.forEach((id) => set.add(id));
  // תקרה כדי שהמטמון לא יגדל ללא גבול
  cur[kind] = Array.from(set).slice(-3000);
  try {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(cur));
  } catch (e) {
    console.warn('שמירת מצבות מחיקה נכשלה:', e);
  }
}

/** נרמול טלפון להשוואת ליד↔לקוח (972… → 0…) */
function normalizePhoneKey(phone: string | undefined | null): string {
  let d = String(phone || '').replace(/[^0-9]/g, '');
  if (d.startsWith('972') && d.length >= 11) d = '0' + d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = '0' + d;
  return d;
}

function normalizeEmailKey(email: string | undefined | null): string {
  return String(email || '').trim().toLowerCase();
}

function normalizeNameKey(name: string | undefined | null): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
  /** מוחק לידים שכבר לקוחות / מילאו הזמנה — לפי טלפון, מייל או שם */
  cleanupConvertedLeads: () => Promise<number>;
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
  /** מוסיף משימות מוכנות (מדלג על כותרות שכבר קיימות). מחזיר כמה נוספו. */
  importTaskObjects: (tasks: Task[]) => number;
  importLeads: (data: Lead[]) => void;
  getCustomerById: (id: string) => Customer | undefined;
  syncAllEventsWithCustomers: () => void;
  syncRemoteBookings: () => Promise<number>;
  /** טעינה מחדש מהענן — הענן הוא מקור האמת */
  reloadFromCloud: () => Promise<void>;
  /** האם הסנכרון האחרון מהענן הצליח */
  cloudSyncOk: boolean;
  lastCloudSyncAt: string | null;
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
    { id: 'f_payment_date', type: 'date', label: 'תאריך תשלום מוסכם', required: true, mapping: 'paymentDate' },
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
  const [cloudSyncOk, setCloudSyncOk] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);

  // Fire-and-forget cloud sync helper – never blocks the UI
  const cloudSync = <T,>(fn: () => Promise<T>) => {
    fn().catch(err => console.warn('☁️ sync:', (err as Error).message));
  };

  /** מושך מהענן ומחיל כמקור אמת; מעלה לענן רשומות שקיימות רק מקומית */
  const pullCloudAsSourceOfTruth = async (localSnapshot?: {
    events: AppEvent[];
    customers: Customer[];
    leads: Lead[];
    tasks: Task[];
  }) => {
    const [cloudEvents, cloudCustomers, cloudLeads, cloudTasks] = await Promise.all([
      eventsService.getAll(),
      customersService.getAll(),
      leadsService.getAll(),
      tasksService.getAll(),
    ]);

    const localEvents = localSnapshot?.events ?? [];
    const localCust = localSnapshot?.customers ?? [];
    const localLeadsArr = localSnapshot?.leads ?? [];
    const localTasksArr = localSnapshot?.tasks ?? [];

    // מצבות מחיקה — רשומות שנמחקו לא יעלו מחדש ולא יוצגו
    const deleted = loadDeletedIds();
    const delEv = new Set(deleted.events);
    const delCust = new Set(deleted.customers);
    const delLead = new Set(deleted.leads);
    const delTask = new Set(deleted.tasks);

    const nextEvents = applyCloudAsSourceOfTruth(localEvents, cloudEvents as AppEvent[], normalizeEventRecord)
      .filter((e) => !delEv.has(e.id));
    const nextCustomers = applyCloudAsSourceOfTruth(localCust, cloudCustomers as Customer[])
      .filter((c) => !delCust.has(c.id));
    const nextLeads = applyCloudAsSourceOfTruth(localLeadsArr, cloudLeads as Lead[])
      .filter((l) => !delLead.has(l.id));
    const nextTasks = applyCloudAsSourceOfTruth(localTasksArr, cloudTasks as Task[])
      .filter((t) => !delTask.has(t.id));

    // אם מכשיר אחר החזיר רשומה שנמחקה — נמחק אותה שוב מהענן (המצבה גוברת)
    (cloudEvents as AppEvent[]).filter((e) => delEv.has(e.id)).forEach((e) => cloudSync(() => eventsService.delete(e.id)));
    (cloudCustomers as Customer[]).filter((c) => delCust.has(c.id)).forEach((c) => cloudSync(() => customersService.delete(c.id)));
    (cloudLeads as Lead[]).filter((l) => delLead.has(l.id)).forEach((l) => cloudSync(() => leadsService.delete(l.id)));
    (cloudTasks as Task[]).filter((t) => delTask.has(t.id)).forEach((t) => cloudSync(() => tasksService.delete(t.id)));

    // העלאת רשומות שקיימות רק מקומית — כדי שלא יישארו "תקועות" מחוץ לענן (ולא כאלה שנמחקו)
    const cloudEventIds = new Set((cloudEvents as AppEvent[]).map((e) => e.id));
    const localOnlyEvents = localEvents.filter((e) => e?.id && !cloudEventIds.has(e.id) && !delEv.has(e.id));
    if (localOnlyEvents.length > 0) {
      cloudSync(() => eventsService.bulkInsert(localOnlyEvents));
    }
    const cloudCustIds = new Set((cloudCustomers as Customer[]).map((c) => c.id));
    const localOnlyCust = localCust.filter((c) => c?.id && !cloudCustIds.has(c.id) && !delCust.has(c.id));
    if (localOnlyCust.length > 0) {
      cloudSync(() => customersService.bulkInsert(localOnlyCust));
    }
    const cloudLeadIds = new Set((cloudLeads as Lead[]).map((l) => l.id));
    const localOnlyLeads = localLeadsArr.filter((l) => l?.id && !cloudLeadIds.has(l.id) && !delLead.has(l.id));
    if (localOnlyLeads.length > 0) {
      cloudSync(() => leadsService.bulkInsert(localOnlyLeads));
    }
    const cloudTaskIds = new Set((cloudTasks as Task[]).map((t) => t.id));
    const localOnlyTasks = localTasksArr.filter((t) => t?.id && !cloudTaskIds.has(t.id) && !delTask.has(t.id));
    if (localOnlyTasks.length > 0) {
      cloudSync(() => tasksService.bulkInsert(localOnlyTasks));
    }

    if (cloudEvents.length > 0 || nextEvents.length > 0) setEvents(nextEvents);
    if (cloudCustomers.length > 0 || nextCustomers.length > 0) setCustomers(nextCustomers);
    if (cloudLeads.length > 0 || nextLeads.length > 0) setLeads(nextLeads);
    if (cloudTasks.length > 0 || nextTasks.length > 0) setTasks(nextTasks);

    setCloudSyncOk(true);
    setLastCloudSyncAt(new Date().toISOString());
    console.log('☁️ סנכרון הושלם (ענן = מקור אמת):', {
      events: nextEvents.length,
      customers: nextCustomers.length,
      leads: nextLeads.length,
      tasks: nextTasks.length,
      uploadedLocalOnly: {
        events: localOnlyEvents.length,
        customers: localOnlyCust.length,
        leads: localOnlyLeads.length,
        tasks: localOnlyTasks.length,
      },
    });
  };

  const loadFromStorage = async () => {
    console.log('💾 טוען מטמון מקומי ואז מסנכרן מהענן...');
    let localEvents: AppEvent[] = [];
    let localCust: Customer[] = [];
    let localLeadsArr: Lead[] = [];
    let localTasksArr: Task[] = [];

    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      localEvents = (parsed.events || []).map((e: AppEvent) => normalizeEventRecord(e));
      localCust = parsed.customers || [];
      localLeadsArr = parsed.leads || [];
      localTasksArr = parsed.tasks || [];
      setEvents(localEvents);
      setCustomers(localCust);
      setLeads(localLeadsArr);
      setTasks(localTasksArr);
      if (parsed.settings) setSettings(parsed.settings);
      if (parsed.customForms?.length) setCustomForms(parsed.customForms);
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

    settingsService.get().then(s => {
      if (s?.data?.activities && Array.isArray(s.data.activities) && s.data.activities.length > 0) {
        setActivities(s.data.activities.map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) })));
      }
    }).catch(() => {});

    try {
      await pullCloudAsSourceOfTruth({
        events: localEvents,
        customers: localCust,
        leads: localLeadsArr,
        tasks: localTasksArr,
      });
    } catch (err) {
      setCloudSyncOk(false);
      console.warn('☁️ שגיאה בטעינה מהענן, ממשיך עם מטמון מקומי:', (err as Error).message);
      if (!savedData) {
        setEvents(mockEvents);
        setCustomers(mockCustomers);
        setLeads(mockLeads);
        setTasks(mockTasks);
      }
    }
  };

  useEffect(() => {
    void loadFromStorage();
  }, []);

  const dataRef = useRef({ events, customers, leads, tasks });
  dataRef.current = { events, customers, leads, tasks };

  // סנכרון מהענן כל 20 שניות — הענן תמיד מקור האמת (לא בדפי פורטל ציבוריים)
  useEffect(() => {
    if (!isLoaded) return;
    const isPublicPage = () => {
      const h = window.location.hash;
      return h.startsWith('#/book') || h.startsWith('#/portal') || h.startsWith('#/add-event');
    };
    if (isPublicPage()) return;

    const syncFromCloud = async () => {
      if (isPublicPage()) return;
      try {
        await pullCloudAsSourceOfTruth(dataRef.current);
        const cloudSettings = await settingsService.get();
        if (cloudSettings?.data?.activities?.length > 0) {
          setActivities(cloudSettings.data.activities.map((a: any) => ({ ...a, timestamp: new Date(a.timestamp) })));
        }
      } catch {
        setCloudSyncOk(false);
      }
    };
    const interval = setInterval(syncFromCloud, 20000);
    return () => clearInterval(interval);
  }, [isLoaded]);

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
    // יצירת / איתור לקוח גם כשמגיעים מליד (leadId) — כדי שההזמנה תהפוך ללקוח והליד יימחק
    if (!finalCustomerId && data.name && data.phone) {
      const existingCustomer = customers.find(c =>
        normalizePhoneKey(c.phone) === normPhone && normPhone.length >= 9
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
          notes: leadId ? `הגיע מליד ${leadId}` : undefined,
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
      paymentDate: data.paymentDate || '',
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
                  ${event.paymentDate ? `<tr><td style="padding: 12px 16px; color: #475569; font-weight: 700; border-bottom: 1px solid #e2e8f0;">💳 תאריך תשלום מוסכם:</td><td style="padding: 12px 16px; color: #1e293b; font-weight: 800; border-bottom: 1px solid #e2e8f0;">${new Date(event.paymentDate).toLocaleDateString('he-IL')}</td></tr>` : ''}
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
                <a href="https://myecrm2026.netlify.app/#/portal/${finalCustomerId || leadId || event.id}?step=1" style="display: inline-block; background: white; color: #8b5cf6; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 19px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); transition: all 0.3s;">🎯 כניסה לפורטל האישי שלכם ←</a>
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

    // אחרי הזמנה — מוחקים לידים תואמים (לפי leadId / טלפון / מייל / שם)
    try {
      await removeLeadsMatchingContact({
        leadId,
        phone: data.phone,
        email: data.email,
        name: data.name,
      });
    } catch (e) {
      console.warn('ניקוי לידים אחרי הזמנה נכשל:', e);
    }

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
    // הבטחת מזהה ייחודי + externalId לכל אירוע — כולל כאלה שמגיעים מקישור במייל
    const id = event.id || `e_${Date.now()}`;
    const externalId = event.externalId || `H-${String(id).replace(/^e_/, '')}`;
    const stamped: AppEvent = { ...event, id, externalId };

    // הגנת כפילות: אותו מזהה / externalId, או אותו טלפון + תאריך + שעת התחלה
    const normPhone = String(stamped.phone || '').replace(/[^0-9]/g, '');
    const dup = events.find(e =>
      e.id === stamped.id ||
      (!!e.externalId && !!stamped.externalId && e.externalId === stamped.externalId) ||
      (!!normPhone && String(e.phone || '').replace(/[^0-9]/g, '') === normPhone &&
        e.date === stamped.date && (e.startTime || '') === (stamped.startTime || ''))
    );
    if (dup) {
      console.warn('🛑 אירוע כפול נחסם ב-addEvent — האירוע הקיים:', dup.id);
      addActivity('system', `נחסמה כפילות אירוע: ${stamped.title} (קיים כבר ${dup.id})`);
      return;
    }

    setEvents(prev => [stamped, ...prev]);
    cloudSync(() => eventsService.create(stamped));
    console.log('✅ אירוע נוסף:', stamped.title);
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
    recordDeletedIds('events', [id]);
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
    setLeads(prev => [stamped, ...prev]);
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

  /** מוחק לידים לפי מזהה או התאמת טלפון/מייל/שם */
  const removeLeadsMatchingContact = async (opts: {
    leadId?: string;
    phone?: string;
    email?: string;
    name?: string;
  }): Promise<number> => {
    const p = normalizePhoneKey(opts.phone);
    const em = normalizeEmailKey(opts.email);
    const n = normalizeNameKey(opts.name);
    const ids = new Set<string>();
    if (opts.leadId) ids.add(opts.leadId);
    for (const l of leads) {
      if (opts.leadId && l.id === opts.leadId) {
        ids.add(l.id);
        continue;
      }
      const lp = normalizePhoneKey(l.phone);
      const le = normalizeEmailKey(l.email);
      const ln = normalizeNameKey(l.name);
      if (p && lp && p === lp) ids.add(l.id);
      else if (em && le && em === le) ids.add(l.id);
      else if (n && ln && n === ln && n.length >= 2) ids.add(l.id);
    }
    if (ids.size === 0) return 0;
    recordDeletedIds('leads', Array.from(ids));
    setLeads(prev => prev.filter(l => !ids.has(l.id)));
    await Promise.all(
      Array.from(ids).map((id) =>
        leadsService.delete(id).catch((err) => console.warn('מחיקת ליד נכשלה:', id, err))
      )
    );
    return ids.size;
  };

  /** לידים שהפכו ללקוחות או שכבר יש להם הזמנה — נמחקים מהלוח */
  const cleanupConvertedLeads = async (): Promise<number> => {
    const phoneSet = new Set<string>();
    const emailSet = new Set<string>();
    const nameSet = new Set<string>();

    for (const c of customers) {
      const p = normalizePhoneKey(c.phone);
      if (p.length >= 9) phoneSet.add(p);
      const em = normalizeEmailKey(c.email);
      if (em) emailSet.add(em);
      const n = normalizeNameKey(c.name);
      if (n.length >= 2) nameSet.add(n);
    }
    for (const e of events) {
      const p = normalizePhoneKey(e.phone);
      if (p.length >= 9) phoneSet.add(p);
      const em = normalizeEmailKey(e.email);
      if (em) emailSet.add(em);
    }

    const toRemove = leads.filter((l) => {
      if (l.status === LeadStatus.Converted) return true;
      const p = normalizePhoneKey(l.phone);
      const em = normalizeEmailKey(l.email);
      const n = normalizeNameKey(l.name);
      if (p.length >= 9 && phoneSet.has(p)) return true;
      if (em && emailSet.has(em)) return true;
      if (n.length >= 2 && nameSet.has(n)) return true;
      return false;
    });

    if (toRemove.length === 0) return 0;

    const ids = new Set(toRemove.map((l) => l.id));
    recordDeletedIds('leads', Array.from(ids));
    setLeads((prev) => prev.filter((l) => !ids.has(l.id)));
    await Promise.all(
      toRemove.map((l) =>
        leadsService.delete(l.id).catch((err) => console.warn('מחיקת ליד נכשלה:', l.id, err))
      )
    );
    addActivity('system', `נוקו ${toRemove.length} לידים שכבר לקוחות / הזמינו אירוע`);
    return toRemove.length;
  };

  const convertLeadToCustomer = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const existing = customers.find(c =>
      (normalizePhoneKey(c.phone) && normalizePhoneKey(c.phone) === normalizePhoneKey(lead.phone)) ||
      (normalizeEmailKey(c.email) && normalizeEmailKey(c.email) === normalizeEmailKey(lead.email))
    );
    if (!existing) {
      const newCustomer: Customer = { id: `c_${Date.now()}`, name: lead.name, phone: lead.phone, email: lead.email || '', notes: `הגיע מליד` };
      setCustomers(prev => [...prev, newCustomer]);
      cloudSync(() => customersService.create(newCustomer));
    }
    recordDeletedIds('leads', [leadId]);
    setLeads(prev => prev.filter(l => l.id !== leadId));
    cloudSync(() => leadsService.delete(leadId));
    addActivity('system', `ליד ${lead.name} הומר ללקוח ונמחק מהלוח`);
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
    recordDeletedIds('tasks', [id]);
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
  const reloadFromCloud = async () => {
    await pullCloudAsSourceOfTruth(dataRef.current);
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

  const importTaskObjects = (incoming: Task[]) => {
    const existing = new Set(tasks.map((t) => t.title.trim()));
    const toAdd = incoming.filter((t) => t.title?.trim() && !existing.has(t.title.trim()));
    if (!toAdd.length) return 0;
    setTasks((prev) => [...toAdd, ...prev]);
    cloudSync(() => tasksService.bulkInsert(toAdd));
    addActivity('system', `יובאו ${toAdd.length} משימות מהרשימה`);
    return toAdd.length;
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
      addCustomer, updateCustomer, getCustomerById, addLead, updateLeadStatus, updateLead, convertLeadToCustomer, cleanupConvertedLeads, handlePublicBookingSubmit,
      sendBookingEmail, sendPortalEmail, sendEventUpdateEmail, addTask, updateTask, toggleTask, updateTaskProgress, deleteTask, importEvents, applyPaymentDatesFromImport, importCustomers, importTasks, importTaskObjects, importLeads, kpis, integrations, toggleIntegration, syncRemoteBookings,
      addCustomForm, updateCustomForm, deleteCustomForm, getFormById, syncAllEventsWithCustomers, uploadAllToCloud, reloadFromCloud,
      cloudSyncOk, lastCloudSyncAt
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
