-- Strength: sessions logged in Ganba, their sets, and the user's own and favourite exercises
-- (spec docs/specs/2026-11-10-styrke.md).

-- One strength session per day; linked to a Garmin strength activity on the same day when there is one.
create table strength_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  activity_id uuid unique references activities on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create trigger strength_sessions_updated before update on strength_sessions for each row execute function set_updated_at();
alter table strength_sessions enable row level security;
create policy own_rows_read on strength_sessions for select to authenticated using (user_id = (select auth.uid()));

-- Sets per exercise in a session. kg null: bodyweight / no load; seconds only for timed exercises.
create table strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  session_id uuid not null references strength_sessions on delete cascade,
  exercise_key text not null,
  position integer not null,
  set_no integer not null,
  reps integer check (reps is null or reps between 0 and 500),
  kg numeric(6, 2) check (kg is null or kg between 0 and 1000),
  seconds integer check (seconds is null or seconds between 0 and 36000),
  created_at timestamptz not null default now(),
  unique (session_id, exercise_key, set_no)
);

create index strength_sets_user_exercise on strength_sets (user_id, exercise_key);
alter table strength_sets enable row level security;
create policy own_rows_read on strength_sets for select to authenticated using (user_id = (select auth.uid()));

-- The user's own exercises (name set) and favourites among the built-in ones (row only once starred).
create table user_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  name text check (name is null or char_length(name) between 1 and 60),
  muscle_group text not null check (muscle_group in ('chest', 'back', 'shoulders', 'arms', 'core', 'legs', 'runners')),
  measure text not null check (measure in ('kg', 'bw', 'time')),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table user_exercises enable row level security;
create policy own_rows_read on user_exercises for select to authenticated using (user_id = (select auth.uid()));

-- Strength days in the plan: computed when shown, never rows in planned_workouts.
alter table training_plans add column strength_weekdays integer[] not null default '{}';

alter table stamps drop constraint stamps_kind_check;
alter table stamps add constraint stamps_kind_check
  check (kind in ('country', 'distance', 'pr', 'volume', 'streak', 'test', 'race', 'strength_count', 'strength_pr'));
