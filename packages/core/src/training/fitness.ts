import { addDays, type ISODate } from "../dates";
import { vdotFrom } from "./vdot";

export interface RunRecord {
  date: ISODate;
  distanceM: number;
  /** Moving time when available, else elapsed. */
  timeS: number;
}

export interface Fitness {
  vdot: number;
  /** Average km/week over the last 4 weeks. */
  kmPerWeek: number;
  longestKm: number;
  runCount: number;
  /** True when there is too little history to trust the numbers. */
  sparse: boolean;
}

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

  const km4 = last4.reduce((s, r) => s + r.distanceM / 1000, 0);
  return {
    vdot,
    kmPerWeek: Math.round((km4 / 4) * 10) / 10,
    longestKm: Math.round(Math.max(0, ...last4.map((r) => r.distanceM / 1000)) * 10) / 10,
    runCount: last4.length,
    sparse: last4.length < 4,
  };
}
