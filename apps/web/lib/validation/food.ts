import { z } from "zod";

export const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "evening", "snack"]);

export const Item = z.object({
  name: z.string().trim().min(1).max(120),
  grams: z.number().min(0).max(5000).nullish(),
  kcal: z.number().min(0).max(10000),
  protein_g: z.number().min(0).max(1000).default(0),
  carbs_g: z.number().min(0).max(2000).default(0),
  fat_g: z.number().min(0).max(1000).default(0),
  alcohol_g: z.number().min(0).max(500).optional(),
  confidence: z.enum(["low", "medium", "high"]).nullish(),
});
export type ItemInput = z.input<typeof Item>;

export const CreateEntry = z.object({
  source: z.enum(["ai", "quick"]),
  mealType: MealTypeSchema,
  loggedAt: z.string().datetime({ offset: true }).optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(Item).min(1).max(40),
  estimateId: z.string().uuid().optional(),
  photoPaths: z.array(z.string()).max(4).default([]),
});
export type CreateEntryInput = z.input<typeof CreateEntry>;

export const UpdateEntry = z.object({
  mealType: MealTypeSchema.optional(),
  items: z.array(Item).min(1).max(40).optional(),
  /** Local wall-clock time on the entry's own date, e.g. "19:30". */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});
