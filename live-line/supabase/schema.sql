-- =====================================================================
-- קו חי (live-line) — סכמת מסד נתונים
-- מומלץ להריץ בפרויקט Supabase נפרד (לא בפרויקט של מערכת האירועים).
-- כל הטבלאות עם קידומת ll_ ו-RLS פעיל ללא מדיניות:
--   הדפדפן לא יכול לגשת אליהן כלל; רק פונקציות השרת (service_role).
-- הרצה: Supabase → SQL Editor → להדביק ולהריץ.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.ll_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  event_date date,
  slug text not null unique check (slug ~ '^[a-z0-9-]{4,40}$'),
  registration_open boolean not null default true,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
-- לכל היותר אירוע פעיל אחד
create unique index if not exists ll_events_one_active on public.ll_events (is_active) where is_active;

create table if not exists public.ll_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ll_events(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 60),
  phone text not null check (phone ~ '^0[0-9]{8,9}$'),
  source text not null default 'web' check (source in ('web', 'admin')),
  created_at timestamptz not null default now(),
  unique (event_id, phone)
);

create table if not exists public.ll_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ll_events(id) on delete cascade,
  position int not null default 0,
  text text not null check (char_length(text) between 1 and 500),
  options jsonb not null default '[]'::jsonb,
  correct text check (correct ~ '^[1-9]$'),
  points int not null default 10 check (points between 0 and 1000),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ll_questions_event on public.ll_questions (event_id, position);

create table if not exists public.ll_answers (
  question_id uuid not null references public.ll_questions(id) on delete cascade,
  event_id uuid not null references public.ll_events(id) on delete cascade,
  phone text not null,
  digit text not null check (digit ~ '^[0-9]$'),
  answered_at timestamptz not null default now(),
  primary key (question_id, phone)
);
create index if not exists ll_answers_event on public.ll_answers (event_id);

create table if not exists public.ll_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip_hash text
);

create table if not exists public.ll_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

-- הגבלת קצב אטומית: מחזיר true אם הבקשה מותרת
create or replace function public.ll_hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.ll_rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

-- ---------- נעילה ----------
alter table public.ll_events        enable row level security;
alter table public.ll_registrations enable row level security;
alter table public.ll_questions     enable row level security;
alter table public.ll_answers       enable row level security;
alter table public.ll_audit         enable row level security;
alter table public.ll_rate_limits   enable row level security;

revoke all on public.ll_events, public.ll_registrations, public.ll_questions,
              public.ll_answers, public.ll_audit, public.ll_rate_limits from anon, authenticated;
revoke all on function public.ll_hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.ll_hit_rate_limit(text, int, int) to service_role;
