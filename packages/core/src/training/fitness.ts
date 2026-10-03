import { addDays, type ISODate } from "../dates";
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

export interface Fitness {
  vdot: number;
  /** Average km/week over the last 4 weeks. */
  kmPerWeek: number;
  longestKm: number;
  runCount: number;
  /** True when there is too little history to trust the numbers. */
  sparse: boolean;
  /** Start volume for a plan: the higher of the 4- and 2-week averages, at most 20 % above the 4-week one. */
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
 * Current fitness. VDOT = the best of: a whole outdoor run ≥ 3 km, fast interval laps (last 8 weeks),
 * and Garmin's 10K prediction minus a small discount.
 */
export function fitnessFrom(runs: RunRecord[], today: ISODate, garmin?: { time10kS?: number | null }): Fitness {
  const valid = runs.filter((r) => r.distanceM > 0 && r.timeS > 0 && r.timeS / (r.distanceM / 1000) >= MIN_PACE_S_PER_KM);
  const last8 = valid.filter((r) => r.date >= addDays(today, -56) && r.date < today);
  const last4 = valid.filter((r) => r.date >= addDays(today, -28) && r.date < today);

  const outdoor = last8.filter((r) => !r.indoor);
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

  const km4 = last4.reduce((s, r) => s + r.distanceM / 1000, 0) / 4;
  const km2 = valid.filter((r) => r.date >= addDays(today, -14) && r.date < today).reduce((s, r) => s + r.distanceM / 1000, 0) / 2;
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
    baseKmPerWeek: r1(Math.min(Math.max(km4, km2), km4 * 1.2)),
    experienced: last4.length >= EXPERIENCED_RUNS && km4 >= EXPERIENCED_KM,
    didQuality,
    source: best.source,
  };
}
