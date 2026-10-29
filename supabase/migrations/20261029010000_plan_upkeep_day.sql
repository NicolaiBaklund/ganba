-- Plans without Garmin are kept up to date once a day on page load; this marks the day it ran (one request wins).
alter table training_plans add column upkept_on date;
