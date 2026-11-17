/** תאריך עברי (דרך Intl, בלי ספריות) — יום, חודש ושנה באותיות, וחגים עיקריים. */

const fmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' });

export type HebrewDate = { day: number; month: string; year: number };

export function toHebrew(date: Date): HebrewDate {
  const parts = fmt.formatToParts(date);
  return {
    day: Number(parts.find((p) => p.type === 'day')?.value || 1),
    month: parts.find((p) => p.type === 'month')?.value || '',
    year: Number(parts.find((p) => p.type === 'year')?.value || 0),
  };
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** מספר באותיות עבריות עם גרש/גרשיים (1–999): 7 → ז׳, 15 → ט״ו, 787 → תשפ״ז */
export function gematria(n: number): string {
  let num = Math.floor(n) % 1000;
  if (num <= 0) return '';
  let s = HUNDREDS[Math.floor(num / 100)];
  num %= 100;
  if (num === 15) s += 'טו';
  else if (num === 16) s += 'טז';
  else s += TENS[Math.floor(num / 10)] + ONES[num % 10];
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}

export const hebrewDayLabel = (h: HebrewDate) => gematria(h.day);
export const hebrewYearLabel = (year: number) => gematria(year % 1000);
export const hebrewMonthLabel = (h: HebrewDate) => `${h.month} ${hebrewYearLabel(h.year)}`;

/** חגים ומועדים עיקריים לפי תאריך עברי (בארץ) */
export function hebrewHoliday(h: HebrewDate, date: Date): string {
  const { day, month } = h;
  const isAdarForPurim = month === 'אדר' || month === 'אדר ב׳' || month === "אדר ב'";
  switch (month) {
    case 'תשרי':
      if (day === 1 || day === 2) return 'ראש השנה';
      if (day === 3 && date.getDay() !== 6) return 'צום גדליה';
      if (day === 9) return 'ערב יום כיפור';
      if (day === 10) return 'יום כיפור';
      if (day === 14) return 'ערב סוכות';
      if (day === 15) return 'סוכות';
      if (day >= 16 && day <= 20) return 'חול המועד סוכות';
      if (day === 21) return 'הושענא רבה';
      if (day === 22) return 'שמחת תורה';
      return '';
    case 'כסלו':
      return day >= 25 ? 'חנוכה' : '';
    case 'טבת':
      if (day <= 2) return 'חנוכה';
      if (day === 3) {
        // חנוכה נמשך 8 ימים: כשכסלו חסר (29 ימים) — גם ג׳ טבת
        const prev = new Date(date);
        prev.setDate(prev.getDate() - 3);
        return toHebrew(prev).day === 30 ? '' : 'חנוכה';
      }
      if (day === 10) return 'עשרה בטבת';
      return '';
    case 'שבט':
      return day === 15 ? 'ט״ו בשבט' : '';
    default:
      break;
  }
  if (isAdarForPurim) {
    if (day === 13) return 'תענית אסתר';
    if (day === 14) return 'פורים';
    if (day === 15) return 'שושן פורים';
    return '';
  }
  switch (month) {
    case 'ניסן':
      if (day === 14) return 'ערב פסח';
      if (day === 15) return 'פסח';
      if (day >= 16 && day <= 20) return 'חול המועד פסח';
      if (day === 21) return 'שביעי של פסח';
      return '';
    case 'אייר':
      return day === 18 ? 'ל״ג בעומר' : '';
    case 'סיון':
    case 'סיוון':
      if (day === 5) return 'ערב שבועות';
      if (day === 6) return 'שבועות';
      return '';
    case 'תמוז':
      return day === 17 ? 'י״ז בתמוז' : '';
    case 'אב':
      return day === 9 ? 'תשעה באב' : '';
    case 'אלול':
      return day === 29 ? 'ערב ראש השנה' : '';
    default:
      return '';
  }
}

/** יום ראשון של החודש העברי שהתאריך נמצא בו */
export function startOfHebrewMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - (toHebrew(d).day - 1));
  return d;
}

/** כל הימים (לועזיים) של החודש העברי שמתחיל ב-start */
export function hebrewMonthDays(start: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(start);
  do {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  } while (toHebrew(d).day !== 1 && days.length < 31);
  return days;
}
