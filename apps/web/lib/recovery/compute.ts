import "server-only";
import { addDays, analyzeRecovery, buildRecoveryRows, type ISODate, type RecoveryQuestion, type RecoveryResult } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { loadRecoveryDays } from "./load";
import { getAiHealthConsent } from "./consent";

export const RECOVERY_WINDOW_DAYS = 90;
export const RECOMPUTE_AFTER_MS = 6 * 3600_000;

/** New nights or new activities since the last run, or the last run is over 6 h old (catches edited food). */
async function isStale(userId: string, computedAt: string | null): Promise<boolean> {
  if (!computedAt) return true;
  if (Date.now() - Date.parse(computedAt) > RECOMPUTE_AFTER_MS) return true;
  const db = createAdminSupabase();
  const [n, a] = await Promise.all([
    db.from("recovery_days").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", computedAt),
    db.from("activities").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("created_at", computedAt),
  ]);
  return (n.count ?? 0) > 0 || (a.count ?? 0) > 0;
}

/** Runs the engine for one user and replaces their stored results (spec §5.7). */
export async function computeRecovery(userId: string, today: ISODate, opts: { force?: boolean } = {}): Promise<"computed" | "fresh" | "not_connected"> {
  const db = createAdminSupabase();
  const { data: acct } = await db.from("garmin_accounts").select("recovery_computed_at").eq("user_id", userId).maybeSingle();
  if (!acct) return "not_connected";
  if (!opts.force && !(await isStale(userId, acct.recovery_computed_at))) return "fresh";

  const days = await loadRecoveryDays(userId, today);
  const rows = buildRecoveryRows(days, addDays(today, -(RECOVERY_WINDOW_DAYS - 1)), today);
  const results = analyzeRecovery(rows);
  // AI-suggested questions: tested on the same rows, but stricter (q ≤ 0.05 within the AI family, spec §7.4).
  const { data: aiQs } = (await getAiHealthConsent(userId))
    ? await db.from("recovery_ai_questions").select("id, spec").eq("user_id", userId).in("status", ["testing", "accepted"])
    : { data: [] };
  const aiQuestions: RecoveryQuestion[] = (aiQs ?? []).map((q) => ({ ...(q.spec as unknown as Omit<RecoveryQuestion, "id">), id: `ai-${q.id.slice(0, 8)}` }));
  const aiResults = aiQuestions.length ? analyzeRecovery(rows, aiQuestions, { maxQ: 0.05 }) : [];
  const aiIdOf = new Map((aiQs ?? []).map((q) => [`ai-${q.id.slice(0, 8)}`, q.id]));
  const computedAt = new Date().toISOString();
  const base = (r: RecoveryResult) => ({
    user_id: userId,
    computed_at: computedAt,
    question_id: r.questionId,
    factor: r.factor,
    outcome: r.outcome,
    lag: r.lag,
    kind: r.kind,
    reason: r.reason,
    groups: r.groups as unknown as Json,
    effect_sd: r.effectSd,
    p_value: r.pValue,
    q_value: r.qValue,
    control_ok: r.controlOk,
    rank: r.rank,
  });

  const { error: delErr } = await db.from("recovery_findings").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const all = [
    ...results.map((r) => ({ ...base(r), source: "engine" as const })),
    ...aiResults.map((r) => ({ ...base(r), source: "ai" as const, ai_question_id: aiIdOf.get(r.questionId) ?? null })),
  ];
  if (all.length) {
    const { error } = await db.from("recovery_findings").insert(all);
    if (error) throw error;
  }
  for (const r of aiResults) {
    await db.from("recovery_ai_questions").update({ status: r.kind === "finding" ? "accepted" : "testing" }).eq("id", aiIdOf.get(r.questionId)!);
  }
  await db.from("garmin_accounts").update({ recovery_computed_at: computedAt }).eq("user_id", userId);
  return "computed";
}
