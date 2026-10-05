-- Form: a daily 0–100 number on Recovery (spec docs/specs/2026-10-05-form.md).
-- Training load per activity and Garmin's sleep need per night, both already in raw; plus the stored daily Form.

alter table activities add column training_load numeric(7,1);
update activities
set training_load = round((raw->>'activityTrainingLoad')::numeric, 1)
where raw is not null and jsonb_typeof(raw->'activityTrainingLoad') = 'number';

alter table recovery_days add column sleep_need_s integer;
update recovery_days
set sleep_need_s = round((raw->'sleep'->'dailySleepDTO'->'sleepNeed'->>'actual')::numeric * 60)
where raw is not null and jsonb_typeof(raw->'sleep'->'dailySleepDTO'->'sleepNeed'->'actual') = 'number';

create table form_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  score smallint check (score between 0 and 100), -- null: no night recorded
  band text check (band in ('ready', 'steady', 'low')),
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create trigger form_days_updated before update on form_days for each row execute function set_updated_at();
alter table form_days enable row level security;
-- Written only by the server; users read their own.
create policy own_rows_read on form_days for select to authenticated using (user_id = (select auth.uid()));
