-- Ride plans start from minutes per week and the longest recent ride in minutes (extensions regenerate from them).
alter table training_plans
  add column start_min_per_week integer,
  add column recent_longest_min integer;
