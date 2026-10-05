import { z } from "zod";
import type { ISODate } from "../dates";
import { RECOVERY_FACTORS, RECOVERY_OUTCOMES, type RecoveryFactor, type RecoveryOutcome } from "./variables";
import type { RecoveryQuestion } from "./questions";

export const RECOVERY_PROMPT_VERSION = 1;
export const FORM_PROMPT_VERSION = 1;

export const GroundedSentenceSchema = z.object({ text: z.string(), refs: z.array(z.string()) });
export type GroundedSentence = z.infer<typeof GroundedSentenceSchema>;
/** What the model returns: the headline must cite like every sentence. */
export const WeeklySummarySchema = z.object({ headline: GroundedSentenceSchema, sentences: z.array(GroundedSentenceSchema), tips: z.array(GroundedSentenceSchema) });
/** What is stored and shown: the headline is "" when it was not grounded. */
export type WeeklySummary = { headline: string; sentences: GroundedSentence[]; tips: GroundedSentence[] };
export const DayAnswerSchema = z.object({ sentences: z.array(GroundedSentenceSchema) });
export type DayAnswer = z.infer<typeof DayAnswerSchema>;
export const QuestionProposalsSchema = z.object({
  proposals: z.array(
    z.object({
      factor: z.enum(RECOVERY_FACTORS),
      transform: z.enum(["tertile", "binary", "threshold"]),
      threshold: z.number().nullable(),
      outcome: z.enum(RECOVERY_OUTCOMES),
      lag: z.number().int(),
      rationale: z.string(),
    }),
  ),
});
export type QuestionProposals = z.infer<typeof QuestionProposalsSchema>;

/** Fields the AI may cite per day: `day:<date>:<field>`. */
export const DAY_FIELDS = ["sleepScore", "hrv", "restingHr", "deficitKcal", "carbsPerKg", "proteinPerKg", "alcoholG", "lateKcal", "hard", "long", "steps"] as const;
export type DayField = (typeof DAY_FIELDS)[number];
export type AiDayRow = { date: ISODate } & Partial<Record<DayField, number | boolean | null>> & {
  /** Deviation from the user's own normal for night metrics (value − median of the previous 28 days). */
  vsNormal?: Partial<Record<"sleepScore" | "hrv" | "restingHr", number | null>>;
};
export interface AiFinding {
  id: string; // question id; cited as finding:<id>
  factor: RecoveryFactor;
  outcome: RecoveryOutcome;
  lag: number;
  highBound: number | null;
  lowBound: number | null;
  difference: number; // outcome units, high − low
  nHigh: number;
  nLow: number;
}

/** Every reference that points at something the AI was actually given. */
export function dayRefs(rows: readonly AiDayRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) for (const f of DAY_FIELDS) if (r[f] != null) out.add(`day:${r.date}:${f}`);
  return out;
}
export const findingRefs = (fs: readonly AiFinding[]) => new Set(fs.map((f) => `finding:${f.id}`));

/** The ground rule: a sentence stays only if it cites something and every citation is real. */
export function keepGrounded(sentences: readonly GroundedSentence[], allowed: ReadonlySet<string>, max: number): GroundedSentence[] {
  return sentences
    .filter((s) => s.text.trim() && s.refs.length > 0 && s.refs.every((r) => allowed.has(r)))
    .slice(0, max)
    .map((s) => ({ text: s.text.trim().slice(0, 300), refs: s.refs }));
}

const BASE_RULES = `- Use only the numbers in the tables. Never guess, never add outside knowledge about the person.
- Correlation, not cause: say "on days with …", never "X causes Y". No medical advice, no diagnosis.
- Plain, short sentences. No emojis.
- Answer in the language given.`;
const RULES = `Rules:
- Every sentence needs refs: "finding:<id>" for a finding, "day:<date>:<field>" for a value in the day table. A sentence without valid refs is deleted.
${BASE_RULES}`;

export const RECOVERY_SUMMARY_PROMPT = `You write a short weekly recovery summary for a runner from their own data.
You get last week's daily table (sleep score, HRV, resting heart rate with their deviation from the person's own normal, food and training), verified findings from a statistics engine, and next week's planned sessions.
Return a headline (max 8 words, with refs like a sentence), 3–5 sentences about what stood out last week, and 1–2 concrete tips for next week that build on the findings.
${RULES}`;

export const RECOVERY_DAY_PROMPT = `You explain one morning's recovery numbers for a runner: why sleep, HRV or resting heart rate looked the way they did.
You get that morning and the day before, each number's deviation from the person's own normal, and verified findings.
Return 2–4 sentences. If no factor stands out, say so honestly in one sentence that cites the day's numbers.
${RULES}`;

export const RECOVERY_QUESTIONS_PROMPT = `You propose new questions for a statistics engine that looks for links in one person's data.
You get the variable catalogue (name, unit, mean, spread, number of days) and the questions already tested. You do not get any results linking variables to each other.
Propose at most 3 new questions: factor (from the catalogue), transform ("tertile" = top vs bottom third, "binary" = yes/no factors only, "threshold" = factor ≥ threshold, give the threshold), outcome, lag in days from 0 to 3 (days from the factor day to the outcome: 0 = same day, 1 = the next morning or day, 2–3 = delayed effects), and a one-sentence rationale.
Do not repeat existing questions. Prefer questions a runner would find useful.
Answer in the language given (the rationale only).`;

export const RECOVERY_FORM_PROMPT = `You write the one line under a runner's daily Form number (0–100, 50 = an ordinary day).
You get today's score, the parts that make it up (each with its points from 50 and the numbers behind it), today's planned session (or none) and verified findings from the person's own data.
Return 1–2 short sentences: what today's number means for today's session, and the one or two parts that matter most. Use findings only when they explain a part.
Rules:
- Every sentence needs refs: "part:<id>" for a part (only parts with status "ok"), "finding:<id>" for a finding. A sentence without valid refs is deleted.
${BASE_RULES}`;

const table = (rows: readonly object[]) => JSON.stringify(rows);

export function formMessage(i: { language: string; date: ISODate; score: number; parts: object[]; workout: { type: string; title: string } | null; findings: AiFinding[] }): string {
  return `Language: ${i.language}
Form for ${i.date}: ${i.score}
Parts: ${table(i.parts)}
Today's session: ${i.workout ? table([i.workout]) : "none (rest day)"}
Findings: ${table(i.findings)}`;
}

export function summaryMessage(i: { language: string; weekStart: ISODate; days: AiDayRow[]; findings: AiFinding[]; nextWeek: { date: ISODate; title: string }[] }): string {
  return `Language: ${i.language}
Week starting ${i.weekStart}.
Day table: ${table(i.days)}
Findings: ${table(i.findings)}
Next week's sessions: ${table(i.nextWeek)}`;
}

export function dayMessage(i: { language: string; date: ISODate; days: AiDayRow[]; findings: AiFinding[] }): string {
  return `Language: ${i.language}
Explain the morning of ${i.date} (sleep the night before).
Day table (the day before, then the morning): ${table(i.days)}
Findings: ${table(i.findings)}`;
}

export function questionsMessage(i: {
  language: string;
  catalogue: { name: RecoveryFactor | RecoveryOutcome; kind: "factor" | "outcome"; unit: string; mean: number | null; sd: number | null; days: number }[];
  existing: { factor: string; transform: string; outcome: string; lag: number }[];
}): string {
  return `Language: ${i.language}
Catalogue: ${table(i.catalogue)}
Already tested: ${table(i.existing)}`;
}

const BINARY = new Set<RecoveryFactor>(["alcohol", "late", "hard", "long"]);
export const MAX_AI_QUESTIONS = 3;
/** Outcome date − factor date. Never negative: an outcome before its factor tests the wrong direction. */
export const MIN_LAG = 0;
export const MAX_LAG = 3;

/** Drops proposals the engine cannot test or already tests; at most 3 survive. */
export function validateProposals(p: QuestionProposals, existing: readonly Pick<RecoveryQuestion, "factor" | "outcome" | "lag">[]): (Omit<RecoveryQuestion, "id"> & { rationale: string })[] {
  const seen = new Set(existing.map((q) => `${q.factor}|${q.outcome}|${q.lag}`));
  const out: (Omit<RecoveryQuestion, "id"> & { rationale: string })[] = [];
  for (const q of p.proposals) {
    if (q.lag < MIN_LAG || q.lag > MAX_LAG) continue;
    if (q.transform === "binary" && !BINARY.has(q.factor)) continue;
    if (q.transform !== "binary" && BINARY.has(q.factor)) continue;
    if (q.transform === "threshold" && (q.threshold == null || !Number.isFinite(q.threshold))) continue;
    const key = `${q.factor}|${q.outcome}|${q.lag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ factor: q.factor, transform: q.transform, ...(q.transform === "threshold" ? { threshold: q.threshold! } : {}), outcome: q.outcome, lag: q.lag, rationale: q.rationale.slice(0, 300) });
    if (out.length === MAX_AI_QUESTIONS) break;
  }
  return out;
}
