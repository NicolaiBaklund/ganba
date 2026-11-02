import { addDays, type ISODate } from "../dates";
import { RACE_KM, type Goal, type RaceDistance } from "../training/types";
import { predictTimeS } from "../training/vdot";

/** The race the clock counts towards (spec docs/specs/2026-11-02-health.md §5). */
export interface ClockRace {
  name: string;
  distance: RaceDistance;
  /** Null for a build plan's focus distance or the 10K fallback: no race day. */
  date: ISODate | null;
}

export interface ClockWorkout {
  date: ISODate;
  type: string;
  title: string;
  plannedKm: number | null;
}

export interface PredictionTimes {
  time5K: number | null;
  time10K: number | null;
  timeHalfMarathon: number | null;
  timeMarathon: number | null;
}

const DISTANCES = Object.keys(RACE_KM) as RaceDistance[];
const NAMES: Record<RaceDistance, string> = { "5k": "5K", "10k": "10K", half: "Half marathon", marathon: "Marathon" };

const nearest = (km: number): RaceDistance =>
  DISTANCES.reduce((a, b) => (Math.abs(RACE_KM[b] - km) < Math.abs(RACE_KM[a] - km) ? b : a));

/** The race's distance: its km, else what its title says ("Half", "Marathon", "10K", "5K"), else a half marathon. */
function raceDistance(w: ClockWorkout): RaceDistance {
  if (w.plannedKm && w.plannedKm > 0) return nearest(w.plannedKm);
  const t = w.title.toLowerCase();
  if (/half|halv/.test(t)) return "half";
  if (/marathon|maraton/.test(t)) return "marathon";
  if (/\b10\s?k\b/.test(t)) return "10k";
  if (/\b5\s?k\b/.test(t)) return "5k";
  return "half";
}

/**
 * A race session in the plan (also one the user added), then a race plan's goal, then a build plan's focus,
 * else 10K. A race stays the day after, so its finish time can show.
 */
export function pickRace(input: { today: ISODate; workouts: readonly ClockWorkout[]; goal: Goal | null }): ClockRace {
  const from = addDays(input.today, -1);
  const race = input.workouts.filter((w) => w.type === "race" && w.date >= from).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (race) return { name: race.title, distance: raceDistance(race), date: race.date };
  const g = input.goal;
  if (g?.kind === "race" && g.raceDate >= from) return { name: NAMES[g.distance], distance: g.distance, date: g.raceDate };
  if (g?.kind === "build" && g.focus) return { name: NAMES[g.focus], distance: g.focus, date: null };
  return { name: NAMES["10k"], distance: "10k", date: null };
}

export function predictionSeconds(p: PredictionTimes, d: RaceDistance): number | null {
  return { "5k": p.time5K, "10k": p.time10K, half: p.timeHalfMarathon, marathon: p.timeMarathon }[d] ?? null;
}

/** Without Garmin: Daniels' prediction from the plan's VDOT. */
export function planPrediction(vdot: number): PredictionTimes {
  const t = (d: RaceDistance) => Math.round(predictTimeS(RACE_KM[d] * 1000, vdot));
  return { time5K: t("5k"), time10K: t("10k"), timeHalfMarathon: t("half"), timeMarathon: t("marathon") };
}

/** A finished race: a run that day within ±5 % of the distance. */
export const isRaceRun = (km: number, d: RaceDistance): boolean => Math.abs(km - RACE_KM[d]) <= RACE_KM[d] * 0.05;
