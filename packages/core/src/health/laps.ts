import type { Block, Step } from "../training/types";

/** One lap from Garmin's activity details, cleaned up (spec 2026-11-18 §5.2). */
export interface RunLap {
  distanceM: number;
  movingS: number;
  /** Clock time of the lap (pauses included): what a test or race time is. */
  elapsedS: number;
  avgHr: number | null;
  /** Grade-adjusted pace when Garmin gives it, so hills are not "too slow". */
  gapSecPerKm: number | null;
  /** ACTIVE / INTERVAL for work, WARMUP, REST, RECOVERY, COOLDOWN; null without a workout. */
  intensity: string | null;
  /** The workout step the lap belongs to; null when the run was not a workout on the watch. */
  stepIndex: number | null;
}

/** Laps shorter than this (distance or time) are strides: left out of easy averages. */
export const STRIDE_LAP = { m: 200, s: 40 } as const;
/** Without step marks, a work lap is at least this long and faster than easy minus `fasterS`. */
export const WORK_LAP = { m: 400, s: 90, fasterS: 10 } as const;

type RawLap = {
  distance?: unknown;
  movingDuration?: unknown;
  duration?: unknown;
  averageHR?: unknown;
  avgGradeAdjustedSpeed?: unknown;
  intensityType?: unknown;
  wktStepIndex?: unknown;
};
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));

/**
 * Laps from `activities.splits`; laps without distance or time (pauses, manual laps at a stop) are dropped, and a
 * workout step split by a lap press (two laps in a row with the same step) is one lap again.
 */
export function lapsFrom(splits: unknown): RunLap[] {
  return mergeSplitSteps(rawLaps(splits));
}

function mergeSplitSteps(laps: RunLap[]): RunLap[] {
  const out: RunLap[] = [];
  for (const l of laps) {
    const prev = out.at(-1);
    if (prev && l.stepIndex != null && prev.stepIndex === l.stepIndex && prev.intensity === l.intensity) {
      const t = prev.movingS + l.movingS;
      const hrs = [prev, l].filter((x) => x.avgHr != null);
      const ht = hrs.reduce((s, x) => s + x.movingS, 0);
      const gaps = [prev, l].filter((x) => x.gapSecPerKm != null);
      const gm = gaps.reduce((s, x) => s + x.distanceM, 0);
      out[out.length - 1] = {
        ...prev,
        distanceM: prev.distanceM + l.distanceM,
        movingS: t,
        elapsedS: prev.elapsedS + l.elapsedS,
        avgHr: ht > 0 ? hrs.reduce((s, x) => s + x.avgHr! * x.movingS, 0) / ht : null,
        gapSecPerKm: gm > 0 ? gaps.reduce((s, x) => s + x.gapSecPerKm! * x.distanceM, 0) / gm : null,
      };
    } else out.push(l);
  }
  return out;
}

function rawLaps(splits: unknown): RunLap[] {
  const raw = (splits as { lapDTOs?: RawLap[] } | null)?.lapDTOs;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    const distanceM = n(l.distance);
    const moving = n(l.movingDuration);
    const elapsed = n(l.duration);
    const movingS = moving > 0 ? moving : elapsed;
    if (!(distanceM > 0) || !(movingS > 0)) return [];
    const gap = n(l.avgGradeAdjustedSpeed);
    const hr = n(l.averageHR);
    return [
      {
        distanceM,
        movingS,
        elapsedS: elapsed > 0 ? elapsed : movingS,
        avgHr: hr > 0 ? hr : null,
        gapSecPerKm: gap > 0 ? 1000 / gap : null,
        intensity: typeof l.intensityType === "string" ? l.intensityType : null,
        stepIndex: l.wktStepIndex == null || Number.isNaN(n(l.wktStepIndex)) ? null : n(l.wktStepIndex),
      },
    ];
  });
}

export const lapPace = (l: RunLap) => l.movingS / (l.distanceM / 1000);
/** The pace a lap is judged on: grade-adjusted when there is one. */
export const judgedPace = (l: RunLap) => l.gapSecPerKm ?? lapPace(l);
export const isWorkIntensity = (l: RunLap) => l.intensity === "ACTIVE" || l.intensity === "INTERVAL";
const isStride = (l: RunLap) => l.distanceM < STRIDE_LAP.m || l.movingS < STRIDE_LAP.s;

/** The "run" steps of a workout in order, repeats unrolled. */
export function runSteps(blocks: readonly Block[]): Step[] {
  const out: Step[] = [];
  for (const b of blocks) {
    if (b.kind === "repeat") for (let i = 0; i < b.times; i++) out.push(...b.steps.filter((s) => s.kind === "run"));
    else if (b.kind === "run") out.push(b);
  }
  return out;
}

/** A step's pace zone, or null when it has none (heart rate, power or no target). */
export function paceZone(s: Step): { min: number; max: number } | null {
  return s.target.kind === "pace" ? { min: s.target.minSecPerKm, max: s.target.maxSecPerKm } : null;
}

/** A step that is work, not easy running: a pace zone other than easy, or no target at all (a test, hills). */
export const isWorkStep = (s: Step): boolean => !(s.target.kind === "pace" && s.target.zone === "easy");

/**
 * Work laps paired with the steps they ran (spec 2026-11-18 §5.2). From the watch, one work lap per run step: lap i
 * is step i, and only the work steps are kept (a long run's easy part is not its finish). Fewer or more marked laps
 * than steps (cut short, a manual lap): the marked laps faster than easy, in order, against the work steps. Without
 * step marks: laps of at least 400 m or 90 s faster than easy minus 10 s, against the first work step.
 */
export function workLaps(laps: readonly RunLap[], steps: readonly Step[], easyMinSecPerKm: number | null): { pairs: { lap: RunLap; step: Step }[]; planned: number } {
  const workSteps = steps.filter(isWorkStep);
  const work = workSteps.length ? workSteps : [...steps];
  const marked = laps.filter((l) => isWorkIntensity(l) && l.stepIndex != null && !isStride(l));
  if (marked.length && marked.length === steps.length) {
    const pairs = marked.map((lap, i) => ({ lap, step: steps[i]! })).filter((p) => !workSteps.length || isWorkStep(p.step));
    return { pairs, planned: work.length };
  }
  if (marked.length && laps.some((l) => l.stepIndex != null)) {
    // A run with strides marks the easy part ACTIVE too: skip laps at easy pace when the work is faster.
    const fast = easyMinSecPerKm != null && workSteps.length ? marked.filter((l) => judgedPace(l) < easyMinSecPerKm) : marked;
    const used = fast.slice(0, work.length);
    return { pairs: used.map((lap, i) => ({ lap, step: work[i]! })), planned: work.length };
  }
  if (!work.length || easyMinSecPerKm == null) return { pairs: [], planned: work.length };
  const found = laps.filter((l) => (l.distanceM >= WORK_LAP.m || l.movingS >= WORK_LAP.s) && judgedPace(l) < easyMinSecPerKm - WORK_LAP.fasterS);
  return { pairs: found.map((lap) => ({ lap, step: work[0]! })), planned: work.length };
}

/** The planned km of a step, or null when it is timed or open. */
export const stepKm = (s: Step): number | null => (s.duration.kind === "distance" ? s.duration.m / 1000 : null);
/** Laps cover their steps: at least 97 % of the planned distance (a test or finish stopped short doesn't count). */
export const COVERED_SHARE = 0.97;
export function covers(pairs: readonly { lap: RunLap; step: Step }[]): boolean {
  const planned = pairs.reduce((s, p) => s + (stepKm(p.step) ?? 0), 0);
  const ran = pairs.reduce((s, p) => s + p.lap.distanceM / 1000, 0);
  return planned <= 0 || ran >= planned * COVERED_SHARE;
}

/** The laps of a run without its strides; all laps when that leaves nothing. */
export function easyPart(laps: readonly RunLap[]): RunLap[] {
  const kept = laps.filter((l) => !isStride(l));
  return kept.length ? kept : [...laps];
}

/** Moving pace and mean heart rate (weighted by time) over some laps. */
export function lapsAverage(laps: readonly RunLap[]): { secPerKm: number; hr: number | null } | null {
  const m = laps.reduce((s, l) => s + l.distanceM, 0);
  const t = laps.reduce((s, l) => s + l.movingS, 0);
  if (!(m > 0) || !(t > 0)) return null;
  const withHr = laps.filter((l) => l.avgHr != null);
  const ht = withHr.reduce((s, l) => s + l.movingS, 0);
  return { secPerKm: t / (m / 1000), hr: ht > 0 ? withHr.reduce((s, l) => s + l.avgHr! * l.movingS, 0) / ht : null };
}
