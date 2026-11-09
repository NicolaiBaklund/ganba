import type { ISODate } from "../dates";
import type { Exercise, Measure } from "./catalog";

export interface SetRow {
  setNo: number;
  reps: number | null;
  /** Null: bodyweight, or not filled in yet. */
  kg: number | null;
  seconds: number | null;
}

/** One logged session of one exercise. */
export interface ExerciseLog {
  date: ISODate;
  sets: SetRow[];
}

/** Sets to start from: a copy of last time, else 3 × 10 (timed: 3 × 30 s) with no load. */
export function prefillSets(last: readonly SetRow[] | null, measure: Measure): SetRow[] {
  if (last?.length) return last.map((s, i) => ({ ...s, setNo: i + 1 }));
  return [1, 2, 3].map((setNo) => (measure === "time" ? { setNo, reps: null, kg: null, seconds: 30 } : { setNo, reps: 10, kg: null, seconds: null }));
}

/** The heaviest kg (kg), most reps (bw) or longest hold (time) in a session; null when nothing is filled in. */
export function topSet(sets: readonly SetRow[], measure: Measure): number | null {
  const vals = sets.map((s) => (measure === "kg" ? s.kg : measure === "bw" ? s.reps : s.seconds)).filter((v): v is number => v != null && v > 0);
  return vals.length ? Math.max(...vals) : null;
}

const DEFAULT_STEP = { barbell: 2.5, machine: 2.5, dumbbell: 2, cable: 2, bodyweight: 2.5 } as const;

/**
 * Suggested increase when every set last time reached the first set's reps (spec §6.2): the runner's own last
 * increase of the top set for this exercise, else a step by equipment. Bodyweight: one more rep. History is
 * oldest first. Null when there is nothing to suggest.
 */
export function increaseHint(history: readonly ExerciseLog[], ex: Exercise): { kg?: number; reps?: number } | null {
  const last = history.at(-1);
  if (!last?.sets.length || ex.measure === "time") return null;
  const first = last.sets[0]!.reps;
  if (first == null || last.sets.some((s) => s.reps == null || s.reps < first)) return null;
  if (ex.measure === "bw") return { reps: 1 };
  if (topSet(last.sets, "kg") == null) return null;
  for (let i = history.length - 1; i > 0; i--) {
    const now = topSet(history[i]!.sets, "kg"), before = topSet(history[i - 1]!.sets, "kg");
    if (now != null && before != null && now > before) return { kg: Math.round((now - before) * 100) / 100 };
  }
  return { kg: ex.equipment ? DEFAULT_STEP[ex.equipment] : 2.5 };
}

/** Minimum and per-set time for a session without a watch (rest included). */
export const STRENGTH_MIN_S = 20 * 60;
export const STRENGTH_SET_S = 150;

/**
 * Length of a session without a linked Garmin activity: the time between the first and last saved exercise, or
 * 2.5 min per set when that is longer (everything logged afterwards in one go), at least 20 min.
 */
export function sessionDurationS(savedAt: readonly string[], setCount: number): number {
  const ts = savedAt.map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n));
  const span = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 1000 : 0;
  return Math.round(Math.max(span, setCount * STRENGTH_SET_S, STRENGTH_MIN_S));
}

export const STRENGTH_COUNTS = [1, 10, 25, 50, 100] as const;

export interface StrengthStamp {
  kind: "strength_count" | "strength_pr";
  key: string;
  earnedOn: ISODate;
  value?: Record<string, number | string>;
}

/**
 * Session counts (1, 10, 25, 50, 100) and, for favourite kg exercises, the first time the top set passes a new
 * multiple of 10 kg after the first session ("Bench 70 kg"). `tops` holds kg exercises only.
 */
export function strengthStamps(
  sessions: readonly { date: ISODate; tops: readonly { key: string; kg: number | null }[] }[],
  favourites: ReadonlySet<string>,
): StrengthStamp[] {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: StrengthStamp[] = [];
  for (const n of STRENGTH_COUNTS) if (sorted.length >= n) out.push({ kind: "strength_count", key: String(n), earnedOn: sorted[n - 1]!.date });
  const best = new Map<string, number>();
  for (const s of sorted) {
    for (const t of s.tops) {
      if (t.kg == null || !favourites.has(t.key)) continue;
      const was = best.get(t.key);
      if (was != null && Math.floor(t.kg / 10) > Math.floor(was / 10)) {
        const tens = Math.floor(t.kg / 10) * 10;
        out.push({ kind: "strength_pr", key: `${t.key}-${tens}`, earnedOn: s.date, value: { exercise: t.key, kg: tens } });
      }
      best.set(t.key, Math.max(was ?? 0, t.kg));
    }
  }
  return out;
}
