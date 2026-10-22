-- Easy-zone steps are now pushed to Garmin without a pace target (run by feel, no alerts).
-- Upcoming easy and long runs already on the watch get pushed again (the push replaces the old copy).
update planned_workouts
set garmin_push_status = 'pending'
where status = 'planned'
  and garmin_push_status = 'pushed'
  and date >= current_date
  and type in ('easy', 'long');
