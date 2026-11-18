import { AppEvent, EventStatus, EventType } from '../types';
import { excludeEventFromKpis, parseEventDateKey } from './eventKpi';

export interface SecretaryCalendarDay {
  booked: AppEvent[];
  pending: AppEvent[];
  clickers: number;
  clickaorim: number;
}

const confirmed = new Set<string>([EventStatus.Booked, EventStatus.DoneUnpaid, EventStatus.Paid]);
const clickerTypes = new Set<string>([EventType.ClickersProgram, EventType.ClickForYouClickers]);
const clickaorimTypes = new Set<string>([EventType.ClickAurimProgram, EventType.ClickForYouAurim]);

/** סיכום מצטבר ליום; אין כאן חישוב זמינות או חפיפה בין אירועים. */
export function summarizeCalendarDays(events: AppEvent[]): Map<string, SecretaryCalendarDay> {
  const days = new Map<string, SecretaryCalendarDay>();
  for (const event of events) {
    const day = parseEventDateKey(event.date);
    if (!day || excludeEventFromKpis(event)) continue;
    let summary = days.get(day);
    if (!summary) {
      summary = { booked: [], pending: [], clickers: 0, clickaorim: 0 };
      days.set(day, summary);
    }
    if (!confirmed.has(String(event.status || '').trim())) {
      summary.pending.push(event);
      continue;
    }
    summary.booked.push(event);
    const amount = Math.max(0, Number(event.clickersNeeded) || 0);
    const type = String(event.eventType || '').trim();
    if (clickerTypes.has(type)) summary.clickers += amount;
    if (clickaorimTypes.has(type)) summary.clickaorim += amount;
  }
  for (const summary of days.values()) {
    summary.booked.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    summary.pending.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }
  return days;
}
