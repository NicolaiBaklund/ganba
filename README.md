<div align="center">

# Ganba

**One daily target that follows your training, and a coach that knows your data.**
A training plan, nutrition, recovery and weight tracking in one mobile web app, driven by your Garmin.

![Status](https://img.shields.io/badge/status-phase%202%20in%20testing-c8102e)
![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs)
![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?logo=supabase&logoColor=fff)
![Vercel](https://img.shields.io/badge/Vercel-000?logo=vercel)

![Ganba: Today, Training, Coach and Progress](docs/screenshots/hero.png)

</div>

> *Ganba* (頑張って) is what Japanese runners shout to cheer each other on: "keep going, give it your all".

## Features

### Today
- Today's session as a race bib, with what to eat before and after.
- Calories left, macros, and how much today's activity added to your target.
- Your meals in one list, with an empty breakfast, lunch or dinner one tap away from logging, and your trend weight.
- The week at a glance: which days you logged food and which sessions you did.

### Coach
- One ongoing conversation about anything: training, food, recovery and your body.
- It looks things up itself instead of asking: your food log, a session's laps and heart rate, sleep and HRV, weight, the plan.
- "I have 700 kcal left, what should I eat?" gets an answer that takes tomorrow's session into account, starting with a direction ("a teishoku with a full bowl of rice") and getting as concrete as you want.
- "I gave up after one interval" gets talked through: what came before (food, sleep, resting heart rate), what the laps show, what to change next time.
- It changes the plan when you ask: moves, rewrites or adds sessions, checks the load first, and says plainly when something is unwise.
- The answer streams in while the coach works, with a line showing what it is looking at.

### Training
- **The race clock:** your predicted time for the race you train for (from Garmin), the road to race day, and in race plans how much race pace you have run against what the plan holds.
- **Under the clock, only when there is something new:** a verdict on your last run against what it was meant to be ("A bit fast: 4:26 and 4:28, zone 4:29–4:39"), a similar earlier run to measure yourself against, what the week did to your predicted time, and one challenge for the week that the app decides itself once the session syncs. No AI writing filler.
- **Alerts with one action:** when resting heart rate and HRV have been off for days it says so, with one tap to swap a hard session for an easy one.
- **Running:** plans for 5K, 10K, half marathon, marathon, or building fitness without a race, on the days you choose. Quality sessions rotate (short and long reps, threshold, race pace, fartlek, hills) with a 5K fitness test every eight weeks.
- **Cycling:** event or build plans driven by time and heart rate, with power targets when you have a power meter or smart trainer (ERG). Indoor season on a switch.
- **Both:** add easy rides to a running plan, or easy runs to a cycling plan, on days you pick.
- **Smart defaults:** paces, zones and the starting volume come from your recent sessions and Garmin. Weekly volume builds toward what your goal needs.
- **Garmin:** sessions go to your watch or Edge. The whole plan shows as a line map to race day.
- **Suggestions you accept:** a missed session, new paces, a lighter week.

### Strength
- Log a session in a few taps: pick exercises from a list with your favourites first, sets filled in from last time, kg typed in.
- A hint when you are ready to go up, using your own last step.
- Sessions show in the week and the plan, link to a Garmin strength activity on the same day, and count in your calories.

### Progress
- The race clock over one month to a year, with the change since the start; drag along the line to see a day.
- Easy pace at your usual heart rate, strength progress on your favourite exercises.
- Stamps that come on their own: countries you have run or ridden in (on a globe you can spin), distances, personal bests, big months, strength milestones.

### Nutrition and weight
- Log food from a photo or a short description. The app estimates grams, calories and macros, and you can correct it in plain text.
- Quick add when you already know the numbers.
- Trend weight that smooths out daily swings, with a forecast to your goal and private progress photos.
- A weekly check-in that adjusts your calorie target to what you actually burn.

### Garmin
- Steps, workouts, sleep and HRV sync automatically. Your daily target builds up through the day as you move.

## Screenshots

| Today | Training | Session | Strength | Coach | Progress | Log food | Body | New plan |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/today.png" width="140"> | <img src="docs/screenshots/training.png" width="140"> | <img src="docs/screenshots/workout.png" width="140"> | <img src="docs/screenshots/strength.png" width="140"> | <img src="docs/screenshots/coach.png" width="140"> | <img src="docs/screenshots/progress.png" width="140"> | <img src="docs/screenshots/food-ai.png" width="140"> | <img src="docs/screenshots/body.png" width="140"> | <img src="docs/screenshots/wizard.png" width="140"> |

Screenshots are made with `node scripts/screenshots.mjs` against a running app and a seeded demo user. With `ANTHROPIC_API_KEY` set, the coach screenshot is a real answer.

## Plan

| Phase | Scope | Status |
|---|---|---|
| 1 | Nutrition, food logging from photos, weight trend, weekly check-in | Done |
| 2 | Garmin sync, activity-based daily target, training plan on the watch | Testing |
| 2 | New design ("Tasuki"), new logo, light and dark mode | Done |
| 2 | Health: race clock, morning note, alerts with one action, stamps and a globe (replaced the daily Form score) | Done |
| 2 | Plan variety, build-fitness plans, fitness tests, hills | Done |
| 2 | Cycling plans with heart rate or power, combined running and cycling | Done |
| 2 | Coach v2: its own tab, food help, looks up your data, streaming answers | Done |
| 2 | Training only: a mode without food tracking, plans without Garmin | Done |
| 2 | Strength sessions: exercises with favourites, sets from last time, Progress and stamps | Done |
| 2 | Under the clock: verdict on each run, a ghost run, what the week bought, a weekly challenge, race pace (replaced the AI morning note) | Done |
| Next | Heart-rate zones from your threshold heart rate (LTHR) in the plan and the verdicts | Planned |
| Later | Route/GPX import, native app | Ideas |
