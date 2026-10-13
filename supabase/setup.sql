-- ============================================================================
--  Presenze – database per Supabase
--  Incolla tutto nel SQL Editor di Supabase e premi "Run". Si può rilanciare
--  senza danni: crea solo ciò che manca.
--
--  Ogni persona vede e modifica soltanto i propri dati (Row Level Security).
--  Fanno eccezione gli orari condivisi con il team, che si leggono solo
--  attraverso la funzione presenze_team_days (vedi in fondo).
--
--  Se prima usavi l'elenco privato del team, la vecchia tabella presenze_team
--  non serve più: puoi eliminarla con  drop table public.presenze_team;
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

-- ── Profilo: nome e foto (una riga per persona) ─────────────────────────────
-- La foto è una piccola immagine JPEG (circa 320 px) salvata come testo "data:image/jpeg;base64,…".
create table if not exists public.presenze_profiles (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  avatar       text check (avatar is null or (char_length(avatar) <= 200000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  updated_at   timestamptz not null default now()
);

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

drop trigger if exists presenze_profiles_touch on public.presenze_profiles;
create trigger presenze_profiles_touch before update on public.presenze_profiles
  for each row execute function public.presenze_touch();

drop trigger if exists presenze_days_touch on public.presenze_days;
create trigger presenze_days_touch before update on public.presenze_days
  for each row execute function public.presenze_touch();

-- ── Sicurezza: ognuno solo i propri dati ────────────────────────────────────
alter table public.presenze_settings enable row level security;
alter table public.presenze_days     enable row level security;
alter table public.presenze_permits  enable row level security;
alter table public.presenze_profiles enable row level security;

drop policy if exists presenze_settings_own on public.presenze_settings;
create policy presenze_settings_own on public.presenze_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists presenze_days_own on public.presenze_days;
create policy presenze_days_own on public.presenze_days
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists presenze_profiles_own on public.presenze_profiles;
create policy presenze_profiles_own on public.presenze_profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists presenze_permits_own on public.presenze_permits;
create policy presenze_permits_own on public.presenze_permits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permessi di accesso alle API: solo chi ha fatto l'accesso, mai in modo anonimo
revoke all on public.presenze_settings, public.presenze_days, public.presenze_permits, public.presenze_profiles from anon;
grant select, insert, update, delete on public.presenze_settings, public.presenze_days, public.presenze_permits, public.presenze_profiles to authenticated;


-- ============================================================================
--  TEAM CONDIVISO
--  Il team è fisso: dopo la registrazione ognuno sceglie quale persona è.
--  Regole:
--    - ognuno vede gli orari dei colleghi, tranne quelli del capo (mai visibili);
--    - ognuno può nascondere i propri orari ai colleghi (di base sono visibili);
--    - si condivide solo il tipo di giornata (sede, smart working, ferie, assente)
--      e gli orari di entrata e uscita. Mai note, permessi, pausa o saldo ore;
--      la malattia compare come "assente".
--  Le tabelle qui sotto non si leggono direttamente: l'app passa dalle funzioni.
-- ============================================================================

-- ── Persone del team e chi le ha scelte ─────────────────────────────────────
-- Se cambia il team, cambia anche l'elenco ROSTER in src/lib/team.ts.
create table if not exists public.presenze_members (
  member_id  text primary key check (member_id ~ '^[a-z0-9-]{1,40}$'),
  name       text not null check (char_length(name) between 1 and 60),
  level      text not null check (level in ('capo', 'senior', 'junior')),
  position   integer not null default 0,
  user_id    uuid unique references auth.users (id) on delete set null,
  share      boolean not null default true,
  claimed_at timestamptz
);

insert into public.presenze_members (member_id, name, level, position) values
  ('carlo',      'Carlo',      'capo',   0),
  ('fortunato',  'Fortunato',  'senior', 1),
  ('serena',     'Serena',     'senior', 2),
  ('fabio',      'Fabio',      'senior', 3),
  ('manuela',    'Manuela',    'senior', 4),
  ('angelo',     'Angelo',     'senior', 5),
  ('alessandro', 'Alessandro', 'senior', 6),
  ('davide',     'Davide',     'junior', 7),
  ('roberta',    'Roberta',    'junior', 8),
  ('irene',      'Irene',      'junior', 9)
on conflict (member_id) do nothing;

-- ── Impostazioni del team (per esempio il codice per entrare) ───────────────
-- Per chiedere un codice a chi si registra (consigliato: così gli sconosciuti non vedono gli orari):
--   insert into public.presenze_config (key, value) values ('team_code', 'scegli-un-codice-lungo')
--   on conflict (key) do update set value = excluded.value;
-- Per toglierlo:  delete from public.presenze_config where key = 'team_code';
create table if not exists public.presenze_config (
  key   text primary key,
  value text not null
);

alter table public.presenze_members enable row level security;
alter table public.presenze_config  enable row level security;
revoke all on public.presenze_members, public.presenze_config from anon, authenticated;

-- ── Funzioni ────────────────────────────────────────────────────────────────
-- Tutte girano con i permessi del proprietario (security definer) e controllano da sole chi le chiama.

-- Il team come lo vedo io: chi è stato scelto, quale sono io, di chi si vedono gli orari.
create or replace function public.presenze_roster()
returns table (member_id text, claimed boolean, mine boolean, shared boolean)
language sql stable security definer set search_path = public as $$
  select m.member_id,
         m.user_id is not null,
         coalesce(m.user_id = auth.uid(), false),
         (m.share and m.level <> 'capo')
  from public.presenze_members m
  where auth.uid() is not null
  order by m.position
$$;

-- Sceglie la persona del team che sono io (una sola, e solo se è libera).
create or replace function public.presenze_claim(p_member text, p_code text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  need text;
begin
  if auth.uid() is null then
    raise exception 'accesso_richiesto';
  end if;

  select c.value into need from public.presenze_config c where c.key = 'team_code';
  if need is not null and need <> '' then
    if coalesce(btrim(p_code), '') = '' then raise exception 'codice_richiesto'; end if;
    if btrim(p_code) <> need then raise exception 'codice_errato'; end if;
  end if;

  if exists (select 1 from public.presenze_members m where m.user_id = auth.uid()) then
    raise exception 'hai_gia_scelto';
  end if;

  update public.presenze_members m
     set user_id = auth.uid(), share = true, claimed_at = now()
   where m.member_id = p_member and m.user_id is null;

  if not found then
    if exists (select 1 from public.presenze_members m where m.member_id = p_member) then
      raise exception 'persona_occupata';
    end if;
    raise exception 'persona_sconosciuta';
  end if;
end $$;

-- Lascia la persona scelta (per sceglierne un'altra).
create or replace function public.presenze_release()
returns void
language sql security definer set search_path = public as $$
  update public.presenze_members
     set user_id = null, share = true, claimed_at = null
   where user_id = auth.uid()
$$;

-- Mostra o nasconde i miei orari ai colleghi.
create or replace function public.presenze_set_share(p_share boolean)
returns void
language sql security definer set search_path = public as $$
  update public.presenze_members
     set share = coalesce(p_share, true)
   where user_id = auth.uid()
$$;

-- Gli orari dei colleghi nel periodo (al massimo 62 giorni).
-- Esclude: me stesso (i miei dati li ho già), il capo, chi ha nascosto i propri orari,
-- e chiunque non abbia ancora scelto la propria persona nel team.
create or replace function public.presenze_team_days(p_from date, p_to date)
returns table (member_id text, day date, mode text, clock_in time, clock_out time)
language sql stable security definer set search_path = public as $$
  select m.member_id,
         d.day,
         case when d.mode = 'sick' then 'absent' else d.mode end,
         case when d.mode in ('office', 'smart') then d.clock_in end,
         case when d.mode in ('office', 'smart') then d.clock_out end
  from public.presenze_members me
  join public.presenze_members m
    on m.user_id is not null and m.user_id <> me.user_id and m.share and m.level <> 'capo'
  join public.presenze_days d on d.user_id = m.user_id
  where me.user_id = auth.uid()
    and d.day between p_from and least(p_to, p_from + 62)
  order by d.day, m.position
$$;

-- Solo chi ha fatto l'accesso può chiamarle, mai in modo anonimo
revoke all on function public.presenze_roster() from public, anon;
revoke all on function public.presenze_claim(text, text) from public, anon;
revoke all on function public.presenze_release() from public, anon;
revoke all on function public.presenze_set_share(boolean) from public, anon;
revoke all on function public.presenze_team_days(date, date) from public, anon;
grant execute on function public.presenze_roster() to authenticated;
grant execute on function public.presenze_claim(text, text) to authenticated;
grant execute on function public.presenze_release() to authenticated;
grant execute on function public.presenze_set_share(boolean) to authenticated;
grant execute on function public.presenze_team_days(date, date) to authenticated;
