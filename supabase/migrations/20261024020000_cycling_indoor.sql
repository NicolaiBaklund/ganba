-- Ride plans can be indoor (trainer): shorter long and easy rides. Switched from the Training page.
alter table training_plans add column indoor boolean not null default false;
