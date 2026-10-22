import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weekday = z.number().int().min(0).max(6);

export const PlanInputSchema = z
  .object({
    goal: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("race"),
        distance: z.enum(["5k", "10k", "half", "marathon"]),
        raceDate: isoDate,
        targetTimeS: z.number().int().min(600).max(86_400).nullable().optional(),
      }),
      z.object({ kind: z.literal("build"), focus: z.enum(["5k", "10k", "half", "marathon"]).nullable().optional() }),
    ]),
    weekdays: z.array(weekday).min(2).max(7),
    longRunWeekday: weekday,
    runsPerWeek: z.number().int().min(2).max(6),
    hills: z.boolean().optional(),
    sport: z.enum(["run", "ride"]).optional(),
    /** Cycling: riding on a trainer right now (the rider chooses). */
    indoor: z.boolean().optional(),
    /** Rides with power targets (only used when an FTP is known). */
    power: z.boolean().optional(),
    /** Optional days for easy sessions of the other sport. */
    crossWeekdays: z.array(weekday).max(5).optional(),
    /** Cycling plans: an event (date, km, climbing) or build fitness. `goal` is ignored then. */
    ride: z
      .object({
        goal: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("event"), date: isoDate, km: z.number().min(10).max(1500), elevationM: z.number().int().min(0).max(30_000).nullable().optional() }),
          z.object({ kind: z.literal("build") }),
        ]),
      })
      .optional(),
    recentRace: z
      .object({ distanceM: z.number().min(1000).max(50_000), timeS: z.number().int().min(120).max(30_000) })
      .nullable()
      .optional(),
  })
  .refine((p) => p.runsPerWeek <= new Set(p.weekdays).size, { message: "more runs than days", path: ["runsPerWeek"] })
  .refine((p) => p.weekdays.includes(p.longRunWeekday), { message: "long run day not allowed", path: ["longRunWeekday"] })
  .refine((p) => p.sport !== "ride" || !!p.ride, { message: "ride goal missing", path: ["ride"] })
  .refine((p) => !(p.crossWeekdays ?? []).some((d) => p.weekdays.includes(d)), { message: "cross days overlap main days", path: ["crossWeekdays"] });

export type PlanInputBody = z.infer<typeof PlanInputSchema>;

/** Race date must be in the future and within a year. */
export const raceDateOk = (raceDate: string, today: string) => {
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCFullYear(max.getUTCFullYear() + 1);
  return raceDate > today && raceDate <= max.toISOString().slice(0, 10);
};
