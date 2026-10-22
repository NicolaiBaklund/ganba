-- Plan variety (spec docs/specs/2026-10-22-plan-variasjon.md): a fitness-test session type and the hills choice.
-- Build plans keep their focus distance in distance_km (null = General).
alter type workout_type add value if not exists 'test';
alter table training_plans add column hills boolean not null default false;
