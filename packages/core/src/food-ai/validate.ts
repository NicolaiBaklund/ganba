import type { Macros } from "../energy/types";
import type { FoodEstimate, FoodEstimateItem } from "./schema";

export function validateEstimate(e: FoodEstimate): { ok: true } | { ok: false; reason: string } {
  for (const it of e.items) {
    if ([it.grams, it.kcal, it.protein_g, it.carbs_g, it.fat_g, it.alcohol_g].some((n) => !Number.isFinite(n) || n < 0))
      return { ok: false, reason: `negative_or_nan:${it.name}` };
    const fromMacros = it.protein_g * 4 + it.carbs_g * 4 + it.fat_g * 9 + it.alcohol_g * 7;
    const diff = Math.abs(fromMacros - it.kcal);
    if (diff > 20 && diff > it.kcal * 0.15) return { ok: false, reason: `macro_mismatch:${it.name}` };
  }
  return { ok: true };
}

export const estimateTotals = (
  items: Pick<FoodEstimateItem, "kcal" | "protein_g" | "carbs_g" | "fat_g">[],
): Macros =>
  items.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      proteinG: t.proteinG + i.protein_g,
      carbsG: t.carbsG + i.carbs_g,
      fatG: t.fatG + i.fat_g,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
