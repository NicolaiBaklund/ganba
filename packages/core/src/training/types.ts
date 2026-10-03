import type { ISODate } from "../dates";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";
export const RACE_KM: Record<RaceDistance, number> = { "5k": 5, "10k": 10, half: 21.0975, marathon: 42.195 };

export type WorkoutType = "easy" | "long" | "intervals" | "threshold" | "tempo" | "strides" | "race";
export const HARD_TYPES: ReadonlySet<WorkoutType> = new Set(["long", "intervals", "threshold", "tempo", "race"]);
export const KEY_TYPES: ReadonlySet<WorkoutType> = new Set(["long", "intervals", "threshold", "tempo"]);

export type Phase = "base" | "build" | "peak" | "taper" | "recovery";

export type PaceZone = "easy" | "marathon" | "threshold" | "interval" | "rep" | "race";

export type Target = { kind: "pace"; zone: PaceZone; minSecPerKm: number; maxSecPerKm: number } | { kind: "none" };

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
  | { kind: "build" };

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
  | { op: "repace"; vdot: number };
