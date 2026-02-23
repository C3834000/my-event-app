-- =====================================================
-- SQL ליצירת כל הטבלאות למערכת CRM של קליכיף
-- העתק והדבק את הכל ב-Supabase SQL Editor
-- =====================================================

-- 1. טבלת לקוחות
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- 2. טבלת אירועים
CREATE TABLE IF NOT EXISTS events (
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

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date DESC);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_tag ON events(tag);

-- 3. טבלת לידים
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- 4. טבלת משימות
CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(is_completed);

-- 5. טבלת טפסים מותאמים
CREATE TABLE IF NOT EXISTS custom_forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  auto_confirm BOOLEAN DEFAULT FALSE,
  theme_color TEXT DEFAULT '#4f46e5',
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. טבלת הגדרות
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  company_name TEXT DEFAULT 'קליכיף',
  company_phone TEXT DEFAULT '073-383-4000',
  company_email TEXT DEFAULT 'c3834000@gmail.com',
  portal_video_url TEXT,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- הוסף שורה ראשונית להגדרות
INSERT INTO settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- הפעלת Row Level Security (RLS)
-- =====================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- מדיניות: אפשר הכל (לפיתוח - בהמשך תוסיף אימות)
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
-- סיימנו! כל הטבלאות נוצרו ומאובטחות
-- =====================================================
