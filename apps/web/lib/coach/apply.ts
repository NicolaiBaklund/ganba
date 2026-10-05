import "server-only";
import { addDays, checkChanges, type PlanWarning } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { activePlan, planContext, planWorkoutsWithKm, recentRuns, savePlanChanges, todayFor } from "@/lib/training/service";
import { updateOptions, type CoachOption } from "./store";

const sameWarnings = (a: PlanWarning[], b: PlanWarning[]) => {
  const k = (w: PlanWarning) => `${w.code}|${w.date ?? ""}|${w.week ?? ""}|${w.severity}`;
  return a.map(k).sort().join() === b.map(k).sort().join();
};

/** Applies one option: re-checked against the plan now; changed warnings → 409 until confirmed. */
export async function applyOption(userId: string, messageId: string, optionId: string, opts: { confirm?: boolean } = {}) {
  const { data: m } = await createAdminSupabase().from("coach_messages").select("id, options").eq("id", messageId).eq("user_id", userId).maybeSingle();
  const options = (m?.options as unknown as CoachOption[] | undefined) ?? [];
  const o = options.find((x) => x.id === optionId);
  if (!m || !o) return { ok: false as const, error: "not_found" as const };
  if (o.status !== "pending" && o.status !== "stale") return { ok: false as const, error: "not_pending" as const };
  const plan = await activePlan(userId);
  if (!plan) return { ok: false as const, error: "no_plan" as const };
  const today = await todayFor(userId);
  const [workouts, runs] = await Promise.all([planWorkoutsWithKm(plan), recentRuns(userId, today)]);
  const recentLongestKm = Math.max(0, ...runs.filter((r) => r.date >= addDays(today, -28)).map((r) => r.distanceM / 1000));
  const res = checkChanges(workouts, o.changes, planContext(plan, today), { recentLongestKm });
  const changed = res.errors.length > 0 || res.valid.length !== o.changes.length || !sameWarnings(res.warnings, o.warnings);
  if (changed && !(opts.confirm && o.status === "stale")) {
    await updateOptions(m.id, options.map((x) => (x.id === o.id ? { ...x, warnings: res.warnings, changes: res.valid, status: "stale" } : x)));
    return { ok: false as const, error: "changed" as const, warnings: res.warnings };
  }
  if (!res.valid.length) return { ok: false as const, error: "changed" as const, warnings: res.warnings };
  await savePlanChanges(userId, plan, res.valid, today);
  await updateOptions(m.id, options.map((x) => (x.id === o.id ? { ...x, status: "applied" } : x.status === "pending" || x.status === "stale" ? { ...x, status: "not_used" } : x)));
  return { ok: true as const };
}
