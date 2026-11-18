import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionTaskId, saveCollectionFollowUp } from '../services/secretaryCollections';
import { AppEvent, Task, TaskPriority } from '../types';

const event = { id: 'event-1', title: 'אירוע בדיקה', customerId: 'customer-1' } as AppEvent;
const initial = (): Task => ({ id: collectionTaskId(event.id), eventId: event.id, title: 'גבייה', assignee: 'מזכירה', category: 'כספים', priority: TaskPriority.Medium, isCompleted: true, progress: 100, estimatedTimeMin: 0, activityLog: [{ id: 'old', at: '2026-11-01T09:00:00Z', text: 'דיברנו' }] });

test('תיעוד נוסף נשמר לצד ההערה הקודמת והתזכורת פותחת משימה לתאריך שנבחר', async () => {
  process.env.TZ = 'Asia/Jerusalem';
  let row = initial(); let refreshed = false;
  const store = { getById: async () => row, create: async (task: Task) => task, update: async (_: string, updates: Partial<Task>) => (row = { ...row, ...updates }) };
  await saveCollectionFollowUp(event, 'יחזרו מחר', '2026-11-25', '10:30', async () => { refreshed = true; }, store);
  assert.deepEqual(row.activityLog?.map(item => item.text), ['דיברנו', 'יחזרו מחר']);
  assert.equal(row.dueDate, '2026-11-25'); assert.equal(row.dueTime, '10:30'); assert.equal(row.reminderDate, '2026-11-25T08:30:00.000Z');
  assert.equal(row.isCompleted, false); assert.equal(row.eventId, event.id); assert.equal(refreshed, true);
});

test('הערה חדשה יוצרת משימה מקושרת ותגובת שרת חסרה אינה נחשבת לשמירה', async () => {
  let created: Task | undefined;
  const store = { getById: async () => null, create: async (task: Task) => { created = task; return task; }, update: async (_: string, task: Partial<Task>) => task as Task };
  await saveCollectionFollowUp(event, 'שלחו פרטי תשלום', '', '', async () => {}, store);
  assert.equal(created?.eventId, event.id); assert.equal(created?.assignee, 'מזכירה'); assert.equal(created?.activityLog?.[0].text, 'שלחו פרטי תשלום');
  const broken = { ...store, create: async (task: Task) => ({ ...task, activityLog: [] }) };
  await assert.rejects(() => saveCollectionFollowUp(event, 'הערה', '', '', async () => {}, broken), /לא התקבל אישור/);
});

test('לא דורסים משימה אחרת במקרה של מזהה מתנגש', async () => {
  let wrote = false;
  const store = { getById: async () => ({ ...initial(), eventId: 'another-event' }), create: async (task: Task) => { wrote = true; return task; }, update: async (_: string, task: Partial<Task>) => { wrote = true; return task as Task; } };
  await assert.rejects(() => saveCollectionFollowUp(event, 'הערה', '', '', async () => {}, store), /לא התקבל אישור/);
  assert.equal(wrote, false);
});
