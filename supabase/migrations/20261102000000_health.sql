-- Health: race clock, morning note and stamps (spec docs/specs/2026-11-02-health.md).

-- Predicted race times per day: Garmin's race predictor, or the plan's VDOT without Garmin.
create table prediction_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  time_5k_s integer,
  time_10k_s integer,
  time_half_s integer,
  time_marathon_s integer,
  source text not null check (source in ('garmin', 'plan')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create trigger prediction_days_updated before update on prediction_days for each row execute function set_updated_at();
alter table prediction_days enable row level security;
create policy own_rows_read on prediction_days for select to authenticated using (user_id = (select auth.uid()));

-- The coach's note for a morning, written once; the alert it carries and whether the user acted on it.
create table daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  text text not null,
  alert text check (alert in ('sick', 'easy_fast', 'sleep')),
  alert_done boolean not null default false,
  facts jsonb not null default '{}'::jsonb,
  source text not null check (source in ('ai', 'template')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create trigger daily_notes_updated before update on daily_notes for each row execute function set_updated_at();
alter table daily_notes enable row level security;
create policy own_rows_read on daily_notes for select to authenticated using (user_id = (select auth.uid()));

-- Stamps: one row per (kind, key); earned_on is the earliest date the data supports and never moves later.
create table stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('country', 'distance', 'pr', 'volume', 'streak', 'test', 'race')),
  key text not null,
  earned_on date not null,
  activity_id uuid references activities on delete set null,
  value jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, key)
);

alter table stamps enable row level security;
create policy own_rows_read on stamps for select to authenticated using (user_id = (select auth.uid()));

-- Garmin's personal records (1 km to marathon, longest run), kept as fetched.
alter table garmin_accounts add column personal_records jsonb;
alter table garmin_accounts add column personal_records_at timestamptz;
