-- Last morning fetched successfully: the next sync fills the gap from here, not from the last night with data
-- (a watch that is off at night would otherwise make every sync refetch 10 empty mornings).
alter table garmin_accounts add column recovery_synced_until date;
