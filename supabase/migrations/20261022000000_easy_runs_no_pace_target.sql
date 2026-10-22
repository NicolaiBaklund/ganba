-- Easy-zone steps are now pushed to Garmin without a pace target (run by feel, no alerts). That includes the
-- warm-ups and cool-downs of quality sessions, so every upcoming session already on the watch is pushed again
-- (the push replaces the old copy).
update planned_workouts
set garmin_push_status = 'pending'
where status = 'planned'
  and garmin_push_status = 'pushed'
  and date >= current_date;
