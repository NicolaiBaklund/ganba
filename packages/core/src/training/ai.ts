import { z } from "zod";
import { weekday, type ISODate } from "../dates";
import type { Goal, PlanWorkout, ProposalChange } from "./types";

export const PLAN_PROMPT_VERSION = 1;

const ref = z.string().describe("Session reference, e.g. s3");
const date = z.string().describe("YYYY-MM-DD");

export const PlanAdjustSchema = z.object({
  summary: z.string().describe("1–3 short sentences to the runner, in the language they wrote in, saying what changes and why."),
  namedDays: z.boolean().describe("True only if the runner explicitly named days or dates they want to run on."),
  changes: z.array(
    z.union([
      z.object({ op: z.literal("move"), session: ref, toDate: date }),
      z.object({ op: z.literal("drop"), session: ref }),
      z.object({
        op: z.literal("replace"),
        session: ref,
        type: z.enum(["easy", "long", "intervals", "threshold", "tempo", "strides"]),
        km: z.number(),
      }),
      z.object({ op: z.literal("rescale"), fromDate: date, factor: z.number().describe("0.5–1.1; applies to easy, long and strides runs from that date") }),
    ]),
  ),
});
export type PlanAdjust = z.infer<typeof PlanAdjustSchema>;

export const PLAN_SYSTEM_PROMPT = `You adjust an existing running training plan when the runner asks for it.
The plan was built by a rule engine; you only edit it with these operations:
- move: move a session to another date
- drop: remove a session
- replace: change a session to another type and distance (the engine rebuilds the structure and paces)
- rescale: scale easy, long and strides runs from a date by a factor (0.5–1.1)

Rules:
- Change as little as possible to satisfy the request. Never touch done or past sessions, and never the race.
- Prefer the runner's available running days unless they name other days.
- Never put two hard sessions (long, intervals, threshold, tempo) on consecutive days.
- Never increase a week's volume by more than 10 %.
- Illness or pain: reduce load (drop quality, shorter easy runs) rather than move it later. Do not give medical advice beyond suggesting rest and seeing a professional if pain persists.
- If the request cannot be met within these rules, return no changes and explain why in the summary.
- If the request is not about the training plan, return no changes.`;

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** User message describing the plan; sessions get short refs (s1, s2 …) that map back to ids. */
export function planAdjustMessage(args: {
  request: string;
  today: ISODate;
  goal: Goal;
  weekdays: number[];
  longRunWeekday: number;
  workouts: PlanWorkout[];
}): { text: string; refs: Map<string, string> } {
  const refs = new Map<string, string>();
  const lines = args.workouts.map((w, i) => {
    const r = `s${i + 1}`;
    refs.set(r, w.id);
    return `${r} | ${w.date} ${DAY[weekday(w.date)]} | ${w.type} | ${w.plannedKm} km | ${w.status} | ${w.title}`;
  });
  const goal =
    args.goal.kind === "race"
      ? `Race: ${args.goal.distance} on ${args.goal.raceDate}${args.goal.targetTimeS ? `, target ${Math.round(args.goal.targetTimeS / 60)} min` : ""}`
      : "Build fitness (no race)";
  const text = [
    `Today: ${args.today} (${DAY[weekday(args.today)]})`,
    goal,
    `Available running days: ${args.weekdays.map((d) => DAY[d]).join(", ")}; long run day: ${DAY[args.longRunWeekday]}`,
    "",
    "Sessions (ref | date | type | km | status | title):",
    ...lines,
    "",
    "Runner's request:",
    `<request>${args.request}</request>`,
  ].join("\n");
  return { text, refs };
}

/** Model output → engine changes; unknown session refs are dropped. */
export function toProposalChanges(out: PlanAdjust, refs: Map<string, string>): ProposalChange[] {
  const changes: ProposalChange[] = [];
  for (const c of out.changes) {
    if (c.op === "rescale") {
      changes.push({ op: "rescale", fromDate: c.fromDate, factor: c.factor });
      continue;
    }
    const workoutId = refs.get(c.session);
    if (!workoutId) continue;
    if (c.op === "move") changes.push({ op: "move", workoutId, toDate: c.toDate });
    else if (c.op === "drop") changes.push({ op: "drop", workoutId });
    else changes.push({ op: "replace", workoutId, type: c.type, km: c.km });
  }
  return changes;
}
