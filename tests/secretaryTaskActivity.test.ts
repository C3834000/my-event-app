import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSecretaryTaskActivity } from '../services/secretaryTaskUpdate';
import { TaskPriority, type Task } from '../types';

const initial = (): Task => ({ id: 'task-1', title: 'משימה', isCompleted: false, priority: TaskPriority.Medium, category: 'כללי', estimatedTimeMin: 0, progress: 0, activityLog: [{ id: 'previous', at: '2026-11-01T09:00:00.000Z', text: 'עדכון קודם' }] });

test('עדכון חדש מצטרף לתיעוד האחרון שנשמר בענן עם חותמת זמן', async () => {
  let current = initial();
  let refreshed = false;
  const store = { getById: async () => current, update: async (_id: string, changes: Partial<Task>) => (current = { ...current, ...changes }) };
  const before = Date.now();
  const entry = await appendSecretaryTaskActivity(current.id, '  דיברתי עם הלקוח  ', async () => { refreshed = true; }, store);
  assert.deepEqual(current.activityLog?.map(item => item.text), ['עדכון קודם', 'דיברתי עם הלקוח']);
  assert.equal(current.activityLog?.[1].id, entry.id);
  assert.ok(Date.parse(entry.at) >= before && Date.parse(entry.at) <= Date.now());
  assert.equal(refreshed, true);
});

test('אין עדכון למשימה חסרה ושמירה שלא אושרה אינה נחשבת הצלחה', async () => {
  let wrote = false;
  const missing = { getById: async () => null, update: async (_id: string, _changes: Partial<Task>) => { wrote = true; return initial(); } };
  await assert.rejects(() => appendSecretaryTaskActivity('task-1', 'עדכון', async () => {}, missing), /לא התקבל אישור/);
  assert.equal(wrote, false);
  const discarded = { getById: async () => initial(), update: async (_id: string, _changes: Partial<Task>) => initial() };
  await assert.rejects(() => appendSecretaryTaskActivity('task-1', 'עדכון', async () => {}, discarded), /לא התקבל אישור/);
  const invalidLog = { getById: async () => ({ ...initial(), activityLog: 'invalid' } as unknown as Task), update: async (_id: string, _changes: Partial<Task>) => { wrote = true; return initial(); } };
  await assert.rejects(() => appendSecretaryTaskActivity('task-1', 'עדכון', async () => {}, invalidLog), /לא התקבל אישור/);
  assert.equal(wrote, false);
});
