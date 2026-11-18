import { AppEvent, Customer, Lead, LeadStatus, Task, TaskPriority } from '../types';
import { eventContributesToOpenDebt, eventOpenAmount, excludeEventFromKpis, parseEventDateKey } from './eventKpi';

export type SecretaryBucket = 'urgent' | 'today' | 'week' | 'backlog' | 'later' | 'stuck' | 'done';

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

export function completedOnDay(value: string | undefined, day: string): boolean {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value === day;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === day;
}

export function taskBucket(task: Task, today: string, weekEnd: string): SecretaryBucket | null {
  if (task.isCompleted) return completedOnDay(task.completedDate, today) ? 'done' : null;
  if (task.deskStatus === 'stuck') return 'stuck';
  const due = parseEventDateKey(task.dueDate);
  if (due && (due < today || (due === today && Number(task.priority) >= TaskPriority.High))) return 'urgent';
  if (due === today || task.focusDate === today) return 'today';
  if (due && due <= weekEnd) return 'week';
  if (!due) return 'backlog';
  return 'later';
}

export function buildSecretaryDeskData(tasks: Task[], leads: Lead[], events: AppEvent[], customers: Customer[], today: string) {
  const weekEnd = addCalendarDays(today, 7);
  const mine = tasks.filter(task => task.assignee === 'מזכירה');
  const grouped: Record<SecretaryBucket, Task[]> = { urgent: [], today: [], week: [], backlog: [], later: [], stuck: [], done: [] };
  for (const task of mine) {
    const bucket = taskBucket(task, today, weekEnd);
    if (bucket) grouped[bucket].push(task);
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => (parseEventDateKey(a.dueDate) || '9999').localeCompare(parseEventDateKey(b.dueDate) || '9999') || Number(b.priority) - Number(a.priority));
  }

  const openLeads = leads.filter(lead => lead.status !== LeadStatus.Lost && lead.status !== LeadStatus.Converted);
  openLeads.sort((a, b) => (parseEventDateKey(a.followUpDate) || '9999').localeCompare(parseEventDateKey(b.followUpDate) || '9999'));
  const dueLeads = openLeads.filter(lead => {
    const followUp = parseEventDateKey(lead.followUpDate);
    return lead.status === LeadStatus.New || (!!followUp && followUp <= today);
  });
  const upcoming = events.filter(event => {
    const date = parseEventDateKey(event.date);
    return !!date && date >= today && date <= weekEnd && !excludeEventFromKpis(event);
  }).sort((a, b) => (parseEventDateKey(a.date) || '').localeCompare(parseEventDateKey(b.date) || '') || (a.startTime || '').localeCompare(b.startTime || ''));
  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  const debt = events.filter(event => eventContributesToOpenDebt(event, today))
    .map(event => ({ event, customer: customerById.get(event.customerId), amount: eventOpenAmount(event) }))
    .sort((a, b) => (parseEventDateKey(a.event.date) || '').localeCompare(parseEventDateKey(b.event.date) || ''));
  const marketing = mine.filter(task => !task.isCompleted && /שיווק/.test(task.category || ''));
  return { mine, grouped, openLeads, dueLeads, upcoming, debt, marketing, weekEnd };
}
