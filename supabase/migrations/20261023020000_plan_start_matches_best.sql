-- New plans start at the best recent week and don't grow in week 1. Older plans keep their week-1 growth
-- when a build plan is extended, so new weeks follow on from the stored ones.
alter table training_plans add column week1_grows boolean not null default true;
