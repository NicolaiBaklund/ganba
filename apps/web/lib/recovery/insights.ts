import "server-only";
import {
  addDays,
  buildRecoveryRows,
  localDate,
  questionsMessage,
  QuestionProposalsSchema,
  RECOVERY_FACTORS,
  RECOVERY_OUTCOMES,
  RECOVERY_PROMPT_VERSION,
  RECOVERY_QUESTIONS,
  RECOVERY_QUESTIONS_PROMPT,
  validateProposals,
  type AiFinding,
  type ISODate,
  type RecoveryQuestion,
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
const QUESTIONS_EVERY_DAYS = 30;
const QUESTIONS_MIN_DAYS = 60;
const MAX_ACTIVE_AI_QUESTIONS = 9;

const db = () => createAdminSupabase();
const round = (v: number | null | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Consent first (no AI call without it), then the key. */
export async function gate(userId: string): Promise<{ ok: true; apiKey: string; language: string; today: ISODate } | { ok: false; error: InsightError }> {
  if (!(await getAiHealthConsent(userId))) return { ok: false, error: "consent_required" };
  const apiKey = await resolveAnthropicKey(userId);
  if (!apiKey) return { ok: false, error: "no_key" };
  const { data: p } = await db().from("profiles").select("locale, timezone").eq("user_id", userId).single();
  return { ok: true, apiKey, language: languageOf(p?.locale), today: localDate(p?.timezone ?? "UTC") };
}

export async function verifiedFindings(userId: string): Promise<AiFinding[]> {
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

export const usageCols = (r: { usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; model: string }, promptVersion = RECOVERY_PROMPT_VERSION) => ({
  model: r.model,
  prompt_version: promptVersion,
  input_tokens: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite,
  output_tokens: r.usage.output,
  cost_usd: costUsd(r.model, r.usage),
});

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
