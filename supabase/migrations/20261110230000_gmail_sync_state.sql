create table if not exists public.gmail_sync_state (
  id text primary key,
  cursor jsonb not null default '{}'::jsonb,
  last_run_at timestamptz
);
alter table public.gmail_sync_state enable row level security;
drop policy if exists "Enable all for anon" on public.gmail_sync_state;
create policy "Enable all for anon" on public.gmail_sync_state for all to public using (true) with check (true);
insert into public.gmail_sync_state (id, cursor)
select 'main', coalesce(data->'gmailSync', '{}'::jsonb) from public.settings where id = 'main'
on conflict (id) do nothing;
