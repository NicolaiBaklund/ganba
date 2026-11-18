import type { ISODate } from "../dates";
import type { Block } from "../training/types";
import { covers, easyPart, judgedPace, lapPace, lapsAverage, paceZone, runSteps, workLaps, type RunLap } from "./laps";

/** Thresholds for the verdict (spec 2026-11-18 §5): seconds per km and beats per minute. */
export const VERDICT = { bitS: 5, unevenS: 8, hrHighBpm: 5, fasterEachMin: 3, halfMinDeltaS: 5 } as const;
/** Session types judged rep by rep. */
export const REP_TYPES: ReadonlySet<string> = new Set(["intervals", "threshold", "tempo"]);

export type VerdictWord = "too_fast" | "too_slow" | "uneven" | "bit_fast" | "bit_slow" | "faster_each" | "on_target" | "too_fast_easy" | "hr_high" | "nice_easy";
export type Tone = "good" | "warn" | "bad" | "plain";

export const WORD_TONE: Record<VerdictWord, Tone> = {
  too_fast: "bad",
  too_slow: "bad",
  uneven: "warn",
  bit_fast: "warn",
  bit_slow: "warn",
  faster_each: "good",
  on_target: "good",
  too_fast_easy: "warn",
  hr_high: "warn",
  nice_easy: "good",
};

export interface Verdict {
  activityId: string;
  date: ISODate;
  /** The plan session's type; null for a run without one. */
  type: string | null;
  title: string | null;
  word: VerdictWord | null;
  tone: Tone;
  reps: { secPerKm: number; hr: number | null }[] | null;
  zone: { min: number; max: number } | null;
  repsDone: number | null;
  repsPlanned: number | null;
  easy: { secPerKm: number; hr: number | null; hrVsNormal: number | null } | null;
  /** A long run's fast finish (marathon or race pace), judged apart from the easy part. */
  finish: { km: number; secPerKm: number; zone: { min: number; max: number } | null } | null;
  /** Second half minus first half of a long run in ~1 km laps, s/km; null under 5 s or without such laps. */
  secondHalfDeltaS: number | null;
  test: { km: number; timeS: number; beat: boolean | null; proposal: boolean } | null;
  race: { km: number; timeS: number; deltaS: number | null } | null;
}

export interface VerdictInput {
  /** `elapsedS`: clock time with pauses, for race times. */
  run: { id: string; date: ISODate; distanceM: number; movingS: number; elapsedS?: number; avgHr: number | null; indoor: boolean; easy: boolean };
  laps: readonly RunLap[];
  workout: { type: string; title: string; blocks: readonly Block[] } | null;
  /** Easy zone from the plan's VDOT (min = fastest easy pace). */
  easyZone: { min: number; max: number } | null;
  /** Median heart rate of the easy runs of the last 42 days; null with fewer than 5. */
  normalHr: number | null;
  /** Garmin's prediction for the test's distance on its day. */
  testPredictionS?: number | null;
  proposal?: boolean;
  /** The race clock the day before the race. */
  raceClockS?: number | null;
}

const r = Math.round;

function repWord(devs: { fast: number; slow: number }[], paces: number[]): VerdictWord {
  if (devs.some((d) => d.fast > VERDICT.bitS)) return "too_fast";
  if (devs.some((d) => d.slow > VERDICT.bitS)) return "too_slow";
  if (paces.length > 1 && Math.max(...paces) - Math.min(...paces) > VERDICT.unevenS) return "uneven";
  if (devs.some((d) => d.fast > 0)) return "bit_fast";
  if (devs.some((d) => d.slow > 0)) return "bit_slow";
  if (paces.length >= VERDICT.fasterEachMin && paces.every((p, i) => i === 0 || p < paces[i - 1]!)) return "faster_each";
  return "on_target";
}

/** Second half minus first half over ~1 km laps (at least 4), or null. */
function secondHalf(laps: readonly RunLap[]): number | null {
  const km = laps.filter((l) => l.distanceM >= 900 && l.distanceM <= 1100);
  if (km.length < 4) return null;
  const mid = Math.floor(km.length / 2);
  const a = lapsAverage(km.slice(0, mid)), b = lapsAverage(km.slice(km.length - mid));
  if (!a || !b) return null;
  const d = r(b.secPerKm - a.secPerKm);
  return Math.abs(d) >= VERDICT.halfMinDeltaS ? d : null;
}

/** How the last run went against what it was meant to be (spec 2026-11-18 §5). */
export function verdictFor(i: VerdictInput): Verdict {
  const w = i.workout;
  const km = i.run.distanceM / 1000;
  const whole = { secPerKm: km > 0 ? i.run.movingS / km : 0, hr: i.run.avgHr };
  const base: Verdict = {
    activityId: i.run.id,
    date: i.run.date,
    type: w?.type ?? null,
    title: w?.title ?? null,
    word: null,
    tone: "plain",
    reps: null,
    zone: null,
    repsDone: null,
    repsPlanned: null,
    easy: null,
    finish: null,
    secondHalfDeltaS: null,
    test: null,
    race: null,
  };

  if (w?.type === "race") {
    const timeS = r(i.run.elapsedS || i.run.movingS);
    return { ...base, race: { km: Math.round(km * 10) / 10, timeS, deltaS: i.raceClockS ? timeS - i.raceClockS : null }, tone: i.raceClockS && timeS < i.raceClockS ? "good" : "plain" };
  }

  if (w?.type === "test") {
    const { pairs } = workLaps(i.laps, runSteps(w.blocks), i.easyZone?.min ?? null);
    if (!pairs.length) return { ...base, easy: { ...whole, hrVsNormal: null } };
    // Clock time, like a race; a test stopped short of its distance doesn't beat anything.
    const timeS = r(pairs.reduce((s, p) => s + p.lap.elapsedS, 0));
    const testKm = Math.round(pairs.reduce((s, p) => s + p.lap.distanceM, 0) / 100) / 10;
    const beat = i.testPredictionS && covers(pairs) ? timeS < i.testPredictionS : null;
    return { ...base, test: { km: testKm, timeS, beat, proposal: !!i.proposal }, tone: beat ? "good" : "plain" };
  }

  if (w && REP_TYPES.has(w.type)) {
    const { pairs, planned } = workLaps(i.laps, runSteps(w.blocks), i.easyZone?.min ?? null);
    if (!pairs.length) return { ...base, easy: { ...whole, hrVsNormal: null } };
    // Shown cut down to the second like Garmin does: 4:28.6 is 4:28, never "4:29" next to a zone starting 4:29.
    const reps = pairs.map((p) => ({ secPerKm: Math.floor(lapPace(p.lap)), hr: p.lap.avgHr == null ? null : r(p.lap.avgHr) }));
    const zoned = pairs.filter((p) => paceZone(p.step));
    const out = { ...base, reps, zone: zoned.length ? paceZone(zoned[0]!.step) : null, repsDone: pairs.length, repsPlanned: planned };
    if (i.run.indoor || !zoned.length) return out;
    const paces = zoned.map((p) => judgedPace(p.lap));
    const devs = zoned.map((p, k) => {
      const z = paceZone(p.step)!;
      return { fast: Math.max(0, z.min - paces[k]!), slow: Math.max(0, paces[k]! - z.max) };
    });
    const word = repWord(devs, paces);
    return { ...out, word, tone: WORD_TONE[word] };
  }

  // Easy, recovery, long and strides sessions, or a run without a plan session. A long run's fast finish is its own
  // line: its laps stay out of the easy pace and heart rate.
  const fin = w && w.type !== "strides" ? workLaps(i.laps, runSteps(w.blocks), i.easyZone?.min ?? null).pairs.filter((p) => paceZone(p.step)) : [];
  const finLaps = new Set(fin.map((p) => p.lap));
  const finAvg = fin.length ? lapsAverage(fin.map((p) => p.lap)) : null;
  const finish = finAvg ? { km: Math.round(fin.reduce((s, p) => s + p.lap.distanceM, 0) / 100) / 10, secPerKm: Math.floor(finAvg.secPerKm), zone: paceZone(fin[0]!.step) } : null;
  const easyLaps = easyPart(i.laps.filter((l) => !finLaps.has(l)));
  const avg = lapsAverage(easyLaps) ?? whole;
  const hrVsNormal = avg.hr != null && i.normalHr != null ? r(avg.hr - i.normalHr) : null;
  const easy = { secPerKm: Math.floor(avg.secPerKm), hr: avg.hr == null ? null : r(avg.hr), hrVsNormal };
  const out = { ...base, easy, finish, secondHalfDeltaS: secondHalf(easyLaps) };
  if (i.run.indoor || !i.easyZone || (!w && !i.run.easy)) return out;
  const word: VerdictWord = avg.secPerKm < i.easyZone.min ? "too_fast_easy" : hrVsNormal != null && hrVsNormal > VERDICT.hrHighBpm ? "hr_high" : "nice_easy";
  return { ...out, word, tone: WORD_TONE[word] };
}
