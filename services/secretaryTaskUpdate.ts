import type { Task } from '../types';
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
