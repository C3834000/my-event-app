/**
 * תמחור תוכניות – מבוסס על טבלה ישנה (כולל מע"מ) + 30%, עיגול לעשרות.
 * משך בטבלה: 2 / 3 / 4 שעות. לפעילות של 1.5 שעות משתמשים ביחס לעמודת 2 שעות (×1.5/2).
 */

/** נקודות ייחוס מהטבלה המקורית (לפני העלאת 30%) */
const OLD_P = [50, 100, 200, 300, 400, 500, 600, 700, 800, 1000, 2000, 2500, 3000] as const;
const OLD_H2 = [140, 220, 340, 460, 580, 700, 820, 940, 1000, 1100, 1800, 2100, 2500];
const OLD_H3 = [200, 350, 500, 630, 750, 950, 1050, 1200, 1250, 1300, 2000, 2300, 2750];
/** 3000 משתתפים – 4 שעות ריק בטבלה המקורית; הושלם באקסטרפולציה לינארית מ־2000–2500 */
const OLD_H4 = [350, 450, 600, 750, 900, 1100, 1300, 1400, 1550, 1500, 2200, 2500, 2800];

export type DurationHours = 2 | 3 | 4 | 1.5;

/** עיגול למחיר בעשרות שקלים (775 → 780) */
export function roundPriceToTens(n: number): number {
  return Math.round(n / 10) * 10;
}

function interpolate(participants: number, xs: readonly number[], ys: number[]): number {
  if (participants <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (participants >= xs[last]) return ys[last];
  let i = 0;
  while (i < last && participants > xs[i + 1]) i++;
  const x0 = xs[i];
  const x1 = xs[i + 1];
  const y0 = ys[i];
  const y1 = ys[i + 1];
  return y0 + ((y1 - y0) * (participants - x0)) / (x1 - x0);
}

function oldBasePrice(participants: number, hours: 2 | 3 | 4): number {
  const ys = hours === 2 ? OLD_H2 : hours === 3 ? OLD_H3 : OLD_H4;
  return interpolate(participants, OLD_P, ys);
}

/**
 * רמת חיוב לפי מספר משתתפים (עיגול כלפי מעלה):
 * עד 500: כפולות 50 | 500–1000: כפולות 100 | 1000–3000: כפולות 200 | מעל 3000: 3000
 */
export function billingParticipantTier(rawParticipants: number): number {
  const n = Math.max(1, Math.ceil(Number(rawParticipants) || 0));
  if (n <= 500) return Math.min(500, Math.ceil(n / 50) * 50);
  if (n <= 1000) return Math.ceil(n / 100) * 100;
  return Math.min(3000, Math.ceil(n / 200) * 200);
}

/** כל רמות החיוב לתצוגה / טבלה */
export function allBillingTiers(): number[] {
  const a: number[] = [];
  for (let p = 50; p <= 500; p += 50) a.push(p);
  for (let p = 600; p <= 1000; p += 100) a.push(p);
  for (let p = 1200; p <= 3000; p += 200) a.push(p);
  return a;
}

/**
 * מחיר אחרי +30% ועיגול לעשרות, לפי משך (שעות).
 * 1.5 שעה = יחס לעמודת 2 שעות (לא מינימום 2 שעות מלאות).
 */
export function priceForParticipantsAndDuration(
  rawParticipants: number,
  durationHours: DurationHours
): number {
  const tier = billingParticipantTier(rawParticipants);
  let baseOld: number;
  if (durationHours === 1.5) {
    baseOld = oldBasePrice(tier, 2) * (1.5 / 2);
  } else {
    baseOld = oldBasePrice(tier, durationHours);
  }
  return roundPriceToTens(baseOld * 1.3);
}

/** שורה בטבלה (לתצוגה) */
export interface PricingRow {
  participants: number;
  price2h: number;
  price3h: number;
  price4h: number;
  price1_5h: number;
}

export function buildFullPricingTable(): PricingRow[] {
  return allBillingTiers().map((participants) => ({
    participants,
    price2h: priceForParticipantsAndDuration(participants, 2),
    price3h: priceForParticipantsAndDuration(participants, 3),
    price4h: priceForParticipantsAndDuration(participants, 4),
    price1_5h: priceForParticipantsAndDuration(participants, 1.5),
  }));
}
