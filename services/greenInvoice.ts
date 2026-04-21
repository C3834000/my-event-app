import type { AppEvent, PaymentMethod } from '../types';

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

export function buildGreenInvoiceParamsFromEvent(
  event: AppEvent,
  customerName: string,
  overrides?: Partial<CreateGreenInvoiceParams>
): CreateGreenInvoiceParams {
  const amount = Number(event.amount) || 0;
  const date = event.date?.slice(0, 10);
  const paymentDate = event.paymentDate?.slice(0, 10);
  const desc = event.title?.trim() || customerName;
  return {
    clientName: customerName.trim() || desc,
    clientEmail: event.email?.trim() || undefined,
    clientPhone: event.phone?.trim() || undefined,
    description: `אירוע: ${desc}`,
    itemDescription: `${desc} — ${event.eventType || 'אירוע'}`,
    amount,
    currency: 'ILS',
    lang: 'he',
    date: date || undefined,
    paymentDate: paymentDate || date || undefined,
    paymentType: greenInvoicePaymentType(event.paymentMethod),
    ...overrides,
  };
}
