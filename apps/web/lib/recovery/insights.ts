import "server-only";
import { createHash } from "node:crypto";
import {
  addDays,
  buildRecoveryRows,
  DayAnswerSchema,
  dayMessage,
  dayRefs,
  findingRefs,
  keepGrounded,
  localDate,
  questionsMessage,
  QuestionProposalsSchema,
  RECOVERY_DAY_PROMPT,
  RECOVERY_FACTORS,
  RECOVERY_OUTCOMES,
  RECOVERY_PROMPT_VERSION,
  RECOVERY_QUESTIONS,
  RECOVERY_QUESTIONS_PROMPT,
  RECOVERY_SUMMARY_PROMPT,
  summaryMessage,
  validateProposals,
  weekStartOn,
  WeeklySummarySchema,
  type AiDayRow,
  type AiFinding,
  type DayAnswer,
  type ISODate,
  type RecoveryDayInput,
  type RecoveryQuestion,
  type RecoveryRow,
  type WeeklySummary,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { costUsd } from "@/lib/ai/pricing";
import { languageOf } from "@/lib/ai/language";
import { anthropicRecoveryAi, type AiError, type RecoveryAi } from "@/lib/ai/recovery";
import { getAiHealthConsent } from "./consent";
import { loadRecoveryDays } from "./load";

export type InsightError = "consent_required" | "no_key" | "not_enough_data" | AiError;
const MIN_WEEK_NIGHTS = 3;
const QUESTIONS_EVERY_DAYS = 30;
const QUESTIONS_MIN_DAYS = 60;
const MAX_ACTIVE_AI_QUESTIONS = 9;

const db = () => createAdminSupabase();
const round = (v: number | null | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Consent first (no AI call without it), then the key. */
async function gate(userId: string): Promise<{ ok: true; apiKey: string; language: string; today: ISODate } | { ok: false; error: InsightError }> {
  if (!(await getAiHealthConsent(userId))) return { ok: false, error: "consent_required" };
  const apiKey = await resolveAnthropicKey(userId);
  if (!apiKey) return { ok: false, error: "no_key" };
  const { data: p } = await db().from("profiles").select("locale, timezone").eq("user_id", userId).single();
  return { ok: true, apiKey, language: languageOf(p?.locale), today: localDate(p?.timezone ?? "UTC") };
}

function aiRow(d: RecoveryDayInput, r: RecoveryRow | undefined): AiDayRow {
  return {
    date: d.date,
    sleepScore: d.sleepScore,
    hrv: d.hrv,
    restingHr: d.restingHr,
    deficitKcal: round(d.food?.deficitKcal),
    carbsPerKg: round(d.food?.carbsPerKg, 1),
    proteinPerKg: round(d.food?.proteinPerKg, 1),
    alcoholG: d.food && d.food.alcoholG > 0 ? round(d.food.alcoholG) : null,
    lateKcal: round(d.food?.lateKcal),
    hard: d.hard,
    long: d.long,
    steps: d.steps,
    vsNormal: { sleepScore: round(r?.outcomes.sleepScore), hrv: round(r?.outcomes.hrv), restingHr: round(r?.outcomes.restingHr) },
  };
}

async function verifiedFindings(userId: string): Promise<AiFinding[]> {
  const { data } = await db().from("recovery_findings").select("question_id, factor, outcome, lag, groups").eq("user_id", userId).eq("kind", "finding");
  return (data ?? []).map((f) => {
    const g = f.groups as unknown as { high: { n: number; mean: number | null; bound: number | null }; low: { n: number; mean: number | null; bound: number | null } };
    return {
      id: f.question_id,
      factor: f.factor as AiFinding["factor"],
      outcome: f.outcome as AiFinding["outcome"],
      lag: f.lag,
      highBound: round(g.high.bound, 1),
      lowBound: round(g.low.bound, 1),
      difference: round((g.high.mean ?? 0) - (g.low.mean ?? 0), 1) ?? 0,
      nHigh: g.high.n,
      nLow: g.low.n,
    };
  });
}

const usageCols = (r: { usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; model: string }) => ({
  model: r.model,
  prompt_version: RECOVERY_PROMPT_VERSION,
  input_tokens: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite,
  output_tokens: r.usage.output,
  cost_usd: costUsd(r.model, r.usage),
});

const RETRY_FAILED_MS = 24 * 3600_000;
const PENDING_MS = 2 * 60_000;
type SummaryRow = WeeklySummary | { status: "pending" | "failed"; error?: AiError; at: string };

/**
 * A) Last full week (Monday–Sunday), made once the first time the tab opens after it ends.
 * One attempt at a time per week (a pending row claims it); a failure waits 24 h before the next paid try.
 */
export async function weeklySummary(userId: string, opts: { ai?: RecoveryAi; today?: ISODate } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const today = opts.today ?? g.today;
  const weekStart = addDays(weekStartOn(today, 1), -7);
  const { data: cached } = await db().from("recovery_summaries").select("content").eq("user_id", userId).eq("week_start", weekStart).maybeSingle();
  const prev = cached?.content as unknown as SummaryRow | undefined;
  if (prev && !("status" in prev)) return { ok: true as const, summary: prev, weekStart };
  if (prev && "status" in prev) {
    const age = Date.now() - Date.parse(prev.at);
    if (prev.status === "pending" && age < PENDING_MS) return { ok: false as const, error: "unavailable" as const };
    if (prev.status === "failed" && age < RETRY_FAILED_MS) return { ok: false as const, error: prev.error ?? ("unavailable" as const) };
  }

  const days = await loadRecoveryDays(userId, today);
  const rows = new Map(buildRecoveryRows(days, addDays(today, -89), today).map((r) => [r.date, r]));
  const week = days.filter((d) => d.date >= weekStart && d.date <= addDays(weekStart, 6));
  if (week.filter((d) => d.sleepScore != null || d.hrv != null).length < MIN_WEEK_NIGHTS) return { ok: false as const, error: "not_enough_data" as const };

  // Claim this week: replace a stale pending/failed row, or insert; whoever does not get the row backs off.
  if (prev) await db().from("recovery_summaries").delete().eq("user_id", userId).eq("week_start", weekStart).eq("content->>at", (prev as { at: string }).at);
  const { data: claimed } = await db()
    .from("recovery_summaries")
    .upsert({ user_id: userId, week_start: weekStart, content: { status: "pending", at: new Date().toISOString() } as unknown as Json }, { onConflict: "user_id,week_start", ignoreDuplicates: true })
    .select("id");
  if (!claimed?.length) return { ok: false as const, error: "unavailable" as const };
  const save = (content: SummaryRow, extra: object = {}) =>
    db().from("recovery_summaries").update({ content: content as unknown as Json, ...extra }).eq("user_id", userId).eq("week_start", weekStart);

  const table = week.map((d) => aiRow(d, rows.get(d.date)));
  const findings = await verifiedFindings(userId);
  const { data: next } = await db()
    .from("planned_workouts")
    .select("date, title")
    .eq("user_id", userId)
    .eq("status", "planned")
    .gte("date", today)
    .lte("date", addDays(weekStart, 13))
    .order("date");

  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_SUMMARY_PROMPT, summaryMessage({ language: g.language, weekStart, days: table, findings, nextWeek: next ?? [] }), WeeklySummarySchema);
  if (!res.ok) {
    await save({ status: "failed", error: res.error, at: new Date().toISOString() }, usageCols(res));
    return { ok: false as const, error: res.error };
  }
  const allowed = new Set([...dayRefs(table), ...findingRefs(findings)]);
  const sentences = keepGrounded(res.value.sentences, allowed, 5);
  const tips = keepGrounded(res.value.tips, allowed, 2);
  // Nothing grounded left → nothing shown; the headline also has to cite.
  const headline = sentences.length || tips.length ? (keepGrounded([res.value.headline], allowed, 1)[0]?.text.slice(0, 80) ?? "") : "";
  const summary: WeeklySummary = { headline, sentences, tips };
  await save(summary, usageCols(res));
  return { ok: true as const, summary, weekStart };
}

/** B) "Why?" for one morning. Stored with a fingerprint of its input; changed data → stale until asked again. */
export async function dayAnswer(userId: string, date: ISODate, opts: { ai?: RecoveryAi; refresh?: boolean } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const days = await loadRecoveryDays(userId, date, 32); // the day before, the day, and 28 nights for the normal
  const rows = new Map(buildRecoveryRows(days, addDays(date, -1), date).map((r) => [r.date, r]));
  const pick = [addDays(date, -1), date].map((d) => days.find((x) => x.date === d)).filter((d): d is RecoveryDayInput => !!d);
  const table = pick.map((d) => aiRow(d, rows.get(d.date)));
  if (!table.some((r) => r.sleepScore != null || r.hrv != null || r.restingHr != null)) return { ok: false as const, error: "not_enough_data" as const };
  const findings = await verifiedFindings(userId);
  const message = dayMessage({ language: g.language, date, days: table, findings });
  // Stale means the day's own numbers changed; findings move with every sync and must not count.
  const inputHash = createHash("sha256").update(`${RECOVERY_PROMPT_VERSION}\n${g.language}\n${JSON.stringify(table)}`).digest("hex");

  const { data: cached } = await db().from("recovery_day_answers").select("content, input_hash").eq("user_id", userId).eq("local_date", date).eq("question", "why").maybeSingle();
  if (cached && !opts.refresh) return { ok: true as const, answer: cached.content as unknown as DayAnswer, stale: cached.input_hash !== inputHash };

  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_DAY_PROMPT, message, DayAnswerSchema);
  if (!res.ok) return { ok: false as const, error: res.error };
  const answer: DayAnswer = { sentences: keepGrounded(res.value.sentences, new Set([...dayRefs(table), ...findingRefs(findings)]), 4) };
  await db()
    .from("recovery_day_answers")
    .upsert({ user_id: userId, local_date: date, question: "why", content: answer as unknown as Json, input_hash: inputHash, ...usageCols(res) }, { onConflict: "user_id,local_date,question" });
  return { ok: true as const, answer, stale: false };
}

/** C) Once a month with ≥ 60 days of data: up to 3 new questions, tested by the engine with q ≤ 0.05. */
export async function proposeQuestions(userId: string, opts: { ai?: RecoveryAi; today?: ISODate } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const today = opts.today ?? g.today;
  const { data: acct } = await db().from("garmin_accounts").select("recovery_questions_at").eq("user_id", userId).maybeSingle();
  const dueBefore = new Date(Date.now() - QUESTIONS_EVERY_DAYS * 86_400_000).toISOString();
  if (!acct || (acct.recovery_questions_at && acct.recovery_questions_at > dueBefore)) return { ok: false as const, error: "not_due" as const };
  const days = await loadRecoveryDays(userId, today);
  const rows = buildRecoveryRows(days, addDays(today, -89), today);
  const withData = days.filter((d) => d.sleepScore != null || d.hrv != null).length;
  if (withData < QUESTIONS_MIN_DAYS) return { ok: false as const, error: "not_enough_data" as const };
  // Claim the month before the paid call, atomically: failures, empty answers and parallel opens all wait.
  const { data: claimed } = await db()
    .from("garmin_accounts")
    .update({ recovery_questions_at: new Date().toISOString() })
    .eq("user_id", userId)
    .or(`recovery_questions_at.is.null,recovery_questions_at.lt.${dueBefore}`)
    .select("user_id");
  if (!claimed?.length) return { ok: false as const, error: "not_due" as const };
  const { data: recent } = await db().from("recovery_ai_questions").select("id, created_at, spec, status").eq("user_id", userId).order("created_at", { ascending: false });

  const stat = (vals: number[]) => {
    if (!vals.length) return { mean: null, sd: null };
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { mean: round(m, 2), sd: round(Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, vals.length - 1)), 2) };
  };
  const UNIT: Record<string, string> = { deficit: "kcal", deficit3: "kcal", carbs: "g/kg", protein: "g/kg", steps: "steps", sleepScore: "score", hrv: "ms", restingHr: "bpm", runForm: "SD", daysSinceHard: "days" };
  // Per-variable numbers only: never anything that links a factor to an outcome (that would bias the test).
  const catalogue = [
    ...RECOVERY_FACTORS.map((f) => {
      const vals = rows.flatMap((r) => (r.factors[f] == null ? [] : [r.factors[f]!]));
      return { name: f, kind: "factor" as const, unit: UNIT[f] ?? "yes/no", ...stat(vals), days: vals.length };
    }),
    ...RECOVERY_OUTCOMES.map((o) => {
      const vals = rows.flatMap((r) => (r.outcomes[o] == null ? [] : [r.outcomes[o]!]));
      return { name: o, kind: "outcome" as const, unit: `${UNIT[o]} vs own normal`, ...stat(vals), days: vals.length };
    }),
  ];
  const existing: Pick<RecoveryQuestion, "factor" | "outcome" | "lag" | "transform">[] = [
    ...RECOVERY_QUESTIONS,
    ...(recent ?? []).map((r) => r.spec as unknown as RecoveryQuestion),
  ];
  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_QUESTIONS_PROMPT, questionsMessage({ language: g.language, catalogue, existing }), QuestionProposalsSchema);
  if (!res.ok) return { ok: false as const, error: res.error };
  const valid = validateProposals(res.value, existing);
  if (valid.length) {
    const { error } = await db()
      .from("recovery_ai_questions")
      .insert(valid.map(({ rationale, ...spec }) => ({ user_id: userId, spec: spec as unknown as Json, rationale, status: "testing", ...usageCols(res) })));
    if (error) throw error;
  }
  // Keep the newest few active; older testing questions that never passed are retired.
  const testing = (recent ?? []).filter((r) => r.status === "testing");
  const overflow = testing.length + valid.length - MAX_ACTIVE_AI_QUESTIONS;
  if (overflow > 0) await db().from("recovery_ai_questions").update({ status: "rejected" }).in("id", testing.slice(-overflow).map((r) => r.id));
  return { ok: true as const, created: valid.length };
}
