import { Task, TaskCategory, TaskFrequency, TaskPriority } from '../types';

type SeedRow = {
  title: string;
  category: TaskCategory;
  minutes: number;
  day?: 'today' | 'week' | '10.8' | 'evening' | 'urgent';
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
    case '10.8':
      return { dueDate: '2026-08-10' };
    case 'urgent':
      return { priority: TaskPriority.High };
    default:
      return {};
  }
};

/** הרשימה המרוכזת המלאה — כ־158 משימות לפי תחומים */
const ROWS: SeedRow[] = [
  // ===== דחוף – אירועים והכנות =====
  { title: 'לסיים את תוכנית התחרויות לישיבות', category: 'אירועים', minutes: 90, day: 'urgent' },
  { title: 'להכין תוכנית לאירוע דעת חיים', category: 'אירועים', minutes: 60, day: 'urgent' },
  { title: 'להכין תוכנית לאירוע בית מתתיהו', category: 'אירועים', minutes: 60, day: 'urgent' },
  { title: 'לבדוק שחלוקת הקבוצות עובדת היטב', category: 'אירועים', minutes: 30, day: 'urgent' },
  { title: 'לבדוק ניקוד, תוצאות וגיבויים לפני האירועים', category: 'אירועים', minutes: 30, day: 'urgent' },
  { title: 'לבצע הרצה מלאה של התוכנית', category: 'אירועים', minutes: 60, day: 'urgent' },
  { title: 'לבדוק חפיפות בין האירועים הקרובים', category: 'אירועים', minutes: 20, day: 'urgent' },
  { title: 'להזין במערכת את האירועים שהגיעו דרך גפן', category: 'מערכת', minutes: 30 },
  { title: 'להכין תוכנה ופעילות לילדים לבין הזמנים', category: 'אירועים', minutes: 45 },

  // ===== קליקלייט וקליקרים =====
  { title: 'לבצע ניסוי מלא עם הרסיבר החדש והקליקלייט', category: 'קליקלייט', minutes: 60 },
  { title: 'לבדוק טווח, מהירות תגובה ויציבות', category: 'קליקלייט', minutes: 30 },
  { title: 'למצוא פתרון לחיבור הקליקלייט לקליקרים', category: 'קליקלייט', minutes: 45 },
  { title: 'להכין אב־טיפוס מושלם אחד לפני הייצור', category: 'קליקלייט', minutes: 60 },
  { title: 'לקנות סוללות לכל הקליקרים', category: 'קליקלייט', minutes: 30 },
  { title: 'להכניס סוללות לעד 400 קליקרים', category: 'קליקלייט', minutes: 150, helper: 'הילדים' },
  { title: 'לבדוק כל קליקר ולסמן מכשירים תקולים', category: 'קליקלייט', minutes: 90 },
  { title: 'לקודד 500 קליקלייטים', category: 'קליקלייט', minutes: 240, helper: 'הילדים' },
  { title: 'להכין בבית עמדת קידוד מסודרת', category: 'קליקלייט', minutes: 45 },
  { title: 'לשלב את עזרת הילדים בקידוד', category: 'קליקלייט', minutes: 20, helper: 'הילדים' },
  { title: 'להדפיס מדבקות חדשות', category: 'קליקלייט', minutes: 30 },
  { title: 'להדביק מדבקה על כל קליקלייט', category: 'קליקלייט', minutes: 120, helper: 'הילדים' },
  { title: 'לחפש רצועות מתאימות', category: 'קליקלייט', minutes: 30 },
  { title: 'למצוא חוט חזק ונוח לקליקלייט', category: 'קליקלייט', minutes: 30 },
  { title: 'להכין חוטים מובנים לחיבור בין הקליקלייט לקליקר', category: 'קליקלייט', minutes: 60 },
  { title: 'למצוא בגרפיקל פתרון לארגזי הקליקלייט', category: 'קליקלייט', minutes: 30, helper: 'גרפיקל' },
  { title: 'לקבוע מידות, מחיצות, ידיות וכמות לכל ארגז', category: 'קליקלייט', minutes: 30 },
  { title: 'להכין ולסמן את הארגזים', category: 'קליקלייט', minutes: 60 },
  { title: 'להכין מסמך מסודר לקורסור בנושא חיבור הקליקלייט', category: 'קליקלייט', minutes: 45 },
  { title: 'להשתמש בתיאור: „משושה לד אישי אינטראקטיבי”', category: 'קליקלייט', minutes: 10 },

  // ===== תוכנה ומשחקים — צד התוכנה =====
  { title: 'לעבור על כל אפליקציית החידון ולבדוק שהיא עובדת', category: 'תוכנה', minutes: 60 },
  { title: 'לבדוק פתיחה, הצבעה, תוצאות וסגירת חידון', category: 'תוכנה', minutes: 30 },
  { title: 'לוודא שהורדת חידון מתאפשרת רק לאחר תשלום', category: 'תוכנה', minutes: 30 },
  { title: 'להוסיף כפתור איפוס נקודות', category: 'תוכנה', minutes: 30 },
  { title: 'לבדוק שהחלוקה לקבוצות עובדת נכון', category: 'תוכנה', minutes: 30 },

  // ===== תוכנה ומשחקים — משחקים =====
  { title: 'לסיים את משחק הפאזל הקבוצתי', category: 'משחקים', minutes: 120 },
  { title: 'לסיים את המשחק הקבוצתי', category: 'משחקים', minutes: 120 },
  { title: 'לסיים את משחק הלוח הקבוצתי', category: 'משחקים', minutes: 120 },
  { title: 'לבנות איקס־עיגול קבוצתי', category: 'משחקים', minutes: 90 },
  { title: 'לבנות דמקה קבוצתית', category: 'משחקים', minutes: 90 },
  { title: 'לבנות ארבע בשורה קבוצתי', category: 'משחקים', minutes: 90 },
  { title: 'לבנות משחק מבוך קבוצתי', category: 'משחקים', minutes: 120 },
  { title: 'לסיים את משחקי האורות', category: 'משחקים', minutes: 90 },
  { title: 'להוסיף שופטים שנבחרים אוטומטית במשחקי האורות', category: 'משחקים', minutes: 45 },
  { title: 'להשלים משימות צבע, זריזות וקואורדינציה', category: 'משחקים', minutes: 60 },
  { title: 'לסיים את מערכת תחרויות השירה והנאומים', category: 'משחקים', minutes: 90 },
  { title: 'להציג בנפרד את הצבעות הקהל והשופטים', category: 'משחקים', minutes: 45 },

  // ===== תוכנה ומשחקים — תוכן/שאלות =====
  { title: 'להוסיף שאלות חדשות לאפליקציה בכל יום', category: 'תוכן', minutes: 20, frequency: TaskFrequency.Daily },
  { title: 'להוסיף שאלות למאגר ולסדר אותן לפי קטגוריות', category: 'תוכן', minutes: 45 },
  { title: 'לאסוף שאלות טריוויה שנשאלו בקעמפים', category: 'תוכן', minutes: 45 },

  // ===== תוכנית קיץ תשפ״ו =====
  { title: 'להשלים את המבנה המלא של תוכנית הקיץ', category: 'תוכנית קיץ', minutes: 90 },
  { title: 'לאפשר למשתתפים להנחות ולהוסיף שאלות במהלך החידון', category: 'תוכנית קיץ', minutes: 60 },
  { title: 'לאפשר למשתתפים לשפוט', category: 'תוכנית קיץ', minutes: 45 },
  { title: 'לשלב משחק פאזל קבוצתי', category: 'תוכנית קיץ', minutes: 30 },
  { title: 'לשלב משחק לוח קבוצתי', category: 'תוכנית קיץ', minutes: 30 },
  { title: 'לשלב משחקי אורות', category: 'תוכנית קיץ', minutes: 30 },
  { title: 'להכין מבחן אישיות', category: 'תוכנית קיץ', minutes: 60 },
  { title: 'להכין השוואת תשובות בין גברים לנשים לפי תחומי ידע', category: 'תוכנית קיץ', minutes: 60 },
  { title: 'לבדוק מי מצליח יותר מחוץ לאזור הנוחות שלו', category: 'תוכנית קיץ', minutes: 30 },
  { title: 'להכין משחק בסגנון „אחד נגד מאה”', category: 'תוכנית קיץ', minutes: 90 },
  { title: 'לבצע אירוע מבחן מלא לתוכנית', category: 'תוכנית קיץ', minutes: 120 },

  // ===== „הקליק הנכון במקום הנכון” =====
  { title: 'להשלים תוכנית מלאה לעשרה לוקיישנים', category: 'הקליק הנכון', minutes: 120 },
  { title: 'לשלב שאלות טריוויה, סקרים, משימות והפתעות', category: 'הקליק הנכון', minutes: 60 },
  { title: 'לשלב תמונות וסרטונים בשאלות', category: 'הקליק הנכון', minutes: 60 },
  { title: 'לשלב את בושאר ומצרי הורמוז באותו לוקיישן', category: 'הקליק הנכון', minutes: 20 },
  { title: 'להוסיף לוקיישן לונה פארק עם רכבת הרים', category: 'הקליק הנכון', minutes: 20 },
  { title: 'להכין שאלה ששווה 20 נקודות', category: 'הקליק הנכון', minutes: 15 },
  { title: 'להכין שאלה מפילה שמורידה 20 נקודות', category: 'הקליק הנכון', minutes: 15 },
  { title: 'להכין שאלה הפוכה שבה חייבים לבחור תשובה לא נכונה', category: 'הקליק הנכון', minutes: 15 },
  { title: 'להכין סרטון מעבר לכל לוקיישן', category: 'הקליק הנכון', minutes: 90 },
  { title: 'להכין פרומפטים ליצירת כל סרטוני המעבר', category: 'הקליק הנכון', minutes: 45 },

  // ===== סרטונים ועיצוב =====
  { title: 'לסיים את סרטון הפתיחה', category: 'וידאו', minutes: 60 },
  { title: 'לסיים את סרטון המנצחים', category: 'וידאו', minutes: 60 },
  { title: 'ליצור תבנית קבועה לסרטוני סיום', category: 'וידאו', minutes: 90 },
  { title: 'להשלים את סרטוני טקס המקומות 5–1', category: 'וידאו', minutes: 90 },
  { title: 'לוודא שפודיום 5 הוא הנמוך ביותר ופודיום 1 הגבוה ביותר', category: 'וידאו', minutes: 15 },
  { title: 'להשאיר את כל ההולוגרמות ריקות מטקסט', category: 'וידאו', minutes: 15 },
  { title: 'למצוא דרך לייצר סרטוני סיום מוצלחים באופן קבוע', category: 'וידאו', minutes: 60 },
  { title: 'להכין סרטון שיווקי על קליכשר באמצעות Google Flow', category: 'וידאו', minutes: 60 },
  { title: 'להכין תוכנית עבודה מלאה לסרטון קליכשר', category: 'וידאו', minutes: 45 },
  { title: 'להשלים לוגו „קליקעמפ” בסגנון הלוגו של קליכיף', category: 'וידאו', minutes: 45 },

  // ===== פליירים וחומר שיווקי =====
  { title: 'להכין פלייר מפורט וברור לקליקלייט', category: 'קליכיף שיווק', minutes: 60 },
  { title: 'להכין פלייר הצגת מוצר לקליכשר', category: 'קליכיף שיווק', minutes: 60 },
  { title: 'להכין פלייר לקליקעמפ לבחורי ישיבות', category: 'קליכיף שיווק', minutes: 60 },
  { title: 'להציג בפלייר קליקעמפ תחרויות שירה, נאומים, אחד נגד מאה ומבחני אישיות', category: 'קליכיף שיווק', minutes: 30 },
  { title: 'להכין חומר הסבר ברור לקליק פור יו', category: 'קליכיף שיווק', minutes: 45 },
  { title: 'להשלים את האינפוגרפיקה לתהליך הכנת חידון', category: 'קליכיף שיווק', minutes: 60 },
  { title: 'להשלים את האינפוגרפיקה ללקוח ששוכר קליק פור יו', category: 'קליכיף שיווק', minutes: 60 },

  // ===== בחדרי ודף הנחיתה =====
  { title: 'לכתוב כתבה שיווקית לבחדרי', category: 'קליכיף שיווק', minutes: 45 },
  { title: 'להכין באנרים לבחדרי', category: 'קליכיף שיווק', minutes: 45 },
  { title: 'לשלוח לבחדרי קישור לאפליקציה', category: 'קליכיף שיווק', minutes: 15 },
  { title: 'לשלוח קישור לדף הנחיתה של בין הזמנים', category: 'קליכיף שיווק', minutes: 15 },
  { title: 'לשדרג דרמטית את עיצוב דף הנחיתה', category: 'קליכיף שיווק', minutes: 120 },
  { title: 'לקצר את דף הנחיתה ולהפוך אותו למושך ומניע לפעולה', category: 'קליכיף שיווק', minutes: 60 },
  { title: 'לצמצם שטחים ריקים וקטעים משעממים', category: 'קליכיף שיווק', minutes: 30 },
  { title: 'להציג בדף את קליקלייט', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'להציג את קליק פור יו', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'להציג את קליכשר', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'להציג את פון קליק', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'להציג את קליקעמפ', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'להוסיף תמונה, הסבר, קהל יעד, יתרון וכפתור הזמנה לכל מוצר', category: 'קליכיף שיווק', minutes: 60 },
  { title: 'לבדוק את הדף במחשב ובטלפון', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'להחליט על הנוסח הסופי של המתנה: 20 או 25 שאלות', category: 'קליכיף שיווק', minutes: 15 },
  { title: 'לציין את מספר המשתתפים במתנה החינמית', category: 'קליכיף שיווק', minutes: 10 },
  { title: 'לפרסם חידון טלפוני במחיר מוזל', category: 'קליכיף שיווק', minutes: 30 },
  { title: 'לפרסם נציגי ערים לקליכשר במחיר מוזל', category: 'קליכיף שיווק', minutes: 30, priority: TaskPriority.High },
  { title: 'להעלות בכל יום סטטוס ושאלת סקר', category: 'קליכיף שיווק', minutes: 15, frequency: TaskFrequency.Daily },
  { title: 'לשקלל את תוצאות הסקרים מהאתר ומהאירועים', category: 'קליכיף שיווק', minutes: 30 },
  { title: 'לחלק פרסים במסגרת הפרסום', category: 'קליכיף שיווק', minutes: 20 },
  { title: 'לדבר עם אנקווה על הרעיון החדש', category: 'שיחות', minutes: 20 },
  { title: 'לסדר שליח נוסף מבלימי', category: 'תפעול', minutes: 15 },

  // ===== גיוס עובד =====
  { title: 'לפרסם מודעת דרושים לעובד זמני לבין הזמנים', category: 'גיוס', minutes: 30 },
  { title: 'לציין עבודה בתחום התוכן, התפעול וההפקה', category: 'גיוס', minutes: 10 },
  { title: 'להדגיש יכולת מחשב ותוכנות', category: 'גיוס', minutes: 10 },
  { title: 'להדגיש יצירתיות, אחריות, סדר ועקביות', category: 'גיוס', minutes: 10 },
  { title: 'להוסיף שירות לקוחות ויכולת תקשורת טובה', category: 'גיוס', minutes: 10 },
  { title: 'לציין שרישיון נהיגה הוא יתרון', category: 'גיוס', minutes: 5 },
  { title: 'לסכם שעות, ימים ושכר באופן סופי', category: 'גיוס', minutes: 20 },
  { title: 'לפרסם את המודעה ללא דמויות אנשים ועם לוגו קליכיף', category: 'גיוס', minutes: 15 },

  // ===== כספים ותזרים =====
  { title: 'לבנות תמונת מצב כספית חיה מה־CRM', category: 'כספים', minutes: 90 },
  { title: 'ליצור API לקריאת נתוני הכספים בלי לחשוף את הטוקן', category: 'כספים', minutes: 90 },
  { title: 'להציג סך הזמנות, שולם, יתרה לגבייה והוצאות קרובות', category: 'כספים', minutes: 45 },
  { title: 'לחשב פער תזרימי לפי יום', category: 'כספים', minutes: 45 },
  { title: 'להציג אירועים ללא תאריך תשלום או עם נתון חריג', category: 'כספים', minutes: 30 },
  { title: 'לבנות תזרים לחודש הקרוב', category: 'כספים', minutes: 60 },
  { title: 'לחשב הכנסות והוצאות ולסגור חובות', category: 'כספים', minutes: 60 },
  { title: 'לעקוב אחר תשלומים פתוחים מאירועים', category: 'כספים', minutes: 30 },
  { title: 'להוסיף לחשבוניות את הוצאות אירוע חב״ד', category: 'כספים', minutes: 20 },
  { title: 'לרכז קבלות על סרטים, דבקים וכלי עבודה', category: 'כספים', minutes: 30 },
  { title: 'לעקוב אחר תשלום ממשמרת השלום', category: 'כספים', minutes: 10, day: '10.8', notes: '5,000 ₪ · 10.8' },
  { title: 'לעקוב אחר תשלום מקול תורה ישי״ק', category: 'כספים', minutes: 10, notes: '3,200 ₪' },
  { title: 'לעקוב אחר תשלום מישיבת פני מנחם', category: 'כספים', minutes: 10, notes: '2,200 ₪' },
  { title: 'לעקוב אחר תשלום לסעיד', category: 'כספים', minutes: 10, notes: '4,500 ₪' },
  { title: 'לעקוב אחר תשלום לרייזי', category: 'כספים', minutes: 10, notes: '20,000 ₪' },
  { title: 'לעקוב אחר תשלום לפנחס ולאלי', category: 'כספים', minutes: 10, notes: '5,000 ₪ לפנחס · 7,000 ₪ לאלי' },
  { title: 'להסדיר תשלום לפרחי', category: 'כספים', minutes: 10, notes: '650 ₪' },
  { title: 'להסדיר תשלום לאשר אייזן', category: 'כספים', minutes: 10, notes: '1,000 ₪' },
  { title: 'להסדיר תשלום לדייטש מהקייטרינג', category: 'כספים', minutes: 10, notes: '800 ₪' },
  { title: 'להסדיר תשלום לדודי עבור הכספת', category: 'כספים', minutes: 10, notes: '250 ₪' },
  { title: 'להוסיף הוצאות סוללות, מדבקות, חוטים, רצועות וארגזים', category: 'כספים', minutes: 20 },
  { title: 'להוציא מהחישוב את הלקוחות שביקשת שלא לחשב', category: 'כספים', minutes: 15 },
  { title: 'לבדוק שכל תאריך גבייה וסכום במערכת נכונים', category: 'כספים', minutes: 45 },

  // ===== ציוד ומעבדה — לבדוק אם כבר הושלם =====
  { title: 'לאסוף את כל ציוד המעבדה מקליקה ולהעביר לבית', category: 'ציוד', minutes: 45 },
  { title: 'לוודא שלא נשארו כבלים, מטענים, רסיברים או כלי עבודה', category: 'ציוד', minutes: 20 },
  { title: 'להביא חתיכות עץ, מברגה וברגים לקליקה', category: 'ציוד', minutes: 20 },
  { title: 'להביא מסור חשמלי', category: 'ציוד', minutes: 10 },
  { title: 'לחזק את פלטת העץ בעמדה', category: 'ציוד', minutes: 30 },
  { title: 'לסדר את הציוד בבית', category: 'ציוד', minutes: 30 },

  // ===== אישי, בית ומשפחה =====
  { title: 'לקבוע טיפול שיניים אצל פרחי', category: 'אישי', minutes: 10 },
  { title: 'לבדוק אם ביטוח הרכב והטסט הושלמו', category: 'אישי', minutes: 15 },
  { title: 'לאסוף את המכנסיים', category: 'אישי', minutes: 15 },
  { title: 'להכין תוכנית חופש שבועית עם הבנים', category: 'משפחה', minutes: 30 },
  { title: 'לקבוע זמן חוויה מודגש עם הילדים', category: 'משפחה', minutes: 20 },
  { title: 'לשלב תפילת שחרית בכל בוקר', category: 'משפחה', minutes: 20, frequency: TaskFrequency.Daily },
  { title: 'לשלב תפילת מנחה אחר הצהריים', category: 'משפחה', minutes: 10, frequency: TaskFrequency.Daily },
  { title: 'לשלב תפילת ערבית בלילה', category: 'משפחה', minutes: 10, frequency: TaskFrequency.Daily },
  { title: 'ללמוד עם הבנים', category: 'משפחה', minutes: 30, frequency: TaskFrequency.Daily },
  { title: 'לעזור בהשכבת הילדים', category: 'משפחה', minutes: 20, frequency: TaskFrequency.Daily },
  { title: 'לטפל בכלים, במצעים ובקיפול בבית', category: 'בית', minutes: 30 },
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
  'הקליק הנכון',
  'תוכן',
  'אירועים',
  'גיוס',
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

export type CategoryColor = 'blue' | 'green' | 'purple' | 'orange' | 'amber' | 'slate' | 'rose';

export type TopCategoryMeta = {
  id: TopCategoryId;
  color: CategoryColor;
  border: string;
  tag: string;
  chip: string;
  chipOn: string;
  bar: string;
  column: string;
  header: string;
  focusSection: string;
  focusBadge: string;
  focusCard: string;
  restBorder: string;
  pill: string;
  pillDone: string;
};

/**
 * שישה תחומים + תיבת «לסיווג». כל מחלקה כתובה במלואה (בלי bg-${color})
 * כדי ש-Tailwind מה-CDN לא יזרוק אותה.
 */
export const TOP_CATEGORIES: TopCategoryMeta[] = [
  {
    id: 'קליכיף',
    color: 'blue',
    border: 'border-r-blue-500',
    tag: 'bg-blue-50 text-blue-700',
    chip: 'bg-blue-50 text-blue-800 border-blue-200',
    chipOn: 'bg-blue-600 text-white border-blue-600',
    bar: 'bg-blue-500',
    column: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20',
    header: 'bg-gradient-to-l from-blue-500 to-blue-600',
    focusSection: 'bg-blue-100/60 dark:bg-blue-900/30 border-blue-200',
    focusBadge: 'bg-blue-600 text-white',
    focusCard: 'bg-gradient-to-l from-blue-500 to-blue-700',
    restBorder: 'border-r-blue-500',
    pill: 'bg-blue-100 text-blue-700',
    pillDone: 'bg-blue-600 text-white',
  },
  {
    id: 'כספים',
    color: 'green',
    border: 'border-r-green-500',
    tag: 'bg-green-50 text-green-700',
    chip: 'bg-green-50 text-green-800 border-green-200',
    chipOn: 'bg-green-600 text-white border-green-600',
    bar: 'bg-green-500',
    column: 'border-green-200 bg-green-50 dark:bg-green-900/20',
    header: 'bg-gradient-to-l from-green-500 to-green-600',
    focusSection: 'bg-green-100/60 dark:bg-green-900/30 border-green-200',
    focusBadge: 'bg-green-600 text-white',
    focusCard: 'bg-gradient-to-l from-green-500 to-green-700',
    restBorder: 'border-r-green-500',
    pill: 'bg-green-100 text-green-700',
    pillDone: 'bg-green-600 text-white',
  },
  {
    id: 'מתיקין',
    color: 'purple',
    border: 'border-r-purple-500',
    tag: 'bg-purple-50 text-purple-700',
    chip: 'bg-purple-50 text-purple-800 border-purple-200',
    chipOn: 'bg-purple-600 text-white border-purple-600',
    bar: 'bg-purple-500',
    column: 'border-purple-200 bg-purple-50 dark:bg-purple-900/20',
    header: 'bg-gradient-to-l from-purple-500 to-purple-600',
    focusSection: 'bg-purple-100/60 dark:bg-purple-900/30 border-purple-200',
    focusBadge: 'bg-purple-600 text-white',
    focusCard: 'bg-gradient-to-l from-purple-500 to-purple-700',
    restBorder: 'border-r-purple-500',
    pill: 'bg-purple-100 text-purple-700',
    pillDone: 'bg-purple-600 text-white',
  },
  {
    id: 'בית ומשפחה',
    color: 'orange',
    border: 'border-r-orange-500',
    tag: 'bg-orange-50 text-orange-700',
    chip: 'bg-orange-50 text-orange-800 border-orange-200',
    chipOn: 'bg-orange-600 text-white border-orange-600',
    bar: 'bg-orange-500',
    column: 'border-orange-200 bg-orange-50 dark:bg-orange-900/20',
    header: 'bg-gradient-to-l from-orange-500 to-orange-600',
    focusSection: 'bg-orange-100/60 dark:bg-orange-900/30 border-orange-200',
    focusBadge: 'bg-orange-600 text-white',
    focusCard: 'bg-gradient-to-l from-orange-500 to-orange-700',
    restBorder: 'border-r-orange-500',
    pill: 'bg-orange-100 text-orange-700',
    pillDone: 'bg-orange-600 text-white',
  },
  {
    id: 'אישי',
    color: 'amber',
    border: 'border-r-amber-500',
    tag: 'bg-amber-50 text-amber-800',
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
    chipOn: 'bg-amber-500 text-white border-amber-500',
    bar: 'bg-amber-500',
    column: 'border-amber-200 bg-amber-50 dark:bg-amber-900/20',
    header: 'bg-gradient-to-l from-amber-500 to-amber-600',
    focusSection: 'bg-amber-100/60 dark:bg-amber-900/30 border-amber-200',
    focusBadge: 'bg-amber-600 text-white',
    focusCard: 'bg-gradient-to-l from-amber-500 to-amber-700',
    restBorder: 'border-r-amber-500',
    pill: 'bg-amber-100 text-amber-700',
    pillDone: 'bg-amber-600 text-white',
  },
  {
    id: 'רעיונות',
    color: 'slate',
    border: 'border-r-slate-400',
    tag: 'bg-slate-100 text-slate-600',
    chip: 'bg-slate-100 text-slate-600 border-slate-200',
    chipOn: 'bg-slate-500 text-white border-slate-500',
    bar: 'bg-slate-400',
    column: 'border-slate-200 bg-slate-50 dark:bg-slate-900/20',
    header: 'bg-gradient-to-l from-slate-500 to-slate-600',
    focusSection: 'bg-slate-100/60 dark:bg-slate-900/30 border-slate-200',
    focusBadge: 'bg-slate-600 text-white',
    focusCard: 'bg-gradient-to-l from-slate-500 to-slate-700',
    restBorder: 'border-r-slate-500',
    pill: 'bg-slate-100 text-slate-700',
    pillDone: 'bg-slate-600 text-white',
  },
  {
    id: 'לסיווג',
    color: 'rose',
    border: 'border-r-rose-500',
    tag: 'bg-rose-50 text-rose-700',
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
    chipOn: 'bg-rose-600 text-white border-rose-600',
    bar: 'bg-rose-500',
    column: 'border-rose-200 bg-rose-50 dark:bg-rose-900/20',
    header: 'bg-gradient-to-l from-rose-500 to-rose-600',
    focusSection: 'bg-rose-100/60 dark:bg-rose-900/30 border-rose-200',
    focusBadge: 'bg-rose-600 text-white',
    focusCard: 'bg-gradient-to-l from-rose-500 to-rose-700',
    restBorder: 'border-r-rose-500',
    pill: 'bg-rose-100 text-rose-700',
    pillDone: 'bg-rose-600 text-white',
  },
];

const TOP_CATEGORY_MAP: Record<string, TopCategoryId | 'hidden'> = {
  'קליכיף': 'קליכיף',
  'קליכיף שוטף': 'קליכיף',
  'קליכיף שיווק': 'קליכיף',
  'שיווק': 'קליכיף',
  'תוכנית מדע': 'קליכיף',
  'תוכנה': 'קליכיף',
  'קליקלייט': 'קליכיף',
  'וידאו': 'קליכיף',
  'משחקים': 'קליכיף',
  'תוכנית קיץ': 'קליכיף',
  'הקליק הנכון': 'קליכיף',
  'תוכן': 'קליכיף',
  'אירועים': 'קליכיף',
  'גיוס': 'קליכיף',
  'מערכת': 'קליכיף',
  'תפעול': 'קליכיף',
  'ציוד': 'קליכיף',
  'שיחות': 'קליכיף',
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
