import { AppEvent, EventStatus, PaymentStatus } from '../types';

/** YYYY-MM-DD מהמחרוזת או null */
export function parseEventDateKey(dateStr: string | undefined): string | null {
  if (!dateStr || !String(dateStr).trim()) return null;
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayDateKey(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function numMoney(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export const PAID_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.Paid, PaymentStatus.PaidCash, PaymentStatus.PaidCredit, PaymentStatus.PaidCheck,
  PaymentStatus.PaidTransferL, PaymentStatus.PaidTransferH, PaymentStatus.PaidTransferM, PaymentStatus.PaidProvider,
];

export function isPaidForKpi(paymentStatus: PaymentStatus | string | undefined | null): boolean {
  if (!paymentStatus) return false;
  return (PAID_PAYMENT_STATUSES as string[]).includes(String(paymentStatus));
}

export function excludeEventFromKpis(ev: AppEvent): boolean {
  return ev.status === EventStatus.Cancelled || String(ev.status || '') === 'בוטל';
}

/** יתרה פתוחה לפי כסף בפועל — לא מסתירים אירוע בגלל תווית סטטוס חריגה (למשל «לא שולם») */
export function eventOpenAmount(ev: AppEvent): number {
  if (excludeEventFromKpis(ev)) return 0;
  return eventOutstandingBalance(ev);
}

export function yearFromDateKey(dateStr: string | undefined): string {
  return parseEventDateKey(dateStr)?.slice(0, 4) || 'ללא שנה';
}

export function currentYearKey(): string {
  return String(new Date().getFullYear());
}

export function eventYearKey(ev: AppEvent): string {
  return yearFromDateKey(ev.date);
}

/** הכנסה שכבר התקבלה נספרת לפי תאריך התשלום בפועל, ואם אין כזה לפי תאריך האירוע. */
export function incomeDateKey(ev: AppEvent): string | null {
  return parseEventDateKey(ev.paymentDate || ev.date);
}

export function incomeYearKey(ev: AppEvent): string {
  return yearFromDateKey(ev.paymentDate || ev.date);
}

export function eventCategoryKey(ev: AppEvent): string {
  return (ev.category || ev.tag || 'כללי').trim() || 'כללי';
}

export function eventOutstandingBalance(ev: AppEvent): number {
  return Math.max(0, numMoney(ev.amount) - numMoney(ev.paidAmount));
}

export function eventHasOpenBalance(ev: AppEvent): boolean {
  return eventOpenAmount(ev) > 0;
}

/** Open debt: event date before today (local calendar), not cancelled, not fully-paid status, positive balance */
export function eventContributesToOpenDebt(ev: AppEvent, todayKey: string): boolean {
  if (excludeEventFromKpis(ev)) return false;
  const key = parseEventDateKey(ev.date);
  if (!key || key >= todayKey) return false;
  return eventHasOpenBalance(ev);
}
