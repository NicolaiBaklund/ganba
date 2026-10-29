import { addDays, daysBetween, weekStartOn, type ISODate } from "../dates";
import { pacesFor, vdotFrom, vo2AtSpeed } from "./vdot";

export interface RunRecord {
  date: ISODate;
  distanceM: number;
  /** Moving time when available, else elapsed. */
  timeS: number;
  /** Garmin laps, when synced (used to spot interval/threshold work). */
  laps?: { distanceM: number; timeS: number }[];
  /** Treadmill/indoor: the watch only estimates distance, so it never sets fitness. */
  indoor?: boolean;
}

export type FitnessSource =
  | { kind: "run"; date: ISODate; distanceKm: number }
  | { kind: "laps"; date: ISODate }
  | { kind: "garmin"; time10kS: number }
  | { kind: "default" };

/**
 * Without logged runs (no Garmin, nothing entered yet): the volume the runner states takes the place of what
 * runs would show (spec 2026-10-29 §7).
 */
export function withStatedStart<F extends { runCount: number; baseKmPerWeek: number; kmPerWeek: number; longestKm: number; experienced: boolean }>(
  fit: F,
  start: { kmPerWeek: number; longestKm: number } | null | undefined,
): F {
  if (!start || fit.runCount > 0) return fit;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { ...fit, baseKmPerWeek: r1(start.kmPerWeek), kmPerWeek: r1(start.kmPerWeek), longestKm: r1(start.longestKm), experienced: start.kmPerWeek >= EXPERIENCED_KM };
}

export interface Fitness {
  vdot: number;
  /** Average km/week over the last 4 weeks. */
  kmPerWeek: number;
  longestKm: number;
  runCount: number;
  /** True when there is too little history to trust the numbers. */
  sparse: boolean;
  /** Start volume for a plan: the best Monday–Sunday week of the last four (and this one so far). Week 1 matches it. */
  baseKmPerWeek: number;
  /** Ran consistently the last 4 weeks (≥ 10 runs, ≥ 15 km/week): no base phase needed. */
  experienced: boolean;
  /** Laps at threshold pace or faster in the last 4 weeks: quality sessions start a level up. */
  didQuality: boolean;
  /** Where the VDOT came from (shown to the user). */
  source: FitnessSource;
}

/** Garmin's predictor runs optimistic for many runners; its VDOT is taken down this much. */
export const GARMIN_VDOT_DISCOUNT = 1;
const REP_LAP_M = [200, 600] as const; // ~repetition pace
const INTERVAL_LAP_M = [600, 1600] as const; // ~interval pace

/**
 * VDOT implied by fast laps, read cautiously: short reps as repetition pace (105 % VO2max),
 * 600–1600 m as interval pace (97.5 %). Per session the second-fastest lap counts, so one GPS glitch does not.
 */
function lapsVdot(r: RunRecord): number | null {
  const est = (r.laps ?? [])
    .filter((l) => l.distanceM >= REP_LAP_M[0] && l.distanceM <= INTERVAL_LAP_M[1] && l.timeS >= 45)
    .map((l) => {
      const v = l.distanceM / (l.timeS / 60);
      return vo2AtSpeed(v) / (l.distanceM < REP_LAP_M[1] ? 1.05 : 0.975);
    })
    .sort((a, b) => b - a);
  return est.length >= 2 ? est[1]! : null;
}

const EXPERIENCED_RUNS = 10;
const EXPERIENCED_KM = 15;
const QUALITY_LAP_M = 300;

export const DEFAULT_VDOT = 30;
const MIN_PACE_S_PER_KM = 150; // faster than 2:30/km is a GPS error, not a run
const VDOT_MIN = 20;
const VDOT_MAX = 85;

/**
 * The biggest Monday–Sunday week among the last four whole weeks and this week so far (before today). Calendar
 * weeks, as the plan and Garmin count them: a rolling 7-day window would take two weeks' busy days together.
 */
export function bestCalendarWeek(items: readonly { date: ISODate; amount: number }[], today: ISODate): number {
  const thisMonday = weekStartOn(today, 1);
  const from = addDays(thisMonday, -28);
  const weeks = new Map<ISODate, number>();
  for (const x of items) if (x.date >= from && x.date < today) weeks.set(weekStartOn(x.date, 1), (weeks.get(weekStartOn(x.date, 1)) ?? 0) + x.amount);
  return Math.max(0, ...weeks.values());
}

/**
 * Current fitness. VDOT = the best of: a whole outdoor run ≥ 3 km, fast interval laps (last 8 weeks),
 * and Garmin's 10K prediction minus a small discount.
 */
export function fitnessFrom(runs: RunRecord[], today: ISODate, garmin?: { time10kS?: number | null }): Fitness {
  // A run logged by hand may have no time: it counts for volume, never for VDOT.
  const valid = runs.filter((r) => r.distanceM > 0 && (r.timeS <= 0 || r.timeS / (r.distanceM / 1000) >= MIN_PACE_S_PER_KM));
  const last8 = valid.filter((r) => r.date >= addDays(today, -56) && r.date < today);
  const last4 = valid.filter((r) => r.date >= addDays(today, -28) && r.date < today);

  const outdoor = last8.filter((r) => !r.indoor && r.timeS > 0);
  const candidates: { vdot: number; source: FitnessSource }[] = [
    ...outdoor
      .filter((r) => r.distanceM >= 3000)
      .map((r) => ({ vdot: vdotFrom(r.distanceM, r.timeS), source: { kind: "run", date: r.date, distanceKm: Math.round(r.distanceM / 100) / 10 } as FitnessSource })),
    ...outdoor.flatMap((r) => {
      const v = lapsVdot(r);
      return v == null ? [] : [{ vdot: v, source: { kind: "laps", date: r.date } as FitnessSource }];
    }),
    ...(garmin?.time10kS ? [{ vdot: vdotFrom(10_000, garmin.time10kS) - GARMIN_VDOT_DISCOUNT, source: { kind: "garmin", time10kS: garmin.time10kS } as FitnessSource }] : []),
  ];
  const best = candidates.sort((a, b) => b.vdot - a.vdot)[0] ?? { vdot: DEFAULT_VDOT, source: { kind: "default" } as FitnessSource };
  const vdot = Math.round(Math.min(VDOT_MAX, Math.max(VDOT_MIN, best.vdot)) * 10) / 10;

  // Rolling 7-day weeks back from today (index 0 = the last 7 days), for the average.
  const weeks = [0, 0, 0, 0];
  for (const r of last4) weeks[Math.min(3, Math.floor((daysBetween(r.date, today) - 1) / 7))]! += r.distanceM / 1000;
  const km4 = weeks.reduce((s, x) => s + x, 0) / 4;
  // The best week: a sick, busy or easy week doesn't lower the start (the user's choice, 2026-10-24).
  const base = bestCalendarWeek(valid.map((r) => ({ date: r.date, amount: r.distanceM / 1000 })), today);
  const thresholdPace = pacesFor(vdot).threshold;
  const didQuality = last4.some((r) =>
    (r.laps ?? []).some((l) => l.distanceM >= QUALITY_LAP_M && l.timeS > 0 && l.timeS / (l.distanceM / 1000) <= thresholdPace + 5),
  );
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    vdot,
    kmPerWeek: r1(km4),
    longestKm: r1(Math.max(0, ...last4.map((r) => r.distanceM / 1000))),
    runCount: last4.length,
    sparse: last4.length < 4,
    baseKmPerWeek: r1(base),
    experienced: last4.length >= EXPERIENCED_RUNS && km4 >= EXPERIENCED_KM,
    didQuality,
    source: best.source,
  };
}
