-- Garmin's lactate threshold heart rates, fetched once a day and reused by plan previews and creation.
alter table garmin_accounts
  add column lthr_running smallint,
  add column lthr_cycling smallint,
  add column thresholds_at timestamptz;
