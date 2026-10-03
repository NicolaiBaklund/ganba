import { addDays, daysBetween, weekStartOn, type ISODate } from "../dates";
import { assignDays } from "./schedule";
import { predictTimeS, pacesFor } from "./vdot";
import {
  easyRun,
  longRun,
  qualityFor,
  raceDay,
  sharpener,
  stridesRun,
  type BuildContext,
  type BuiltWorkout,
  type QualityType,
} from "./workouts";
import { RACE_KM, type Phase, type PlanInput, type RaceDistance, type WorkoutSpec, type WorkoutType } from "./types";

export const GROWTH = 0.08;
export const GROWTH_IN_DEFICIT = 0.05;
export const DEFICIT_SLOWDOWN_KCAL = 500;
export const RECOVERY_FACTOR = 0.75;
export const BUILD_PLAN_WEEKS = 4;
export const MAX_RACE_PLAN_WEEKS = 20;
export const QUALITY_SHARE = 0.25;
export const SECOND_QUALITY_MIN_KM = 40;
export const MIN_RUN_KM = 5;

const PEAK_RANGE: Record<RaceDistance, [number, number]> = {
  "5k": [20, 50],
  "10k": [25, 60],
  half: [35, 70],
  marathon: [50, 90],
};
/** Long run to build toward by the end of the build/peak phase. */
const LONG_TARGET: Record<RaceDistance, number> = { "5k": 10, "10k": 14, half: 19, marathon: 30 };
const LONG_CAP: Record<RaceDistance, number> = { "5k": 14, "10k": 18, half: 22, marathon: 32 };
const TAPER: Record<RaceDistance, number[]> = { "5k": [0.7], "10k": [0.7], half: [0.8, 0.6], marathon: [0.8, 0.65, 0.5] };

export interface WeekSummary {
  week: number;
  startDate: ISODate;
  phase: Phase;
  km: number;
}

export interface GeneratedPlan {
  workouts: WorkoutSpec[];
  weeks: WeekSummary[];
  peakKm: number;
  predictedTimeS: number | null;
  racePaceS: number | null;
}

export const mondayOf = (d: ISODate): ISODate => weekStartOn(d, 1);
const dateIn = (monday: ISODate, wd: number): ISODate => addDays(monday, (wd + 6) % 7);
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Phase per week for a race plan of `n` weeks (last week = race week). */
function racePhases(n: number, distance: RaceDistance): Phase[] {
  const taper = Math.min(n, TAPER[distance].length);
  const m = n - taper;
  const phases: Phase[] = [];
  if (m > 0) {
    if (m < 3) phases.push(...Array<Phase>(m).fill("peak"));
    else {
      const peak = clamp(Math.round(m * 0.25), 1, 4);
      const build = clamp(Math.round(m * 0.45), 1, 8);
      const base = Math.max(1, m - peak - build);
      const b2 = m - peak - base;
      phases.push(...Array<Phase>(base).fill("base"), ...Array<Phase>(b2).fill("build"), ...Array<Phase>(peak).fill("peak"));
    }
  }
  phases.push(...Array<Phase>(taper).fill("taper"));
  // Every 4th week before the taper is a lighter week (not the one right before taper).
  for (let i = 3; i < m - 1; i += 4) phases[i] = "recovery";
  return phases;
}

/** Hard session types for a week, by goal and phase; `k` alternates week to week. */
function qualityTypes(distance: RaceDistance | null, phase: Phase, count: number, k: number): WorkoutType[] {
  if (phase === "base" || phase === "recovery") return count > 0 ? ["strides"] : [];
  if (phase === "taper") return count > 0 ? ["intervals"] : [];
  const d = distance ?? "10k";
  const pairs: Record<RaceDistance, Record<"build" | "peak", [WorkoutType, WorkoutType]>> = {
    "5k": { build: ["intervals", "threshold"], peak: ["intervals", "threshold"] },
    "10k": { build: ["intervals", "threshold"], peak: ["threshold", "intervals"] },
    half: { build: ["threshold", "intervals"], peak: ["threshold", "tempo"] },
    marathon: { build: ["threshold", "tempo"], peak: ["tempo", "threshold"] },
  };
  const [a, b] = pairs[d][phase];
  if (distance == null) return [k % 2 === 0 ? "threshold" : "strides"].slice(0, count) as WorkoutType[];
  if (count >= 2) return [a, b];
  return count === 1 ? [k % 2 === 0 ? a : b] : [];
}

/**
 * Builds the whole plan. Deterministic: same input, same plan.
 * Race plans run to race day; build plans run to `untilDate` (default 4 weeks).
 */
export function generatePlan(input: PlanInput): GeneratedPlan {
  const paces = pacesFor(input.vdot);
  const distance = input.goal.kind === "race" ? input.goal.distance : null;
  const raceKm = distance ? RACE_KM[distance] : null;
  const predictedTimeS = raceKm ? predictTimeS(raceKm * 1000, input.vdot) : null;
  const racePaceS =
    input.goal.kind === "race" && raceKm
      ? Math.round((input.goal.targetTimeS ?? predictedTimeS!) / raceKm)
      : null;
  const ctx: BuildContext = { paces, racePaceS: racePaceS ?? undefined };

  const runs = clamp(Math.min(input.runsPerWeek, new Set(input.weekdays).size), 1, 6);
  const firstMonday = mondayOf(input.startDate);
  const lastDate =
    input.goal.kind === "race" ? input.goal.raceDate : (input.untilDate ?? addDays(input.startDate, BUILD_PLAN_WEEKS * 7 - 1));
  const nWeeks = Math.max(1, daysBetween(firstMonday, mondayOf(lastDate)) / 7 + 1);

  const phases: Phase[] =
    distance != null
      ? racePhases(nWeeks, distance)
      : Array.from({ length: nWeeks }, (_, i) => (i % 4 === 3 ? "recovery" : "build"));

  const startKm = Math.max(input.startKmPerWeek, runs * 3);
  const [peakLo, peakHi] = distance ? PEAK_RANGE[distance] : [Math.max(15, runs * 4), 60];
  const peakKm = Math.max(startKm, clamp(startKm * (distance ? 1.5 : 1.3), peakLo, peakHi));
  const growth = input.deficitKcal > DEFICIT_SLOWDOWN_KCAL ? GROWTH_IN_DEFICIT : GROWTH;
  const longCap = distance ? LONG_CAP[distance] : 16;
  const longShare = runs <= 2 ? 0.5 : runs === 3 ? 0.4 : 0.3;
  const longStart = Math.max(5, startKm * longShare);
  const longTarget = distance ? Math.max(longStart, LONG_TARGET[distance]) : Math.max(longStart, 12);
  const qualityWeeks = phases.filter((p) => p === "build" || p === "peak").length;
  const growthWeeks = phases.filter((p) => p !== "taper" && p !== "recovery").length;
  let growthIdx = 0;

  const workouts: WorkoutSpec[] = [];
  const weeks: WeekSummary[] = [];
  let level = startKm;
  let taperIdx = 0;
  let qualityIdx = 0;
  let peakReached = startKm;

  for (let w = 0; w < nWeeks; w++) {
    const phase = phases[w]!;
    const monday = addDays(firstMonday, w * 7);
    let km: number;
    if (phase === "taper") km = peakReached * TAPER[distance!]![taperIdx++]!;
    else if (phase === "recovery") km = level * RECOVERY_FACTOR;
    else {
      if (w > 0) level = Math.min(peakKm, level * (1 + growth));
      km = level;
      growthIdx++;
      peakReached = Math.max(peakReached, level);
    }

    const isQualityWeek = phase === "build" || phase === "peak";
    // Session size follows both time in the plan and the runner's volume (beginners stay small).
    const byProgress = qualityWeeks > 1 ? Math.round((qualityIdx / (qualityWeeks - 1)) * 4) : 2;
    const byVolume = km < 20 ? 0 : km < 30 ? 1 : km < 40 ? 2 : km < 55 ? 3 : 4;
    const lvl = Math.min(byProgress, byVolume);
    // A second hard session only in bigger weeks.
    const qualityCount = isQualityWeek ? (runs >= 5 && km >= SECOND_QUALITY_MIN_KM ? 2 : 1) : 0;
    const qTypes = isQualityWeek ? qualityTypes(distance, phase, qualityCount, qualityIdx) : [];
    if (isQualityWeek) qualityIdx++;
    const hardTypes = (phase === "taper" && runs >= 3 ? ["intervals"] : qTypes.filter((t) => t !== "strides")) as QualityType[];
    const wantStrides = phase === "base" || phase === "recovery" || qTypes.includes("strides");

    const isRaceWeek = distance != null && w === nWeeks - 1;
    const built: { date: ISODate; w: BuiltWorkout }[] = [];
    // Short runs only for very small weeks (beginners); otherwise fewer, proper runs.
    const minRun = clamp(km * 0.2, 3, MIN_RUN_KM);

    if (isRaceWeek) {
      const raceDate = (input.goal as { raceDate: ISODate }).raceDate;
      built.push({ date: raceDate, w: raceDay(distance!, raceKm!, ctx) });
      const before = [...new Set(input.weekdays)]
        .map((wd) => dateIn(monday, wd))
        .filter((d) => d < addDays(raceDate, -1))
        .sort();
      const pick = before.slice(-Math.max(0, runs - 1));
      pick.forEach((d, i) => {
        const sharp = i === 0 && daysBetween(d, raceDate) >= 3 && runs >= 3 && km - raceKm! >= 8;
        built.push({ date: d, w: sharp ? sharpener(ctx) : easyRun(clamp((km - raceKm!) / Math.max(1, pick.length), 3, 6), ctx) });
      });
    } else {
      const marathonPeak = distance === "marathon" && phase === "peak";
      // Long run grows linearly toward the target, never above ~55 % of the week.
      const progress = growthWeeks > 1 ? Math.min(1, Math.max(0, growthIdx - 1) / (growthWeeks - 1)) : 1;
      const longGoal = longStart + (longTarget - longStart) * progress;
      const longScale = phase === "recovery" || phase === "taper" ? (phase === "taper" ? 0.6 : RECOVERY_FACTOR) : 1;
      const longMax = Math.min(longCap, km * 0.55);
      let longKm = Math.max(5, Math.min(longMax, Math.max(km * longShare, longGoal * longScale)));

      // Hard work stays within ~25 % of the week (with two runs a week, whatever the long run leaves).
      const qualityBudget = runs <= 2 ? Math.max(0, km - longKm) : km * QUALITY_SHARE;
      const quality = hardTypes.map((t) =>
        phase === "taper" ? sharpener(ctx) : qualityFor(t, lvl, distance ?? "10k", ctx, qualityBudget / hardTypes.length),
      );
      const qualityKm = quality.reduce((sum, q) => sum + q.plannedKm, 0);
      // Drop easy runs rather than make them tiny; they come back as the volume grows.
      let easyCount = Math.max(0, runs - 1 - quality.length);
      while (easyCount > 1 && (km - longKm - qualityKm) / easyCount < minRun) easyCount--;
      // If easy runs would outgrow the long run, the long run takes the extra instead.
      const biggestEasy = easyCount ? ((km - longKm - qualityKm) / easyCount) * (runs >= 4 && easyCount >= 2 ? 1.25 : 1) : 0;
      if (biggestEasy > longKm * 0.8) longKm = Math.max(longKm, Math.min(longMax, biggestEasy / 0.8));
      const long = longRun(longKm, ctx, marathonPeak ? Math.min(12, Math.round(longKm * 0.35)) : 0);
      const left = Math.max(0, km - long.plannedKm - qualityKm);
      const days = assignDays(input.weekdays, input.longRunWeekday, true, quality.length, easyCount);

      if (days.long != null) built.push({ date: dateIn(monday, days.long), w: long });
      quality.forEach((q, i) => days.hard[i] != null && built.push({ date: dateIn(monday, days.hard[i]!), w: q }));

      // Easy runs share what is left: shorter the day after a hard day, one medium-long run in bigger weeks.
      const hardDays = [...(days.long == null ? [] : [days.long]), ...days.hard.slice(0, quality.length)];
      const easyDays = days.easy.slice(0, easyCount);
      const recovery = easyDays.map((d) => hardDays.some((h) => (d - h + 7) % 7 === 1));
      const mediumIdx = runs >= 4 ? easyDays.findIndex((_, i) => !recovery[i]) : -1;
      const weights = easyDays.map((_, i) => (recovery[i] ? 0.7 : i === mediumIdx && easyDays.length >= 2 ? 1.4 : 1));
      const totalW = weights.reduce((a, b) => a + b, 0) || 1;
      let stridesIdx = wantStrides ? easyDays.findIndex((_, i) => !recovery[i] && i !== mediumIdx) : -1;
      if (wantStrides && stridesIdx < 0) stridesIdx = easyDays.length ? 0 : -1;
      easyDays.forEach((d, i) => {
        const size = clamp((left * weights[i]!) / totalW, minRun, Math.max(minRun, long.plannedKm * 0.8));
        const w =
          i === stridesIdx
            ? stridesRun(size, ctx)
            : easyRun(size, ctx, recovery[i] ? "Recovery run" : i === mediumIdx && easyDays.length >= 2 ? "Medium-long run" : "Easy run");
        built.push({ date: dateIn(monday, d), w });
      });
    }

    const kept = built.filter((b) => b.date >= input.startDate).sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const b of kept) workouts.push({ ...b.w, date: b.date, week: w + 1, phase });
    weeks.push({ week: w + 1, startDate: monday, phase, km: r1(kept.reduce((s, b) => s + b.w.plannedKm, 0)) });
  }

  return { workouts, weeks, peakKm: r1(peakKm), predictedTimeS, racePaceS };
}

/** Weekday helper for UIs: the long-run day default (Sunday when allowed, else the last allowed day). */
export const defaultLongRunDay = (weekdays: number[]): number =>
  weekdays.includes(0) ? 0 : [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).at(-1) ?? 0;
