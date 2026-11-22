import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecretaryDeskData, taskBucket } from '../services/secretaryDesk';
import { summarizeCalendarDays } from '../services/secretaryCalendar';
import { AppEvent, Customer, EventStatus, EventType, Lead, LeadStatus, Task, TaskPriority } from '../types';

const task = (overrides: Partial<Task>): Task => ({ id: '1', title: 'משימה', isCompleted: false, priority: TaskPriority.Medium, category: 'קליכיף', estimatedTimeMin: 0, progress: 0, assignee: 'מזכירה', ...overrides });
const lead = (overrides: Partial<Lead>): Lead => ({ id: '1', name: 'ליד', phone: '', source: '', status: LeadStatus.Contacted, ...overrides });
const event = (overrides: Partial<AppEvent>): AppEvent => ({ id: '1', customerId: 'customer', title: 'אירוע', date: '2026-11-18', amount: 0, paidAmount: 0, status: EventStatus.Booked, ...overrides } as AppEvent);

test('מיון משימות מבחין באיחור, פוקוס, המתנה והשלמה באזור הזמן המקומי', () => {
  process.env.TZ = 'Asia/Jerusalem';
  const today = '2026-11-18';
  const tasks = [
    task({ id: 'overdue', dueDate: '2026-11-17' }),
    task({ id: 'high', dueDate: today, priority: TaskPriority.High }),
    task({ id: 'focus', focusDate: today }),
    task({ id: 'waiting', dueDate: '2026-11-17', deskStatus: 'stuck' }),
    task({ id: 'completed', isCompleted: true, completedDate: '2026-11-17T23:30:00.000Z' }),
    task({ id: 'other', assignee: 'משה' }),
  ];
  const data = buildSecretaryDeskData(tasks, [], [], [], today);
  assert.deepEqual(data.grouped.urgent.map(item => item.id), ['overdue', 'high']);
  assert.deepEqual(data.grouped.today.map(item => item.id), ['focus']);
  assert.deepEqual(data.grouped.stuck.map(item => item.id), ['waiting']);
  assert.deepEqual(data.grouped.done.map(item => item.id), ['completed']);
  assert.equal(data.mine.length, 5);
  assert.equal(taskBucket(task({ isCompleted: true, completedDate: '2026-11-16T23:30:00.000Z' }), today, '2026-11-25'), null);
  assert.equal(taskBucket(task({ id: 'backlog' }), today, '2026-11-25'), 'backlog');
  assert.equal(taskBucket(task({ id: 'later', dueDate: '2026-12-01' }), today, '2026-11-25'), 'later');
});

test('משימה המקושרת למייל מוצגת בשולחן רק כאשר היא משויכת למזכירה', () => {
  const fromMail = task({ id: 'mail-task', emailThreadId: 'thread-1', assignee: undefined });
  assert.equal(buildSecretaryDeskData([fromMail], [], [], [], '2026-11-22').mine.length, 0);
  const assigned = { ...fromMail, assignee: 'מזכירה' as const };
  const data = buildSecretaryDeskData([assigned], [], [], [], '2026-11-22');
  assert.deepEqual(data.grouped.backlog.map(item => item.id), ['mail-task']);
});

test('הלוח סופר הזמנות מאושרות וציוד לפי סוג, ומשאיר הצעות בנפרד', () => {
  const date = '2026-11-19';
  const events = [
    event({ id: 'one', date, eventType: EventType.ClickersProgram, clickersNeeded: 100 }),
    event({ id: 'two', date, eventType: EventType.ClickForYouClickers, clickersNeeded: 50 }),
    event({ id: 'lights', date, eventType: EventType.ClickAurimProgram, clickersNeeded: 80 }),
    event({ id: 'phone', date, eventType: EventType.PhoneClick, clickersNeeded: 200 }),
    event({ id: 'pending', date, status: EventStatus.PreliminaryApproval, eventType: EventType.ClickersProgram, clickersNeeded: 500 }),
    event({ id: 'cancelled', date, status: EventStatus.Cancelled, eventType: EventType.ClickersProgram, clickersNeeded: 1000 }),
    event({ id: 'next-day', date: '2026-11-20', eventType: EventType.ClickersProgram, clickersNeeded: 30 }),
  ];
  const days = summarizeCalendarDays(events);
  assert.equal(days.get(date)?.booked.length, 4);
  assert.equal(days.get(date)?.clickers, 150);
  assert.equal(days.get(date)?.clickaorim, 80);
  assert.equal(days.get(date)?.pending.length, 1);
  assert.equal(days.get('2026-11-20')?.clickers, 30);
});

test('יום עם הצעה בלבד מופיע בלוח ויום עם אירוע מבוטל בלבד אינו מופיע', () => {
  const days = summarizeCalendarDays([
    event({ id: 'quote', date: '2026-11-23', status: EventStatus.QuoteSent }),
    event({ id: 'cancelled', date: '2026-11-24', status: EventStatus.Cancelled }),
  ]);
  assert.equal(days.get('2026-11-23')?.booked.length, 0);
  assert.equal(days.get('2026-11-23')?.pending[0].id, 'quote');
  assert.equal(days.has('2026-11-24'), false);
});

test('לידים כוללים חדשים ומעקבים שהגיעו, בלי לידים סגורים', () => {
  const leads = [lead({ id: 'new', status: LeadStatus.New }), lead({ id: 'due', followUpDate: '2026-11-18' }), lead({ id: 'future', followUpDate: '2026-11-19' }), lead({ id: 'lost', status: LeadStatus.Lost, followUpDate: '2026-11-01' })];
  const data = buildSecretaryDeskData([], leads, [], [], '2026-11-18');
  assert.deepEqual(new Set(data.dueLeads.map(item => item.id)), new Set(['new', 'due']));
  assert.equal(data.openLeads.length, 3);
});

test('גבייה כוללת יתרות באירועי עבר בלבד; אירועים מבוטלים ועתידיים מוחרגים', () => {
  const customers: Customer[] = [{ id: 'customer', name: 'לקוח', phone: '', email: '' }];
  const events = [event({ id: 'past', date: '2026-11-17', amount: 1000, paidAmount: 400 }), event({ id: 'today', amount: 200 }), event({ id: 'future', date: '2026-11-25', amount: 100 }), event({ id: 'outside', date: '2026-11-26' }), event({ id: 'cancelled', date: '2026-11-16', amount: 500, status: EventStatus.Cancelled }), event({ id: 'paid', date: '2026-11-15', amount: 100, paidAmount: 100 })];
  const data = buildSecretaryDeskData([], [], events, customers, '2026-11-18');
  assert.deepEqual(data.debt.map(row => [row.event.id, row.amount, row.customer?.name]), [['past', 600, 'לקוח']]);
  assert.deepEqual(data.upcoming.map(item => item.id), ['today', 'future']);
});
