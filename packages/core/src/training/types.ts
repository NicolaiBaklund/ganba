import type { ISODate } from "../dates";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";
export const RACE_KM: Record<RaceDistance, number> = { "5k": 5, "10k": 10, half: 21.0975, marathon: 42.195 };

export type WorkoutType = "easy" | "long" | "intervals" | "threshold" | "tempo" | "strides" | "race" | "test";
export const HARD_TYPES: ReadonlySet<WorkoutType> = new Set(["long", "intervals", "threshold", "tempo", "race", "test"]);
export const KEY_TYPES: ReadonlySet<WorkoutType> = new Set(["long", "intervals", "threshold", "tempo", "test"]);

export type Phase = "base" | "build" | "peak" | "taper" | "recovery";

export type PaceZone = "easy" | "marathon" | "threshold" | "interval" | "rep" | "race";

/** Cycling heart-rate zones (Friel, % of LTHR); "ss" = sweet spot. */
export type HrZone = "z1" | "z2" | "z3" | "ss" | "z4" | "z5";
export const HR_ZONES: readonly HrZone[] = ["z1", "z2", "z3", "ss", "z4", "z5"];

export type Target =
  | { kind: "pace"; zone: PaceZone; minSecPerKm: number; maxSecPerKm: number }
  | { kind: "hr"; zone: HrZone; minBpm: number; maxBpm: number }
  | { kind: "none" };

export type Sport = "run" | "ride";

export type Duration = { kind: "distance"; m: number } | { kind: "time"; s: number } | { kind: "open" };

export interface Step {
  kind: "warmup" | "run" | "recover" | "cooldown";
  duration: Duration;
  target: Target;
}

export interface Repeat {
  kind: "repeat";
  times: number;
  steps: Step[];
}

export type Block = Step | Repeat;

/** Compact step the coach writes; the engine turns it into a Step with paces from the runner's VDOT. */
export interface CoachStep {
  kind: "warmup" | "run" | "recover" | "cooldown";
  km?: number | null;
  minutes?: number | null;
  /** Pace zones for running plans, heart-rate zones for cycling plans. */
  zone?: PaceZone | HrZone | "none" | null;
}
export type CoachBlock = CoachStep | { repeat: number; steps: CoachStep[] };

export interface WorkoutSpec {
  date: ISODate;
  type: WorkoutType;
  title: string;
  blocks: Block[];
  plannedKm: number;
  plannedDurationS: number;
  week: number;
  phase: Phase;
}

/** A stored workout: spec plus identity and status. */
export interface PlanWorkout extends WorkoutSpec {
  id: string;
  status: "planned" | "done" | "missed" | "removed";
  activityKm?: number | null;
}

export type Goal =
  | { kind: "race"; distance: RaceDistance; raceDate: ISODate; targetTimeS?: number | null }
  /** Build plans: optional focus distance (no race day), null = General. */
  | { kind: "build"; focus?: RaceDistance | null };

export interface PlanInput {
  goal: Goal;
  startDate: ISODate;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  longRunWeekday: number;
  runsPerWeek: number;
  vdot: number;
  startKmPerWeek: number;
  /** Planned daily calorie deficit; large deficits slow volume growth. */
  deficitKcal: number;
  /** Build plans only: generate through this date. */
  untilDate?: ISODate;
  /** Consistent recent training: skip the base phase. */
  experienced?: boolean;
  /** Recent interval/threshold work: quality sessions start a level up. */
  didQuality?: boolean;
  /** Longest run in the last 4 weeks: the long run starts there, not below. */
  recentLongestKm?: number;
  /** Hills nearby: hill repeats take the place of fartlek. */
  hills?: boolean;
  /** Plans made before 2026-10-23 grew already in week 1; their extensions must keep doing so. */
  week1Grows?: boolean;
}

export interface Paces {
  easy: { min: number; max: number };
  marathon: number;
  threshold: number;
  interval: number;
  rep: number;
}

export type ProposalChange =
  | { op: "move"; workoutId: string; toDate: ISODate }
  | { op: "drop"; workoutId: string }
  | { op: "replace"; workoutId: string; type: WorkoutType; km: number }
  | { op: "rescale"; fromDate: ISODate; factor: number }
  | { op: "repace"; vdot: number }
  | { op: "rezone"; lthr: number }
  | { op: "edit"; workoutId: string; type?: WorkoutType; title?: string; steps: CoachBlock[] }
  | { op: "add"; date: ISODate; type: WorkoutType; title?: string; steps: CoachBlock[] };
