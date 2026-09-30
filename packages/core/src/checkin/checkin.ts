import { addDays, daysBetween, type ISODate } from "../dates";
import { KCAL_PER_KG } from "../energy/constants";
import { trendAt, trendSeries, type WeightPoint } from "../trend/trend";

export const CHECKIN_WINDOW_DAYS = 21;
export const MAX_BASE_CHANGE = 150;

export interface CheckinInput {
  weekStart: ISODate;
  firstLogDate: ISODate | null;
  dailyIntake: { date: ISODate; kcal: number }[];
  weights: WeightPoint[];
  avgTrainingKcal: number;
  currentBaseKcal: number;
}

export type InsufficientReason = "too_early" | "few_food_days" | "few_food_days_last_week" | "few_weigh_ins";

export type CheckinResult =
  | { status: "insufficient_data"; reason: InsufficientReason; windowStart: ISODate; windowEnd: ISODate; loggedDays: number }
  | {
      status: "pending";
      windowStart: ISODate;
      windowEnd: ISODate;
      avgIntakeKcal: number;
      trendChangeKg: number;
      loggedDays: number;
      avgTrainingKcal: number;
      computedBaseKcal: number;
      proposedBaseKcal: number;
    };

/**
 * Base expenditure (without training) from what was actually eaten and how the
 * trend weight actually moved. Never uses the previous target.
 */
export function computeCheckin(i: CheckinInput): CheckinResult {
  const windowEnd = addDays(i.weekStart, -1);
  const windowStart = addDays(windowEnd, -(CHECKIN_WINDOW_DAYS - 1));
  const inWindow = (d: ISODate) => d >= windowStart && d <= windowEnd;

  const intake = i.dailyIntake.filter((d) => inWindow(d.date) && d.kcal > 0);
  const loggedDays = intake.length;
  const lastWeek = intake.filter((d) => d.date >= addDays(windowEnd, -6)).length;
  const weighDays = new Set(i.weights.filter((w) => inWindow(w.localDate)).map((w) => w.localDate));

  const insufficient = (reason: InsufficientReason): CheckinResult => ({
    status: "insufficient_data",
    reason,
    windowStart,
    windowEnd,
    loggedDays,
  });

  if (!i.firstLogDate || daysBetween(i.firstLogDate, windowEnd) < 13) return insufficient("too_early");
  if (loggedDays < 10) return insufficient("few_food_days");
  if (lastWeek < 5) return insufficient("few_food_days_last_week");
  if (weighDays.size < 4) return insufficient("few_weigh_ins");

  const series = trendSeries(i.weights);
  const firstInside = series.find((p) => inWindow(p.date))!;
  const trendAtStart = trendAt(series, windowStart);
  const startTrend = trendAtStart ?? firstInside.trendKg;
  const startDate = trendAtStart != null ? windowStart : firstInside.date;
  const endTrend = trendAt(series, windowEnd)!;
  const spanDays = Math.max(1, daysBetween(startDate, windowEnd));

  const avgIntakeKcal = intake.reduce((s, d) => s + d.kcal, 0) / loggedDays;
  const trendChangeKg = endTrend - startTrend;
  const computed = avgIntakeKcal - (trendChangeKg * KCAL_PER_KG) / spanDays - i.avgTrainingKcal;
  const proposed = Math.min(
    i.currentBaseKcal + MAX_BASE_CHANGE,
    Math.max(i.currentBaseKcal - MAX_BASE_CHANGE, computed),
  );

  return {
    status: "pending",
    windowStart,
    windowEnd,
    avgIntakeKcal: Math.round(avgIntakeKcal),
    trendChangeKg: Math.round(trendChangeKg * 100) / 100,
    loggedDays,
    avgTrainingKcal: Math.round(i.avgTrainingKcal),
    computedBaseKcal: Math.round(computed),
    proposedBaseKcal: Math.round(proposed),
  };
}
