-- Build plans are extended by regenerating from the start: keep the longest recent run the plan began with,
-- so the long run continues from the same place.
alter table training_plans add column recent_longest_km numeric(5,1);
