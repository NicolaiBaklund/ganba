-- The weekly challenge under the race clock (spec docs/specs/2026-11-18-under-klokka.md §7, §11): one per user and
-- week, picked once so it doesn't change during the week, decided when its session syncs.
create table weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  workout_id uuid references planned_workouts on delete set null,
  kind text not null check (kind in ('test_beat', 'reps_in_zone', 'last_rep_fastest', 'finish_fast', 'long_hr', 'easy_hr_week')),
  params jsonb not null default '{}',
  result text check (result is null or result in ('won', 'lost')),
  result_value numeric(9, 1),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table weekly_challenges enable row level security;
create policy own_rows_read on weekly_challenges for select to authenticated using (user_id = (select auth.uid()));
