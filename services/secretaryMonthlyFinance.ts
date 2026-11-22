import { EventStatus, type AppEvent } from '../types';
import { excludeEventFromKpis, numMoney, parseEventDateKey } from './eventKpi';
import { localDateKey } from './secretaryDesk';
import { isConfirmedBookingStatus } from './bookingApproval';

const creationDateKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : localDateKey(date);
};

/** שווי אירועים בחודש, רשומות שנוצרו בחודש ותקבולים לפי התאריך הרשום. */
export function summarizeSecretaryMonthlyFinance(events: AppEvent[], today: string) {
  const month = today.slice(0, 7);
  let booked = 0;
  let created = 0;
  let paid = 0;
  let undatedPayments = 0;
  let undatedBookings = 0;
  let datedBookings = 0;
  for (const event of events) {
    if (excludeEventFromKpis(event)) continue;
    if (isConfirmedBookingStatus(String(event.status || '').trim())) {
      const amount = Math.max(0, numMoney(event.amount));
      if (parseEventDateKey(event.date)?.slice(0, 7) === month) booked += amount;
      const createdDate = creationDateKey(event.createdAt);
      if (!createdDate) undatedBookings++;
      else {
        datedBookings++;
        if (createdDate.slice(0, 7) === month && createdDate <= today) created += amount;
      }
    }
    const amountPaid = Math.max(0, numMoney(event.paidAmount));
    if (!amountPaid) continue;
    const paymentDate = parseEventDateKey(event.paymentDate);
    if (!paymentDate) undatedPayments++;
    else if (paymentDate.slice(0, 7) === month && paymentDate <= today) paid += amountPaid;
  }
  return { booked, created, paid, undatedPayments, undatedBookings, datedBookings };
}
