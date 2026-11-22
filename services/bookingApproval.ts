import { EventStatus, type AppEvent } from '../types';
import type { SendEmailParams } from './emailService';

// The status itself keeps the approval/notification work visible across devices,
// without depending on a browser being open or on an extra database column.
export const APPROVAL_SENDING_PREFIX = 'אושר - שליחת הודעה בתהליך: ';
export const APPROVAL_SEND_TIMEOUT_MS = 5 * 60 * 1000;

export function isApprovalSending(status: string | undefined | null): boolean {
  return String(status || '').startsWith(APPROVAL_SENDING_PREFIX);
}

export function isBookingApprovalWork(status: string | undefined | null): boolean {
  return status === EventStatus.PendingApproval || status === EventStatus.ApprovalEmailPending || isApprovalSending(status);
}

export function isConfirmedBookingStatus(status: string | undefined | null): boolean {
  return [EventStatus.Booked, EventStatus.DoneUnpaid, EventStatus.Paid, EventStatus.ApprovalEmailPending].includes(status as EventStatus)
    || isApprovalSending(status);
}

export function approvalSendingExpired(status: string | undefined | null, now = Date.now()): boolean {
  if (!isApprovalSending(status)) return false;
  const started = Date.parse(String(status).slice(APPROVAL_SENDING_PREFIX.length));
  return !Number.isFinite(started) || now - started >= APPROVAL_SEND_TIMEOUT_MS;
}

export function bookingStatusLabel(status: string | undefined | null): string {
  return isApprovalSending(status) ? 'אושר - שליחת הודעה בתהליך' : String(status || 'סטטוס לא צוין');
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c] || c));

export function bookingCustomerName(event: AppEvent): string {
  return String(event.title || '').replace(/^אירוע\s*[–-]\s*/, '').trim() || 'לקוח/ה';
}

function formatDate(value: string | undefined): string {
  if (!value) return 'לא צוין';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('he-IL');
}

/** One detail list is used by both the receipt and the final approval. */
export function bookingEmail(event: AppEvent, kind: 'received' | 'approved', settings: { companyName: string; contactPhone: string }): SendEmailParams {
  const name = bookingCustomerName(event);
  const reference = event.externalId || event.id;
  const rows: [string, string][] = [
    ['שם המזמין', name],
    ['טלפון', event.phone || 'לא צוין'],
    ['דוא״ל', event.email || 'לא צוין'],
    ['תאריך', formatDate(event.date)],
    ...(event.hebrewDate ? [['תאריך עברי', event.hebrewDate] as [string, string]] : []),
    ['שעות', `${event.startTime || '—'}–${event.endTime || '—'}`],
    ['מיקום', event.location || 'לא צוין'],
    ['סוג האירוע', event.eventType || 'לא צוין'],
    ['מספר משתתפים', String(event.clickersNeeded || 0)],
    ['סכום לתשלום', `₪${Number(event.amount || 0).toLocaleString('he-IL')}`],
    ...(event.invoiceName ? [['שם לחשבונית', event.invoiceName] as [string, string]] : []),
    ...(event.paymentDate ? [['תאריך תשלום מוסכם', formatDate(event.paymentDate)] as [string, string]] : []),
    ...(event.paymentMethod ? [['אופן תשלום', event.paymentMethod] as [string, string]] : []),
    ...(event.notes ? [['הערות', event.notes] as [string, string]] : []),
  ];
  const heading = kind === 'received' ? 'בקשת ההזמנה התקבלה' : 'הזמנת האירוע אושרה';
  const message = kind === 'received'
    ? 'תודה! בקשתכם התקבלה ותיבדק על ידי המזכירות. אם הכול תקין, נשלח אליכם הודעה נוספת עם אישור להזמנת האירוע.'
    : 'בשמחה, הזמנת האירוע שלכם אושרה. להלן פרטי האירוע המעודכנים.';
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const htmlRows = rows.map(([label, value]) => `<tr><th style="text-align:right;padding:9px;border-bottom:1px solid #e2e8f0">${escapeHtml(label)}</th><td style="padding:9px;border-bottom:1px solid #e2e8f0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join('');
  const portal = event.customerId ? `https://myecrm2026.netlify.app/#/portal/${encodeURIComponent(event.customerId)}?step=1` : '';
  const dateKey = String(event.date || '').slice(0, 10);
  const validCalendar = kind === 'approved' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    && /^\d{2}:\d{2}/.test(event.startTime || '') && /^\d{2}:\d{2}/.test(event.endTime || '');
  const calendarParams = new URLSearchParams({
    action: 'TEMPLATE', text: event.title || 'אירוע קליכיף',
    dates: `${dateKey.replace(/-/g, '')}T${String(event.startTime || '').slice(0, 5).replace(':', '')}00/${dateKey.replace(/-/g, '')}T${String(event.endTime || '').slice(0, 5).replace(':', '')}00`,
    location: event.location || '',
  });
  const calendar = validCalendar ? `https://calendar.google.com/calendar/render?${calendarParams}` : '';
  return {
    to: event.email || '',
    subject: `${heading} | ${reference}`,
    text: `שלום ${name},\n\n${message}\nמספר בקשה: ${reference}\n\n${textRows}\n\n${calendar ? `הוספה ליומן Google: ${calendar}\n` : ''}${portal ? `פורטל אישי: ${portal}\n` : ''}לשאלות: ${settings.contactPhone}\n${settings.companyName}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#1e293b"><h1 style="color:#6d28d9">${heading}</h1><p>שלום ${escapeHtml(name)},</p><p>${message}</p><p><strong>מספר בקשה:</strong> ${escapeHtml(reference)}</p><table style="width:100%;border-collapse:collapse">${htmlRows}</table>${calendar ? `<p><a href="${escapeHtml(calendar)}">הוספת האירוע ליומן Google</a></p>` : ''}${portal ? `<p><a href="${escapeHtml(portal)}">כניסה לפורטל האישי והכנת החידון</a></p>` : ''}<p>לשאלות: ${escapeHtml(settings.contactPhone)}<br>${escapeHtml(settings.companyName)}</p></div>`,
  };
}

type Transition = (id: string, expected: string, next: string) => Promise<AppEvent | null>;
type Send = (params: SendEmailParams) => Promise<{ success: boolean; error?: string }>;

/** Save edits only while the status still matches what the editor opened. */
export async function saveBookingEdits(
  event: AppEvent,
  updates: Partial<AppEvent>,
  transition: (id: string, expected: string, next: string, updates: Partial<AppEvent>) => Promise<AppEvent | null>,
): Promise<AppEvent> {
  if (!isBookingApprovalWork(event.status) || isApprovalSending(event.status)) throw new Error('אי אפשר לערוך בקשה בזמן שליחת האישור.');
  const nextStatus = updates.status || event.status;
  if (nextStatus !== event.status && nextStatus !== EventStatus.Cancelled) throw new Error('אישור הבקשה מתבצע בשולחן המזכירה.');
  const saved = await transition(event.id, event.status, nextStatus, updates);
  if (!saved) throw new Error('סטטוס הבקשה השתנה במכשיר אחר. יש לרענן ולבדוק שוב את הפרטים.');
  return saved;
}

export type ApprovalResult =
  | { kind: 'sent' }
  | { kind: 'send_failed'; error?: string }
  | { kind: 'conflict' }
  | { kind: 'sent_state_unknown' };

/** Claim by a conditional database update before sending, so two desks cannot approve simultaneously. */
export async function approveBooking(
  event: AppEvent,
  settings: { companyName: string; contactPhone: string },
  transition: Transition,
  send: Send,
  now = Date.now(),
): Promise<ApprovalResult> {
  const status = String(event.status || '');
  if (!isBookingApprovalWork(status) || (isApprovalSending(status) && !approvalSendingExpired(status, now))) return { kind: 'conflict' };
  const sendingStatus = `${APPROVAL_SENDING_PREFIX}${new Date(now).toISOString()}`;
  const claimed = await transition(event.id, status, sendingStatus);
  if (!claimed) return { kind: 'conflict' };

  let result: { success: boolean; error?: string };
  try {
    result = claimed.email ? await send(bookingEmail(claimed, 'approved', settings)) : { success: false, error: 'לא הוזנה כתובת דוא״ל' };
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!result.success) {
    // If this write fails, the timestamped sending state is still recoverable.
    try { await transition(event.id, sendingStatus, EventStatus.ApprovalEmailPending); } catch { /* retry after timeout */ }
    return { kind: 'send_failed', error: result.error };
  }
  try {
    const saved = await transition(event.id, sendingStatus, EventStatus.Booked);
    return saved ? { kind: 'sent' } : { kind: 'sent_state_unknown' };
  } catch {
    return { kind: 'sent_state_unknown' };
  }
}
