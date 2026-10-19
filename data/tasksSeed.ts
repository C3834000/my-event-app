import { Task, TaskCategory, TaskFrequency, TaskPriority } from '../types';

type SeedRow = {
  title: string;
  category: TaskCategory;
  minutes: number;
  day?: 'today' | 'week' | 'until28' | '28.7' | '10.8' | 'evening' | 'urgent';
  time?: string;
  helper?: string;
  notes?: string;
  frequency?: TaskFrequency;
  priority?: TaskPriority;
};

const endOfWeek = () => {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? 0 : 7 - day));
  return d.toISOString().slice(0, 10);
};

const today = () => new Date().toISOString().slice(0, 10);

const resolveDay = (day?: SeedRow['day']): { dueDate?: string; priority?: TaskPriority } => {
  switch (day) {
    case 'today':
    case 'evening':
      return { dueDate: today() };
    case 'week':
      return { dueDate: endOfWeek() };
    case 'until28':
    case '28.7':
      return { dueDate: '2026-07-28' };
    case '10.8':
      return { dueDate: '2026-08-10' };
    case 'urgent':
      return { priority: TaskPriority.High };
    default:
      return {};
  }
};

/** ~54 משימות מהרשימה המרוכזת (יולי 2026) */
const ROWS: SeedRow[] = [
  { title: 'לסיים את תוכנית התחרויות לישיבות', category: 'דחוף', minutes: 60, day: 'until28', helper: 'עוזר', notes: 'דעת חיים ובית מתתיהו', priority: TaskPriority.High },
  { title: 'להכין תוכנית לאירוע בית מתתיהו בצהריים', category: 'אירועים', minutes: 30, day: '28.7', time: '12:00', helper: 'עוזר' },
  { title: 'לבדוק חלוקת קבוצות, ניקוד וגיבוי לתחרות', category: 'תוכנה', minutes: 45, day: 'until28', helper: 'עוזר' },

  { title: 'להכניס סוללות ל-400 קליקלייט', category: 'קליקלייט', minutes: 120, day: 'until28', helper: 'הילדים', notes: 'בקבוצות של 100' },
  { title: 'לקנות סוללות לכל הקליקליים', category: 'קליקלייט', minutes: 30, day: 'week', helper: 'עוזר', notes: 'כולל רזרבה' },
  { title: 'לבדוק רסיבר חדש וחיבור קליקלייט לקליקליים', category: 'קליקלייט', minutes: 45, day: 'week', helper: 'עוזר', notes: 'טווח, תגובה וסנכרון' },
  { title: 'להכין אבטיפוס מושלם לקליקלייט', category: 'קליקלייט', minutes: 60, day: 'week', helper: 'עוזר' },
  { title: 'לקודד 500 קליקלייטים', category: 'קליקלייט', minutes: 180, helper: 'הילדים' },
  { title: 'להדביק מדבקות על הקליקלייטים', category: 'קליקלייט', minutes: 60, helper: 'עוזר' },
  { title: 'להדפיס מדבקות חדשות', category: 'קליקלייט', minutes: 30, day: 'week', helper: 'עוזר' },
  { title: 'למצוא רצועות וחוטים מתאימים לקליקלייט', category: 'קליקלייט', minutes: 45, day: 'week', helper: 'עוזר' },
  { title: 'להכין חוטים מוכנים לחיבור הקליקלייט', category: 'קליקלייט', minutes: 60, helper: 'עוזר' },
  { title: 'למצוא בגרפיקל פתרון לארגון קליקלייט', category: 'קליקלייט', minutes: 45, day: 'week', helper: 'גרפיקל', notes: 'מידות, מחיצות ידיות' },
  { title: 'להכין ולסמן ארגזים לציוד', category: 'קליקלייט', minutes: 60, helper: 'עוזר' },

  { title: 'לסיים סרטון פתיחה', category: 'וידאו', minutes: 60, helper: 'עוזר' },
  { title: 'לסיים סרטון מנצחים ותבנית סרטוני סיום', category: 'וידאו', minutes: 90, helper: 'עוזר' },
  { title: 'להשלים סרטוני מעבר לעשרת הלוקיישנים', category: 'וידאו', minutes: 120, helper: 'עוזר', notes: 'הקליק הנכון במקום הנכון' },

  { title: 'לעבור על אפליקציית החידון ולבדוק שהכל עובד', category: 'תוכנה', minutes: 60, helper: 'עוזר' },
  { title: 'לבדוק שהורדת חידון מתאפשרת רק לאחר תשלום', category: 'תוכנה', minutes: 30, helper: 'עוזר' },
  { title: 'להוסיף כפתור איפוס נקודות', category: 'תוכנה', minutes: 30, helper: 'עוזר' },

  { title: 'לסיים משחק פאזל קבוצתי', category: 'משחקים', minutes: 60, helper: 'עוזר' },
  { title: 'לסיים משחק קבוצתי ומשחק לוח קבוצתי', category: 'משחקים', minutes: 90, helper: 'עוזר' },
  { title: 'לבנות איקס-עיגול, דמקה, ארבע בשורה ומבוך', category: 'משחקים', minutes: 180, helper: 'עוזר' },
  { title: 'להשלים משחקי אורות עם שופטים אוטומטיים', category: 'משחקים', minutes: 120, helper: 'עוזר' },

  { title: 'להכין תוכנית קיץ תשפ"ו', category: 'תוכנית קיץ', minutes: 90, helper: 'עוזר', notes: 'הנחיה, שיפוט, שאלות' },
  { title: 'להוסיף מבחן אישיות לתוכנית הקיץ', category: 'תוכנית קיץ', minutes: 60, helper: 'עוזר' },

  { title: 'להכין כתבה שיווקית לבהדרי', category: 'שיווק', minutes: 45, day: 'today', time: '18:00', helper: 'עוזר' },
  { title: 'להכין באנרים לבהדרי', category: 'שיווק', minutes: 45, day: 'today', time: '18:00', helper: 'עוזר' },
  { title: 'לשלוח לבהדרי קישור לאפליקציה ולדף הנחיתה', category: 'שיווק', minutes: 20, day: 'today', time: '18:00', helper: 'עוזר' },
  { title: 'להכין מבצע חידון טלפוני חינם', category: 'שיווק', minutes: 30, helper: 'עוזר' },
  { title: 'לפרסם נציגי ערים לקליכשר במחיר מוזל', category: 'שיווק', minutes: 45, day: 'urgent', helper: 'עוזר', priority: TaskPriority.High },
  { title: 'לפרסם חידון טלפוני במחיר מוזל', category: 'שיווק', minutes: 30, helper: 'עוזר' },
  { title: 'להעלות סטטוס יומי ושאלת סקר יומית', category: 'שיווק', minutes: 15, helper: 'עוזר', frequency: TaskFrequency.Daily },
  { title: 'לפרסם מודעת דרושים לעובד בין הזמנים', category: 'שיווק', minutes: 30, day: 'week', helper: 'עוזר' },

  { title: 'להוסיף שאלות חדשות לאפליקציה ולמאגר', category: 'תוכן', minutes: 30, helper: 'עוזר', frequency: TaskFrequency.Daily },
  { title: 'לאסוף שאלות טריוויה שנשאלו בקעמפים', category: 'תוכן', minutes: 45, helper: 'עוזר' },

  { title: 'להזין את האירועים מתוך גפן במערכת', category: 'מערכת', minutes: 45, helper: 'עוזר' },

  { title: 'לדבר עם אבוטבול על הרעיון החדש', category: 'שיחות', minutes: 20, day: 'week', helper: 'עוזר' },
  { title: 'לסדר שליח נוסף מבלימי', category: 'תפעול', minutes: 15, day: 'urgent', helper: 'עוזר', priority: TaskPriority.High },

  { title: 'לבנות תזרים לחודש הקרוב', category: 'כספים', minutes: 60, day: 'week', helper: 'עוזר' },
  { title: 'לחשב הכנסות, הוצאות ולסגור חובות', category: 'כספים', minutes: 60, day: 'week', helper: 'עוזר' },
  { title: 'להוסיף לחשבוניות את הוצאות אירוע חב"ד', category: 'כספים', minutes: 30, day: 'week', helper: 'עוזר' },
  { title: 'לעקוב אחר תשלום משמרת השלום', category: 'כספים', minutes: 10, day: '10.8', helper: 'עוזר', notes: '₪ 5,000' },
  { title: 'לעקוב אחר תשלום קול תורה ישייק', category: 'כספים', minutes: 10, helper: 'עוזר', notes: '₪ 3,200' },
  { title: 'לעקוב אחר תשלום ישיבת פני מנחם', category: 'כספים', minutes: 10, helper: 'עוזר', notes: '₪ 2,200' },

  { title: 'לאסוף את כל ציוד המעבדה מקליקה ולהעביר לבית', category: 'ציוד', minutes: 45, day: 'evening', time: '18:00', helper: 'עוזר' },
  { title: 'לחזק את פלטת העץ בעמדה בקליקה', category: 'ציוד', minutes: 30, day: 'evening', time: '18:00', helper: 'עוזר', notes: 'עץ, מברגה, ברגים ומסור' },

  { title: 'לקבוע טיפול שיניים אצל פרחי', category: 'אישי', minutes: 10, helper: 'עוזר' },
  { title: 'לבדוק ביטוח רכב וטסט', category: 'אישי', minutes: 30, helper: 'עוזר' },
  { title: 'לאסוף את המכנסיים', category: 'אישי', minutes: 20, helper: 'עוזר' },

  { title: 'לתכנן זמן חוויה עם הבנים', category: 'משפחה', minutes: 30, day: 'week', helper: 'עוזר' },
  { title: 'ללמוד עם הבנים ולעזור בהשכבה', category: 'משפחה', minutes: 60, helper: 'עוזר', frequency: TaskFrequency.Daily, time: '20:00' },
  { title: 'לקבוע תפילות שחרית, מנחה וערבית בלוח החופש', category: 'משפחה', minutes: 10, helper: 'עוזר', frequency: TaskFrequency.Daily },

  { title: 'לטפל בכלים, מצעים וקיפול בבית', category: 'בית', minutes: 45, day: 'week', helper: 'עוזר' },
];

/** סדר תצוגה לקטגוריות שבאמת בשימוש, כולל אלו שחסרו בכפתורי הסינון */
export const TASK_CATEGORY_ORDER: TaskCategory[] = [
  'קליכיף',
  'קליכיף שוטף',
  'קליכיף שיווק',
  'שיווק',
  'תוכנית מדע',
  'תוכנה',
  'קליקלייט',
  'וידאו',
  'משחקים',
  'תוכנית קיץ',
  'תוכן',
  'אירועים',
  'מערכת',
  'כספים',
  'מתיקין',
  'בית',
  'בית ומשפחה',
  'חתונה',
  'משפחה',
  'אישי',
  'רעיונות',
  'שיחות',
  'תפעול',
  'ציוד',
  'כללי',
  'דחוף',
  'דחוף / לסיווג',
  'לסיווג',
  'ארכיון',
];

export const TASK_CATEGORIES: TaskCategory[] = [...TASK_CATEGORY_ORDER];

export type TopCategoryId =
  | 'קליכיף'
  | 'כספים'
  | 'מתיקין'
  | 'בית ומשפחה'
  | 'אישי'
  | 'רעיונות'
  | 'לסיווג';

export type TopCategoryMeta = {
  id: TopCategoryId;
  border: string;
  tag: string;
  chip: string;
  chipOn: string;
  bar: string;
};

/** שישה תחומים + תיבת «לסיווג». המחלקות מלאות כדי ש-Tailwind מה-CDN יזהה אותן. */
export const TOP_CATEGORIES: TopCategoryMeta[] = [
  { id: 'קליכיף', border: 'border-r-blue-500', tag: 'bg-blue-50 text-blue-700', chip: 'bg-blue-50 text-blue-800 border-blue-200', chipOn: 'bg-blue-600 text-white border-blue-600', bar: 'bg-blue-500' },
  { id: 'כספים', border: 'border-r-green-500', tag: 'bg-green-50 text-green-700', chip: 'bg-green-50 text-green-800 border-green-200', chipOn: 'bg-green-600 text-white border-green-600', bar: 'bg-green-500' },
  { id: 'מתיקין', border: 'border-r-purple-500', tag: 'bg-purple-50 text-purple-700', chip: 'bg-purple-50 text-purple-800 border-purple-200', chipOn: 'bg-purple-600 text-white border-purple-600', bar: 'bg-purple-500' },
  { id: 'בית ומשפחה', border: 'border-r-orange-500', tag: 'bg-orange-50 text-orange-700', chip: 'bg-orange-50 text-orange-800 border-orange-200', chipOn: 'bg-orange-600 text-white border-orange-600', bar: 'bg-orange-500' },
  { id: 'אישי', border: 'border-r-amber-500', tag: 'bg-amber-50 text-amber-800', chip: 'bg-amber-50 text-amber-800 border-amber-200', chipOn: 'bg-amber-500 text-white border-amber-500', bar: 'bg-amber-500' },
  { id: 'רעיונות', border: 'border-r-slate-400', tag: 'bg-slate-100 text-slate-600', chip: 'bg-slate-100 text-slate-600 border-slate-200', chipOn: 'bg-slate-500 text-white border-slate-500', bar: 'bg-slate-400' },
  { id: 'לסיווג', border: 'border-r-rose-500', tag: 'bg-rose-50 text-rose-700', chip: 'bg-rose-50 text-rose-800 border-rose-200', chipOn: 'bg-rose-600 text-white border-rose-600', bar: 'bg-rose-500' },
];

const TOP_CATEGORY_MAP: Record<string, TopCategoryId | 'hidden'> = {
  'קליכיף': 'קליכיף',
  'קליכיף שוטף': 'קליכיף',
  'קליכיף שיווק': 'קליכיף',
  'שיווק': 'קליכיף',
  'תוכנית מדע': 'קליכיף',
  'תוכנה': 'קליכיף',
  'כספים': 'כספים',
  'מתיקין': 'מתיקין',
  'בית': 'בית ומשפחה',
  'חתונה': 'בית ומשפחה',
  'משפחה': 'בית ומשפחה',
  'בית ומשפחה': 'בית ומשפחה',
  'אישי': 'אישי',
  'רעיונות': 'רעיונות',
  'כללי': 'לסיווג',
  'דחוף': 'לסיווג',
  'דחוף / לסיווג': 'לסיווג',
  'לסיווג': 'לסיווג',
  'ארכיון': 'hidden',
};

/** תחום ראשי לתצוגה. קטגוריה לא מוכרת נופלת ל«לסיווג». «ארכיון» מוסתר. */
export function getTopCategory(cat: string | undefined | null): TopCategoryId | 'hidden' {
  const key = (cat || '').trim();
  if (!key) return 'לסיווג';
  return TOP_CATEGORY_MAP[key] ?? 'לסיווג';
}

export function topCategoryMeta(id: TopCategoryId): TopCategoryMeta {
  return TOP_CATEGORIES.find((c) => c.id === id) ?? TOP_CATEGORIES[TOP_CATEGORIES.length - 1];
}

/** קטגוריית ברירת מחדל כשמוסיפים משימה מתוך צ'יפ של תחום ראשי */
export const TOP_DEFAULT_CATEGORY: Record<TopCategoryId, TaskCategory> = {
  'קליכיף': 'קליכיף',
  'כספים': 'כספים',
  'מתיקין': 'מתיקין',
  'בית ומשפחה': 'בית',
  'אישי': 'אישי',
  'רעיונות': 'רעיונות',
  'לסיווג': 'לסיווג',
};

export function buildTasksSeed(existingTitles: Set<string> = new Set()): Task[] {
  const now = Date.now();
  return ROWS.filter((row) => !existingTitles.has(row.title.trim())).map((row, i) => {
    const dayInfo = resolveDay(row.day);
    return {
      id: `seed_${now}_${i}`,
      title: row.title,
      isCompleted: false,
      priority: row.priority ?? dayInfo.priority ?? TaskPriority.Medium,
      category: row.category,
      estimatedTimeMin: row.minutes,
      progress: 0,
      dueDate: dayInfo.dueDate,
      dueTime: row.time,
      helper: row.helper,
      requiredResources: row.notes,
      frequency: row.frequency ?? TaskFrequency.OneTime,
      subTasks: [],
    } satisfies Task;
  });
}

/**
 * בונה משימות ראשיות לפי תחום, עם תתי-משימות בפנים —
 * מתאים למבנה "משימה ראשית + תתי משימות" מהגרסה הקודמת.
 */
export function buildGroupedTasksSeed(existingTitles: Set<string> = new Set()): Task[] {
  const flat = buildTasksSeed(new Set());
  const byCat = new Map<TaskCategory, Task[]>();
  for (const t of flat) {
    const list = byCat.get(t.category) || [];
    list.push(t);
    byCat.set(t.category, list);
  }

  const now = Date.now();
  const parents: Task[] = [];
  let i = 0;
  for (const cat of TASK_CATEGORY_ORDER) {
    const items = byCat.get(cat);
    if (!items?.length) continue;
    const parentTitle = `📁 ${cat}`;
    if (existingTitles.has(parentTitle)) continue;
    parents.push({
      id: `seed_parent_${now}_${i++}`,
      title: parentTitle,
      isCompleted: false,
      priority: items.some((t) => t.priority === TaskPriority.High) ? TaskPriority.High : TaskPriority.Medium,
      category: cat,
      estimatedTimeMin: items.reduce((s, t) => s + (t.estimatedTimeMin || 0), 0),
      progress: 0,
      frequency: TaskFrequency.OneTime,
      subTasks: items.map((t, j) => ({
        id: `seed_st_${now}_${i}_${j}`,
        title: t.title,
        isCompleted: false,
        priority: t.priority,
        estimatedTimeMin: t.estimatedTimeMin,
        progress: 0,
        dueDate: t.dueDate,
        requiredResources: [t.helper, t.requiredResources].filter(Boolean).join(' · ') || undefined,
      })),
    });
  }
  return parents;
}
