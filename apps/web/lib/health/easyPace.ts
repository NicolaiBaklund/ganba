import "server-only";
import { addDays, EASY_PACE, easyPaceAtHr, type EasyPaceAtHr, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isEasyRun, QUALITY_TYPES } from "@/lib/recovery/load";

/** Easy pace at the usual easy heart rate for Progress, from the easy runs of the last 12 weeks. */
export async function loadEasyPace(userId: string, today: ISODate): Promise<EasyPaceAtHr | null> {
  const from = addDays(today, -2 * EASY_PACE.windowDays);
  const db = createAdminSupabase();
  const [{ data: acts }, { data: planned }] = await Promise.all([
    db.from("activities").select("id, local_date, type_key, distance_m, duration_s, moving_s, avg_hr, te_anaerobic").eq("user_id", userId).gt("local_date", from).lte("local_date", today),
    db.from("planned_workouts").select("type, activity_id").eq("user_id", userId).eq("status", "done").gt("date", from),
  ]);
  const quality = new Set((planned ?? []).filter((p) => QUALITY_TYPES.has(p.type) && p.activity_id).map((p) => p.activity_id!));
  const runs = (acts ?? [])
    .filter((a) => isEasyRun(a, quality))
    .map((a) => {
      const km = Number(a.distance_m) / 1000;
      return { date: a.local_date, km, secPerKm: Number(a.moving_s ?? a.duration_s) / km, avgHr: Number(a.avg_hr) };
    });
  return easyPaceAtHr(runs, today);
}
