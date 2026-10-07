-- ============================================================================
--  Presenze – database per Supabase
--  Incolla tutto nel SQL Editor di Supabase e premi "Run". Si può rilanciare
--  senza danni: crea solo ciò che manca.
--
--  Ogni persona vede e modifica soltanto i propri dati (Row Level Security).
-- ============================================================================

-- ── Impostazioni (una riga per persona) ─────────────────────────────────────
create table if not exists public.presenze_settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Orario settimanale: chiavi "1" (lunedì) … "7" (domenica); netMin = ore nette in minuti, breakMin = pausa pranzo
  schedule             jsonb not null default '{
    "1": {"netMin": 450, "breakMin": 30},
    "2": {"netMin": 450, "breakMin": 30},
    "3": {"netMin": 450, "breakMin": 30},
    "4": {"netMin": 450, "breakMin": 30},
    "5": {"netMin": 360, "breakMin": 0},
    "6": {"netMin": 0,   "breakMin": 0},
    "7": {"netMin": 0,   "breakMin": 0}
  }'::jsonb,
  smart_per_week       integer     not null default 2 check (smart_per_week between 0 and 7),
  tracking_start       date        not null default current_date,
  initial_balance_min  integer     not null default 0 check (initial_balance_min between -100000 and 100000),
  permit_allowance_min integer              check (permit_allowance_min is null or permit_allowance_min >= 0),
  national_holidays    boolean     not null default true,
  updated_at           timestamptz not null default now()
);

-- ── Giornate (una riga per persona e per giorno) ────────────────────────────
create table if not exists public.presenze_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  mode       text not null check (mode in ('office', 'smart', 'vacation', 'sick', 'holiday')),
  clock_in   time,
  clock_out  time,
  break_min  integer check (break_min is null or break_min between 0 and 240),
  note       text    check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ── Permessi ────────────────────────────────────────────────────────────────
create table if not exists public.presenze_permits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  minutes    integer not null check (minutes between 1 and 1440),
  start_time time,
  reason     text not null default 'personal' check (reason in ('personal', 'medical', 'family', 'study', 'other')),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists presenze_permits_user_day on public.presenze_permits (user_id, day);

-- ── Data dell'ultima modifica ───────────────────────────────────────────────
create or replace function public.presenze_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists presenze_settings_touch on public.presenze_settings;
create trigger presenze_settings_touch before update on public.presenze_settings
  for each row execute function public.presenze_touch();

drop trigger if exists presenze_days_touch on public.presenze_days;
create trigger presenze_days_touch before update on public.presenze_days
  for each row execute function public.presenze_touch();

-- ── Sicurezza: ognuno solo i propri dati ────────────────────────────────────
alter table public.presenze_settings enable row level security;
alter table public.presenze_days     enable row level security;
alter table public.presenze_permits  enable row level security;

drop policy if exists presenze_settings_own on public.presenze_settings;
create policy presenze_settings_own on public.presenze_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists presenze_days_own on public.presenze_days;
create policy presenze_days_own on public.presenze_days
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists presenze_permits_own on public.presenze_permits;
create policy presenze_permits_own on public.presenze_permits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permessi di accesso alle API: solo chi ha fatto l'accesso, mai in modo anonimo
revoke all on public.presenze_settings, public.presenze_days, public.presenze_permits from anon;
grant select, insert, update, delete on public.presenze_settings, public.presenze_days, public.presenze_permits to authenticated;
