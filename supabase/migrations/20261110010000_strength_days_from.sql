-- Strength days apply from the day they were picked: earlier days are not marked missed (spec 2026-11-10 §7a).
alter table training_plans add column strength_weekdays_from date;
