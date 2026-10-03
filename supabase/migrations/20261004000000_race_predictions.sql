-- Garmin's race predictor, used (cautiously) as one input to the runner's fitness.
alter table garmin_accounts add column if not exists race_predictions jsonb;
alter table garmin_accounts add column if not exists race_predictions_at timestamptz;
