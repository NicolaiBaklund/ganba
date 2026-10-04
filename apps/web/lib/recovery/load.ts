import "server-only";
import {
  activityKcal,
  addDays,
  dailyTarget,
  isRun,
  localDate,
  localHour,
  trendAt,
  trendSeries,
  type ActivityLike,
  type ISODate,
  type RecoveryDayInput,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { toEnergyPlan } from "@/lib/db/current";
import { qualityResultsBetween } from "@/lib/training/quality";

/** 90-day window + 30 days so every day in it has a normal to compare with. */
export const RECOVERY_LOAD_DAYS = 120;
const FALLBACK_DAYS = 14;
export const MIN_MEALS = 2;
export const MIN_SHARE_OF_TARGET = 0.5;
const QUALITY_TYPES = new Set(["intervals", "threshold", "tempo", "race"]);
export const HARD_TE = { aerobic: 3.5, anaerobic: 2.0 } as const;
const LONG_RUN_S = 90 * 60;
const EASY_MIN_S = 20 * 60;
const INDOOR = /treadmill|indoor|virtual/;

type DayData = { steps: number | null; activities: ActivityLike[] };

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const num = (v: unknown) => Number(v ?? 0);

/** Latest versioned row on or before `date`, else the earliest (same rule as rowForDate). */
function versionAt<T extends { valid_from: string }>(rows: readonly T[], date: ISODate): T | undefined {
  let pick: T | undefined;
  for (const r of rows) if (r.valid_from <= date) pick = r;
  return pick ?? rows[0];
}

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Everything the engine needs per day, from what the app already stores (spec §4.4–§4.5). */
export async function loadRecoveryDays(userId: string, today: ISODate): Promise<RecoveryDayInput[]> {
  const db = createAdminSupabase();
  const from = addDays(today, -(RECOVERY_LOAD_DAYS - 1));
  const early = addDays(from, -FALLBACK_DAYS);
  const [profile, nights, entries, weights, plans, goals, gdays, acts, planned, quality] = await Promise.all([
    db.from("profiles").select("sex, timezone").eq("user_id", userId).single().then(must),
    db.from("recovery_days").select("local_date, sleep_score, hrv_avg, resting_hr").eq("user_id", userId).gte("local_date", from).then(must),
    db
      .from("food_entries")
      .select("local_date, logged_at, items:food_items(kcal, protein_g, carbs_g, alcohol_g)")
      .eq("user_id", userId)
      .gte("local_date", from)
      .lt("local_date", today)
      .then(must),
    db.from("weight_entries").select("local_date, measured_at, weight_kg").eq("user_id", userId).order("local_date").then(must),
    db.from("energy_plans").select("*").eq("user_id", userId).order("valid_from").order("created_at").then(must),
    db.from("goals").select("*").eq("user_id", userId).order("valid_from").order("created_at").then(must),
    db.from("garmin_days").select("local_date, steps").eq("user_id", userId).gte("local_date", early).then(must),
    db
      .from("activities")
      .select("id, local_date, type_key, distance_m, duration_s, moving_s, avg_hr, steps, te_aerobic, te_anaerobic")
      .eq("user_id", userId)
      .gte("local_date", early)
      .then(must),
    db.from("planned_workouts").select("date, type, activity_id").eq("user_id", userId).eq("status", "done").gte("date", from).then(must),
    qualityResultsBetween(userId, from, today),
  ]);

  const tz = profile.timezone;
  const trend = trendSeries(weights.map((w) => ({ localDate: w.local_date, measuredAt: w.measured_at, weightKg: Number(w.weight_kg) })));
  const nightBy = new Map(nights.map((n) => [n.local_date, n]));

  const dayData = new Map<ISODate, DayData>();
  for (const g of gdays) dayData.set(g.local_date, { steps: g.steps, activities: [] });
  const actsBy = new Map<ISODate, typeof acts>();
  for (const a of acts) {
    const d = dayData.get(a.local_date) ?? { steps: null, activities: [] };
    d.activities.push({
      typeKey: a.type_key,
      distanceM: a.distance_m == null ? null : Number(a.distance_m),
      durationS: a.duration_s == null ? null : Number(a.duration_s),
      steps: a.steps,
    });
    dayData.set(a.local_date, d);
    actsBy.set(a.local_date, [...(actsBy.get(a.local_date) ?? []), a]);
  }
  const hasData = (d: DayData | undefined): d is DayData => !!d && ((d.steps ?? 0) > 0 || d.activities.length > 0);
  /** Same activity energy as the daily target, incl. the 14-day average for days without watch data. */
  const activityOn = (date: ISODate, kg: number): number => {
    const d = dayData.get(date);
    if (hasData(d)) return activityKcal(d, kg).total;
    const prev: number[] = [];
    for (let i = 1; i <= FALLBACK_DAYS; i++) {
      const p = dayData.get(addDays(date, -i));
      if (hasData(p)) prev.push(activityKcal(p, kg).total);
    }
    return prev.length ? avg(prev) : 0;
  };

  const foodBy = new Map<ISODate, typeof entries>();
  for (const e of entries) foodBy.set(e.local_date, [...(foodBy.get(e.local_date) ?? []), e]);
  const plannedBy = new Map<ISODate, string[]>();
  for (const p of planned) plannedBy.set(p.date, [...(plannedBy.get(p.date) ?? []), p.type]);
  const qualityIds = new Set(planned.filter((p) => QUALITY_TYPES.has(p.type) && p.activity_id).map((p) => p.activity_id!));
  const qualityBy = new Map<ISODate, number[]>();
  for (const q of quality) qualityBy.set(q.date, [...(qualityBy.get(q.date) ?? []), q.actualSecPerKm / q.plannedSecPerKm]);

  const foodOn = (date: ISODate): RecoveryDayInput["food"] => {
    const es = foodBy.get(date) ?? [];
    if (es.length < MIN_MEALS) return null;
    const kg = trendAt(trend, date) ?? trend[0]?.trendKg ?? null;
    const plan = versionAt(plans, date);
    const goal = versionAt(goals, date);
    if (kg == null || !plan || !goal) return null;
    const items = es.flatMap((e) => e.items);
    const kcal = items.reduce((s, i) => s + num(i.kcal), 0);
    const activity = activityOn(date, kg);
    const target = dailyTarget({ plan: toEnergyPlan(plan), trainingKcal: activity, rateKgPerWeek: Number(goal.rate_kg_per_week), sex: profile.sex }).kcal;
    if (kcal < MIN_SHARE_OF_TARGET * target) return null; // half-logged day
    const timeKnown = es.every((e) => localDate(tz, new Date(e.logged_at)) === date);
    return {
      deficitKcal: Number(plan.base_expenditure_kcal) + activity - kcal,
      carbsPerKg: items.reduce((s, i) => s + num(i.carbs_g), 0) / kg,
      proteinPerKg: items.reduce((s, i) => s + num(i.protein_g), 0) / kg,
      alcoholG: items.reduce((s, i) => s + num(i.alcohol_g), 0),
      lateKcal: timeKnown
        ? es.filter((e) => localHour(tz, new Date(e.logged_at)) >= 20).reduce((s, e) => s + e.items.reduce((t, i) => t + num(i.kcal), 0), 0)
        : null,
    };
  };

  const out: RecoveryDayInput[] = [];
  for (let date = from; date <= today; date = addDays(date, 1)) {
    const n = nightBy.get(date);
    const dayActs = actsBy.get(date) ?? [];
    const types = plannedBy.get(date) ?? [];
    const easy = dayActs
      .filter(
        (a) =>
          isRun(a.type_key) &&
          !INDOOR.test(a.type_key) &&
          num(a.duration_s) >= EASY_MIN_S &&
          num(a.avg_hr) > 0 &&
          num(a.distance_m) > 0 &&
          !qualityIds.has(a.id) &&
          num(a.te_anaerobic) < HARD_TE.anaerobic,
      )
      .map((a) => num(a.distance_m) / (num(a.moving_s ?? a.duration_s) / 60) / num(a.avg_hr));
    const ratios = qualityBy.get(date) ?? [];
    out.push({
      date,
      sleepScore: n?.sleep_score ?? null,
      hrv: n?.hrv_avg ?? null,
      restingHr: n?.resting_hr ?? null,
      food: date < today ? foodOn(date) : null,
      hard: types.some((t) => QUALITY_TYPES.has(t)) || dayActs.some((a) => num(a.te_aerobic) >= HARD_TE.aerobic || num(a.te_anaerobic) >= HARD_TE.anaerobic),
      long: types.includes("long") || dayActs.some((a) => isRun(a.type_key) && num(a.duration_s) >= LONG_RUN_S),
      steps: dayData.get(date)?.steps ?? null,
      easyMetersPerBeat: easy.length ? avg(easy) : null,
      qualityPaceRatio: ratios.length ? avg(ratios) : null,
    });
  }
  return out;
}
