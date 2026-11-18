# Under klokka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI morning note under the race clock with computed items, shown one at a time: verdict on the last run (with ghost), what the week bought, the weekly challenge, and a race-pace account line in race plans. Alerts stay and win.

**Architecture:** Pure rules in `packages/core/src/health/` (laps, verdict, ghost, challenge, weekBought, racePace, spot). Server loaders in `apps/web/lib/health/spot.ts` and `racePace.ts`; one API `GET /api/health/spot`; one client component `UnderClock` replaces `MorningNote`. The challenge is the only stored item (`weekly_challenges`); everything else is computed on load. `daily_notes` is kept for alerts only; the AI note goes.

**Tech Stack:** Next.js app router (apps/web), Supabase, next-intl, Vitest integration tests, Playwright smoke.

**Spec:** docs/specs/2026-11-18-under-klokka.md

## Global Constraints

- All app copy in English in `apps/web/messages/en.json` (namespace `health.spot`); docs in Norwegian.
- Multi-user, no hardcoded user values; thresholds as named constants in core.
- Integration tests only, written once the flow stands (project rule overrides TDD). Run `pnpm exec vitest run <file>` from repo root.
- Thresholds: 5 s/km "a bit", 8 s/km uneven, 5 bpm "Heart rate high", stride laps < 200 m or < 40 s, ghost ±10 % distance, ≥ 14 days old, ≤ 182 days, hide under 3 s and 2 bpm; normal easy HR = median over 42 days, ≥ 5 runs; race-pace laps ≥ 400 m within the race zone ±3 s; week window Sunday from 18:00 local until the first run of Monday synced (or Monday ends).
- Without Garmin: only alerts. Running only (no rides, no strength).
- No AI calls anywhere in this feature. No Co-Authored-By/Claude attribution in commits.

## Review Focus

- Two runs on one day (double): the verdict is the latest run; the ghost never compares with the same day's other run.
- Laps with 0 distance or missing `movingDuration` (pauses, manual laps): no NaN, they are skipped.
- The Sunday 18:00 window and "end of next day" use the profile timezone, never server UTC.
- Two first loads at once create one challenge (unique `user_id, week_start`), never an error.
- The challenge's workout is swapped to easy ("Swap to easy"), moved or removed after the challenge was made: the challenge follows or disappears, never shows ✗.

---

### Task 1: Table and core rules

**Files:**
- Create: `supabase/migrations/20261118000000_weekly_challenges.sql`
- Create: `packages/core/src/health/{laps.ts,verdict.ts,ghost.ts,challenge.ts,weekBought.ts,racePace.ts,spot.ts}`; export all from `packages/core/src/health/index.ts`

**Interfaces (Produces):**
- `laps.ts`:
  - `interface RunLap { distanceM: number; movingS: number; avgHr: number | null; gapSecPerKm: number | null; intensity: string | null; stepIndex: number | null }`.
  - `lapsFrom(splits: unknown): RunLap[]` reads `lapDTOs` (`distance`, `movingDuration ?? duration`, `averageHR`, `avgGradeAdjustedSpeed`, `intensityType`, `wktStepIndex`) and drops laps with 0 distance or time.
  - `lapPace(l)`; `judgedPace(l)` (GAP when present).
  - `runSteps(blocks: Block[]): Step[]`: "run" steps with repeats expanded.
  - `workLaps(laps, steps, easyMinSecPerKm): { pairs: { lap: RunLap; step: Step }[]; planned: number }`. With `stepIndex` on the `ACTIVE`/`INTERVAL` laps: pair in order, and fewer laps means a cut-short session. Without: laps ≥ 400 m or ≥ 90 s faster than `easyMin − 10`, each paired with the first run step.
  - `easyPart(laps): RunLap[]` drops stride laps.
- `verdict.ts`:
  - `VERDICT = { bitS: 5, unevenS: 8, hrHighBpm: 5 }`.
  - `type VerdictWord = "too_fast" | "too_slow" | "uneven" | "bit_fast" | "bit_slow" | "faster_each" | "on_target" | "too_fast_easy" | "hr_high" | "nice_easy"`.
  - `type Tone = "good" | "warn" | "bad" | "plain"`.
  - `interface Verdict { activityId: string; date: ISODate; type: string | null; title: string | null; word: VerdictWord | null; tone: Tone; reps: { secPerKm: number; hr: number | null }[] | null; zone: { min: number; max: number } | null; repsDone: number | null; repsPlanned: number | null; easy: { secPerKm: number; hr: number | null; hrVsNormal: number | null } | null; secondHalfDeltaS: number | null; test: { km: number; timeS: number; beat: boolean | null; proposal: boolean } | null; race: { km: number; timeS: number; deltaS: number | null } | null }`.
  - `verdictFor(i: { run: { id; date; distanceM; movingS; avgHr; indoor: boolean; easy: boolean }; laps: RunLap[]; workout: { type: string; title: string; blocks: Block[] } | null; easyZone: { min: number; max: number } | null; normalHr: number | null; testPredictionS?: number | null; proposal?: boolean; raceClockS?: number | null }): Verdict`. Implements spec §5.2–5.6 (the order in the §5.3 table). Quality types are intervals, threshold, tempo and test-free fartlek (`QUALITY_TYPES` minus race and test). Steps with `target.kind = "none"` get no word. Indoor runs get no word. An unlinked run that isn't easy gets no word. `secondHalfDeltaS` needs ≥ 4 laps of 0.9–1.1 km, and only differences ≥ 5 s are kept.
- `ghost.ts`:
  - `interface GhostRun { date: ISODate; distanceM: number; secPerKm: number; avgHr: number }`.
  - `interface Ghost { date: ISODate; km: number; secPerKm: number; hr: number; deltaS: number; deltaHr: number }` (today minus then; negative = faster or lower).
  - `ghostFor(today: GhostRun, candidates: GhostRun[]): Ghost | null` (spec §6).
- `challenge.ts`:
  - `type ChallengeKind = "test_beat" | "reps_in_zone" | "last_rep_fastest" | "finish_fast" | "long_hr" | "easy_hr_week"`.
  - `interface ChallengePick { kind: ChallengeKind; workoutId: string | null; params: Record<string, number> }`. Params:
    - `test_beat {targetS, km}`
    - `reps_in_zone {min, max}`
    - `finish_fast {km, maxSecPerKm}`
    - `long_hr {bpm}`
    - `easy_hr_week {bpm}`
  - `pickChallenge(i: { workouts: { id; date; type; blocks: Block[] }[]; lastKind: ChallengeKind | null; lastSameTypeInZone: (type: string) => boolean | null; predictionS: (km: number) => number | null; normalHr: number | null }): ChallengePick | null`. `workouts` are this week's planned run sessions not done yet. Picks per spec §7.2–7.3: priority test > finish_fast > quality > long > easy week. A different template than `lastKind` wins when one fits. HR templates are skipped without `normalHr`.
  - `decideChallenge(c: ChallengePick, i: { laps: RunLap[]; steps: Step[]; avgHr: number | null; testTimeS: number | null }): { result: "won" | "lost"; value: number } | null` for single-session kinds.
  - `decideEasyWeek(bpm: number, easyHrs: number[], weekOver: boolean): { result; value } | null`: lost at the first run over the limit; won once the week is over and every run was under.
- `weekBought.ts`: `weekBought(preds: { date: ISODate; s: number }[], today: ISODate): { weeks: { sunday: ISODate; deltaS: number }[] } | null`. Uses the latest Sunday ≤ today, three weeks, oldest first. A missing Sunday takes the nearest day up to 3 days earlier. Null when this week's delta can't be computed.
- `racePace.ts`: `racePaceAccount(i: { workouts: { date; type; status; blocks: Block[] }[]; runs: { date: ISODate; laps: RunLap[] }[]; today: ISODate; planStart: ISODate }): { secPerKm: number; doneKm: number; plannedKm: number } | null`. Implements spec §9: the race workout's race step gives the zone; time steps are converted to km at the zone's middle.
- `spot.ts`: `pickSpot(i: { alert: boolean; verdict: boolean; week: boolean; challengeOpen: boolean }): { main: "alert" | "verdict" | "week" | "challenge" | null; challengeLine: boolean }`. `challengeLine` is true when a challenge is open and something else is main.
- Migration: `weekly_challenges` per spec §11:
  - `workout_id references planned_workouts on delete set null`;
  - check on `kind` and on `result in ('won','lost')`;
  - `params jsonb not null default '{}'`;
  - `unique (user_id, week_start)`;
  - RLS: owner select only.

- [ ] Write the migration, run `pnpm db:push`, and confirm `apps/web/lib/db/types.ts` has `weekly_challenges`.
- [ ] Write the core files. `pnpm typecheck` passes.
- [ ] Commit `feat(under-klokka): weekly_challenges and core rules`.

### Task 2: Spot loader: verdict, ghost, week, alerts without AI

**Files:**
- Create: `apps/web/lib/health/spot.ts`, `apps/web/app/api/health/spot/route.ts`
- Modify:
  - `apps/web/lib/health/note.ts`: `dailyNote` returns null and stores nothing when there is no alert; the AI branch and `gate`/`anthropicRecoveryAi` use are removed.
  - `packages/core/src/health/note.ts`: drop `NOTE_PROMPT`, `noteMessage`, `NoteSchema`, `NOTE_PROMPT_VERSION`, `lastSession`, `clockDeltaS`, `raceName`; `templateNote` keeps only the alert sentences and the swap/rest line.
- Delete: `apps/web/app/api/health/note/route.ts`
- Test: `tests/integration/under-klokka.test.ts`; update `tests/integration/health.test.ts` (note tests: no note without an alert, no AI)

**Interfaces:**
- Consumes: Task 1 core functions.
- Produces:
  - `loadSpot(userId: string, today: ISODate, opts?: { now?: Date }): Promise<SpotView>`, where `SpotView = { alert: DailyNote | null; verdict: (Verdict & { ghost: Ghost | null; challenge: { kind: ChallengeKind; params; result: "won" | "lost"; value: number } | null }) | null; week: { distance: RaceDistance; weeks: { sunday; deltaS }[]; runs: number; km: number } | null; challenge: ChallengeView | null; main: ...; challengeLine: boolean }`.
  - `ChallengeView = { kind; params; workoutDate: ISODate | null; workoutTitle: string | null }`.
  - `normalEasyHr(userId, today): Promise<number | null>`.
  - `latestVerdict(userId, today, tz): Promise<SpotView["verdict"]>`, for the coach.
- Verdict window: the latest running activity with `local_date` in [yesterday, today] (profile timezone via `todayFor`). Without Garmin (`getGarminStatus` null): `verdict`, `week` and `challenge` are null.
- Week distance: `loadClock(...).race.distance`. Window: `localHour(tz, now) >= 18` on Sunday, or Monday with no running activity yet that day.
- Test prediction: `prediction_days` on the test's date for the test's km (5K → `time_5k_s`). Proposal: a pending `plan_proposals` row created on or after the test date.

- [ ] Build `loadSpot` (challenge parts return null until Task 3), the API and the note trimming.
- [ ] Write `under-klokka.test.ts`. Seed a Garmin user (`saveTokens`), a plan with `vdot` 45.7, and activities with `splits.lapDTOs` inserted directly. Cases:
  - threshold 2 × 12 min with laps 4:27, 4:28 against zone 269–279 → `bit_fast`;
  - laps 4:31, 4:33 → `on_target`;
  - laps 4:20, 4:35 → `too_fast`;
  - 1 of 2 laps → `repsDone` 1 and `repsPlanned` 2;
  - easy 11 km at 5:22 with 6 stride laps of 20 s → strides left out, `nice_easy`;
  - easy at 5:05 → `too_fast_easy`;
  - treadmill → word null;
  - ghost: 12.1 km 21 days earlier at 5:46/163 → `deltaS` −27, `deltaHr` −4; a candidate 10 days old is ignored;
  - week: Sundays 6350/6267/6210/6061 → deltas −83, −57, −149 when `now` is Sunday 19:00 Europe/Oslo, null at 17:00;
  - priority: an alert on the same day → `main` "alert";
  - double run: the verdict is the later one (Review Focus);
  - a lap with 0 distance doesn't produce NaN (Review Focus).
- [ ] Run `pnpm exec vitest run tests/integration/under-klokka.test.ts tests/integration/health.test.ts` → PASS.
- [ ] Commit `feat(under-klokka): verdict, ghost and week bought; note without AI`.

### Task 3: Weekly challenge

**Files:**
- Modify: `apps/web/lib/health/spot.ts`: `ensureChallenge(userId, today)` upserts `ignoreDuplicates` on `(user_id, week_start)` and reads back; `decideChallenges(userId, today)` is called from `loadSpot`.
- Modify: `apps/web/lib/training/service.ts` `afterGarminSync`: call `decideChallenges` inside its own try/catch, like `linkStrength`.
- Test: `tests/integration/under-klokka.test.ts`

**Interfaces:**
- Consumes: `pickChallenge`, `decideChallenge`, `decideEasyWeek`, `workLaps`, `runSteps`.
- Produces: `ensureChallenge(userId, today): Promise<ChallengeView | null>` and `decideChallenges(userId, today): Promise<void>`.
- Rules:
  - The week starts Monday (`weekStartOn(today, 1)`).
  - `lastKind` comes from the previous week's row.
  - `lastSameTypeInZone` = whether every work lap of the last done session of that type was in its zone.
  - A challenge whose workout is removed, no longer `planned`/`done`, swapped to another type, or outside the week is hidden (no ✗).
  - `easy_hr_week` uses the week's easy runs (`isEasyRun`); the week is over once today is past Sunday.

- [ ] Implement.
- [ ] Add tests:
  - a week with a fitness test → `test_beat` with the 5K prediction;
  - after the synced test run → won/lost with the lap time;
  - a threshold week where last time was in the zone → `last_rep_fastest`, then next week not the same kind;
  - two `ensureChallenge` calls at once → one row (Review Focus);
  - the workout swapped to easy via `swapToEasy` → challenge hidden (Review Focus);
  - `easy_hr_week` lost at the first run over the limit.
- [ ] Run the under-klokka and health tests → PASS.
- [ ] Commit `feat(under-klokka): weekly challenge`.

### Task 4: Race-pace account

**Files:**
- Create: `apps/web/lib/health/racePace.ts`: `loadRacePace(userId: string, today: ISODate): Promise<{ secPerKm: number; doneKm: number; plannedKm: number } | null>`. Null without Garmin, without an active running plan, without a future race workout, or with 0 planned km.
- Modify: `apps/web/app/(app)/training/page.tsx` (load it, pass to `RaceRoad`); `apps/web/components/health/RaceRoad.tsx` (`racePace` prop: line "Race pace {pace}: {done} of {planned} km" with a 4 px `--w-race` bar)
- Test: `tests/integration/under-klokka.test.ts`

- [ ] Implement.
- [ ] Add tests:
  - a race plan: race day 21.1 km zone 278–284, a long run with 4 km race step, and runs with laps 4:40 (2 km counted), 4:50 and 350 m (not counted) → `doneKm` 2 and `plannedKm` 4;
  - a build plan without a race → null;
  - the day after the race → null.
- [ ] Run → PASS.
- [ ] Commit `feat(under-klokka): race-pace account in race plans`.

### Task 5: UI, coach, smoke, docs, merge

**Files:**
- Create: `apps/web/components/health/UnderClock.tsx` (client). It fetches `/api/health/spot` and reloads on `GARMIN_SYNCED`. It renders:
  - the alert block, moved from `MorningNote`, with the swap buttons;
  - the verdict block: stripe in `typeColor`, "{title}, {Mon}", word in its tone, numbers line, optional ✓/✗ pill, ghost line with the ghost icon;
  - the week block (headline, "This week, {runs} runs, {km} km", 3 bars);
  - the challenge block (pill "This week", headline, "{weekday}, {title}" or "Garmin's estimate for you now");
  - the challenge line ("This week: …").

  Nothing renders when `main` is null. Look follows the artifact mockups and docs/design.md tokens (`--success`, `--warning`, `--destructive`).
- Delete: `apps/web/components/health/MorningNote.tsx`
- Modify:
  - `app/(app)/training/page.tsx` (`UnderClock` in both places);
  - `messages/en.json` (`health.spot.*`, drop `health.waiting`);
  - `lib/coach/context.ts`: replace the morning-note line with "Last run verdict: …" from `latestVerdict` and "This week's challenge: …" from the stored row. Alerts are kept: "Alert today: … (dealt with)".
  - `tests/smoke/health-smoke.mjs`: the alert flow still passes; add a seeded threshold run with laps and check "A bit fast" and the race-pace line. Dark and light.
  - Docs: spec status godkjent, `docs/02-decisions.md` row status, `CLAUDE.md` (spec link, smoke description).
- [ ] Build the UI and coach changes. `pnpm typecheck`.
- [ ] Run the full `pnpm test:int`, `pnpm build`, and `node tests/smoke/health-smoke.mjs`, `training-smoke.mjs` and `coach-smoke.mjs` against the dev server.
- [ ] Commit `feat(under-klokka): under-the-clock UI, coach context, smoke`.
- [ ] Final review (fresh reviewer, most capable model) with the Review Focus. Fix Critical/Important with a failing test first. Merge `--no-ff` to main and push.
