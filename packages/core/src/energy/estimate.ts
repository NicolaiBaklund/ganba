import * as C from "./constants";
import type { ActivityBaseline, BodyStats, StartEstimate } from "./types";

/** Mifflin-St Jeor. */
export const bmr = ({ sex, ageYears, heightCm, weightKg }: BodyStats): number =>
  10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161);

const walkingKcal = (a: ActivityBaseline, kg: number): number => {
  const runSteps = (a.runKmPerWeek / 7) * C.RUN_STEPS_PER_KM;
  const walkSteps = Math.max(0, a.stepsPerDay - runSteps);
  const extra = Math.max(0, walkSteps - C.BASELINE_STEPS);
  return (extra / 1000) * C.WALK_KCAL_PER_KG_PER_1000_STEPS * kg;
};

export const trainingKcalPerDay = (a: ActivityBaseline, kg: number): number =>
  (a.runKmPerWeek * kg * C.RUN_NET_KCAL_PER_KG_KM +
    a.otherTrainingHoursPerWeek * (C.OTHER_TRAINING_MET - 1) * kg) / 7;

export function startEstimate(s: BodyStats, a: ActivityBaseline): StartEstimate {
  const b = bmr(s);
  const walking = walkingKcal(a, s.weightKg);
  const baseKcal = b * C.SEDENTARY_FACTOR + walking;
  const trainingKcal = trainingKcalPerDay(a, s.weightKg);
  const maintenanceKcal = baseKcal + trainingKcal;
  const r = Math.round;
  return {
    bmr: r(b),
    baseKcal: r(baseKcal),
    walkingKcal: r(walking),
    trainingKcal: r(trainingKcal),
    maintenanceKcal: r(maintenanceKcal),
    low: r(maintenanceKcal * (1 - C.ESTIMATE_SPREAD)),
    high: r(maintenanceKcal * (1 + C.ESTIMATE_SPREAD)),
  };
}
