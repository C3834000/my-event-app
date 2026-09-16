create table if not exists public.pickup_stations (
  id text primary key default (gen_random_uuid())::text,
  name text not null,
  phone text not null,
  address text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

alter table public.events
  add column if not exists pickup_station_id text,
  add column if not exists reminder_sent_at timestamp with time zone,
  add column if not exists pickup_confirmed_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_pickup_station_id_fkey'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_pickup_station_id_fkey
      foreign key (pickup_station_id)
      references public.pickup_stations (id);
  end if;
end
$$;

grant all on table public.pickup_stations to anon, authenticated, service_role;
