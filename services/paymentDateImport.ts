import type { AppEvent } from '../types';

/** DD/MM/YYYY או DD.MM.YYYY → YYYY-MM-DD */
export function parseDdMmYyyyToIso(s: unknown): string | null {
  if (s == null || s === '') return null;
  const str = String(s).trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[./\\-](\d{1,2})[./\\-](\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * התאמת שורות מקובץ "נתוני אירועים" (עמודת Item ID + תאריך תשלום) לאירועים לפי externalId
 */
export function buildPaymentDateUpdates(events: AppEvent[], parsedRows: Record<string, string>[]): { id: string; paymentDate: string }[] {
  const byExt = new Map<string, AppEvent>();
  for (const e of events) {
    const ext = (e.externalId || '').trim();
    if (ext) byExt.set(ext, e);
  }
  const out: { id: string; paymentDate: string }[] = [];
  const seen = new Set<string>();

  for (const row of parsedRows) {
    const ext = (row['Item ID'] ?? row['item id'] ?? '').toString().trim();
    const payRaw = row['תאריך תשלום'] ?? row['תאריך תשלום '] ?? '';
    const iso = parseDdMmYyyyToIso(payRaw);
    if (!ext || !iso) continue;
    const ev = byExt.get(ext);
    if (!ev || seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push({ id: ev.id, paymentDate: iso });
  }
  return out;
}
