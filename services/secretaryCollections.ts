import type { AppEvent, Task, TaskActivity } from '../types';
import { TaskPriority } from '../types';
import { tasksService } from './supabase';

export const collectionTaskId = (eventId: string) => `collection_${eventId}`;
const activityId = () => `note_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`}`;
type TaskStore = Pick<typeof tasksService, 'getById' | 'create' | 'update'>;

/** התיעוד והמעקב נשמרים במשימה נפרדת המקושרת לאירוע, בלי לשנות את פרטי האירוע. */
export async function saveCollectionFollowUp(
  event: AppEvent, note: string, followUpDate: string, followUpTime: string,
  refresh: () => Promise<void>, store: TaskStore = tasksService,
): Promise<void> {
  const cleanNote = note.trim();
  if (!cleanNote && !followUpDate) throw new Error('יש לכתוב הערה או לבחור תאריך למעקב.');
  const id = collectionTaskId(event.id);
  let saved: Task;
  try {
    const current = await store.getById(id);
    if (current === undefined) throw new Error('Invalid task response');
    if (current && (current.eventId !== event.id || current.assignee !== 'מזכירה')) throw new Error('Task ID is already in use');
    const entry: TaskActivity | null = cleanNote ? { id: activityId(), at: new Date().toISOString(), text: cleanNote } : null;
    const log = [...(Array.isArray(current?.activityLog) ? current!.activityLog! : []), ...(entry ? [entry] : [])];
    // שדה התזכורת במסד כולל אזור זמן; השעה שהמשתמשת בחרה היא מקומית.
    const reminder = followUpDate ? new Date(`${followUpDate}T${followUpTime || '09:00'}:00`).toISOString() : undefined;
    const updates: Partial<Task> = {
      ...(entry ? { activityLog: log } : {}),
      ...(followUpDate ? { dueDate: followUpDate, dueTime: followUpTime || '09:00', reminderDate: reminder, isCompleted: false, progress: 0, deskStatus: null, focusDate: null } : {}),
    };
    saved = current ? await store.update(id, updates) : await store.create({
      id, eventId: event.id, title: `מעקב גבייה: ${event.title || 'אירוע'}`, assignee: 'מזכירה', category: 'כספים',
      priority: TaskPriority.Medium, isCompleted: false, progress: 0, estimatedTimeMin: 0, ...updates,
    });
    if (!saved || saved.id !== id || saved.eventId !== event.id || saved.assignee !== 'מזכירה' ||
        (entry && !saved.activityLog?.some(item => item.id === entry.id && item.text === entry.text)) ||
        (followUpDate && (String(saved.dueDate || '').slice(0, 10) !== followUpDate || saved.dueTime?.slice(0, 5) !== (followUpTime || '09:00') || !saved.reminderDate || Date.parse(saved.reminderDate) !== Date.parse(reminder!) || saved.isCompleted))) {
      throw new Error('Task fields were not confirmed');
    }
  } catch {
    throw new Error('לא התקבל אישור לשמירה. רעננו את נתוני ה־CRM לפני ניסיון נוסף.');
  }
  try { await refresh(); }
  catch { throw new Error('הטיפול נשמר, אך התצוגה לא התרעננה. רעננו את נתוני ה־CRM.'); }
}
