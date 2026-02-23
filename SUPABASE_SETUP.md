# 🚀 הגדרת Supabase למערכת CRM

## שלב 1: יצירת פרויקט ב-Supabase

1. **היכנס ל-Supabase**: https://supabase.com/
2. **לחץ על "Start your project"** (או "New Project" אם יש לך חשבון)
3. **צור פרויקט חדש**:
   - שם הפרויקט: `clickef-crm` (או כל שם שתרצה)
   - סיסמת Database: **שמור את הסיסמה הזו!** (תצטרך אותה)
   - אזור: בחר את האזור הכי קרוב (Europe/Israel)
4. **המתן** כ-2 דקות עד שהפרויקט ייווצר

---

## שלב 2: קבלת מפתחות ה-API

1. **לחץ על ההגדרות** (Settings) בתפריט הצד
2. **לחץ על API**
3. **העתק את 2 הערכים האלה**:
   - **Project URL** (למשל: `https://abc123xyz.supabase.co`)
   - **anon public key** (מפתח ארוך - זה בטוח לשים בצד לקוח)

4. **פתח את הקובץ `.env.local`** בפרויקט ועדכן:
```env
VITE_SUPABASE_URL=הדבק_כאן_את_ה_URL
VITE_SUPABASE_ANON_KEY=הדבק_כאן_את_ה_KEY
```

---

## שלב 3: יצירת טבלאות ב-Supabase

1. **לחץ על "Table Editor"** (או SQL Editor) בתפריט הצד
2. **לחץ על "+ New Table"** או העתק את ה-SQL למטה ל-SQL Editor

### 📋 הטבלאות שצריך ליצור:

---

### 1️⃣ טבלת **customers** (לקוחות)

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- אינדקס לחיפוש מהיר
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);
```

**עמודות:**
- `id` (text, primary key) - מזהה ייחודי
- `name` (text, required) - שם הלקוח
- `phone` (text, required) - טלפון
- `email` (text, required) - אימייל
- `company_name` (text, optional) - שם חברה
- `notes` (text, optional) - הערות
- `created_at` (timestamptz, auto) - תאריך יצירה

---

### 2️⃣ טבלת **events** (אירועים)

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  amount NUMERIC(10,2) DEFAULT 0,
  paid_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  clickers_needed INTEGER DEFAULT 0,
  location TEXT,
  reminder_date_time TIMESTAMPTZ,
  tag TEXT NOT NULL DEFAULT 'קליכיף',
  category TEXT,
  hebrew_date TEXT,
  payment_method TEXT,
  notes TEXT,
  external_id TEXT,
  phone TEXT,
  email TEXT,
  terms_accepted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- אינדקסים
CREATE INDEX idx_events_date ON events(date DESC);
CREATE INDEX idx_events_customer ON events(customer_id);
CREATE INDEX idx_events_tag ON events(tag);
```

**עמודות:**
- `id` (text, PK)
- `customer_id` (text, FK → customers)
- `title` (text) - כותרת
- `date` (date) - תאריך
- `start_time` (text) - שעת התחלה
- `end_time` (text) - שעת סיום
- `amount` (numeric) - סכום
- `paid_amount` (numeric) - סכום ששולם
- `status` (text) - סטטוס אירוע
- `payment_status` (text) - סטטוס תשלום
- `event_type` (text) - סוג אירוע
- `clickers_needed` (integer) - מספר קליקרים
- `location` (text) - מיקום
- `tag` (text) - תג
- `category` (text) - קטגוריה
- `hebrew_date` (text) - תאריך עברי
- `notes` (text) - הערות
- `phone` (text) - טלפון
- `email` (text) - אימייל

---

### 3️⃣ טבלת **leads** (לידים)

```sql
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- אינדקס
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
```

**עמודות:**
- `id` (text, PK)
- `name` (text) - שם
- `source` (text) - מקור
- `status` (text) - סטטוס
- `phone` (text) - טלפון
- `email` (text) - אימייל
- `notes` (text) - הערות

---

### 4️⃣ טבלת **tasks** (משימות)

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 1,
  category TEXT NOT NULL,
  estimated_time_min INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  due_date DATE,
  completed_date TIMESTAMPTZ,
  reminder_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- אינדקס
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_completed ON tasks(is_completed);
```

**עמודות:**
- `id` (text, PK)
- `title` (text) - כותרת
- `is_completed` (boolean) - הושלם?
- `priority` (integer) - עדיפות (1-5)
- `category` (text) - קטגוריה
- `estimated_time_min` (integer) - זמן משוער
- `progress` (integer) - אחוז התקדמות
- `due_date` (date) - תאריך יעד
- `notes` (text) - הערות

---

### 5️⃣ טבלת **custom_forms** (טפסים)

```sql
CREATE TABLE custom_forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  auto_confirm BOOLEAN DEFAULT FALSE,
  theme_color TEXT DEFAULT '#4f46e5',
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**עמודות:**
- `id` (text, PK)
- `title` (text) - כותרת
- `description` (text) - תיאור
- `is_active` (boolean) - פעיל?
- `fields` (jsonb) - שדות הטופס (JSON)
- `theme_color` (text) - צבע ערכת נושא

---

### 6️⃣ טבלת **settings** (הגדרות)

```sql
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  company_name TEXT DEFAULT 'קליכיף',
  company_phone TEXT DEFAULT '073-383-4000',
  company_email TEXT DEFAULT 'c3834000@gmail.com',
  portal_video_url TEXT,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- הוסף שורה ראשונית
INSERT INTO settings (id) VALUES ('main');
```

**עמודות:**
- `id` (text, PK) - תמיד 'main'
- `company_name` (text) - שם החברה
- `company_phone` (text) - טלפון
- `company_email` (text) - אימייל
- `portal_video_url` (text) - קישור לסרטון
- `data` (jsonb) - נתונים נוספים

---

## שלב 4: הפעלת Row Level Security (RLS)

**חשוב מאוד!** כרגע הטבלאות פתוחות לכולם. נפעיל RLS ונאפשר גישה:

```sql
-- הפעלת RLS על כל הטבלאות
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- מדיניות: אפשר הכל לכולם (בינתיים - בשלב מתקדם תוסיף אימות)
CREATE POLICY "Enable all for anon" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON custom_forms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON settings FOR ALL USING (true) WITH CHECK (true);
```

**⚠️ הערה חשובה:** זו מדיניות פתוחה לפיתוח. בהמשך כדאי להוסיף אימות משתמשים.

---

## שלב 5: בדיקה שהכל עובד

1. **רענן את האפליקציה** (npm run dev)
2. **פתח את הקונסול** (F12)
3. האפליקציה תעבוד עם Supabase אוטומטית!

---

## שלב 6 (אופציונלי): מיגרציית נתונים

אם יש לך נתונים ב-localStorage שאתה רוצה להעביר:

1. **פתח את הקונסול** בדפדפן (F12)
2. **הרץ:**
```javascript
await window.migrateFromLocalStorage();
```

זה יעתיק את כל הנתונים מ-localStorage ל-Supabase!

---

## 🎉 סיימת!

עכשיו כל הנתונים שלך נשמרים ב-Supabase:
- ✅ לא ימחקו ברענון
- ✅ לא ימחקו בעדכון גרסה
- ✅ גיבוי אוטומטי
- ✅ נגיש מכל מכשיר

---

## 📊 צפייה בנתונים

בכל עת תוכל לראות את הנתונים ב:
- **Supabase Dashboard** → Table Editor
- או לחץ ישירות על הטבלה שאתה רוצה לראות

---

## ❓ שאלות נפוצות

**ש: מה קורה אם אני מרענן את הדף?**
ת: הנתונים נשארים! הם ב-Supabase, לא ב-localStorage.

**ש: אפשר לעבוד עם כמה מכשירים?**
ת: כן! הנתונים מסונכרנים בין כל המכשירים.

**ש: זה בטוח?**
ת: כרגע המדיניות פתוחה. בהמשך כדאי להוסיף אימות.

**ש: כמה זה עולה?**
ת: Supabase בחינם עד 500MB ו-2GB bandwidth בחודש - יותר מספיק!

---

**בהצלחה! 🚀**
