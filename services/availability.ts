import type { AppEvent } from '../types';
import { EventStatus } from '../types';

/** מקסימום משתתפים במקביל — תוכניות קליקאורים / קליקרים (1000 קליקרים) */
export const MAX_CLICKER_CAPACITY = 1000;
/** מקסימום משתתפים במקביל — פון קליך / טוק קליך */
export const MAX_SIMULTANEOUS_PARTICIPANTS = 500;
/** משך פעילות לבדיקה (דקות) */
export const SLOT_DURATION_MIN = 90;

export function normalizeTimeString(t: string): string {
  const parts = String(t || '').trim().split(':');
  const h = Math.min(23, Math.max(0, Number(parts[0]) || 0));
  const m = Math.min(59, Math.max(0, Number(parts[1]) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** תאריך YYYY-MM-DD מהאירוע */
function eventDateKey(ev: AppEvent): string | null {
  const d = ev.date;
  if (!d) return null;
  return d.includes('T') ? d.split('T')[0]! : d.slice(0, 10);
}

/** חלון זמן של אירוע במילישניות (UTC לפי מחרוזת מקומית) */
export function eventToInterval(ev: AppEvent): { startMs: number; endMs: number } | null {
  const datePart = eventDateKey(ev);
  if (!datePart) return null;
  const st = normalizeTimeString(ev.startTime || '09:00');
  const et = normalizeTimeString(ev.endTime || '10:30');
  const start = new Date(`${datePart}T${st}:00`);
  let end = new Date(`${datePart}T${et}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/** סכום משתתפים תפוסים בחפיפה לחלון [startMs, endMs] */
export function capacityUsedDuring(
  events: AppEvent[],
  startMs: number,
  endMs: number,
  options?: { excludeCancelled?: boolean }
): number {
  const excludeCancelled = options?.excludeCancelled !== false;
  let sum = 0;
  for (const ev of events) {
    if (excludeCancelled && ev.status === EventStatus.Cancelled) continue;
    const int = eventToInterval(ev);
    if (!int) continue;
    if (intervalsOverlap(startMs, endMs, int.startMs, int.endMs)) {
      sum += Math.max(0, Number(ev.clickersNeeded) || 0);
    }
  }
  return sum;
}

/** כמה מקומות פנויים בחלון */
export function freeCapacityDuring(events: AppEvent[], startMs: number, endMs: number): number {
  return Math.max(0, MAX_SIMULTANEOUS_PARTICIPANTS - capacityUsedDuring(events, startMs, endMs));
}

export function isSlotAvailable(
  events: AppEvent[],
  dateStr: string,
  startTime: string,
  requestedParticipants: number,
  options?: { filterEventTypes?: string[]; maxCapacity?: number }
): { available: boolean; freeCapacity: number; used: number } {
  const capacity = options?.maxCapacity ?? MAX_SIMULTANEOUS_PARTICIPANTS;
  const st = normalizeTimeString(startTime);
  const start = new Date(`${dateStr}T${st}:00`);
  if (Number.isNaN(start.getTime())) {
    return { available: false, freeCapacity: 0, used: capacity };
  }
  const end = new Date(start.getTime() + SLOT_DURATION_MIN * 60 * 1000);
  const filteredEvents = options?.filterEventTypes
    ? events.filter(e => options.filterEventTypes!.includes(e.eventType))
    : events;
  const used = capacityUsedDuring(filteredEvents, start.getTime(), end.getTime());
  const free = capacity - used;
  return {
    available: free >= requestedParticipants,
    freeCapacity: free,
    used,
  };
}

export interface SlotSuggestion {
  dateStr: string;
  time: string;
  startMs: number;
  score: number;
}

function addDays(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** אפשרויות שעה בחצאי שעות (התחלה 08:00–21:00) */
export function halfHourTimeOptions(): string[] {
  const out: string[] = [];
  for (let minutes = 8 * 60; minutes <= 21 * 60; minutes += 30) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** 4 חלונות קרובים בטווח ±2 ימים */
export function suggestNearestSlots(
  events: AppEvent[],
  preferredDateStr: string,
  preferredTime: string,
  requestedParticipants: number,
  count = 4,
  slotOptions?: { filterEventTypes?: string[]; maxCapacity?: number }
): SlotSuggestion[] {
  const pref = new Date(`${preferredDateStr}T${normalizeTimeString(preferredTime)}:00`);
  const prefMs = pref.getTime();
  if (Number.isNaN(prefMs)) return [];

  const candidates: SlotSuggestion[] = [];
  for (let dayOff = -2; dayOff <= 2; dayOff++) {
    const dateStr = addDays(preferredDateStr, dayOff);
    for (const time of halfHourTimeOptions()) {
      const start = new Date(`${dateStr}T${time}:00`);
      if (Number.isNaN(start.getTime())) continue;
      const end = new Date(start.getTime() + SLOT_DURATION_MIN * 60 * 1000);
      void end;
      const { available, freeCapacity } = isSlotAvailable(events, dateStr, time, requestedParticipants, slotOptions);
      if (!available) continue;
      const startMs = start.getTime();
      const dayDiff = Math.abs(dayOff);
      const minDiff = Math.abs(startMs - prefMs) / 60000;
      const score = dayDiff * 2000 + minDiff;
      candidates.push({ dateStr, time, startMs, score });
    }
  }

  const prefTimeNorm = normalizeTimeString(preferredTime);
  const filtered = candidates.filter(
    c => !(c.dateStr === preferredDateStr && c.time === prefTimeNorm)
  );
  filtered.sort((a, b) => a.score - b.score);

  const uniq: SlotSuggestion[] = [];
  const seen = new Set<string>();
  for (const c of filtered) {
    const key = `${c.dateStr}|${c.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(c);
    if (uniq.length >= count) break;
  }
  return uniq;
}

/** אפשרויות מספר משתתפים לטופס (50–500 בצעדי 50) */
export function participantStepOptions(): number[] {
  const out: number[] = [];
  for (let n = 50; n <= MAX_SIMULTANEOUS_PARTICIPANTS; n += 50) out.push(n);
  return out;
}
