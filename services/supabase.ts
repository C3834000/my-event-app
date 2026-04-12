import type { Customer, AppEvent, Lead, Task, CustomForm } from '../types';

// In development, call the local Express server on port 4000.
// In production (Netlify), call the function directly (avoids _redirects / SPA ordering issues).
const API_BASE = import.meta.env.DEV ? 'http://localhost:4000' : '';
const DB_URL = import.meta.env.DEV ? `${API_BASE}/api/db` : '/.netlify/functions/db';

const DB_FETCH_MS = 25000;

function mapDbNetworkError(err: unknown): Error {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'AbortError') {
    return new Error('השרת לא הגיב בזמן — נסה שוב בעוד רגע.');
  }
  const m = (e?.message || '').toLowerCase();
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to load')) {
    return new Error(
      'לא ניתן להתחבר למסד הנתונים מהדפדפן. בדוק חיבור לאינטרנט, נסה רענון, או כבה חוסם פרסומות/פרטיות לדף הזה.'
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function dbRequest(
  action: string,
  table: string,
  options: { data?: any; id?: string; orderBy?: string; orderAsc?: boolean } = {}
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DB_FETCH_MS);
  try {
    const response = await fetch(DB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, table, ...options }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let result: { data?: any; error?: string } = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(response.ok ? 'תשובה לא תקינה מהשרת' : `שגיאת שרת (${response.status})`);
    }
    if (!response.ok) throw new Error(result.error || 'Database request failed');
    return result.data;
  } catch (err) {
    throw mapDbNetworkError(err);
  } finally {
    clearTimeout(timeout);
  }
}

// ===== CUSTOMERS =====
export const customersService = {
  async getAll(): Promise<Customer[]> {
    return dbRequest('getAll', 'customers', { orderBy: 'name', orderAsc: true });
  },
  async create(customer: Customer): Promise<Customer> {
    return dbRequest('create', 'customers', { data: customer });
  },
  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    return dbRequest('update', 'customers', { id, data: updates });
  },
  async delete(id: string): Promise<void> {
    return dbRequest('delete', 'customers', { id });
  },
  async bulkInsert(customers: Customer[]): Promise<void> {
    if (!customers.length) return;
    return dbRequest('bulkInsert', 'customers', { data: customers });
  },
};

// ===== EVENTS =====
export const eventsService = {
  async getAll(): Promise<AppEvent[]> {
    return dbRequest('getAll', 'events', { orderBy: 'date', orderAsc: false });
  },
  async create(event: AppEvent): Promise<AppEvent> {
    return dbRequest('create', 'events', { data: event });
  },
  async update(id: string, updates: Partial<AppEvent>): Promise<AppEvent> {
    return dbRequest('update', 'events', { id, data: updates });
  },
  async delete(id: string): Promise<void> {
    return dbRequest('delete', 'events', { id });
  },
  async bulkInsert(events: AppEvent[]): Promise<void> {
    if (!events.length) return;
    return dbRequest('bulkInsert', 'events', { data: events });
  },
};

// ===== LEADS =====
export const leadsService = {
  async getAll(): Promise<Lead[]> {
    return dbRequest('getAll', 'leads');
  },
  async create(lead: Lead): Promise<Lead> {
    return dbRequest('create', 'leads', { data: lead });
  },
  async update(id: string, updates: Partial<Lead>): Promise<Lead> {
    return dbRequest('update', 'leads', { id, data: updates });
  },
  async delete(id: string): Promise<void> {
    return dbRequest('delete', 'leads', { id });
  },
  async bulkInsert(leads: Lead[]): Promise<void> {
    if (!leads.length) return;
    return dbRequest('bulkInsert', 'leads', { data: leads });
  },
};

// ===== TASKS =====
export const tasksService = {
  async getAll(): Promise<Task[]> {
    return dbRequest('getAll', 'tasks');
  },
  async create(task: Task): Promise<Task> {
    return dbRequest('create', 'tasks', { data: task });
  },
  async update(id: string, updates: Partial<Task>): Promise<Task> {
    return dbRequest('update', 'tasks', { id, data: updates });
  },
  async delete(id: string): Promise<void> {
    return dbRequest('delete', 'tasks', { id });
  },
  async bulkInsert(tasks: Task[]): Promise<void> {
    if (!tasks.length) return;
    return dbRequest('bulkInsert', 'tasks', { data: tasks });
  },
};

// ===== CUSTOM FORMS =====
export const formsService = {
  async getAll(): Promise<CustomForm[]> {
    return dbRequest('getAll', 'custom_forms');
  },
  async create(form: CustomForm): Promise<CustomForm> {
    return dbRequest('create', 'custom_forms', { data: form });
  },
  async update(id: string, updates: Partial<CustomForm>): Promise<CustomForm> {
    return dbRequest('update', 'custom_forms', { id, data: updates });
  },
  async delete(id: string): Promise<void> {
    return dbRequest('delete', 'custom_forms', { id });
  },
};

// ===== SETTINGS =====
export const settingsService = {
  async get(): Promise<any> {
    try {
      const rows = await dbRequest('getAll', 'settings');
      return rows?.[0] || {};
    } catch {
      return {};
    }
  },
  async update(settings: any): Promise<any> {
    return dbRequest('upsert', 'settings', { data: { id: 'main', ...settings } });
  },
};

// ===== MIGRATION: localStorage → Supabase (via proxy) =====
export async function migrateFromLocalStorage() {
  try {
    const localCustomers = localStorage.getItem('customers');
    if (localCustomers) {
      const customers = JSON.parse(localCustomers);
      if (customers.length > 0) {
        await customersService.bulkInsert(customers);
        console.log(`✅ ${customers.length} לקוחות הועברו`);
      }
    }

    const localEvents = localStorage.getItem('events');
    if (localEvents) {
      const events = JSON.parse(localEvents);
      if (events.length > 0) {
        await eventsService.bulkInsert(events);
        console.log(`✅ ${events.length} אירועים הועברו`);
      }
    }

    const localLeads = localStorage.getItem('leads');
    if (localLeads) {
      const leads = JSON.parse(localLeads);
      if (leads.length > 0) {
        await leadsService.bulkInsert(leads);
        console.log(`✅ ${leads.length} לידים הועברו`);
      }
    }

    const localTasks = localStorage.getItem('tasks');
    if (localTasks) {
      const tasks = JSON.parse(localTasks);
      if (tasks.length > 0) {
        await tasksService.bulkInsert(tasks);
        console.log(`✅ ${tasks.length} משימות הועברו`);
      }
    }

    console.log('🎉 מיגרציה הושלמה בהצלחה!');
    return true;
  } catch (error) {
    console.error('❌ שגיאה במיגרציה:', error);
    throw error;
  }
}
