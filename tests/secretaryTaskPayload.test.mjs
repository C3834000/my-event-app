import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTasksPayload } from '../netlify/functions/db.js';

test('task API retains secretary assignment and progress fields', () => {
  const request = { assignee: 'מזכירה', doneNote: 'טופל חלקית', deskStatus: 'partial', isCompleted: false, unexpected: 'ignored' };
  assert.deepEqual(filterTasksPayload(request), { assignee: 'מזכירה', doneNote: 'טופל חלקית', deskStatus: 'partial', isCompleted: false });
});
