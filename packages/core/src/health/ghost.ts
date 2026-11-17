import { daysBetween, type ISODate } from "../dates";

/** A similar earlier easy run (spec 2026-11-18 §6). */
export const GHOST = { minDaysOld: 14, maxDaysOld: 182, distanceShare: 0.1, minDeltaS: 3, minDeltaHr: 2, samePaceS: 5, lowerHr: 3 } as const;

export interface GhostRun {
  date: ISODate;
  distanceM: number;
  /** Moving pace without strides. */
  secPerKm: number;
  avgHr: number;
}

export interface Ghost {
  date: ISODate;
  km: number;
  secPerKm: number;
  hr: number;
  /** Today minus then: negative is faster. */
  deltaS: number;
  /** Today minus then: negative is lower. */
  deltaHr: number;
}

/** The newest easy run 14–182 days older with a distance within ±10 %, or null when there is none or no real change. */
export function ghostFor(today: GhostRun, candidates: readonly GhostRun[]): Ghost | null {
  const pick = candidates
    .filter((c) => {
      const age = daysBetween(c.date, today.date);
      return age >= GHOST.minDaysOld && age <= GHOST.maxDaysOld && Math.abs(c.distanceM - today.distanceM) <= today.distanceM * GHOST.distanceShare && c.avgHr > 0 && c.secPerKm > 0;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!pick) return null;
  const deltaS = Math.round(today.secPerKm - pick.secPerKm);
  const deltaHr = Math.round(today.avgHr - pick.avgHr);
  if (Math.abs(deltaS) < GHOST.minDeltaS && Math.abs(deltaHr) < GHOST.minDeltaHr) return null;
  return { date: pick.date, km: Math.round(pick.distanceM / 100) / 10, secPerKm: Math.round(pick.secPerKm), hr: Math.round(pick.avgHr), deltaS, deltaHr };
}
