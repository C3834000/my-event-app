
import { AppEvent, Customer, EventStatus, Lead, LeadStatus, Task, TaskPriority, PaymentStatus, EventType } from '../types';

export const mockCustomers: Customer[] = [
  { id: '1772716933', name: 'תמר גלמן', email: 'tamarge1@clalit.org.il', phone: '0543363163', notes: 'מקור: גוגל' },
  { id: '1772716939', name: 'אילן טויטו', email: '5044313@gmail.com', phone: '0501234567', notes: 'מקור: בנימין אלימי' },
  { id: '1772716946', name: 'תיכון אהל משה', email: 'hodayadadush@gmail.com', phone: '0548401691', notes: '' },
  { id: '1772716953', name: 'תהילה קרואני', email: 'tgavra1@gmail.com', phone: '0527172832', notes: '' },
  { id: '1772716960', name: 'אוצר החיים בנים', email: 'otzar.613695@gmail.com', phone: '0534866258', notes: '' },
  { id: '1772716967', name: 'ישיבת איילת השחר', email: 'y0527176326@gmail.com', phone: '0534789316', notes: '' },
];

export const mockEvents: AppEvent[] = [
  {
    id: '1',
    customerId: '1772716933',
    title: 'חידון קליקרים - תמר גלמן',
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '12:00',
    amount: 1500,
    paidAmount: 0,
    status: EventStatus.Booked,
    paymentStatus: PaymentStatus.NotPaid,
    eventType: EventType.ClickersProgram,
    clickersNeeded: 50,
    location: 'ירושלים',
    tag: 'קליכיף',
    phone: '0543363163'
  },
  {
    id: '2',
    customerId: '1772716939',
    title: 'ערכת קליקאורים - אילן טויטו',
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    startTime: '16:00',
    endTime: '18:00',
    amount: 1200,
    paidAmount: 1200,
    status: EventStatus.Paid,
    paymentStatus: PaymentStatus.Paid,
    eventType: EventType.ClickForYouAurim,
    clickersNeeded: 30,
    location: 'בני ברק',
    tag: 'קליכיף',
    phone: '0501234567'
  }
];

export const mockLeads: Lead[] = [
  { id: 'l1', name: 'משה כהן', source: 'Facebook', status: LeadStatus.New, phone: '0501112233', notes: 'מתעניין בתוכנית מדע' },
  { id: 'l2', name: 'רבקה לוי', source: 'Google', status: LeadStatus.Contacted, phone: '0524445566', notes: 'צריכה הצעה לבת מצווה' }
];

export const mockTasks: Task[] = [
  { id: 't1', title: 'להכין מצגת לחידון קליקרים', isCompleted: false, priority: TaskPriority.High, category: 'קליכיף', estimatedTimeMin: 60, progress: 20 },
  { id: 't2', title: 'לקנות ציוד משרדי', isCompleted: false, priority: TaskPriority.Low, category: 'בית', estimatedTimeMin: 30, progress: 0 },
  { id: 't3', title: 'שיחת פולו-אפ עם משה כהן', isCompleted: false, priority: TaskPriority.Medium, category: 'שיווק', estimatedTimeMin: 15, progress: 0 },
  { id: 't4', title: 'לעדכן שאלות בתוכנית מדע תשפ"ה', isCompleted: false, priority: TaskPriority.High, category: 'תוכנית מדע', estimatedTimeMin: 120, progress: 10 },
  { id: 't5', title: 'לשלם חשבון חשמל', isCompleted: true, priority: TaskPriority.Medium, category: 'אישי', estimatedTimeMin: 5, progress: 100 },
  { id: 't6', title: 'לסווג משימות ממאנדיי', isCompleted: false, priority: TaskPriority.High, category: 'דחוף / לסיווג', estimatedTimeMin: 45, progress: 0 },
  { id: 't7', title: 'ניקיון תקופתי למקלט הקליקרים', isCompleted: false, priority: TaskPriority.Low, category: 'כללי', estimatedTimeMin: 90, progress: 0 },
];
