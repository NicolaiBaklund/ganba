import { z } from "zod";
import { HARD_TYPES, type WorkoutType } from "../training/types";
import { formatPace } from "../training/vdot";
import type { HealthAlert } from "./alerts";

/** What the morning note may say (spec docs/specs/2026-11-02-health.md §7): Garmin, the plan and own tables only. */
export interface NoteFacts {
  alert: HealthAlert | null;
  /** The latest session done: today's if it is already done when the note is written, else yesterday's. */
  lastSession: {
    when: "today" | "yesterday";
    type: string;
    title: string;
    km: number;
    avgSecPerKm: number | null;
    avgHr: number | null;
    /** Mean pace of the fast laps of an interval session. */
    repsAvgSecPerKm: number | null;
    /** The fastest reps (or easy pace at the same heart rate) of this session type so far. */
    bestYet: boolean;
  } | null;
  /** Today's session still to do (null when it is done or it is a rest day). */
  today: { type: string; title: string; km: number | null; hrMax: number | null } | null;
  /** Tomorrow's session, any kind. */
  tomorrow: { type: string; title: string } | null;
  /** Race clock change since yesterday, seconds (negative = faster). */
  clockDeltaS: number | null;
  raceName: string | null;
}

export const NoteSchema = z.object({ text: z.string().min(1).max(500) });
export type NoteAnswer = z.infer<typeof NoteSchema>;
export const NOTE_PROMPT_VERSION = 2;

export const NOTE_PROMPT = `You are a running coach writing a runner's morning note in their app.
You get facts as JSON: an alert (or null), the latest session they did (today or yesterday, with its numbers), today's session still to do, tomorrow's session, the change in their predicted race time since yesterday and the race's name.
Write 1–3 short sentences, plain text, in the given language. Order: the alert if there is one (what is off and what you suggest), else how the latest session went, then what comes next (today's session, or tomorrow's when today's is done or a rest day). Mention the race time change only when it is not zero.
Rules:
- Use only the facts given. Never invent numbers, places, people or feelings.
- A null fact is simply left out. Never say that data is missing or that there is nothing to review.
- A latest session with when "today" is already done: talk about it as done today, not as something to do.
- Speak to the runner as "you". No greetings, no sign-off, no exclamation marks, no lists, no em dashes.
- An alert "sick": resting heart rate up and HRV low two mornings in a row; suggest swapping today's or tomorrow's hard session for an easy run.
- An alert "easy_fast": their easy runs are faster than easy; give the pace to stay above.
- An alert "sleep": they are short of sleep over many nights; suggest an earlier night and an easy day if a hard one is near.
Return JSON: {"text": "..."}.`;

export function noteMessage(f: NoteFacts, language: string): string {
  return `Language: ${language}
Facts: ${JSON.stringify(f)}`;
}

const pace = (s: number | null) => (s == null ? null : `${formatPace(s)}/km`);
/** A session an alert may swap for an easy run: hard, but never a race or a fitness test. */
const swappable = (type: string) => HARD_TYPES.has(type as WorkoutType) && type !== "race" && type !== "test";

/** Without AI: the same facts in fixed sentences, at most three. */
export function templateNote(f: NoteFacts): string {
  const out: string[] = [];
  const a = f.alert;
  if (a?.kind === "sick") out.push(`Your resting heart rate is up ${a.facts.rhrUp} and HRV has been low two mornings running, often how getting sick starts.`);
  else if (a?.kind === "easy_fast") out.push(`Your easy runs have averaged ${pace(a.facts.avgSecPerKm!)}. Keep them slower than ${pace(a.facts.easyFastSecPerKm!)} so they stay easy.`);
  else if (a?.kind === "sleep") out.push(`You have slept about ${a.facts.avgShortH} h less than you need a night lately. An earlier night would help.`);

  const y = f.lastSession;
  if (!a && y) {
    const how = y.repsAvgSecPerKm != null ? `averaged ${pace(y.repsAvgSecPerKm)} on the reps` : y.avgSecPerKm != null ? `went at ${pace(y.avgSecPerKm)}` : null;
    if (how) out.push(`${y.when === "today" ? "Today's" : "Yesterday's"} ${y.title.toLowerCase()} ${how}${y.bestYet ? ", your fastest yet" : ""}.`);
  }
  if (!a && f.clockDeltaS) out.push(`Your predicted time is ${Math.abs(f.clockDeltaS)} s ${f.clockDeltaS < 0 ? "faster" : "slower"} than yesterday.`);

  const t = f.today;
  if (a?.kind === "sick") {
    if (t && swappable(t.type)) out.push(`Swap today's ${t.title.toLowerCase()} for an easy run?`);
    else if (f.tomorrow && swappable(f.tomorrow.type)) out.push(`Swap tomorrow's ${f.tomorrow.title.toLowerCase()} for an easy run?`);
    else out.push(t ? `Keep today's ${t.title.toLowerCase()} truly easy, or rest.` : "Rest today.");
  } else if (t) out.push(`Today: ${t.title}${t.hrMax ? `, heart rate under ${t.hrMax}` : ""}.`);
  else if (y?.when === "today") out.push(f.tomorrow ? `Tomorrow: ${f.tomorrow.title}.` : "Rest tomorrow.");
  else if (f.tomorrow) out.push(`Rest today. Tomorrow: ${f.tomorrow.title}.`);
  else out.push("Rest today.");
  return out.slice(0, 3).join(" ");
}
