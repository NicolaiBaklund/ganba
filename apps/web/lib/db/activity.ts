import "server-only";
import { activityKcal, addDays, isRun, runKcal, type ActivityLike, type ISODate } from "@loop/core";
import type { DB } from "./current";

export const FALLBACK_WINDOW_DAYS = 14;

export interface DayActivityBreakdown {
  /** "garmin": synced data; "average": no watch data that day, 14-day average used; "planned": future day. */
  source: "garmin" | "average" | "planned";
  steps: number | null;
  walkingKcal: number;
  runKcal: number;
  otherKcal: number;
  /** Planned run not done yet (today/future). */
  plannedRunKcal: number;
  plannedRun: { title: string; km: number } | null;
  total: number;
}

interface DayData {
  steps: number | null;
  activities: ActivityLike[];
}

async function loadDays(db: DB, userId: string, from: ISODate, to: ISODate): Promise<Map<ISODate, DayData>> {
  const [days, acts] = await Promise.all([
    db.from("garmin_days").select("local_date, steps").eq("user_id", userId).gte("local_date", from).lte("local_date", to),
    db.from("activities").select("local_date, type_key, distance_m, duration_s, steps").eq("user_id", userId).gte("local_date", from).lte("local_date", to),
  ]);
  const map = new Map<ISODate, DayData>();
  for (const d of days.data ?? []) map.set(d.local_date, { steps: d.steps, activities: [] });
  for (const a of acts.data ?? []) {
    const day = map.get(a.local_date) ?? { steps: null, activities: [] };
    day.activities.push({ typeKey: a.type_key, distanceM: a.distance_m == null ? null : Number(a.distance_m), durationS: a.duration_s == null ? null : Number(a.duration_s), steps: a.steps });
    map.set(a.local_date, day);
  }
  return map;
}

/** A day "has data" when the watch logged steps or any activity. */
const hasData = (d: DayData | undefined): d is DayData => !!d && ((d.steps ?? 0) > 0 || d.activities.length > 0);

/** Mean activity kcal over days with data in [from, to]; null when there are none. */
export async function averageActivityKcal(db: DB, userId: string, from: ISODate, to: ISODate, kg: number): Promise<number | null> {
  const map = await loadDays(db, userId, from, to);
  const totals = [...map.values()].filter(hasData).map((d) => activityKcal(d, kg).total);
  return totals.length ? totals.reduce((s, t) => s + t, 0) / totals.length : null;
}

/**
 * Activity energy for one day (Garmin users). Today is built up as data arrives, plus a
 * planned run that has not been done yet. Past days without watch data use the 14-day average.
 */
export async function dayActivity(db: DB, userId: string, date: ISODate, today: ISODate, kg: number): Promise<DayActivityBreakdown> {
  const [map, plannedRes] = await Promise.all([
    loadDays(db, userId, date, date),
    db
      .from("planned_workouts")
      .select("title, planned_km, status, plan:training_plans!inner(status)")
      .eq("user_id", userId)
      .eq("date", date)
      .eq("status", "planned")
      .eq("plan.status", "active"),
  ]);
  const day = map.get(date);
  const ranToday = !!day?.activities.some((a) => isRun(a.typeKey));
  const planned = date >= today && !ranToday ? (plannedRes.data ?? [])[0] : undefined;
  const plannedRun = planned ? { title: planned.title, km: Number(planned.planned_km) } : null;
  const plannedRunKcal = plannedRun ? Math.round(runKcal(plannedRun.km, kg)) : 0;

  if (date > today) {
    return { source: "planned", steps: null, walkingKcal: 0, runKcal: 0, otherKcal: 0, plannedRunKcal, plannedRun, total: plannedRunKcal };
  }
  if (!hasData(day) && date < today) {
    const avg = (await averageActivityKcal(db, userId, addDays(date, -FALLBACK_WINDOW_DAYS), addDays(date, -1), kg)) ?? 0;
    return { source: "average", steps: null, walkingKcal: 0, runKcal: 0, otherKcal: 0, plannedRunKcal: 0, plannedRun: null, total: Math.round(avg) };
  }
  const k = activityKcal(day ?? { steps: null, activities: [] }, kg);
  return {
    source: "garmin",
    steps: day?.steps ?? null,
    walkingKcal: k.walkingKcal,
    runKcal: k.runKcal,
    otherKcal: k.otherKcal,
    plannedRunKcal,
    plannedRun,
    total: k.total + plannedRunKcal,
  };
}
