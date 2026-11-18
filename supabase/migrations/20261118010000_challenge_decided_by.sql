-- The run that decided a weekly challenge, so its verdict can show ✓/✗ (also for "every easy run", which has no
-- session of its own).
alter table weekly_challenges add column decided_activity_id uuid references activities on delete set null;
