import type { Task, TaskActivity } from '../types';
import { tasksService } from './supabase';

/** שומר ומאמת את הערכים שהשרת החזיר, ואז מרענן את הנתונים המשותפים. */
export async function saveSecretaryTask(id: string, updates: Partial<Task>, refresh: () => Promise<void>): Promise<void> {
  let saved: Task;
  try {
    saved = await tasksService.update(id, updates);
    if (!saved || saved.id !== id) throw new Error('Missing task');
    for (const key of ['assignee', 'doneNote', 'deskStatus', 'isCompleted', 'progress'] as const) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const normalize = (value: unknown) => value === '' || value === undefined ? null : value;
        if (normalize(saved[key]) !== normalize(updates[key])) throw new Error('Task fields were not saved');
      }
    }
  } catch {
    throw new Error('העדכון לא אושר בענן. בדקו את החיבור ונסו שוב.');
  }
  try {
    await refresh();
  } catch {
    throw new Error('השמירה אושרה, אך התצוגה לא התרעננה. רעננו את נתוני ה־CRM.');
  }
}

type ActivityStore = Pick<typeof tasksService, 'getById' | 'update'>;

/** מוסיף עדכון ליומן הקיים של המשימה, בלי להחליף את הרשומות שכבר נשמרו. */
export async function appendSecretaryTaskActivity(id: string, text: string, refresh: () => Promise<void>, store: ActivityStore = tasksService): Promise<TaskActivity> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('יש לכתוב עדכון לפני השמירה.');
  const entry: TaskActivity = {
    id: `a_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`}`,
    at: new Date().toISOString(),
    text: cleanText,
  };
  try {
    const current = await store.getById(id);
    if (!current || current.id !== id) throw new Error('Missing task');
    if (current.activityLog != null && !Array.isArray(current.activityLog)) throw new Error('Invalid activity log');
    const activityLog = [...(Array.isArray(current.activityLog) ? current.activityLog : []), entry];
    const saved = await store.update(id, { activityLog });
    if (!saved || saved.id !== id || !saved.activityLog?.some(item => item.id === entry.id && item.text === entry.text && item.at === entry.at)) throw new Error('Activity was not confirmed');
  } catch {
    throw new Error('לא התקבל אישור לשמירת העדכון. בדקו את יומן המשימה כשהחיבור מתחדש.');
  }
  await refresh().catch(() => {});
  return entry;
}
