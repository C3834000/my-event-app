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

export function isPaidForKpi(paymentStatus: PaymentStatus): boolean {
  return PAID_PAYMENT_STATUSES.includes(paymentStatus);
}

export function excludeEventFromKpis(ev: AppEvent): boolean {
  return ev.status === EventStatus.Cancelled;
}

/** Open debt: event date before today (local calendar), not cancelled, not fully-paid status, positive balance */
export function eventContributesToOpenDebt(ev: AppEvent, todayKey: string): boolean {
  if (excludeEventFromKpis(ev)) return false;
  const key = parseEventDateKey(ev.date);
  if (!key || key >= todayKey) return false;
  if (isPaidForKpi(ev.paymentStatus)) return false;
  const balance = Math.max(0, numMoney(ev.amount) - numMoney(ev.paidAmount));
  return balance > 0;
}
