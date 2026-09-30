import type { EnergyPlan, Macros } from "./types";

export const defaultProteinGPerKg = (rate: number): number => (rate < 0 ? 2.0 : 1.8);

export function macrosFor(
  kcal: number,
  weightKg: number,
  plan: Pick<EnergyPlan, "proteinGPerKg" | "fatPct">,
): Macros {
  const proteinG = Math.round(plan.proteinGPerKg * weightKg);
  const fatG = Math.round((kcal * plan.fatPct) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}
