import "server-only";
import { pacesFor, type Block, type ISODate, type QualityResult } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type QualityResultRow = QualityResult & { activityId: string };

/**
 * How the hard parts of completed quality sessions in [from, to] went: planned pace of the non-easy
 * run steps vs. the pace of laps clearly faster than easy (the reps), weighted by distance. Needs Garmin laps.
 */
export async function qualityResultsBetween(userId: string, from: ISODate, to: ISODate, planId?: string): Promise<QualityResultRow[]> {
  const db = createAdminSupabase();
  let query = db
    .from("planned_workouts")
    .select("date, blocks, activity_id, plan_id, plan:training_plans!inner(vdot)")
    .eq("user_id", userId)
    .eq("status", "done")
    .in("type", ["intervals", "threshold", "tempo"])
    .gte("date", from)
    .lte("date", to)
    .not("activity_id", "is", null);
  if (planId) query = query.eq("plan_id", planId);
  const { data: done } = await query;
  if (!done?.length) return [];
  const { data: acts } = await db.from("activities").select("id, splits").in("id", done.map((w) => w.activity_id!));
  const lapsOf = new Map(
    (acts ?? []).map((a) => [a.id, (a.splits as { lapDTOs?: { distance?: number | null; duration?: number | null }[] } | null)?.lapDTOs ?? []]),
  );

  const out: QualityResultRow[] = [];
  for (const w of done) {
    const easyFastest = pacesFor(Number((w.plan as { vdot: number | string }).vdot)).easy.min;
    const steps = (w.blocks as unknown as Block[]).flatMap((b) => (b.kind === "repeat" ? b.steps : [b]));
    const hard = steps.filter((s) => s.kind === "run" && s.target.kind === "pace" && s.target.zone !== "easy");
    if (!hard.length || hard[0]!.target.kind !== "pace") continue;
    const zone = hard[0]!.target.zone as QualityResult["zone"];
    if (zone !== "interval" && zone !== "threshold" && zone !== "marathon") continue;
    const planned = hard.reduce((s, x) => s + (x.target.kind === "pace" ? (x.target.minSecPerKm + x.target.maxSecPerKm) / 2 : 0), 0) / hard.length;
    const work = (lapsOf.get(w.activity_id!) ?? [])
      .map((l) => ({ m: Number(l.distance ?? 0), s: Number(l.duration ?? 0) }))
      .filter((l) => l.m >= 200 && l.s >= 45 && l.s / (l.m / 1000) < easyFastest);
    const m = work.reduce((a, l) => a + l.m, 0);
    if (m < 1000) continue;
    out.push({
      date: w.date,
      zone,
      plannedSecPerKm: planned,
      actualSecPerKm: work.reduce((a, l) => a + l.s, 0) / (m / 1000),
      activityId: w.activity_id!,
    });
  }
  return out;
}
