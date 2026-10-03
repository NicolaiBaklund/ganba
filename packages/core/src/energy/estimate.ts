import * as C from "./constants";
import { walkingAddonKcal } from "./activity";
import type { ActivityBaseline, BodyStats, StartEstimate } from "./types";

/** Mifflin-St Jeor. */
export const bmr = ({ sex, ageYears, heightCm, weightKg }: BodyStats): number =>
  10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161);

export const trainingKcalPerDay = (a: ActivityBaseline, kg: number): number =>
  (a.runKmPerWeek * kg * C.RUN_NET_KCAL_PER_KG_KM +
    a.otherTrainingHoursPerWeek * (C.OTHER_TRAINING_MET - 1) * kg) / 7;

export function startEstimate(s: BodyStats, a: ActivityBaseline): StartEstimate {
  const b = bmr(s);
  const walking = walkingAddonKcal(a, s.weightKg);
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
