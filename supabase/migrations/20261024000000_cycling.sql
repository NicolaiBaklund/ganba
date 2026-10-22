-- Cycling part 1 (spec docs/specs/2026-10-23-sykling.md): a plan is either running or cycling.
-- Ride plans are time- and heart-rate-based; km on their sessions are estimates from the rider's usual speed.
alter table training_plans
  add column sport text not null default 'run' check (sport in ('run', 'ride')),
  add column event_km numeric(6,1),
  add column event_elevation_m integer,
  add column lthr smallint,
  add column ride_speed_kmh numeric(4,1),
  add column power_seen boolean not null default false;
