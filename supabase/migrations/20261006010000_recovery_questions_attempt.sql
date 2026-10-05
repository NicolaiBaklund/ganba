-- When AI questions were last attempted (success or not): the monthly limit counts attempts, so a failing
-- or empty answer never turns into a paid call on every Recovery tab open.
alter table garmin_accounts add column recovery_questions_at timestamptz;
