import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStatus, EventType, PaymentStatus, type AppEvent } from '../types';
import { approveBooking, approvalSendingExpired, bookingEmail, isConfirmedBookingStatus, saveBookingEdits, APPROVAL_SEND_TIMEOUT_MS, APPROVAL_SENDING_PREFIX } from '../services/bookingApproval';
import { summarizeCalendarDays } from '../services/secretaryCalendar';
import { eventContributesToOpenDebt } from '../services/eventKpi';

const settings = { companyName: 'קליכיף', contactPhone: '052-0000000' };
const booking = (): AppEvent => ({
  id: 'e_1', customerId: 'c_1', title: 'אירוע – ישראל <script>', date: '2026-12-01',
  startTime: '10:00', endTime: '11:30', amount: 500, paidAmount: 0,
  status: EventStatus.PendingApproval, paymentStatus: PaymentStatus.NotPaid,
  eventType: EventType.ClickersProgram, clickersNeeded: 50, location: 'ירושלים', tag: 'קליכיף',
  phone: '0500000000', email: 'test@example.com', notes: '<img src=x>',
});

function mockDatabase(initial = booking()) {
  let current = { ...initial };
  const transition = async (id: string, expected: string, next: string, updates: Partial<AppEvent> = {}) => {
    if (current.id !== id || current.status !== expected) return null;
    current = { ...current, ...updates, id, status: next as EventStatus };
    return { ...current };
  };
  return { transition, current: () => ({ ...current }) };
}

test('אישור קבלה מובחן מאישור סופי ופרטי הלקוח מוצגים בבטחה', () => {
  const received = bookingEmail(booking(), 'received', settings);
  const approved = bookingEmail(booking(), 'approved', settings);
  assert.match(received.subject, /בקשת ההזמנה התקבלה/);
  assert.match(received.text!, /תיבדק על ידי המזכירות/);
  assert.doesNotMatch(received.text!, /הזמנת האירוע שלכם אושרה/);
  assert.match(approved.text!, /הזמנת האירוע שלכם אושרה/);
  assert.equal(approved.to, 'test@example.com');
  assert.match(approved.html!, /&lt;script&gt;/);
  assert.doesNotMatch(approved.html!, /<img src=x>/);
});

test('אישור נשמר לפני השליחה, שולח את הפרטים השמורים ומונע אישור מקביל', async () => {
  const db = mockDatabase();
  const sent: string[] = [];
  const send = async (mail: { text?: string }) => {
    assert.match(String(db.current().status), /^אושר - שליחת הודעה בתהליך:/);
    sent.push(mail.text || '');
    return { success: true };
  };
  const [one, two] = await Promise.all([
    approveBooking(booking(), settings, db.transition, send),
    approveBooking(booking(), settings, db.transition, send),
  ]);
  assert.deepEqual([one.kind, two.kind].sort(), ['conflict', 'sent']);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /ירושלים/);
  assert.equal(db.current().status, EventStatus.Booked);
});

test('כשל בשליחה נשמר ומאפשר ניסיון חוזר בלי לאשר מחדש', async () => {
  const db = mockDatabase();
  const failed = await approveBooking(booking(), settings, db.transition, async () => ({ success: false, error: 'SMTP' }));
  assert.equal(failed.kind, 'send_failed');
  assert.equal(db.current().status, EventStatus.ApprovalEmailPending);
  assert.equal(isConfirmedBookingStatus(db.current().status), true);
  await saveBookingEdits(db.current(), { email: 'corrected@example.com' }, db.transition);
  const retried = await approveBooking(db.current(), settings, db.transition, async mail => {
    assert.equal(mail.to, 'corrected@example.com');
    return { success: true };
  });
  assert.equal(retried.kind, 'sent');
  assert.equal(db.current().status, EventStatus.Booked);
});

test('עריכת בקשה נכתבת לענן לפני אישור; עריכה ישנה אינה דורסת אישור ממכשיר אחר', async () => {
  const db = mockDatabase();
  const editorCopy = db.current();
  await saveBookingEdits(editorCopy, { location: 'מיקום מתוקן' }, db.transition);
  let sent = '';
  await approveBooking(db.current(), settings, db.transition, async mail => { sent = mail.text || ''; return { success: true }; });
  assert.match(sent, /מיקום מתוקן/);
  await assert.rejects(saveBookingEdits(editorCopy, { location: 'מידע ישן' }, db.transition), /סטטוס הבקשה השתנה/);
  assert.equal(db.current().location, 'מיקום מתוקן');
  assert.equal(db.current().status, EventStatus.Booked);
});

test('כשל או חוסר התאמה בשמירה אינם שולחים הודעת אישור', async () => {
  let sends = 0;
  const send = async () => { sends++; return { success: true }; };
  const conflict = await approveBooking(booking(), settings, async () => null, send);
  assert.equal(conflict.kind, 'conflict');
  await assert.rejects(approveBooking(booking(), settings, async () => { throw new Error('offline'); }, send));
  assert.equal(sends, 0);
});

test('שליחה שנקטעה נשארת גלויה ואפשר לחזור אליה רק אחרי זמן ההמתנה', async () => {
  const start = Date.parse('2026-11-22T10:00:00Z');
  const initial = { ...booking(), status: `${APPROVAL_SENDING_PREFIX}${new Date(start).toISOString()}` as EventStatus };
  const db = mockDatabase(initial);
  assert.equal(approvalSendingExpired(initial.status, start + APPROVAL_SEND_TIMEOUT_MS - 1), false);
  assert.equal((await approveBooking(initial, settings, db.transition, async () => ({ success: true }), start + 1)).kind, 'conflict');
  assert.equal((await approveBooking(initial, settings, db.transition, async () => ({ success: true }), start + APPROVAL_SEND_TIMEOUT_MS)).kind, 'sent');
});

test('בקשות ממתינות מופיעות בנפרד בלוח ולא נספרות כחוב', () => {
  const pending = booking();
  const failedMail = { ...booking(), id: 'e_2', status: EventStatus.ApprovalEmailPending };
  const summary = summarizeCalendarDays([pending, failedMail]).get('2026-12-01')!;
  assert.equal(summary.pending.length, 1);
  assert.equal(summary.booked.length, 1);
  assert.equal(summary.clickers, 50);
  assert.equal(eventContributesToOpenDebt(pending, '2026-12-02'), false);
  assert.equal(eventContributesToOpenDebt(failedMail, '2026-12-02'), true);
});
