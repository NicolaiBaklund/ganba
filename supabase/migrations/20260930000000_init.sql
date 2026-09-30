-- Loop phase 1: schema, RLS, storage

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create type sex as enum ('male','female');
create type energy_source as enum ('formula','adaptive','manual');
create type meal_type as enum ('breakfast','lunch','dinner','evening','snack');
create type food_source as enum ('ai','quick');
create type confidence as enum ('low','medium','high');
create type photo_bucket as enum ('food','body');
create type checkin_status as enum ('pending','accepted','kept','insufficient_data');

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  sex sex not null,
  birth_date date not null,
  height_cm numeric(5,1) not null check (height_cm between 100 and 250),
  timezone text not null default 'UTC',
  checkin_weekday smallint not null default 1 check (checkin_weekday between 0 and 6), -- 0 = Sunday
  locale text not null default 'en',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  steps_per_day integer not null check (steps_per_day >= 0),
  run_km_per_week numeric(6,1) not null default 0 check (run_km_per_week >= 0),
  other_training_hours_per_week numeric(5,1) not null default 0 check (other_training_hours_per_week >= 0),
  valid_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on activity_baselines (user_id, valid_from);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  target_weight_kg numeric(5,1) not null,
  rate_kg_per_week numeric(4,2) not null,
  valid_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on goals (user_id, valid_from);

create table weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  window_start date,
  window_end date,
  avg_intake_kcal numeric(6,0),
  trend_change_kg numeric(5,2),
  logged_days smallint,
  avg_training_kcal numeric(6,0),
  computed_base_kcal numeric(6,0),
  proposed_base_kcal numeric(6,0),
  reason text,
  status checkin_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table energy_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  base_expenditure_kcal numeric(6,0) not null,
  source energy_source not null,
  protein_g_per_kg numeric(3,1) not null,
  fat_pct numeric(3,2) not null,
  manual_kcal_override numeric(6,0),
  checkin_id uuid references weekly_checkins on delete set null,
  valid_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on energy_plans (user_id, valid_from);

create table food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  logged_at timestamptz not null,
  local_date date not null,
  meal_type meal_type not null,
  source food_source not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on food_entries (user_id, local_date);

create table food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  food_entry_id uuid not null references food_entries on delete cascade,
  name text not null,
  grams numeric(7,1),
  kcal numeric(6,0) not null check (kcal >= 0),
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  confidence confidence,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on food_items (food_entry_id);

create table ai_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  food_entry_id uuid references food_entries on delete set null,
  parent_estimate_id uuid references ai_estimates on delete set null,
  input_text text,
  photo_paths text[] not null default '{}',
  model text not null,
  prompt_version integer not null,
  response jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  latency_ms integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  measured_at timestamptz not null,
  local_date date not null,
  weight_kg numeric(5,2) not null check (weight_kg between 20 and 400),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on weight_entries (user_id, local_date);

create table photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  bucket photo_bucket not null,
  storage_path text not null,
  food_entry_id uuid references food_entries on delete cascade,
  weight_entry_id uuid references weight_entries on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((food_entry_id is null) <> (weight_entry_id is null))
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null default 'anthropic',
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  last4 text not null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- updated_at triggers + RLS (api_keys: RLS on, no policies => service role only)
do $$
declare t text;
begin
  foreach t in array array['profiles','activity_baselines','goals','weekly_checkins','energy_plans',
    'food_entries','food_items','ai_estimates','weight_entries','photos','api_keys'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    if t <> 'api_keys' then
      execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;

-- daily totals, RLS-respecting
create view daily_intake with (security_invoker = true) as
select e.user_id, e.local_date,
       sum(i.kcal)::numeric(7,0) as kcal,
       sum(i.protein_g)::numeric(7,1) as protein_g,
       sum(i.carbs_g)::numeric(7,1) as carbs_g,
       sum(i.fat_g)::numeric(7,1) as fat_g
from food_entries e join food_items i on i.food_entry_id = e.id
group by e.user_id, e.local_date;

-- storage: private buckets, objects under "{user_id}/..."
insert into storage.buckets (id, name, public) values ('food','food',false), ('body','body',false)
on conflict (id) do nothing;

create policy own_files_select on storage.objects for select to authenticated
  using (bucket_id in ('food','body') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy own_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('food','body') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy own_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('food','body') and (storage.foldername(name))[1] = (select auth.uid())::text);
