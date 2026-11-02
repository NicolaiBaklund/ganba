-- Health stamps from the whole Garmin history (summary only: date, type, start point, km), fetched once per account.
alter table garmin_accounts add column activity_history jsonb;
alter table garmin_accounts add column history_scanned_at timestamptz;
