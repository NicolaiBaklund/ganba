-- One option applied at a time per coach message (two taps or two tabs must not both land).
alter table coach_messages add column applying_until timestamptz;
