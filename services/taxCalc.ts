// ============================================================================
// חישובי מס לעצמאי (עוסק מורשה, דיווח מע"מ דו-חודשי) — הערכות בלבד,
// לא תחליף לרו"ח. מקורות: מדרגות מס 2026, מע"מ 18%, זיכוי תרומות 35% (סעיף 46).
// ============================================================================

export const VAT_RATE = 0.18;
export const NATIONAL_INSURANCE_RATE = 0.12;      // הערכה שמרנית לעצמאי
export const DONATION_CREDIT_RATE = 0.35;         // סעיף 46
export const DONATION_MINIMUM = 207;              // רצפת תרומות שנתית
export const DONATION_TAXABLE_INCOME_CAP_RATE = 0.3;

const INCOME_TAX_BRACKETS_ANNUAL = [
  { upTo: 84120, rate: 0.10 },
  { upTo: 120720, rate: 0.14 },
  { upTo: 228000, rate: 0.20 },
  { upTo: 301200, rate: 0.31 },
  { upTo: 560280, rate: 0.35 },
  { upTo: 721560, rate: 0.47 },
  { upTo: Infinity, rate: 0.50 },
];

/** מס הכנסה שנתי לפי מדרגות (לפני זיכויים) */
export function annualIncomeTax(annualTaxable: number): number {
  let tax = 0, prev = 0;
  for (const b of INCOME_TAX_BRACKETS_ANNUAL) {
    const slice = Math.max(0, Math.min(annualTaxable, b.upTo) - prev);
    tax += slice * b.rate;
    prev = b.upTo;
    if (annualTaxable <= b.upTo) break;
  }
  return tax;
}

/** חלק המע"מ מתוך סכום כולל מע"מ */
export const vatFromGross = (gross: number) => gross - gross / (1 + VAT_RATE);

/** תקופות דיווח מע"מ דו-חודשיות לשנה: ינו-פבר, מרץ-אפר, ... */
export interface VatPeriod {
  key: string;          // "2026-P1"
  label: string;        // "ינואר–פברואר"
  months: string[];     // ["2026-01", "2026-02"]
  reportDueDate: string; // YYYY-MM-DD — עד ה-19 בחודש העוקב (דיווח מקוון)
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function vatPeriodsForYear(year: number): VatPeriod[] {
  const periods: VatPeriod[] = [];
  for (let i = 0; i < 6; i++) {
    const m1 = i * 2 + 1, m2 = i * 2 + 2;
    const dueMonth = m2 === 12 ? 1 : m2 + 1;
    const dueYear = m2 === 12 ? year + 1 : year;
    periods.push({
      key: `${year}-P${i + 1}`,
      label: `${HE_MONTHS[m1 - 1]}–${HE_MONTHS[m2 - 1]}`,
      months: [`${year}-${String(m1).padStart(2, '0')}`, `${year}-${String(m2).padStart(2, '0')}`],
      reportDueDate: `${dueYear}-${String(dueMonth).padStart(2, '0')}-19`,
    });
  }
  return periods;
}

/** זיכוי תרומות: 35% מהתרומות, בכפוף לרצפה ולתקרה של 30% מההכנסה החייבת */
export function donationCredit(donationsTotal: number, annualTaxable: number): number {
  if (donationsTotal < DONATION_MINIMUM) return 0;
  const eligible = Math.min(donationsTotal, annualTaxable * DONATION_TAXABLE_INCOME_CAP_RATE);
  return eligible * DONATION_CREDIT_RATE;
}
