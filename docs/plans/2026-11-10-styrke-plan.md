# Styrke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log strength sessions in Ganba (exercise list with favourites, sets prefilled from last time), show them in This week, the plan, Today's bib and Progress, count their kcal, and give stamps.

**Architecture:** New tables `strength_sessions`, `strength_sets`, `user_exercises`; the exercise catalog and all pure rules (prefill, increase step, duration, top set, stamps) live in `packages/core/src/strength`. Server code in `apps/web/lib/strength`. Planned strength days are virtual: computed from `training_plans.strength_weekdays`, never rows in `planned_workouts`, so watch push, km sums and missed proposals are untouched.

**Tech Stack:** Next.js app router (apps/web), Supabase, next-intl, Vitest integration tests, Playwright smoke.

**Spec:** docs/specs/2026-11-10-styrke.md

## Global Constraints

- Multi-user: no hardcoded user values. Copy in English in `apps/web/messages/en.json`; docs in Norwegian.
- Integration tests only (no unit tests). Run with `pnpm exec vitest run <file>` from the repo root.
- One strength session per user per day (`unique (user_id, local_date)`).
- kg is typed (decimal), − / + changes 1 kg; reps ± 1; seconds ± 5.
- Increase step: the user's own last increase of the top set for that exercise; else 2.5 (barbell, machine, custom), 2 (dumbbell, cable); bw: +1 rep.
- Duration without a linked Garmin activity: max(first→last saved exercise, sets × 150 s), at least 20 min. kcal via `metFor("strength_training")` like other watchless activities; Garmin numbers replace it once linked, never both.
- Never pushed to the watch; never counted in km.
- No Co-Authored-By/Claude attribution in commits.

## Review Focus

- A session logged before the Garmin sync, then linked: kcal must not be counted twice (session + activity).
- Two `strength_training` activities on one day: only one links; the other still shows "From your watch".
- Changing strength weekdays must not touch run/ride planned workouts or push anything to Garmin.
- Prefill when the last session of the exercise had a different number of sets, or bw with extra kg.
- Past days: logging from a past Garmin row or Today's viewed date lands on that date, never in the future.

---

### Task 1: Data and core rules

**Files:**
- Create: `supabase/migrations/20261110000000_strength.sql`
- Create: `packages/core/src/strength/{catalog.ts,rules.ts,index.ts}`; export from `packages/core/src/index.ts`
- Modify: `packages/core/src/health/stamps.ts` (StampKind)

**Interfaces (Produces):**
- `type Measure = "kg" | "bw" | "time"`, `type Equipment = "barbell" | "machine" | "dumbbell" | "cable" | "bodyweight"`, `type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "core" | "legs" | "runners"`.
- `interface Exercise { key: string; name: string; group: MuscleGroup; measure: Measure; equipment: Equipment | null }`; `EXERCISES: Exercise[]` (~40, spec §5.1); `exerciseByKey(key, custom?: Exercise[]): Exercise | null`.
- `interface SetRow { setNo: number; reps: number | null; kg: number | null; seconds: number | null }`.
- `prefillSets(last: SetRow[] | null, measure: Measure): SetRow[]` — copy of last; first time 3 × 10 (time: 3 × 30 s), kg null.
- `increaseHint(history: { date: ISODate; sets: SetRow[] }[], ex: Exercise): { kg?: number; reps?: number } | null` — history newest last; hint only when every set of the last session has reps ≥ first set's reps; step per Global Constraints.
- `topSet(sets: SetRow[], measure): number | null` (max kg; bw: max reps; time: max seconds).
- `sessionDurationS(savedAt: string[], setCount: number): number`.
- `strengthStamps(sessions: { date: ISODate; tops: { key: string; kg: number | null }[] }[], favourites: Set<string>): { kind: "strength_count" | "strength_pr"; key: string; earnedOn: ISODate; value?: object }[]` — counts 1/10/25/50/100 (key `"1"`, `"10"` …); PR key `${exerciseKey}-${tens}` when a favourite kg exercise's top set first reaches a new multiple of 10.
- Migration: tables per spec §11 with RLS (owner select/insert/update/delete), `training_plans.strength_weekdays int[] not null default '{}'`, stamps kind check extended with `strength_count`, `strength_pr`. Then `pnpm db:push`.

- [ ] Write migration, run `pnpm db:push`, check `apps/web/lib/db/types.ts` has the tables.
- [ ] Write core files; `pnpm typecheck` passes.
- [ ] Commit `feat(strength): tables, exercise catalog and rules`.

### Task 2: Server: sessions, linking, kcal, view, stamps, API

**Files:**
- Create: `apps/web/lib/strength/{sessions.ts,view.ts}`; API `apps/web/app/api/strength/{session/route.ts,exercise/route.ts,favorite/route.ts}`
- Modify: `apps/web/lib/db/activity.ts` (`loadDays` adds unlinked strength sessions as `ActivityLike { typeKey: "strength_training", durationS }`), `apps/web/lib/health/stamps.ts` (merge `strengthStamps`, `stampText` for the new kinds), `apps/web/lib/garmin/sync.ts` or `afterGarminSync` (call `linkStrength(userId)`), `apps/web/lib/coach/context.ts` (last 14 days of strength)
- Test: `tests/integration/strength.test.ts`

**Interfaces (Produces):**
- `openSession(userId, date): Promise<string>` (get or create the day's session; date ≤ today).
- `saveExercise(userId, sessionId, { key, position, sets: SetRow[] }): Promise<void>` (replaces that exercise's sets, stamps `saved_at` list via `updated_at`, links Garmin).
- `removeExercise`, `finishSession(userId, sessionId)` (deletes empty session; sets finished_at; refreshStamps), `deleteSession`.
- `linkStrength(userId): Promise<void>` — spec §7 rule.
- `createExercise(userId, { name, group, measure }): Promise<string>` (key `custom-<uuid>`), `setFavourite(userId, key, on)`.
- `loadSession(userId, id): Promise<SessionView | null>` with exercises (sets, prefill for new ones, hint, favourite) and Garmin minutes/kcal.
- `loadPicker(userId): Promise<{ favourites: PickRow[]; groups: { group; rows: PickRow[] }[] }>` with "Last: …".
- `strengthWeek(userId, monday, plan): Promise<StrengthItem[]>` — logged sessions, unlinked Garmin strength activities ("From your watch"), and virtual planned days (`strength_weekdays`) merged so one row per day. `StrengthItem { date; state: "done" | "planned" | "missed"; sessionId: string | null; activityId: string | null; groups: MuscleGroup[]; minutes: number | null; fromWatch: boolean }`.
- `strengthProgress(userId, today): Promise<{ sessions: number; rows: { key; name; from; to; since: ISODate; unit: "kg" | "reps" | "s"; points: number[] }[] }>`.

- [ ] Write the integration test first (spec §13 server items): session create/save/prefill/hint; one per day; linking before and after a fake Garmin sync with two activities; kcal counted once (via `dayActivity`); week items (logged, from watch, planned, missed); progress rows; stamps (1 session, favourite 70 kg). Run → FAIL.
- [ ] Implement; run → PASS. Also `tests/integration/health.test.ts` still passes.
- [ ] Commit `feat(strength): sessions, Garmin link, kcal, week items, progress, stamps`.

### Task 3: Screens

**Files:**
- Create: `apps/web/app/(app)/training/strength/[id]/page.tsx` (session), `apps/web/app/(app)/training/strength/[id]/add/page.tsx` (picker), `apps/web/app/(app)/training/strength/open/route.ts` (GET `?date=` → openSession → redirect), components `apps/web/components/strength/{SessionEditor.tsx,ExercisePicker.tsx,StrengthRow.tsx,StrengthSection.tsx}`
- Modify: `components/nav/PlusMenu.tsx` (full-width Strength tile → `/training/strength/open` with viewed past date), `app/(app)/training/page.tsx` (This week merges `StrengthRow`s by date), `components/training/TrainingMap.tsx` + `lib/training/view.ts` (strength items per week), `lib/db/week.ts` (strength sash), `components/tasuki/Sash.tsx` (type `"strength"`), `components/today/TodayBib.tsx` + today page (strength-only day: RestBib-style "Strength" bib in `--w-strength`), `app/(app)/progress/page.tsx` (`StrengthSection`), `app/globals.css` (`--w-strength`: `#8a909a` light, `#c9ced6` dark), `messages/en.json`
- [ ] Build screens per spec §4, §6 and the mockups; `pnpm typecheck`.
- [ ] Commit `feat(strength): log sessions, This week, bib and Progress`.

### Task 4: Strength days in the plan

**Files:**
- Create: `apps/web/components/training/StrengthDays.tsx`, API `apps/web/app/api/training/plan/strength-days/route.ts`
- Modify: `app/(app)/training/plan/page.tsx`, `lib/training/view.ts` (`plan.strengthWeekdays`), `lib/coach/context.ts` (strength days line)
- [ ] Add to `strength.test.ts`: setting days stores them, creates no `planned_workouts` rows and no push; virtual planned item appears; done when logged. Run → FAIL, implement, PASS.
- [ ] Commit `feat(strength): strength days in the plan`.

### Task 5: Smoke, docs, merge

- [ ] `tests/smoke/strength-smoke.mjs`: + → Strength → Add exercise → star, add 2 exercises → change kg by typing → ✓ → Finish → This week row → Progress section; dark and light; no console errors.
- [ ] Docs: spec status godkjent, `docs/02-decisions.md` row, `CLAUDE.md` (spec link, smoke list).
- [ ] Full `pnpm test:int`, `pnpm build`, health/training smokes.
- [ ] Final review (fresh reviewer), fixes, merge `--no-ff` to main, push.
