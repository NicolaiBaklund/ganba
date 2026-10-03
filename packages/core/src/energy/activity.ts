import * as C from "./constants";
import type { ActivityBaseline } from "./types";

/** One synced activity, reduced to what the energy model needs. */
export interface ActivityLike {
  typeKey: string;
  distanceM: number | null;
  durationS: number | null;
  steps: number | null;
}

export interface DayActivity {
  /** Total steps for the day, null when the watch recorded nothing. */
  steps: number | null;
  activities: ActivityLike[];
}

export interface ActivityKcal {
  walkingKcal: number;
  runKcal: number;
  otherKcal: number;
  total: number;
}

const RUN_TYPES = new Set(["running", "trail_running", "treadmill_running", "track_running", "street_running", "virtual_run", "indoor_running"]);
/** Counted through the day's steps, so not again as a workout. */
const STEP_TYPES = new Set(["walking", "hiking", "casual_walking", "speed_walking"]);

/** Net MET (minus resting) is applied, since BMR · 1.2 already counts resting burn. */
const MET: Record<string, number> = {
  cycling: 7,
  road_biking: 7,
  mountain_biking: 8,
  indoor_cycling: 7,
  virtual_ride: 7,
  lap_swimming: 7,
  open_water_swimming: 7,
  strength_training: 4,
  cross_country_skiing_ws: 8,
  skate_skiing_ws: 8,
  backcountry_skiing: 8,
  indoor_rowing: 6,
  rowing: 6,
};

export const isRun = (typeKey: string): boolean => RUN_TYPES.has(typeKey);
export const isStepActivity = (typeKey: string): boolean => STEP_TYPES.has(typeKey);
export const metFor = (typeKey: string): number => MET[typeKey] ?? C.OTHER_TRAINING_MET;

export const runKcal = (km: number, kg: number): number => km * kg * C.RUN_NET_KCAL_PER_KG_KM;

const runSteps = (a: ActivityLike): number =>
  a.steps != null && a.steps > 0 ? a.steps : ((a.distanceM ?? 0) / 1000) * C.RUN_STEPS_PER_KM;

export const walkingKcalForSteps = (steps: number, kg: number): number =>
  (Math.max(0, steps - C.BASELINE_STEPS) / 1000) * C.WALK_KCAL_PER_KG_PER_1000_STEPS * kg;

/**
 * Activity energy for one day from raw Garmin data (own formulas, not Garmin's calories).
 * Running steps are taken out of the step count so a run is not counted twice.
 */
export function activityKcal(day: DayActivity, kg: number): ActivityKcal {
  const runs = day.activities.filter((a) => isRun(a.typeKey));
  const others = day.activities.filter((a) => !isRun(a.typeKey) && !isStepActivity(a.typeKey));
  const walkSteps = Math.max(0, (day.steps ?? 0) - runs.reduce((s, a) => s + runSteps(a), 0));
  const walkingKcal = walkingKcalForSteps(walkSteps, kg);
  const run = runs.reduce((s, a) => s + runKcal((a.distanceM ?? 0) / 1000, kg), 0);
  const other = others.reduce((s, a) => s + ((a.durationS ?? 0) / 3600) * (metFor(a.typeKey) - 1) * kg, 0);
  const r = Math.round;
  return { walkingKcal: r(walkingKcal), runKcal: r(run), otherKcal: r(other), total: r(walkingKcal + run + other) };
}

/** The walking part of a phase-1 onboarding estimate (removed from the base when Garmin takes over). */
export function walkingAddonKcal(a: ActivityBaseline, kg: number): number {
  const runStepsPerDay = (a.runKmPerWeek / 7) * C.RUN_STEPS_PER_KM;
  return Math.round(walkingKcalForSteps(Math.max(0, a.stepsPerDay - runStepsPerDay), kg));
}
