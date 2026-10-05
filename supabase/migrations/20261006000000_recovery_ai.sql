-- Recovery part 2: consent to send health data to AI, and the AI layer's stored output.

alter table profiles
  add column ai_health_consent boolean not null default false,
  add column ai_health_consent_at timestamptz;

create table recovery_ai_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  spec jsonb not null, -- {factor, transform, threshold, outcome, lag}
  rationale text not null,
  status text not null default 'testing' check (status in ('testing', 'accepted', 'rejected')),
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recovery_ai_questions (user_id, status);

alter table recovery_findings add column ai_question_id uuid references recovery_ai_questions on delete cascade;

create table recovery_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  content jsonb not null,
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table recovery_day_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  question text not null default 'why',
  content jsonb not null,
  input_hash text not null,
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date, question)
);

do $$
declare t text;
begin
  foreach t in array array['recovery_ai_questions', 'recovery_summaries', 'recovery_day_answers'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
