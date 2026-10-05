-- Recovery part 1: nightly sleep/HRV, engine results, alcohol per food item, Training Effect per activity.

create table recovery_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null, -- the morning you wake up
  sleep_s integer,
  deep_s integer,
  light_s integer,
  rem_s integer,
  awake_s integer,
  sleep_score smallint,
  sleep_start timestamptz,
  sleep_end timestamptz,
  hrv_avg smallint,
  hrv_baseline_low smallint,
  hrv_baseline_high smallint,
  hrv_status text,
  resting_hr smallint,
  body_battery_charged smallint,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create table recovery_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  computed_at timestamptz not null,
  question_id text not null,
  factor text not null,
  outcome text not null,
  lag smallint not null,
  kind text not null check (kind in ('finding', 'no_effect', 'needs_data')),
  reason text check (reason in ('few_days', 'unclear', 'training')),
  groups jsonb not null,
  effect_sd numeric(6,3),
  p_value numeric(8,6),
  q_value numeric(8,6),
  control_ok boolean,
  source text not null default 'engine' check (source in ('engine', 'ai')),
  rank smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);
create index on recovery_findings (user_id, kind);

alter table food_items add column alcohol_g numeric(6,1) not null default 0 check (alcohol_g >= 0);
-- Earlier AI logs: alcohol was only kept in the estimate. Match the saved estimate's items by name.
update food_items fi
set alcohol_g = round((x->>'alcohol_g')::numeric, 1)
from ai_estimates ae,
  jsonb_array_elements(case when jsonb_typeof(ae.response->'items') = 'array' then ae.response->'items' else '[]'::jsonb end) x
where ae.food_entry_id = fi.food_entry_id
  and lower(trim(x->>'name')) = lower(trim(fi.name))
  and jsonb_typeof(x->'alcohol_g') = 'number'
  and (x->>'alcohol_g')::numeric > 0;

alter table activities add column te_aerobic numeric(3,1), add column te_anaerobic numeric(3,1);
update activities
set te_aerobic = case when jsonb_typeof(raw->'aerobicTrainingEffect') = 'number' then round((raw->>'aerobicTrainingEffect')::numeric, 1) end,
    te_anaerobic = case when jsonb_typeof(raw->'anaerobicTrainingEffect') = 'number' then round((raw->>'anaerobicTrainingEffect')::numeric, 1) end
where raw is not null;

alter table garmin_accounts
  add column recovery_backfilled_until date,
  add column recovery_computed_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['recovery_days', 'recovery_findings'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
