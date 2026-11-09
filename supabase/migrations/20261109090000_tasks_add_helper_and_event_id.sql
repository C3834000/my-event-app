-- מי יעזור במשימה (שדה helper) — בלעדיו כל שמירה של משימה עם «מי יעזור» נכשלה בענן
alter table public.tasks add column if not exists helper text;
-- קישור משימה לאירוע
alter table public.tasks add column if not exists event_id text;
create index if not exists tasks_event_id_idx on public.tasks (event_id);
