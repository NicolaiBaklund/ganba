-- Loop phase 2: Garmin sync + training plans

alter type energy_source add value if not exists 'garmin_connect';

create type garmin_status as enum ('active','reauth_required');
create type plan_goal_kind as enum ('race','build');
create type plan_status as enum ('active','completed','cancelled');
create type workout_type as enum ('easy','long','intervals','threshold','tempo','strides','race');
create type workout_status as enum ('planned','done','missed','removed');
create type garmin_push_status as enum ('none','pending','pushed','failed');
create type proposal_kind as enum ('missed','paces','volume','ai');
create type proposal_status as enum ('pending','accepted','rejected','stale');

-- Server-only (RLS on, no policies): encrypted tokens and pending MFA state.
create table garmin_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  status garmin_status not null default 'active',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_synced_date date,
  sync_started_at timestamptz,
  history_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table garmin_login_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table garmin_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  steps integer,
  raw jsonb,
  final boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  garmin_activity_id bigint not null,
  local_date date not null,
  start_time timestamptz not null,
  type_key text not null,
  name text,
  distance_m numeric(9,1),
  duration_s numeric(9,1),
  moving_s numeric(9,1),
  avg_hr smallint,
  max_hr smallint,
  steps integer,
  elevation_gain_m numeric(7,1),
  garmin_kcal numeric(6,0),
  splits jsonb,
  hr_zones jsonb,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, garmin_activity_id)
);
create index on activities (user_id, local_date);

create table training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  goal_kind plan_goal_kind not null,
  distance_km numeric(6,3),
  race_date date,
  target_time_s integer,
  runs_per_week smallint not null check (runs_per_week between 2 and 6),
  weekdays smallint[] not null,
  long_run_weekday smallint not null check (long_run_weekday between 0 and 6),
  vdot numeric(4,1) not null,
  start_km_per_week numeric(5,1) not null,
  start_date date not null,
  generated_until date not null,
  status plan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index training_plans_one_active on training_plans (user_id) where status = 'active';

create table planned_workouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references training_plans on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  week smallint not null,
  phase text not null,
  type workout_type not null,
  title text not null,
  blocks jsonb not null,
  planned_km numeric(5,1) not null,
  planned_duration_s integer not null,
  status workout_status not null default 'planned',
  activity_id uuid references activities on delete set null,
  garmin_workout_id bigint,
  garmin_schedule_id bigint,
  garmin_push_status garmin_push_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on planned_workouts (user_id, date);
create index on planned_workouts (plan_id, date);

create table plan_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plan_id uuid not null references training_plans on delete cascade,
  kind proposal_kind not null,
  summary text not null,
  changes jsonb not null,
  status proposal_status not null default 'pending',
  request_text text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on plan_proposals (user_id, status);

do $$
declare t text;
begin
  foreach t in array array['garmin_accounts','garmin_login_states','garmin_days','activities',
    'training_plans','planned_workouts','plan_proposals'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    if t not in ('garmin_accounts','garmin_login_states') then
      execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;
