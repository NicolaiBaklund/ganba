-- What a coach reply did beyond its text: the tools it used (shown as "✓ Checked …") and what it remembered or forgot.
alter table coach_messages add column meta jsonb not null default '{}';
