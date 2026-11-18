import "server-only";
import { isRun, lapsFrom, racePaceAccount, type Block, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { activePlan, planWorkouts } from "@/lib/training/service";

export type RacePaceAccount = { secPerKm: number; doneKm: number; plannedKm: number };

/**
 * Race pace run against race pace planned before race day (spec 2026-11-18 §9). Garmin users with a running plan that
 * has a race day ahead and race pace planned before it; otherwise null.
 */
export async function loadRacePace(userId: string, today: ISODate): Promise<RacePaceAccount | null> {
  const [plan, garmin] = await Promise.all([activePlan(userId), getGarminStatus(userId)]);
  if (!plan || !garmin || plan.sport === "ride") return null;
  const workouts = (await planWorkouts(plan.id)).filter((w) => w.sport !== "ride");
  if (!workouts.some((w) => w.type === "race" && w.status !== "removed" && w.date >= today)) return null;
  const { data: acts } = await createAdminSupabase()
    .from("activities")
    .select("local_date, type_key, splits")
    .eq("user_id", userId)
    // Runs only (all but virtual runs end in "running"): rides, strength and walks never carry race pace.
    .ilike("type_key", "%running")
    .gte("local_date", plan.start_date)
    .lte("local_date", today);
  return racePaceAccount({
    workouts: workouts.map((w) => ({ date: w.date, type: w.type, status: w.status, blocks: w.blocks as unknown as Block[] })),
    runs: (acts ?? []).filter((a) => isRun(a.type_key)).map((a) => ({ date: a.local_date, laps: lapsFrom(a.splits) })),
    today,
    planStart: plan.start_date,
  });
}
