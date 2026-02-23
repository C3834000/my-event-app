/**
 * ייבוא נתונים מ-Monday.com עם מיפוי נכון
 */

import { AppEvent, PaymentStatus, EventStatus, EventType } from '../types';

/**
 * המרת תאריך מפורמט DD/MM/YYYY ל-YYYY-MM-DD
 */
function convertDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return new Date().toISOString().split('T')[0];
  
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * המרת סטטוס תשלום מ-Monday לפורמט המערכת
 */
function mapPaymentStatus(mondayStatus: string): PaymentStatus {
  const status = mondayStatus.toLowerCase().trim();
  
  if (status.includes('שולם - מזומן') || status.includes('מזומן')) return PaymentStatus.PaidCash;
  if (status.includes('שולם - אשראי') || status.includes('אשראי')) return PaymentStatus.PaidCredit;
  if (status.includes('שולם - העברה') || status.includes('העברה')) return PaymentStatus.PaidTransferM;
  if (status.includes('שולם -צ\'ק') || status.includes('צ\'ק') || status.includes('צק')) return PaymentStatus.PaidCheck;
  if (status.includes('שולם העברה ל')) return PaymentStatus.PaidTransferL;
  if (status.includes('שולם העברה ה')) return PaymentStatus.PaidTransferH;
  if (status.includes('שולם')) return PaymentStatus.Paid;
  if (status.includes('טרם שולם')) return PaymentStatus.NotPaid;
  
  return PaymentStatus.NotPaid;
}

/**
 * המרת סטטוס אירוע מ-Monday
 */
function mapEventStatus(mondayStatus: string): EventStatus {
  const status = mondayStatus.toLowerCase().trim();
  
  if (status.includes('בוצע ושולם')) return EventStatus.Paid;
  if (status.includes('בוצע ולא שולם')) return EventStatus.DoneUnpaid;
  if (status.includes('לפני ביצוע')) return EventStatus.Booked;
  
  return EventStatus.Booked;
}

/**
 * המרת סוג אירוע מ-Monday
 */
function mapEventType(mondayType: string): EventType {
  const type = mondayType.toLowerCase().trim();
  
  if (type.includes('קליקאורים') && type.includes('הנחיה')) return EventType.ClickAurimProgram;
  if (type.includes('קליקרים') && type.includes('הנחיה')) return EventType.ClickersProgram;
  if (type.includes('קליק פור יו') && type.includes('קליקאורים')) return EventType.ClickForYouAurim;
  if (type.includes('קליק פור יו') && type.includes('קליקרים')) return EventType.ClickForYouClickers;
  if (type.includes('פון קליק')) return EventType.PhoneClick;
  if (type.includes('טוק קליק')) return EventType.TalkClick;
  
  return EventType.ClickersProgram;
}

/**
 * ייבוא אירועים מקובץ CSV של Monday
 */
export function importMondayEvents(csvData: any[]): AppEvent[] {
  const events: AppEvent[] = [];
  
  csvData.forEach((row, index) => {
    try {
      // קריאת שדות מה-CSV
      const name = row['Name'] || row['שם'] || '';
      const phone = row['מס\' טלפון: (המס\' שיהיה זמין בעת האירוע)'] || row['טלפון'] || '';
      const itemId = row['Item ID'] || `T-${Date.now()}-${index}`;
      const eventType = row['סוג אירוע'] || '';
      const tag = row['תג אירוע'] || 'קליכיף';
      const paymentStatusStr = row['סטטוס תשלום'] || '';
      const amount = parseFloat(row['סכום סופי לתשלום'] || '0') || 0;
      const statusStr = row['Status'] || '';
      const eventDate = row['תאריך קיום האירוע'] || '';
      const hebrewDate = row['תאריך אירוע עברי'] || '';
      const location = row['כתובת האירוע'] || '';
      const notes = row['הערות'] || '';
      const email = row['כתובת דוא"ל'] || '';
      const participants = parseInt(row['כמות משתתפים משוערת'] || '0') || 0;
      const category = row['קטגוריה'] || '';
      
      // חישוב paidAmount לפי הסטטוס
      const paymentStatus = mapPaymentStatus(paymentStatusStr);
      const eventStatus = mapEventStatus(statusStr);
      let paidAmount = 0;
      
      if (eventStatus === EventStatus.Paid || paymentStatus !== PaymentStatus.NotPaid) {
        paidAmount = amount; // אם שולם - הסכום המלא
      }
      
      const event: AppEvent = {
        id: `monday_${itemId}`,
        customerId: '',
        title: name,
        date: convertDate(eventDate),
        startTime: '10:00',
        endTime: '12:00',
        amount: amount,
        paidAmount: paidAmount,
        status: eventStatus,
        paymentStatus: paymentStatus,
        eventType: mapEventType(eventType),
        location: location,
        tag: tag,
        phone: phone,
        email: email,
        clickersNeeded: participants,
        notes: notes,
        hebrewDate: hebrewDate,
        externalId: itemId,
        category: category
      };
      
      events.push(event);
    } catch (err) {
      console.error('שגיאה בייבוא שורה:', index, err);
    }
  });
  
  return events;
}

/**
 * חישוב סטטיסטיקות מנתוני Monday
 */
export function calculateMondayStats(events: AppEvent[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let totalRevenue = 0;
  let openDebt = 0;
  let projectedIncome = 0;
  
  // פילוח לפי חודש
  const byMonth: Record<string, { revenue: number; count: number }> = {};
  
  // פילוח לפי תג
  const byTag: Record<string, { revenue: number; count: number }> = {};
  
  // פילוח לפי סוג אירוע
  const byType: Record<string, { revenue: number; count: number }> = {};
  
  events.forEach(ev => {
    const eventDate = new Date(ev.date);
    eventDate.setHours(0, 0, 0, 0);
    const isPast = eventDate < today;
    const isFuture = eventDate >= today;
    
    // סה"כ הכנסות - כל מה ששולם
    totalRevenue += ev.paidAmount || 0;
    
    // חוב פתוח
    const debt = ev.amount - (ev.paidAmount || 0);
    if (debt > 0 && ev.paymentStatus !== PaymentStatus.Paid) {
      openDebt += debt;
    }
    
    // צפי הכנסות - אירועים עתידיים שעדיין לא שולמו
    if (isFuture && debt > 0) {
      projectedIncome += debt;
    }
    
    // פילוח לפי חודש
    const monthKey = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[monthKey]) byMonth[monthKey] = { revenue: 0, count: 0 };
    byMonth[monthKey].revenue += ev.paidAmount || 0;
    byMonth[monthKey].count++;
    
    // פילוח לפי תג
    const tagKey = ev.tag || 'אחר';
    if (!byTag[tagKey]) byTag[tagKey] = { revenue: 0, count: 0 };
    byTag[tagKey].revenue += ev.paidAmount || 0;
    byTag[tagKey].count++;
    
    // פילוח לפי סוג אירוע
    const typeKey = ev.eventType || 'אחר';
    if (!byType[typeKey]) byType[typeKey] = { revenue: 0, count: 0 };
    byType[typeKey].revenue += ev.paidAmount || 0;
    byType[typeKey].count++;
  });
  
  return {
    totalRevenue,
    openDebt,
    projectedIncome,
    byMonth,
    byTag,
    byType
  };
}
