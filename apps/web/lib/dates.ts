import type { MealType } from "@/lib/db/today";

/** Browser-local calendar date (YYYY-MM-DD). */
export const localDateNow = (): string => new Intl.DateTimeFormat("en-CA").format(new Date());

export const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "evening", "snack"];

export function mealTypeForHour(h: number): MealType {
  if (h >= 5 && h < 10) return "breakfast";
  if (h >= 10 && h < 15) return "lunch";
  if (h >= 15 && h < 20) return "dinner";
  if (h >= 20 && h < 23) return "evening";
  return "snack";
}
