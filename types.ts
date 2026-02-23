
export enum EventStatus {
  QuoteSent = 'הצעת מחיר נשלחה',
  Booked = 'שוריין',
  DoneUnpaid = 'בוצע ולא שולם',
  Paid = 'שולם מלא',
  Cancelled = 'בוטל'
}

export enum PaymentStatus {
  NotPaid = 'טרם שולם',
  PaidCash = 'שולם - מזומן',
  Paid = 'שולם',
  PaidTransferL = "שולם העברה ל'",
  PaidPartial = 'שולם חלקית',
  PaidCredit = 'שולם - אשראי',
  Net30 = 'שוטף + 30',
  PaidCheck = "שולם -צ'ק",
  Net60 = 'שוטף + 60',
  PaidTransferH = "שולם - העברה ח'",
  PaidTransferM = "שולם - העברה מ'",
  PaidProvider = "שולם לספק אלזס / קו..."
}

export enum EventType {
  ClickersProgram = 'תוכנית קליקרים כולל הנחיה / הפעלה',
  ClickAurimProgram = 'תוכנית קליקאורים כולל הנחיה / הפעלה',
  ClickForYouClickers = 'קליק פור יו - ערכת קליקרים להשכרה',
  ClickForYouAurim = 'קליק פור יו - ערכת קליקאורים להשכרה',
  TalkClick = 'טוק קליק - חדר ועידה אינטראקטיבי',
  PhoneClick = 'פון קליק - חידון במערכת הטלפונית'
}

export enum PaymentMethod {
  CreditCard = 'אשראי',
  BankTransfer = 'העברה בנקאית',
  Check = "צ'ק",
  Bit = 'ביט',
  Cash = 'מזומן',
  Other = 'אחר'
}

export enum LeadStatus {
  New = 'חדש',
  Contacted = 'נוצר קשר',
  Qualified = 'רלוונטי',
  Lost = 'לא רלוונטי',
  Converted = 'הפך ללקוח'
}

export enum TaskPriority {
  Low = 1,
  Medium = 3,
  High = 5
}

export type TaskCategory = 'קליכיף' | 'אישי' | 'בית' | 'תוכנית מדע' | 'שיווק' | 'כללי' | 'דחוף / לסיווג';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  companyName?: string;
  notes?: string;
}

export interface AppEvent {
  id: string;
  customerId: string;
  title: string; 
  date: string; 
  startTime: string;
  endTime: string;
  amount: number;
  paidAmount: number;
  status: EventStatus;
  paymentStatus: PaymentStatus;
  eventType: EventType;
  clickersNeeded: number;
  location: string;
  reminderDateTime?: string;
  tag: string;
  category?: string;
  hebrewDate?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  externalId?: string; 
  phone?: string;
  email?: string;
  termsAccepted?: boolean;
}

export interface Lead {
  id: string;
  name: string;
  source: string;
  status: LeadStatus;
  phone: string;
  email?: string;
  notes?: string;
  followUpDate?: string;
  followUpReminder?: string; 
}

export interface Task {
  id: string;
  title: string;
  isCompleted: boolean;
  priority: TaskPriority;
  category: TaskCategory;
  estimatedTimeMin: number;
  progress: number; 
  dueDate?: string;
  completedDate?: string;
  reminderDate?: string;
  mondayId?: string;
}

export type FormFieldType = 'text' | 'number' | 'date' | 'time' | 'email' | 'tel' | 'select' | 'textarea' | 'checkbox';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  mapping?: string;
}

export interface CustomForm {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  isActive: boolean;
  autoConfirm: boolean;
  themeColor: string;
}
