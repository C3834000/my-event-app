import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSecretaryMonthlyFinance } from '../services/secretaryMonthlyFinance';
import { EventStatus, type AppEvent } from '../types';
import { APPROVAL_SENDING_PREFIX } from '../services/bookingApproval';

const event = (overrides: Partial<AppEvent>): AppEvent => ({ id: '1', customerId: 'customer', title: 'אירוע', date: '2026-11-23', amount: 1000, paidAmount: 0, status: EventStatus.Booked, ...overrides } as AppEvent);

test('שווי אירועי החודש, הזמנות שנוצרו החודש ותקבולים לפי התאריך עד היום', () => {
  process.env.TZ = 'Asia/Jerusalem';
  const events = [
    event({ id: 'booked', amount: 1000, paidAmount: 250, paymentDate: '2026-11-10', createdAt: '2026-11-01T10:00:00.000Z' }),
    event({ id: 'past-event', date: '2026-10-20', amount: 900, paidAmount: 400, paymentDate: '2026-11-21', createdAt: '2026-10-31T23:30:00.000Z' }),
    event({ id: 'future-payment', amount: 200, paidAmount: 50, paymentDate: '2026-11-25', createdAt: '2026-11-25T00:00:00.000Z' }),
    event({ id: 'missing-date', amount: 300, paidAmount: 100 }),
    event({ id: 'preliminary', amount: 800, status: EventStatus.PreliminaryApproval }),
    event({ id: 'cancelled', amount: 500, paidAmount: 200, paymentDate: '2026-11-05', status: EventStatus.Cancelled }),
    event({ id: 'previous-year', date: '2025-11-22', amount: 700, paidAmount: 50, paymentDate: '2025-11-22', createdAt: '2025-11-22T12:00:00.000Z' }),
  ];
  assert.deepEqual(summarizeSecretaryMonthlyFinance(events, '2026-11-22'), { booked: 1500, created: 1900, paid: 650, undatedPayments: 1, undatedBookings: 1, datedBookings: 4 });
});

test('בקשת הזמנה אינה נספרת עד האישור, וגם אישור שממתין להודעה נספר', () => {
  const pending = event({ id: 'pending', amount: 500, status: EventStatus.PendingApproval, createdAt: '2026-11-10' });
  const approved = event({ id: 'approved', amount: 700, status: EventStatus.ApprovalEmailPending, createdAt: '2026-11-11' });
  const sending = event({ id: 'sending', amount: 300, status: `${APPROVAL_SENDING_PREFIX}2026-11-12T10:00:00Z` as EventStatus, createdAt: '2026-11-12' });
  const totals = summarizeSecretaryMonthlyFinance([pending, approved, sending], '2026-11-22');
  assert.equal(totals.booked, 1000);
  assert.equal(totals.created, 1000);
});
