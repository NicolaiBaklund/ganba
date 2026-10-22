import { addDays, type ISODate } from "../dates";
import type { WeekSummary } from "./generate";
import { easyRun, type BuildContext } from "./workouts";
import { enduranceRide, INDOOR, type RideContext } from "./ride";
import type { Sport, WorkoutSpec } from "./types";

/**
 * Cross-training (spec docs/specs/2026-10-23-sykling-del2.md §3): easy sessions of the other sport on their own
 * days. The main sport keeps the goal, the quality and the volume; these grow gently with the plan.
 */
export interface CrossInput {
  /** Sport of the cross sessions (the other one than the plan's). */
  sport: Sport;
  weekdays: readonly number[];
  startDate: ISODate;
  /** Race/event day of the main plan: no cross session on it or the day before. */
  eventDate?: ISODate | null;
  ride?: { ctx: RideContext; indoor?: boolean; experienced?: boolean };
  run?: { ctx: BuildContext };
}

export const CROSS = {
  ride: { startMin: 60, maxMin: 90, maxMinExperienced: 120, lightMin: 45 },
  run: { startKm: 5, maxKm: 8, lightKm: 5 },
} as const;
/** Weeks of growth (lighter weeks don't count) until cross sessions reach their full length. */
const GROWTH_WEEKS = 12;

export function crossSessions(weeks: readonly WeekSummary[], input: CrossInput): WorkoutSpec[] {
  const out: WorkoutSpec[] = [];
  const days = [...new Set(input.weekdays)];
  let grown = 0;
  for (const wk of weeks) {
    const light = wk.phase === "recovery" || wk.phase === "taper";
    const progress = Math.min(1, grown / GROWTH_WEEKS);
    if (!light) grown++;
    for (const wd of days) {
      const date = addDays(wk.startDate, (wd + 6) % 7);
      if (date < input.startDate) continue;
      if (input.eventDate && date >= addDays(input.eventDate, -1)) continue;
      let built;
      if (input.sport === "ride") {
        const r = input.ride!;
        const max = Math.min(r.experienced ? CROSS.ride.maxMinExperienced : CROSS.ride.maxMin, r.indoor ? INDOOR.easyMaxMin : Infinity);
        const full = CROSS.ride.startMin + (max - CROSS.ride.startMin) * progress;
        const minutes = wk.phase === "taper" ? CROSS.ride.lightMin : wk.phase === "recovery" ? Math.max(CROSS.ride.lightMin, full * 0.75) : full;
        built = enduranceRide(minutes, r.ctx);
      } else {
        const km = light ? CROSS.run.lightKm : CROSS.run.startKm + (CROSS.run.maxKm - CROSS.run.startKm) * progress;
        built = easyRun(Math.round(km * 2) / 2, input.run!.ctx);
      }
      out.push({ ...built, sport: input.sport, date, week: wk.week, phase: wk.phase });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
