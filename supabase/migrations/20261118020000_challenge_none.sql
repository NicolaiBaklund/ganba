-- A week with nothing to challenge is stored too ('none'), so the pick isn't redone on every open.
alter table weekly_challenges drop constraint weekly_challenges_kind_check;
alter table weekly_challenges add constraint weekly_challenges_kind_check
  check (kind in ('test_beat', 'reps_in_zone', 'last_rep_fastest', 'finish_fast', 'long_hr', 'easy_hr_week', 'none'));
