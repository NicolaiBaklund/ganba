import { z } from "zod";
import type { WorkoutType } from "./types";

/**
 * Fueling around a run from common sports-nutrition guidance (ACSM / ISSN ranges),
 * scaled to body weight and session length. Free and instant; AI only adds food ideas.
 */
export interface Fueling {
  before: { kind: "meal" | "carbs"; carbsG: number | null; hoursBefore: [number, number] };
  during: { carbsPerHour: [number, number]; fluidMlPerHour: [number, number] } | null;
  after: { proteinG: number; carbsG: number | null };
}

const HARD: ReadonlySet<WorkoutType> = new Set(["intervals", "threshold", "tempo", "race"]);
const round5 = (n: number) => Math.round(n / 5) * 5;

export function fuelingFor(w: { type: WorkoutType; plannedDurationS: number }, kg: number): Fueling {
  const minutes = w.plannedDurationS / 60;
  const demanding = HARD.has(w.type) || minutes >= 60;
  return {
    before: demanding
      ? { kind: "carbs", carbsG: round5(kg * (w.type === "race" || minutes >= 90 ? 1.5 : 1)), hoursBefore: [2, 3] }
      : { kind: "meal", carbsG: null, hoursBefore: [2, 3] },
    during:
      minutes > 75
        ? { carbsPerHour: minutes > 150 ? [60, 90] : [30, 60], fluidMlPerHour: [400, 800] }
        : null,
    after: { proteinG: round5(kg * 0.3), carbsG: demanding ? round5(kg * 1) : null },
  };
}

export const FUEL_PROMPT_VERSION = 1;

export const FuelAdviceSchema = z.object({
  before: z.array(z.string()).describe("1–2 short concrete food suggestions with amounts"),
  during: z.array(z.string()).describe("0–2 suggestions; empty when nothing is needed during the run"),
  after: z.array(z.string()).describe("1–2 short concrete food suggestions with amounts"),
});
export type FuelAdvice = z.infer<typeof FuelAdviceSchema>;

export const FUEL_SYSTEM_PROMPT = `You suggest concrete, everyday foods around one planned run.
You get the session, the fueling targets (grams, already calculated — keep to them), what the runner has eaten today and what is left of today's calorie and macro targets.
- Give 1–2 short suggestions per phase, each with an amount ("2 slices of bread with jam, ~60 g carbs").
- Prefer simple foods most people have at home; fit within what is left today where possible.
- No medical advice, no supplements beyond ordinary sports drinks/gels when carbs are needed during the run.
- Answer in the language given in the request.`;

export function fuelMessage(args: {
  workoutTitle: string;
  minutes: number;
  fueling: Fueling;
  eatenToday: string[];
  remaining: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  language: string;
}): string {
  const f = args.fueling;
  return [
    `Language: ${args.language}`,
    `Session: ${args.workoutTitle}, about ${Math.round(args.minutes)} min`,
    `Before: ${f.before.carbsG ? `${f.before.carbsG} g carbs` : "a normal meal"} ${f.before.hoursBefore[0]}–${f.before.hoursBefore[1]} h before`,
    `During: ${f.during ? `${f.during.carbsPerHour[0]}–${f.during.carbsPerHour[1]} g carbs per hour, ${f.during.fluidMlPerHour[0]}–${f.during.fluidMlPerHour[1]} ml fluid per hour` : "nothing needed (water if thirsty)"}`,
    `After: ${f.after.proteinG} g protein${f.after.carbsG ? ` and ${f.after.carbsG} g carbs` : ""} within 2 h`,
    `Eaten today: ${args.eatenToday.length ? args.eatenToday.join("; ") : "nothing logged yet"}`,
    `Left today: ${args.remaining.kcal} kcal, protein ${args.remaining.proteinG} g, carbs ${args.remaining.carbsG} g, fat ${args.remaining.fatG} g`,
  ].join("\n");
}
