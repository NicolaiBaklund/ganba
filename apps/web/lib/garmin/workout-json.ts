import "server-only";
import type { Block, Step, WorkoutSpec } from "@loop/core";

/**
 * Plan workout → Garmin Connect workout JSON (running or cycling).
 * IDs follow Garmin Connect's own workout export: end condition lap.button 1, time 2, distance 3,
 * iterations 7; target no.target 1, power.zone 2 (W), heart.rate.zone 4 (bpm), pace.zone 6 (values in m/s, slower first).
 * Easy-zone steps (easy and long runs, warm-ups, cool-downs) go without a pace target: run them by feel, no alerts.
 * The app still shows the easy pace as guidance.
 */
const STEP_TYPE = {
  warmup: { stepTypeId: 1, stepTypeKey: "warmup", displayOrder: 1 },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown", displayOrder: 2 },
  run: { stepTypeId: 3, stepTypeKey: "interval", displayOrder: 3 },
  recover: { stepTypeId: 4, stepTypeKey: "recovery", displayOrder: 4 },
  repeat: { stepTypeId: 6, stepTypeKey: "repeat", displayOrder: 6 },
} as const;

const COND = {
  open: { conditionTypeId: 1, conditionTypeKey: "lap.button", displayOrder: 1, displayable: true },
  time: { conditionTypeId: 2, conditionTypeKey: "time", displayOrder: 2, displayable: true },
  distance: { conditionTypeId: 3, conditionTypeKey: "distance", displayOrder: 3, displayable: true },
  iterations: { conditionTypeId: 7, conditionTypeKey: "iterations", displayOrder: 7, displayable: false },
} as const;

const NO_TARGET = { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target", displayOrder: 1 };
const PACE_TARGET = { workoutTargetTypeId: 6, workoutTargetTypeKey: "pace.zone", displayOrder: 6 };
/** Custom heart-rate range in bpm (targetValueOne = low, targetValueTwo = high). */
const HR_TARGET = { workoutTargetTypeId: 4, workoutTargetTypeKey: "heart.rate.zone", displayOrder: 4 };
/** Custom power range in watts: watch and Edge show it, and drive a smart trainer in ERG mode. */
const POWER_TARGET = { workoutTargetTypeId: 2, workoutTargetTypeKey: "power.zone", displayOrder: 2 };
const RUNNING = { sportTypeId: 1, sportTypeKey: "running", displayOrder: 1 };
const CYCLING = { sportTypeId: 2, sportTypeKey: "cycling", displayOrder: 2 };

const mps = (secPerKm: number) => Math.round((1000 / secPerKm) * 1000) / 1000;

function stepJson(s: Step, order: { n: number }) {
  const cond = COND[s.duration.kind];
  return {
    type: "ExecutableStepDTO",
    stepOrder: order.n++,
    stepType: STEP_TYPE[s.kind],
    endCondition: cond,
    endConditionValue: s.duration.kind === "distance" ? s.duration.m : s.duration.kind === "time" ? s.duration.s : null,
    ...(s.target.kind === "pace" && s.target.zone !== "easy"
      ? { targetType: PACE_TARGET, targetValueOne: mps(s.target.maxSecPerKm), targetValueTwo: mps(s.target.minSecPerKm) }
      : s.target.kind === "hr"
        ? { targetType: HR_TARGET, targetValueOne: s.target.minBpm, targetValueTwo: s.target.maxBpm }
        : s.target.kind === "power"
          ? { targetType: POWER_TARGET, targetValueOne: s.target.minW, targetValueTwo: s.target.maxW }
          : { targetType: NO_TARGET }),
  };
}

function blockJson(b: Block, order: { n: number }): Record<string, unknown> {
  if (b.kind !== "repeat") return stepJson(b, order);
  const own = order.n++;
  return {
    type: "RepeatGroupDTO",
    stepOrder: own,
    stepType: STEP_TYPE.repeat,
    numberOfIterations: b.times,
    smartRepeat: false,
    endCondition: COND.iterations,
    endConditionValue: b.times,
    workoutSteps: b.steps.map((s) => stepJson(s, order)),
  };
}

/** Cycling sessions go to Garmin as cycling workouts, so they sync to Edge bike computers as well as watches. */
export function toGarminWorkout(w: Pick<WorkoutSpec, "title" | "blocks" | "plannedDurationS" | "sport">) {
  const order = { n: 1 };
  const sportType = w.sport === "ride" ? CYCLING : RUNNING;
  return {
    workoutName: `Ganba: ${w.title}`.slice(0, 80),
    description: "Planned by Ganba",
    sportType,
    estimatedDurationInSecs: w.plannedDurationS,
    workoutSegments: [{ segmentOrder: 1, sportType, workoutSteps: w.blocks.map((b) => blockJson(b, order)) }],
  };
}
