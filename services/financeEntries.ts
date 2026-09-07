// ============================================================================
// רישום פיננסי משותף — הוצאות קבועות/שוטפות, תרומות ומשכורות, עם תיוג עסק/בית.
// הנתונים נשמרים בענן (settings.data.financeEntries) + עותק מקומי לטעינה מהירה.
// משמש גם את לוח הדוחות (ChartsBoard) וגם את מסך מצב המס (TaxBoard).
// ============================================================================
import { settingsService } from './supabase';

export type FinanceEntryType = 'fixedExpense' | 'variableExpense' | 'donation' | 'salary';
export type FinanceScope = 'business' | 'home';

export interface FinanceEntry {
  id: string;
  type: FinanceEntryType;
  label: string;
  amount: number;
  date: string;         // YYYY-MM-DD — עבור קבועות/משכורת: מהחודש הזה והלאה
  scope?: FinanceScope; // רישומים ישנים בלי שדה — עסק (תאימות לאחור)
}

export const FINANCE_STORAGE_KEY = 'ME_CFM_FINANCE_ENTRIES_V1';

/** תיוג בפועל: משכורת היא תמיד "בית"; רישום ישן בלי תיוג — "עסק" */
export const entryScope = (e: FinanceEntry): FinanceScope =>
  e.type === 'salary' ? 'home' : (e.scope || 'business');

export const ENTRY_TYPE_LABELS: Record<FinanceEntryType, string> = {
  fixedExpense: 'הוצאה קבועה',
  variableExpense: 'הוצאה שוטפת',
  donation: 'תרומה',
  salary: 'משכורת',
};

/** האם הרישום חוזר כל חודש (קבועה/משכורת) או חד-פעמי בחודש שלו */
export const isRecurring = (e: FinanceEntry) => e.type === 'fixedExpense' || e.type === 'salary';

export function loadFinanceEntriesLocal(): FinanceEntry[] {
  try {
    const raw = localStorage.getItem(FINANCE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function loadFinanceEntriesCloud(): Promise<FinanceEntry[] | null> {
  try {
    const s = await settingsService.get();
    if (Array.isArray(s?.data?.financeEntries)) {
      localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(s.data.financeEntries));
      return s.data.financeEntries;
    }
  } catch { /* offline — נשתמש בעותק המקומי */ }
  return null;
}

/** שמירה: עותק מקומי מיידי + מיזוג לענן (בלי לדרוס מפתחות אחרים בהגדרות) */
export async function saveFinanceEntries(entries: FinanceEntry[]): Promise<void> {
  try { localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
  try {
    const s = await settingsService.get();
    await settingsService.update({ data: { ...(s?.data || {}), financeEntries: entries } });
  } catch { /* הענן לא זמין — יסתנכרן בשמירה הבאה */ }
}

// ── הגדרות מס (ניכוי במקור, מקדמות, חובות קיימים) ────────────────────────────
export interface TaxSettings {
  withholdingRate: number;     // אחוז ניכוי במקור שהלקוחות מנכים (ברירת מחדל 30)
  advanceRate: number;         // שיעור מקדמות מס הכנסה מהמחזור (מהתיק: 4%)
  vatDebt: number;             // חוב מע"מ קיים (בור העבר)
  incomeTaxDebt: number;       // חוב מס הכנסה קיים
  debtAsOf: string;            // לאיזה תאריך נכונים סכומי החוב
  monthlyDebtPayment: number;  // כמה מפרישים בחודש לסגירת החוב
}

// ברירות מחדל לפי "ריכוז יתרות" ברשות המסים (07/09/2026) — ניתנים לעריכה במסך
export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  // לפי נתוני העזר לדוח השנתי (2025): 39 מנכים דיווחו 299,111 ₪ עסקאות — ומס שנוכה 0.
  // בפועל הלקוחות משלמים סכום מלא ולא מנכים במקור.
  withholdingRate: 0,
  advanceRate: 4,
  vatDebt: 93465,
  incomeTaxDebt: 28301,
  debtAsOf: '2026-09-07',
  monthlyDebtPayment: 0,
};

export async function loadTaxSettings(): Promise<TaxSettings> {
  try {
    const s = await settingsService.get();
    const t = s?.data?.taxSettings;
    if (t && typeof t === 'object') return { ...DEFAULT_TAX_SETTINGS, ...t };
  } catch { /* ignore */ }
  return DEFAULT_TAX_SETTINGS;
}

export async function saveTaxSettings(taxSettings: TaxSettings): Promise<void> {
  try {
    const s = await settingsService.get();
    await settingsService.update({ data: { ...(s?.data || {}), taxSettings } });
  } catch { /* ignore */ }
}
