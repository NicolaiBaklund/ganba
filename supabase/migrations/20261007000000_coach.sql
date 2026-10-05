-- Coach: a conversation about the plan, with options to apply and a short memory.

create table coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  archived_at timestamptz,
  busy_until timestamptz, -- one reply at a time per thread
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coach_threads_one_active on coach_threads (user_id) where archived_at is null;

create table coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references coach_threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'coach')),
  text text not null,
  about_workout_id uuid references planned_workouts on delete set null,
  options jsonb not null default '[]',
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on coach_messages (thread_id, created_at);

create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null check (char_length(text) <= 200),
  until date,
  source text not null check (source in ('coach', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on coach_notes (user_id);

do $$
declare t text;
begin
  foreach t in array array['coach_threads', 'coach_messages', 'coach_notes'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows_read on %I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
