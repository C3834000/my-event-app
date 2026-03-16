-- =====================================================
-- SQL ליצירת כל הטבלאות למערכת CRM של קליכיף
-- העתק והדבק את הכל ב-Supabase SQL Editor ולחץ Run
-- =====================================================

-- 1. טבלת לקוחות
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  company_name TEXT,
  notes TEXT,
  task_ids JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. טבלת אירועים
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL DEFAULT '10:00',
  end_time TEXT NOT NULL DEFAULT '12:00',
  amount NUMERIC(10,2) DEFAULT 0,
  paid_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'שוריין',
  payment_status TEXT NOT NULL DEFAULT 'טרם שולם',
  event_type TEXT NOT NULL DEFAULT 'תוכנית קליקרים כולל הנחיה / הפעלה',
  clickers_needed INTEGER DEFAULT 0,
  location TEXT DEFAULT '',
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

-- 3. טבלת לידים
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'חדש',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  notes TEXT,
  event_details TEXT,
  follow_up_date TEXT,
  follow_up_reminder TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. טבלת משימות
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'כללי',
  estimated_time_min INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  due_date DATE,
  completed_date TIMESTAMPTZ,
  reminder_date TIMESTAMPTZ,
  monday_id TEXT,
  waiting_days INTEGER,
  potential_revenue NUMERIC(10,2),
  ease_of_execution INTEGER,
  required_resources TEXT,
  frequency TEXT,
  sub_tasks JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. טבלת טפסים מותאמים
CREATE TABLE IF NOT EXISTS custom_forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  auto_confirm BOOLEAN DEFAULT FALSE,
  theme_color TEXT DEFAULT '#4f46e5',
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. טבלת הגדרות
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  company_name TEXT DEFAULT 'קליכיף',
  contact_phone TEXT DEFAULT '052-9934000',
  portal_video_url TEXT DEFAULT '',
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- שורה ראשונית להגדרות (אם לא קיימת)
INSERT INTO settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- הפעלת Row Level Security (RLS) - אבטחה
-- =====================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- מדיניות: אפשר הכל (לפיתוח)
DROP POLICY IF EXISTS "Enable all for anon" ON customers;
CREATE POLICY "Enable all for anon" ON customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for anon" ON events;
CREATE POLICY "Enable all for anon" ON events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for anon" ON leads;
CREATE POLICY "Enable all for anon" ON leads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for anon" ON tasks;
CREATE POLICY "Enable all for anon" ON tasks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for anon" ON custom_forms;
CREATE POLICY "Enable all for anon" ON custom_forms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for anon" ON settings;
CREATE POLICY "Enable all for anon" ON settings FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- סיימנו! 6 טבלאות נוצרו.
-- =====================================================
