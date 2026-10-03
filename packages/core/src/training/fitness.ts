import { addDays, type ISODate } from "../dates";
import { pacesFor, vdotFrom } from "./vdot";

export interface RunRecord {
  date: ISODate;
  distanceM: number;
  /** Moving time when available, else elapsed. */
  timeS: number;
  /** Garmin laps, when synced (used to spot interval/threshold work). */
  laps?: { distanceM: number; timeS: number }[];
}

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
}

const EXPERIENCED_RUNS = 10;
const EXPERIENCED_KM = 15;
const QUALITY_LAP_M = 300;

export const DEFAULT_VDOT = 30;
const MIN_PACE_S_PER_KM = 150; // faster than 2:30/km is a GPS error, not a run
const VDOT_MIN = 20;
const VDOT_MAX = 85;

/** Current fitness from recent runs. VDOT = best effort ≥ 3 km in the last 8 weeks. */
export function fitnessFrom(runs: RunRecord[], today: ISODate): Fitness {
  const valid = runs.filter((r) => r.distanceM > 0 && r.timeS > 0 && r.timeS / (r.distanceM / 1000) >= MIN_PACE_S_PER_KM);
  const last8 = valid.filter((r) => r.date >= addDays(today, -56) && r.date < today);
  const last4 = valid.filter((r) => r.date >= addDays(today, -28) && r.date < today);

  const efforts = last8.filter((r) => r.distanceM >= 3000).map((r) => vdotFrom(r.distanceM, r.timeS));
  const best = efforts.length ? Math.max(...efforts) : DEFAULT_VDOT;
  const vdot = Math.round(Math.min(VDOT_MAX, Math.max(VDOT_MIN, best)) * 10) / 10;

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
  };
}
