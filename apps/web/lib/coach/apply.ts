import "server-only";
import { addDays, checkChanges, describeChanges, type PlanWarning } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { activePlan, planContext, planWorkoutsWithKm, recentRuns, savePlanChanges, todayFor } from "@/lib/training/service";
import { claimMessage, releaseMessage, updateOptions, type CoachOption } from "./store";

const key = (w: PlanWarning) => `${w.code}|${w.date ?? ""}|${w.week ?? ""}|${w.severity}|${w.before ?? ""}|${w.after ?? ""}|${w.pct ?? ""}`;
const sameWarnings = (a: PlanWarning[], b: PlanWarning[]) => a.map(key).sort().join() === b.map(key).sort().join();

export type ApplyError = "not_found" | "not_pending" | "no_plan" | "changed" | "invalid" | "archived" | "busy";

/**
 * Applies one option, all or nothing, re-checked against the plan now.
 * - A change that no longer applies → the option is invalid (never applied in part).
 * - Warnings differ from what the runner last saw → stale with the new warnings (409).
 * - Stale + confirm applies only if nothing changed since the runner saw the stale warnings.
 */
export async function applyOption(userId: string, messageId: string, optionId: string, opts: { confirm?: boolean } = {}) {
  const db = createAdminSupabase();
  const { data: m } = await db.from("coach_messages").select("id, thread_id").eq("id", messageId).eq("user_id", userId).maybeSingle();
  if (!m) return { ok: false as const, error: "not_found" as ApplyError };
  const { data: thread } = await db.from("coach_threads").select("archived_at").eq("id", m.thread_id).single();
  if (thread?.archived_at) return { ok: false as const, error: "archived" as ApplyError };
  if (!(await claimMessage(m.id))) return { ok: false as const, error: "busy" as ApplyError };
  try {
    const { data: fresh } = await db.from("coach_messages").select("options").eq("id", m.id).single();
    const options = (fresh?.options as unknown as CoachOption[] | undefined) ?? [];
    const o = options.find((x) => x.id === optionId);
    if (!o) return { ok: false as const, error: "not_found" as ApplyError };
    if (o.status !== "pending" && o.status !== "stale") return { ok: false as const, error: "not_pending" as ApplyError };
    const plan = await activePlan(userId);
    if (!plan) return { ok: false as const, error: "no_plan" as ApplyError };
    const today = await todayFor(userId);
    const [workouts, runs] = await Promise.all([planWorkoutsWithKm(plan), recentRuns(userId, today)]);
    const recentLongestKm = Math.max(0, ...runs.filter((r) => r.date >= addDays(today, -28)).map((r) => r.distanceM / 1000));
    const res = checkChanges(workouts, o.changes, planContext(plan, today), { recentLongestKm });
    const save = (next: Partial<CoachOption>) => updateOptions(m.id, options.map((x) => (x.id === o.id ? { ...x, ...next } : x)));

    if (res.errors.length || res.valid.length !== o.changes.length) {
      const reason = res.errors[0]?.reason ?? "it no longer fits the plan";
      await save({ status: "invalid", reason, warnings: res.warnings });
      return { ok: false as const, error: "invalid" as ApplyError, reason };
    }
    if (!sameWarnings(res.warnings, o.warnings)) {
      await save({ status: "stale", warnings: res.warnings, lines: describeChanges(workouts, res.after, res.valid) });
      return { ok: false as const, error: "changed" as ApplyError, warnings: res.warnings };
    }
    if (o.status === "stale" && !opts.confirm) return { ok: false as const, error: "changed" as ApplyError, warnings: o.warnings };

    await savePlanChanges(userId, plan, res.valid, today);
    await updateOptions(
      m.id,
      options.map((x) => (x.id === o.id ? { ...x, status: "applied" } : x.status === "pending" || x.status === "stale" ? { ...x, status: "not_used" } : x)),
    );
    return { ok: true as const };
  } finally {
    await releaseMessage(m.id);
  }
}
