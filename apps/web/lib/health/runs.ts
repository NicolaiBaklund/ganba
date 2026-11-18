import "server-only";
import { addDays, EASY_PACE, RACE_KM, type ISODate, type RaceDistance } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isEasyRun, QUALITY_TYPES } from "@/lib/recovery/load";

const db = () => createAdminSupabase();

export type ActRow = {
  id: string;
  local_date: string;
  start_time: string;
  type_key: string;
  distance_m: unknown;
  duration_s: unknown;
  moving_s: unknown;
  avg_hr: unknown;
  te_anaerobic: unknown;
};
export const ACT_COLS = "id, local_date, start_time, type_key, distance_m, duration_s, moving_s, avg_hr, te_anaerobic";
export const num = (v: unknown) => Number(v ?? 0);
export const movingOf = (a: Pick<ActRow, "moving_s" | "duration_s">) => num(a.moving_s) || num(a.duration_s);

export async function timezone(userId: string): Promise<string> {
  const { data } = await db().from("profiles").select("timezone").eq("user_id", userId).single();
  return data?.timezone ?? "UTC";
}

/** Activity ids of done quality sessions (they are never easy runs). */
export async function qualityIds(userId: string, from: ISODate): Promise<Set<string>> {
  const { data } = await db().from("planned_workouts").select("type, activity_id").eq("user_id", userId).eq("status", "done").gte("date", from);
  return new Set((data ?? []).filter((p) => QUALITY_TYPES.has(p.type) && p.activity_id).map((p) => p.activity_id!));
}

/** The usual heart rate on easy runs: the median of the last 42 days, with at least 5 runs (spec §5.4). */
export async function normalEasyHr(userId: string, today: ISODate): Promise<number | null> {
  const from = addDays(today, -EASY_PACE.windowDays);
  const [{ data: acts }, quality] = await Promise.all([
    db().from("activities").select(ACT_COLS).eq("user_id", userId).gt("local_date", from).lte("local_date", today),
    qualityIds(userId, from),
  ]);
  const hrs = (acts ?? [])
    .filter((a) => isEasyRun(a, quality))
    .map((a) => num(a.avg_hr))
    .sort((a, b) => a - b);
  if (hrs.length < EASY_PACE.minRuns) return null;
  const m = Math.floor(hrs.length / 2);
  return hrs.length % 2 ? hrs[m]! : (hrs[m - 1]! + hrs[m]!) / 2;
}

export const PRED_COL: Record<RaceDistance, "time_5k_s" | "time_10k_s" | "time_half_s" | "time_marathon_s"> = { "5k": "time_5k_s", "10k": "time_10k_s", half: "time_half_s", marathon: "time_marathon_s" };
/** A race distance within ±5 % of some km, or null. */
export const distanceFor = (km: number): RaceDistance | null =>
  (Object.keys(RACE_KM) as RaceDistance[]).find((d) => Math.abs(km - RACE_KM[d]) <= RACE_KM[d] * 0.05) ?? null;

/** Garmin's predicted time for a distance on a day. */
export async function predictionOn(userId: string, date: ISODate, km: number): Promise<number | null> {
  const d = distanceFor(km);
  if (!d) return null;
  const { data } = await db().from("prediction_days").select(PRED_COL[d]).eq("user_id", userId).lte("local_date", date).gte("local_date", addDays(date, -3)).order("local_date", { ascending: false }).limit(1);
  const v = (data?.[0] as Record<string, unknown> | undefined)?.[PRED_COL[d]];
  return typeof v === "number" && v > 0 ? v : null;
}

