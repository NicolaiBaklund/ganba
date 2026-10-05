import "server-only";
import {
  dailyTarget,
  forecast,
  localDate,
  macrosFor,
  trainingKcalPerDay,
  trendAt,
  trendSeries,
  weeklyChange,
  type ISODate,
  type Macros,
  type TrendPoint,
} from "@loop/core";
import { getProfile, rowForDate, toActivityBaseline, toEnergyPlan, type DB } from "./current";
import { dayActivity, type DayActivityBreakdown } from "./activity";
import { getGarminStatus } from "@/lib/garmin/accounts";

export type MealType = "breakfast" | "lunch" | "dinner" | "evening" | "snack";

export interface FoodItemRow {
  id: string;
  name: string;
  grams: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  alcohol_g: number;
  confidence: "low" | "medium" | "high" | null;
}

export interface FoodEntryWithItems {
  id: string;
  logged_at: string;
  local_date: string;
  meal_type: MealType;
  source: "ai" | "quick";
  items: FoodItemRow[];
  photos: { id: string; storage_path: string }[];
}

export interface DaySnapshot {
  date: ISODate;
  today: ISODate;
  timezone: string;
  target: { kcal: number; floored: boolean };
  baseKcal: number;
  /** Fixed calorie target set by the user (no breakdown applies). */
  manualTarget: boolean;
  trainingKcal: number;
  /** Garmin users: where today's activity energy comes from. Null without Garmin. */
  activity: DayActivityBreakdown | null;
  garmin: { status: "active" | "reauth_required" } | null;
  macrosTarget: Macros;
  intake: Macros;
  entries: FoodEntryWithItems[];
  trend: TrendPoint[];
  latestTrendKg: number | null;
  weeklyChangeKg: number | null;
  goal: { targetWeightKg: number; rateKgPerWeek: number };
  forecast: { kgPerWeek: number | null; etaDate: ISODate | null };
}

export const sumItems = (items: Pick<FoodItemRow, "kcal" | "protein_g" | "carbs_g" | "fat_g">[]): Macros =>
  items.reduce(
    (t, i) => ({
      kcal: t.kcal + Number(i.kcal),
      proteinG: t.proteinG + Number(i.protein_g),
      carbsG: t.carbsG + Number(i.carbs_g),
      fatG: t.fatG + Number(i.fat_g),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

export async function getDaySnapshot(supabase: DB, userId: string, dateArg?: ISODate): Promise<DaySnapshot> {
  const profile = await getProfile(supabase, userId);
  const today = localDate(profile.timezone);
  const date = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : today;

  const [goalRow, planRow, baselineRow, entriesRes, weightsRes, garmin] = await Promise.all([
    rowForDate(supabase, "goals", userId, date),
    rowForDate(supabase, "energy_plans", userId, date),
    rowForDate(supabase, "activity_baselines", userId, date),
    supabase
      .from("food_entries")
      .select("id, logged_at, local_date, meal_type, source, items:food_items(id, name, grams, kcal, protein_g, carbs_g, fat_g, alcohol_g, confidence), photos(id, storage_path)")
      .eq("user_id", userId)
      .eq("local_date", date)
      .order("logged_at"),
    supabase.from("weight_entries").select("local_date, measured_at, weight_kg").eq("user_id", userId).order("local_date"),
    getGarminStatus(userId),
  ]);
  if (entriesRes.error) throw entriesRes.error;
  if (weightsRes.error) throw weightsRes.error;
  if (!goalRow || !planRow || !baselineRow) throw new Error("missing_onboarding_rows");

  const weights = weightsRes.data.map((w) => ({
    localDate: w.local_date,
    measuredAt: w.measured_at,
    weightKg: Number(w.weight_kg),
  }));
  const trend = trendSeries(weights);
  const latestTrendKg = trendAt(trend, date);
  const weightKg = latestTrendKg ?? weights.at(-1)?.weightKg ?? 70;

  const plan = toEnergyPlan(planRow);
  const goal = { targetWeightKg: Number(goalRow.target_weight_kg), rateKgPerWeek: Number(goalRow.rate_kg_per_week) };
  const activity = garmin ? await dayActivity(supabase, userId, date, today, weightKg) : null;
  const training = activity ? activity.total : trainingKcalPerDay(toActivityBaseline(baselineRow), weightKg);
  const target = dailyTarget({ plan, trainingKcal: training, rateKgPerWeek: goal.rateKgPerWeek, sex: profile.sex });

  const entries = entriesRes.data as unknown as FoodEntryWithItems[];

  return {
    date,
    today,
    timezone: profile.timezone,
    target,
    baseKcal: plan.baseExpenditureKcal,
    manualTarget: plan.manualKcalOverride != null,
    trainingKcal: Math.round(training),
    activity,
    garmin: garmin ? { status: garmin.status } : null,
    macrosTarget: macrosFor(target.kcal, weightKg, plan),
    intake: sumItems(entries.flatMap((e) => e.items)),
    entries,
    trend,
    latestTrendKg,
    weeklyChangeKg: weeklyChange(trend, date),
    goal,
    forecast: forecast(trend, date, goal.targetWeightKg),
  };
}
