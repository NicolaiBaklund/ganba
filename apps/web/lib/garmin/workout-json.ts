import "server-only";
import type { Block, Step, WorkoutSpec } from "@loop/core";

/**
 * Plan workout → Garmin Connect workout JSON (running).
 * IDs follow Garmin Connect's own workout export: end condition lap.button 1, time 2, distance 3,
 * iterations 7; target no.target 1, pace.zone 6 (values in m/s, slower first).
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
const RUNNING = { sportTypeId: 1, sportTypeKey: "running", displayOrder: 1 };

const mps = (secPerKm: number) => Math.round((1000 / secPerKm) * 1000) / 1000;

function stepJson(s: Step, order: { n: number }) {
  const cond = COND[s.duration.kind];
  return {
    type: "ExecutableStepDTO",
    stepOrder: order.n++,
    stepType: STEP_TYPE[s.kind],
    endCondition: cond,
    endConditionValue: s.duration.kind === "distance" ? s.duration.m : s.duration.kind === "time" ? s.duration.s : null,
    ...(s.target.kind === "pace"
      ? { targetType: PACE_TARGET, targetValueOne: mps(s.target.maxSecPerKm), targetValueTwo: mps(s.target.minSecPerKm) }
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

export function toGarminWorkout(w: Pick<WorkoutSpec, "title" | "blocks" | "plannedDurationS">) {
  const order = { n: 1 };
  return {
    workoutName: `Loop: ${w.title}`.slice(0, 80),
    description: "Planned by Loop",
    sportType: RUNNING,
    estimatedDurationInSecs: w.plannedDurationS,
    workoutSegments: [{ segmentOrder: 1, sportType: RUNNING, workoutSteps: w.blocks.map((b) => blockJson(b, order)) }],
  };
}
