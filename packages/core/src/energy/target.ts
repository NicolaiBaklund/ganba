import * as C from "./constants";
import type { EnergyPlan, Sex } from "./types";

export const rateLimits = (weightKg: number) => ({
  maxLossPerWeek: -Math.round(weightKg * C.MAX_LOSS_PCT_PER_WEEK * 100) / 100,
  maxGainPerWeek: C.MAX_GAIN_KG_PER_WEEK,
});

export const clampRate = (rate: number, weightKg: number): number => {
  const { maxLossPerWeek, maxGainPerWeek } = rateLimits(weightKg);
  return Math.min(maxGainPerWeek, Math.max(maxLossPerWeek, rate));
};

export function dailyTarget(args: {
  plan: EnergyPlan;
  trainingKcal: number;
  rateKgPerWeek: number;
  sex: Sex;
}): { kcal: number; floored: boolean } {
  const { plan, trainingKcal, rateKgPerWeek, sex } = args;
  // The user's base target: what they eat on a rest day, goal included; the day's activity comes on top.
  if (plan.manualKcalOverride != null) return { kcal: Math.round(plan.manualKcalOverride + trainingKcal), floored: false };
  const raw = plan.baseExpenditureKcal + trainingKcal + (rateKgPerWeek * C.KCAL_PER_KG) / 7;
  const floor = C.KCAL_FLOOR[sex];
  return raw < floor ? { kcal: floor, floored: true } : { kcal: Math.round(raw), floored: false };
}
