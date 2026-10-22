-- Cycling part 2 (docs/specs/2026-10-23-sykling-del2.md): power targets and cross-training days.

-- Every session carries its own sport (a running plan can have rides and the other way round).
alter table planned_workouts add column sport text not null default 'run' check (sport in ('run', 'ride'));
update planned_workouts w set sport = p.sport from training_plans p where p.id = w.plan_id;

alter table training_plans
  add column cross_weekdays smallint[] not null default '{}',
  add column ftp smallint,
  add column power boolean not null default false,
  -- Week 1 matches the start volume in every plan now.
  drop column week1_grows;

alter table garmin_accounts
  add column ftp_cycling smallint,
  add column ftp_cycling_at date;

create or replace function save_plan_changes(p_user uuid, p_plan uuid, p_vdot numeric, p_updates jsonb, p_inserts jsonb)
returns setof uuid
language plpgsql
set search_path = public
as $$
declare
  r jsonb;
  nid uuid;
begin
  for r in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update planned_workouts set
      date = (r->>'date')::date,
      status = (r->>'status')::workout_status,
      type = (r->>'type')::workout_type,
      title = r->>'title',
      blocks = r->'blocks',
      planned_km = (r->>'planned_km')::numeric,
      planned_duration_s = (r->>'planned_duration_s')::integer,
      garmin_push_status = 'pending'
    where id = (r->>'id')::uuid and plan_id = p_plan and user_id = p_user;
    if not found then
      raise exception 'workout % is not in this plan', r->>'id';
    end if;
    return next (r->>'id')::uuid;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_inserts, '[]'::jsonb)) loop
    insert into planned_workouts (plan_id, user_id, date, week, phase, type, title, blocks, planned_km, planned_duration_s, status, garmin_push_status, sport)
    values (p_plan, p_user, (r->>'date')::date, (r->>'week')::smallint, r->>'phase', (r->>'type')::workout_type, r->>'title', r->'blocks',
            (r->>'planned_km')::numeric, (r->>'planned_duration_s')::integer, 'planned', 'pending',
            coalesce(r->>'sport', (select sport from training_plans where id = p_plan)))
    returning id into nid;
    return next nid;
  end loop;
  if p_vdot is not null then
    update training_plans set vdot = p_vdot where id = p_plan and user_id = p_user;
  end if;
end $$;

revoke execute on function save_plan_changes(uuid, uuid, numeric, jsonb, jsonb) from public, anon, authenticated;
