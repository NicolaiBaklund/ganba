import type { ISODate } from "../dates";
import type { Block, Step } from "../training/types";
import { judgedPace, paceZone, runSteps, workLaps, type RunLap } from "./laps";
import { REP_TYPES } from "./verdict";

/** The weekly challenge (spec 2026-11-18 §7). */
export type ChallengeKind = "test_beat" | "reps_in_zone" | "last_rep_fastest" | "finish_fast" | "long_hr" | "easy_hr_week";

export const CHALLENGE = { longHrPlus: 5, sameRepS: 1 } as const;

export interface ChallengePick {
  kind: ChallengeKind;
  workoutId: string | null;
  /** test_beat {targetS, km}; reps_in_zone {min, max}; finish_fast {km, maxSecPerKm}; long_hr / easy_hr_week {bpm}. */
  params: Record<string, number>;
}

export interface ChallengeWorkout {
  id: string;
  date: ISODate;
  type: string;
  blocks: readonly Block[];
}

const kmOf = (s: Step) => (s.duration.kind === "distance" ? s.duration.m / 1000 : 0);
const FINISH_ZONES: ReadonlySet<string> = new Set(["race", "marathon"]);

/** The finishing step of a long run at race or marathon pace, if it has one. */
function finishStep(w: ChallengeWorkout): Step | null {
  const steps = runSteps(w.blocks);
  const last = steps.at(-1);
  return steps.length > 1 && last && last.target.kind === "pace" && FINISH_ZONES.has(last.target.zone) ? last : null;
}

/**
 * Picks this week's challenge from the sessions not run yet: a fitness test, then a long run with a fast finish, then
 * intervals/threshold/tempo, then a plain long run, then (no key session) every easy run under the usual heart rate.
 * Avoids last week's template when another one fits. Heart-rate templates need the usual easy heart rate.
 */
export function pickChallenge(i: {
  workouts: readonly ChallengeWorkout[];
  lastKind: ChallengeKind | null;
  /** Whether every rep of the last done session of this type was in its zone; null when there is none. */
  lastSameTypeInZone: (type: string) => boolean | null;
  /** Garmin's (else the plan's) predicted time for a distance in km. */
  predictionS: (km: number) => number | null;
  normalHr: number | null;
}): ChallengePick | null {
  const ws = [...i.workouts].sort((a, b) => a.date.localeCompare(b.date));
  const out: ChallengePick[] = [];
  for (const w of ws.filter((x) => x.type === "test")) {
    const km = runSteps(w.blocks).reduce((s, x) => s + kmOf(x), 0);
    const targetS = km > 0 ? i.predictionS(km) : null;
    if (targetS) out.push({ kind: "test_beat", workoutId: w.id, params: { targetS: Math.round(targetS), km } });
  }
  for (const w of ws.filter((x) => x.type === "long")) {
    const f = finishStep(w);
    const z = f && paceZone(f);
    if (f && z && kmOf(f) > 0) out.push({ kind: "finish_fast", workoutId: w.id, params: { km: kmOf(f), maxSecPerKm: z.max } });
  }
  for (const w of ws.filter((x) => REP_TYPES.has(x.type))) {
    const steps = runSteps(w.blocks).filter((s) => paceZone(s));
    if (!steps.length) continue;
    const z = paceZone(steps[0]!)!;
    const zone: ChallengePick = { kind: "reps_in_zone", workoutId: w.id, params: { min: z.min, max: z.max } };
    const last: ChallengePick = { kind: "last_rep_fastest", workoutId: w.id, params: {} };
    if (steps.length < 2) out.push(zone);
    else out.push(...(i.lastSameTypeInZone(w.type) ? [last, zone] : [zone, last]));
  }
  if (i.normalHr != null) {
    for (const w of ws.filter((x) => x.type === "long" && !finishStep(x))) out.push({ kind: "long_hr", workoutId: w.id, params: { bpm: Math.round(i.normalHr + CHALLENGE.longHrPlus) } });
    if (!out.length && ws.some((x) => x.type === "easy" || x.type === "strides")) out.push({ kind: "easy_hr_week", workoutId: null, params: { bpm: Math.round(i.normalHr) } });
  }
  return out.find((c) => c.kind !== i.lastKind) ?? out[0] ?? null;
}

export interface ChallengeResult {
  result: "won" | "lost";
  /** Seconds (test), seconds per km (reps, finish) or beats per minute. */
  value: number;
}

/** Decides a single-session challenge from the synced run; null when it can't be told (no laps, no heart rate). */
export function decideChallenge(c: ChallengePick, i: { laps: readonly RunLap[]; blocks: readonly Block[]; avgHr: number | null; easyMinSecPerKm: number | null }): ChallengeResult | null {
  if (c.kind === "long_hr") return i.avgHr == null ? null : { result: i.avgHr <= c.params.bpm! ? "won" : "lost", value: Math.round(i.avgHr) };
  if (c.kind === "easy_hr_week") return null;
  const { pairs } = workLaps(i.laps, runSteps(i.blocks), i.easyMinSecPerKm);
  if (!pairs.length) return null;
  const paces = pairs.map((p) => judgedPace(p.lap));
  if (c.kind === "test_beat") {
    const t = Math.round(pairs.reduce((s, p) => s + p.lap.movingS, 0));
    return { result: t < c.params.targetS! ? "won" : "lost", value: t };
  }
  if (c.kind === "finish_fast") {
    const p = paces.at(-1)!;
    return { result: p <= c.params.maxSecPerKm! ? "won" : "lost", value: Math.round(p) };
  }
  if (c.kind === "last_rep_fastest") {
    const last = paces.at(-1)!;
    const before = paces.slice(0, -1);
    return { result: before.length && last <= Math.min(...before) + CHALLENGE.sameRepS ? "won" : "lost", value: Math.round(last) };
  }
  // reps_in_zone: the rep furthest outside the zone, or the mean when all are in.
  const { min, max } = c.params as { min: number; max: number };
  const worst = paces.reduce((w, p) => (Math.max(min - p, p - max) > Math.max(min - w, w - max) ? p : w), paces[0]!);
  const inZone = paces.every((p) => p >= min && p <= max);
  return { result: inZone ? "won" : "lost", value: Math.round(inZone ? paces.reduce((s, p) => s + p, 0) / paces.length : worst) };
}

/** Every easy run under the limit: lost at the first one over it, won once the week is over. */
export function decideEasyWeek(bpm: number, easyHrs: readonly number[], weekOver: boolean): ChallengeResult | null {
  const over = easyHrs.find((h) => h > bpm);
  if (over != null) return { result: "lost", value: Math.round(over) };
  if (weekOver && easyHrs.length) return { result: "won", value: Math.round(Math.max(...easyHrs)) };
  return null;
}
