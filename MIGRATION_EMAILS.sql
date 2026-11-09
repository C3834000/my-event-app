-- מיילים מסונכרנים מ-Gmail (c3834000@gmail.com), משוייכים ללקוח/ליד לפי כתובת המייל.
-- הורץ ישירות על הפרויקט (MyEventApp) דרך ה-MCP של Supabase.

create table if not exists public.emails (
  id text primary key default (gen_random_uuid())::text,
  customer_id text references public.customers(id) on delete set null,
  lead_id text references public.leads(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  snippet text,
  body_text text,
  body_html text,
  message_id text,
  thread_id text,
  in_reply_to text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists emails_message_id_key on public.emails (message_id) where message_id is not null;
create index if not exists emails_customer_id_idx on public.emails (customer_id);
create index if not exists emails_lead_id_idx on public.emails (lead_id);
create index if not exists emails_thread_id_idx on public.emails (thread_id);

-- עוזר לסנכרון ה-IMAP לזכור עד איפה כבר קרא בכל תיקייה (נשמר ב-settings.value כ-JSON).
insert into public.settings (id, key, value)
values ('gmail_sync', 'gmail_sync', '{}'::jsonb)
on conflict (key) do nothing;
