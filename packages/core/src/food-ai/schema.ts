import { z } from "zod";

export const FoodEstimateItemSchema = z.object({
  name: z.string(),
  grams: z.number(),
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  /** Alcohol carries ~7 kcal/g and is not a macro; needed to validate kcal for drinks. */
  alcohol_g: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.string(),
});

export const FoodEstimateSchema = z.object({
  items: z.array(FoodEstimateItemSchema),
  notes: z.string(),
});

export type FoodEstimate = z.infer<typeof FoodEstimateSchema>;
export type FoodEstimateItem = z.infer<typeof FoodEstimateItemSchema>;
