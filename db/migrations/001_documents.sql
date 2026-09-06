-- ============================================================================
-- מיגרציה 001: מאגר מסמכים (שלב ראשון — טרם הורץ!)
-- ============================================================================
-- ⚠️ הקובץ הזה לא הורץ על בסיס נתוני הייצור. להרצה: Supabase Dashboard → SQL
-- Editor → הדבקה והרצה. המיגרציה מוסיפה טבלאות חדשות בלבד ולא נוגעת בנתונים
-- קיימים (customers / events / leads / tasks / settings).
--
-- מבנה: הפרדה בין מסמך חשבונאי (documents), עסקה לוגית (transactions)
-- ותשלום בפועל (payments) — כדי לתמוך בהמשך בתשלומים חלקיים, בתשלום אחד
-- על כמה מסמכים, ובחשבונית+קבלה על אותה עסקה בלי ספירה כפולה.
-- ============================================================================

-- עסקה לוגית. בהמשך תקושר לאירוע (event_id) או לרכישה מספק.
create table if not exists transactions (
  id          text primary key,
  direction   text check (direction in ('income', 'expense')),
  description text,
  counterparty text,                -- לקוח (הכנסה) או ספק (הוצאה)
  expected_amount numeric,          -- סכום העסקה הכולל (כולל מע"מ), אם ידוע
  event_id    text,                 -- קישור עתידי לאירוע ב-events (ללא FK — טבלה קיימת)
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- מסמך חשבונאי: חשבונית, קבלה, חשבונית מס/קבלה, זיכוי, ביטול...
-- חשבונית וקבלה על אותה עסקה = שתי שורות נפרדות המקושרות לאותה transaction.
create table if not exists documents (
  id            text primary key,
  direction     text not null check (direction in ('income', 'expense')),
  doc_type      text,               -- 'חשבונית מס' | 'קבלה' | 'חשבונית מס/קבלה' | 'חשבון עסקה' | 'זיכוי' | 'ביטול' | 'אחר'
  counterparty  text,               -- ספק/לקוח. מותר להשאיר ריק — אין השלמה בניחוש.
  doc_number    text,
  doc_date      date,
  currency      text default 'ILS',
  net_amount    numeric,            -- לפני מע"מ. null = לא ידוע.
  vat_amount    numeric,
  total_amount  numeric,            -- כולל מע"מ.
  notes         text,
  review_status text not null default 'needs_review'
                check (review_status in ('needs_review', 'confirmed')),
  -- זיכוי/ביטול שומרים קשר למסמך המקורי; הסכום נשאר חיובי והמשמעות לפי doc_type.
  related_doc_id text references documents(id) on delete set null,
  transaction_id text references transactions(id) on delete set null,
  -- קישור עתידי למסמך חשבונית ירוקה (מספר מסמך) — ללא כפילות מול ח"י.
  gi_doc_number text,
  -- הקובץ המקורי ב-Supabase Storage (bucket פרטי 'documents')
  file_path     text,
  file_hash     text,               -- SHA-256 hex של הקובץ המקורי
  file_name     text,
  file_mime     text,
  file_size     bigint,
  -- ארכיון במקום מחיקה: מסמך בארכיון ניתן לשחזור; הקובץ המקורי לא נמחק לעולם.
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- אכיפת כפילות קובץ: אותו קובץ (אותו hash) לא יכול להירשם פעמיים.
create unique index if not exists documents_file_hash_uq
  on documents (file_hash) where file_hash is not null;

create index if not exists documents_doc_number_idx  on documents (doc_number);
create index if not exists documents_counterparty_idx on documents (counterparty);
create index if not exists documents_doc_date_idx    on documents (doc_date);

-- מקורות המסמך: אותו מסמך יכול להגיע מכמה מקורות (מייל + Drive + ידני).
create table if not exists document_sources (
  id          text primary key,
  document_id text not null references documents(id) on delete cascade,
  source_kind text not null check (source_kind in ('manual', 'email', 'drive', 'folder', 'greeninvoice')),
  source_ref  text,                 -- מזהה במקור: שם קובץ / message-id / drive file id / מספר מסמך ח"י
  added_at    timestamptz not null default now(),
  unique (document_id, source_kind, source_ref)
);

-- תשלום בפועל. תשלום אחד יכול לכסות כמה מסמכים (document_payments),
-- ומסמך יכול להיפרע בכמה תשלומים (תשלומים חלקיים).
create table if not exists payments (
  id             text primary key,
  transaction_id text references transactions(id) on delete set null,
  amount         numeric not null,
  paid_date      date,
  method         text,              -- העברה / אשראי / מזומן / צ'ק ...
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists document_payments (
  document_id text not null references documents(id) on delete cascade,
  payment_id  text not null references payments(id) on delete cascade,
  amount      numeric,              -- החלק מהתשלום המשויך למסמך הזה
  primary key (document_id, payment_id)
);

-- ============================================================================
-- אבטחה: RLS מופעל בלי policies — גישה רק דרך מפתח service בצד השרת.
-- (הפונקציה החדשה netlify/functions/documents.js דורשת SUPABASE_SERVICE_ROLE_KEY)
-- ============================================================================
alter table transactions      enable row level security;
alter table documents         enable row level security;
alter table document_sources  enable row level security;
alter table payments          enable row level security;
alter table document_payments enable row level security;

-- ============================================================================
-- Storage: bucket פרטי לקבצים המקוריים. גישה רק דרך signed URLs מהשרת.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
