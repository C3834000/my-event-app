-- תיקון טבלת tasks - הוספת עמודות חסרות
-- הרץ את זה ב-Supabase SQL Editor

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ease_of_execution INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS monday_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS waiting_days INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS potential_revenue NUMERIC(10,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required_resources TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS frequency TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sub_tasks JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_date TIMESTAMPTZ;

-- תיקון טבלת customers - עמודות חסרות
ALTER TABLE customers ADD COLUMN IF NOT EXISTS task_ids JSONB DEFAULT '[]';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;

-- תיקון טבלת events - עמודות חסרות  
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_details TEXT;

-- סיום
SELECT 'תיקון הושלם בהצלחה!' as status;
