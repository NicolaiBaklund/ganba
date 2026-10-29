-- Training only: a mode without food and body data, and runs logged by hand (spec 2026-10-29).
alter table profiles
  add column mode text not null default 'full' check (mode in ('full', 'training')),
  alter column sex drop not null,
  alter column birth_date drop not null,
  alter column height_cm drop not null;

alter table activities
  add column source text not null default 'garmin' check (source in ('garmin', 'manual')),
  alter column garmin_activity_id drop not null;
