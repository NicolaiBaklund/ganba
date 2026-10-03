-- How the plan was started: experienced runners skip the base phase; recent quality work starts sessions a level up.
alter table training_plans add column if not exists experienced boolean not null default false;
alter table training_plans add column if not exists did_quality boolean not null default false;
