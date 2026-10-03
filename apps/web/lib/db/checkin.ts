import "server-only";
import {
  addDays,
  computeCheckin,
  localDate,
  trainingKcalPerDay,
  trendAt,
  trendSeries,
  weekStartOn,
} from "@loop/core";
import { currentRow, getProfile, toActivityBaseline, type DB } from "./current";
import { averageActivityKcal } from "./activity";
import { getGarminStatus } from "@/lib/garmin/accounts";
import type { Database } from "./types";

export type CheckinRow = Database["public"]["Tables"]["weekly_checkins"]["Row"];

/**
 * Returns this week's check-in, creating it on first call (lazy, no cron).
 * Unique (user_id, week_start) makes concurrent calls safe.
 */
export async function ensureWeeklyCheckin(supabase: DB, userId: string): Promise<CheckinRow | null> {
  const profile = await getProfile(supabase, userId);
  const today = localDate(profile.timezone);
  const weekStart = weekStartOn(today, profile.checkin_weekday);
  if (!profile.onboarded_at || localDate(profile.timezone, new Date(profile.onboarded_at)) >= weekStart) return null;

  const existing = await supabase
    .from("weekly_checkins")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing.data) return existing.data;

  const windowEnd = addDays(weekStart, -1);
  const [intakeRes, weightsRes, firstRes, plan, baseline] = await Promise.all([
    supabase
      .from("daily_intake")
      .select("local_date, kcal")
      .eq("user_id", userId)
      .gte("local_date", addDays(weekStart, -21))
      .lte("local_date", windowEnd),
    supabase
      .from("weight_entries")
      .select("local_date, measured_at, weight_kg")
      .eq("user_id", userId)
      .gte("local_date", addDays(weekStart, -60))
      .lte("local_date", windowEnd),
    supabase.from("food_entries").select("local_date").eq("user_id", userId).order("local_date").limit(1).maybeSingle(),
    currentRow(supabase, "energy_plans", userId, windowEnd),
    currentRow(supabase, "activity_baselines", userId, windowEnd),
  ]);
  if (!plan || !baseline) return null;

  const weights = (weightsRes.data ?? []).map((w) => ({
    localDate: w.local_date,
    measuredAt: w.measured_at,
    weightKg: Number(w.weight_kg),
  }));
  const kg = trendAt(trendSeries(weights), windowEnd) ?? weights.at(-1)?.weightKg ?? 70;
  // Garmin users: actual activity over the window (days without watch data count as the window average).
  const garminAvg = (await getGarminStatus(userId))
    ? await averageActivityKcal(supabase, userId, addDays(weekStart, -21), windowEnd, kg)
    : null;

  const result = computeCheckin({
    weekStart,
    firstLogDate: firstRes.data?.local_date ?? null,
    dailyIntake: (intakeRes.data ?? []).map((d) => ({ date: d.local_date!, kcal: Number(d.kcal ?? 0) })),
    weights,
    avgTrainingKcal: garminAvg ?? trainingKcalPerDay(toActivityBaseline(baseline), kg),
    currentBaseKcal: Number(plan.base_expenditure_kcal),
  });

  const row =
    result.status === "pending"
      ? {
          window_start: result.windowStart,
          window_end: result.windowEnd,
          avg_intake_kcal: result.avgIntakeKcal,
          trend_change_kg: result.trendChangeKg,
          logged_days: result.loggedDays,
          avg_training_kcal: result.avgTrainingKcal,
          computed_base_kcal: result.computedBaseKcal,
          proposed_base_kcal: result.proposedBaseKcal,
        }
      : { window_start: result.windowStart, window_end: result.windowEnd, logged_days: result.loggedDays, reason: result.reason };

  const inserted = await supabase
    .from("weekly_checkins")
    .insert({ user_id: userId, week_start: weekStart, status: result.status, ...row })
    .select("*")
    .single();
  if (inserted.data) return inserted.data;

  // Lost a race with a concurrent request: read the winner's row.
  const again = await supabase
    .from("weekly_checkins")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  return again.data ?? null;
}
