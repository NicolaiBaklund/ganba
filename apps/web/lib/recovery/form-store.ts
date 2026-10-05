import "server-only";
import { formSeries, HARD_TYPES, type FormFinding, type ISODate, type RecoveryDayInput, type RecoveryResult } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";

/** Verified run-form findings from the engine: the learned parts of Form (spec §3.3). */
export function formFindings(results: readonly Pick<RecoveryResult, "kind" | "outcome" | "factor" | "lag" | "effectSd" | "groups">[]): FormFinding[] {
  return results
    .filter((r) => r.kind === "finding" && r.outcome === "runForm" && r.effectSd != null)
    .map((r) => ({ factor: r.factor, lag: r.lag, effectSd: r.effectSd!, highBound: r.groups.high.bound, lowBound: r.groups.low.bound }));
}

/** Form for every day in the window, stored per day (spec §4). Days without a night get no row. */
export async function saveForm(userId: string, days: readonly RecoveryDayInput[], results: readonly RecoveryResult[], from: ISODate, to: ISODate) {
  const db = createAdminSupabase();
  const { data: planned, error: pErr } = await db
    .from("planned_workouts")
    .select("date, type")
    .eq("user_id", userId)
    .gte("date", from)
    .lte("date", to)
    .neq("status", "removed")
    .in("type", [...HARD_TYPES]);
  if (pErr) throw pErr;
  const hard = new Set((planned ?? []).map((p) => p.date));
  const findings = formFindings(results);
  const series = formSeries(days, from, to, (date) => ({ findings, hardPlanned: hard.has(date) }));
  const rows = [...series.values()].map((r) => ({ user_id: userId, local_date: r.date, score: r.score, band: r.band, parts: r.parts as unknown as Json }));
  if (rows.length) {
    const { error } = await db.from("form_days").upsert(rows, { onConflict: "user_id,local_date" });
    if (error) throw error;
  }
  // A night that disappeared (rare) leaves no stale number behind.
  const keep = rows.map((r) => r.local_date);
  let del = db.from("form_days").delete().eq("user_id", userId).gte("local_date", from).lte("local_date", to);
  if (keep.length) del = del.not("local_date", "in", `(${keep.join(",")})`);
  const { error: dErr } = await del;
  if (dErr) throw dErr;
}
