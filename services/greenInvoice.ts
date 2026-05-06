import { PaymentMethod } from '../types';
import type { AppEvent } from '../types';

const API_PATH = '/api/green-invoice';

/** קודי אמצעי תשלום ב-API חשבונית ירוקה (תואם ל-bariew/greeninvoice Payment) */
export function greenInvoicePaymentType(method?: PaymentMethod): number {
  switch (method) {
    case PaymentMethod.Cash:
      return 1;
    case PaymentMethod.Check:
      return 2;
    case PaymentMethod.CreditCard:
      return 3;
    case PaymentMethod.BankTransfer:
      return 4;
    case PaymentMethod.Bit:
      return 11;
    default:
      return 4;
  }
}

export interface CreateGreenInvoiceParams {
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  description?: string;
  itemDescription?: string;
  amount: number;
  currency?: string;
  lang?: string;
  date?: string;
  paymentDate?: string;
  documentType?: number;
  paymentType?: number;
  vatType?: number;
}

export interface GreenInvoiceResult {
  success: boolean;
  message?: string;
  id?: string;
  number?: number;
  url?: { origin?: string; he?: string; en?: string };
  emailSent?: boolean;
  error?: string;
  hint?: string;
  details?: unknown;
}

async function postGreenInvoice(body: Record<string, unknown>): Promise<GreenInvoiceResult> {
  const res = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as GreenInvoiceResult & { raw?: unknown };
  if (!res.ok) {
    return {
      success: false,
      error: data.error || res.statusText,
      hint: (data as { hint?: string }).hint,
      details: data.details ?? data.raw,
    };
  }
  return data;
}

export async function pingGreenInvoice(): Promise<GreenInvoiceResult> {
  return postGreenInvoice({ action: 'ping' });
}

export async function createGreenInvoiceDocument(params: CreateGreenInvoiceParams): Promise<GreenInvoiceResult> {
  return postGreenInvoice({
    action: 'createDocument',
    ...params,
  });
}

/** יצירת מסמך חדש מתוך מסמך קיים (המרה) */
export async function convertGreenInvoiceDocument(
  parentDocId: string,
  documentType: number,
  clientEmail?: string,
): Promise<GreenInvoiceResult> {
  return postGreenInvoice({ action: 'convertDocument', parentDocId, documentType, clientEmail });
}

/** שם ידידותי לסוג מסמך */
export function giDocTypeName(type?: number): string {
  switch (type) {
    case 10:  return 'הצעת מחיר';
    case 300: return 'חשבון עסקה';
    case 305: return 'חשבונית מס';
    case 320: return 'חשבונית מס/קבלה';
    case 400: return 'קבלה';
    default:  return type ? `מסמך (${type})` : '';
  }
}

/** אילו סוגי מסמך ניתן ליצור מתוך סוג נתון */
export function giAllowedConversions(fromType?: number): { value: number; label: string }[] {
  switch (fromType) {
    case 300: // חשבון עסקה → חשבונית מס / חשבונית מס+קבלה
      return [
        { value: 305, label: 'חשבונית מס' },
        { value: 320, label: 'חשבונית מס/קבלה' },
      ];
    case 305: // חשבונית מס → קבלה
      return [{ value: 400, label: 'קבלה' }];
    default:
      return [];
  }
}

export function buildGreenInvoiceParamsFromEvent(
  event: AppEvent,
  customerName: string,
  overrides?: Partial<CreateGreenInvoiceParams>
): CreateGreenInvoiceParams {
  const amount = Number(event.amount) || 0;
  const date = event.date?.slice(0, 10);
  const paymentDate = event.paymentDate?.slice(0, 10);

  // Document-level description: event type + notes (if any) as second line
  const docDescription = [
    (event.eventType || 'אירוע').trim(),
    event.notes?.trim() || '',
  ].filter(Boolean).join('\n');

  // Line-item description: structured event details
  const itemParts: string[] = [];
  if (event.eventType) itemParts.push(event.eventType);
  if (event.clickersNeeded) itemParts.push(`${event.clickersNeeded} משתתפים`);
  if (date) itemParts.push(date);
  if (event.startTime) itemParts.push(event.startTime);
  if (event.location) itemParts.push(event.location);
  const itemDesc = itemParts.join(' | ') || docDescription;

  return {
    clientName: customerName.trim(),
    clientEmail: event.email?.trim() || undefined,
    clientPhone: event.phone?.trim() || undefined,
    description: docDescription,
    itemDescription: itemDesc,
    amount,
    currency: 'ILS',
    lang: 'he',
    date: date || undefined,
    paymentDate: paymentDate || date || undefined,
    paymentType: greenInvoicePaymentType(event.paymentMethod),
    ...overrides,
  };
}
