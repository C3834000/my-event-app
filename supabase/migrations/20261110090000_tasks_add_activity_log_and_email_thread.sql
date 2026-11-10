-- יומן פעילות במשימה: [{ id, at (ISO), text }]
alter table public.tasks add column if not exists activity_log jsonb;
-- משימה שנוצרה ממייל (שרשור)
alter table public.tasks add column if not exists email_thread_id text;
create index if not exists tasks_email_thread_id_idx on public.tasks (email_thread_id);
