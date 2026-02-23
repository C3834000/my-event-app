import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Customer, AppEvent, Lead, Task, CustomForm } from '../types';

// הגדרות חיבור - תחליף את הערכים האלה עם הערכים שלך מ-Supabase
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// יצירת לקוח Supabase
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== CUSTOMERS (לקוחות) =====
export const customersService = {
  async getAll(): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (error) throw error;
    return data || [];
  },

  async create(customer: Customer): Promise<Customer> {
    const { data, error } = await supabase.from('customers').insert([customer]).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const { data, error } = await supabase.from('customers').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
  },

  async bulkInsert(customers: Customer[]): Promise<void> {
    const { error } = await supabase.from('customers').insert(customers);
    if (error) throw error;
  }
};

// ===== EVENTS (אירועים) =====
export const eventsService = {
  async getAll(): Promise<AppEvent[]> {
    const { data, error } = await supabase.from('events').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(event: AppEvent): Promise<AppEvent> {
    const { data, error } = await supabase.from('events').insert([event]).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<AppEvent>): Promise<AppEvent> {
    const { data, error } = await supabase.from('events').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
  },

  async bulkInsert(events: AppEvent[]): Promise<void> {
    const { error } = await supabase.from('events').insert(events);
    if (error) throw error;
  }
};

// ===== LEADS (לידים) =====
export const leadsService = {
  async getAll(): Promise<Lead[]> {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(lead: Lead): Promise<Lead> {
    const { data, error } = await supabase.from('leads').insert([lead]).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Lead>): Promise<Lead> {
    const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
  },

  async bulkInsert(leads: Lead[]): Promise<void> {
    const { error } = await supabase.from('leads').insert(leads);
    if (error) throw error;
  }
};

// ===== TASKS (משימות) =====
export const tasksService = {
  async getAll(): Promise<Task[]> {
    const { data, error } = await supabase.from('tasks').select('*').order('priority', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(task: Task): Promise<Task> {
    const { data, error } = await supabase.from('tasks').insert([task]).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Task>): Promise<Task> {
    const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  }
};

// ===== CUSTOM FORMS (טפסים מותאמים) =====
export const formsService = {
  async getAll(): Promise<CustomForm[]> {
    const { data, error } = await supabase.from('custom_forms').select('*');
    if (error) throw error;
    return data || [];
  },

  async create(form: CustomForm): Promise<CustomForm> {
    const { data, error } = await supabase.from('custom_forms').insert([form]).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<CustomForm>): Promise<CustomForm> {
    const { data, error } = await supabase.from('custom_forms').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('custom_forms').delete().eq('id', id);
    if (error) throw error;
  }
};

// ===== SETTINGS (הגדרות) =====
export const settingsService = {
  async get(): Promise<any> {
    const { data, error } = await supabase.from('settings').select('*').single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || {};
  },

  async update(settings: any): Promise<any> {
    // Upsert - עדכון או יצירה
    const { data, error } = await supabase.from('settings').upsert([{ id: 'main', ...settings }]).select().single();
    if (error) throw error;
    return data;
  }
};

// ===== פונקציה למיגרציה של נתונים מ-localStorage =====
export async function migrateFromLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage is not available');
    }

    // לקוחות
    const localCustomers = localStorage.getItem('customers');
    if (localCustomers) {
      const customers = JSON.parse(localCustomers);
      if (customers.length > 0) {
        await customersService.bulkInsert(customers);
        console.log(`✅ ${customers.length} לקוחות הועברו`);
      }
    }

    // אירועים
    const localEvents = localStorage.getItem('events');
    if (localEvents) {
      const events = JSON.parse(localEvents);
      if (events.length > 0) {
        await eventsService.bulkInsert(events);
        console.log(`✅ ${events.length} אירועים הועברו`);
      }
    }

    // לידים
    const localLeads = localStorage.getItem('leads');
    if (localLeads) {
      const leads = JSON.parse(localLeads);
      if (leads.length > 0) {
        await leadsService.bulkInsert(leads);
        console.log(`✅ ${leads.length} לידים הועברו`);
      }
    }

    // משימות
    const localTasks = localStorage.getItem('tasks');
    if (localTasks) {
      const tasks = JSON.parse(localTasks);
      if (tasks.length > 0) {
        await tasksService.bulkInsert(tasks);
        console.log(`✅ ${tasks.length} משימות הועברו`);
      }
    }

    // טפסים
    const localForms = localStorage.getItem('customForms');
    if (localForms) {
      const forms = JSON.parse(localForms);
      if (forms.length > 0) {
        for (const form of forms) {
          await formsService.create(form);
        }
        console.log(`✅ ${forms.length} טפסים הועברו`);
      }
    }

    // הגדרות
    const localSettings = localStorage.getItem('settings');
    if (localSettings) {
      const settings = JSON.parse(localSettings);
      await settingsService.update(settings);
      console.log('✅ הגדרות הועברו');
    }

    console.log('🎉 מיגרציה הושלמה בהצלחה!');
    return true;
  } catch (error) {
    console.error('❌ שגיאה במיגרציה:', error);
    throw error;
  }
}
