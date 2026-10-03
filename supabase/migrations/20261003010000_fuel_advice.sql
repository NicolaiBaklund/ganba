-- Phase 2: cached AI food ideas around a planned run
alter table planned_workouts add column if not exists fuel_advice jsonb;
