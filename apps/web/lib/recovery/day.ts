import "server-only";
import { addDays, localDate, localHour, nightSeries, recoveryCurve, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getDaySnapshot, sumItems } from "@/lib/db/today";
import { loadRecoveryDays } from "./load";

export interface RecoveryDay {
  date: ISODate;
  night: {
    sleepS: number | null;
    deepS: number | null;
    lightS: number | null;
    remS: number | null;
    awakeS: number | null;
    sleepScore: number | null;
    hrv: number | null;
    restingHr: number | null;
    hrvLow: number | null;
    hrvHigh: number | null;
  } | null;
  normal: Record<"sleepScore" | "hrv" | "restingHr", { low: number | null; high: number | null }>;
  before: {
    date: ISODate;
    kcal: number;
    targetKcal: number;
    carbsG: number;
    proteinG: number;
    alcoholG: number;
    /** Null when a meal was logged on another day (time unknown). */
    lateKcal: number | null;
    meals: number;
    training: { typeKey: string; km: number | null; minutes: number }[];
  };
}

/** The morning of `date` (the night before) and the day before it: what the day sheet shows. */
export async function loadRecoveryDay(userId: string, date: ISODate): Promise<RecoveryDay> {
  const db = createAdminSupabase();
  const prev = addDays(date, -1);
  const [{ data: n }, days, snap, { data: acts }] = await Promise.all([
    db.from("recovery_days").select("*").eq("user_id", userId).eq("local_date", date).maybeSingle(),
    loadRecoveryDays(userId, date, 30), // the normal band needs the 28 nights before
    getDaySnapshot(db, userId, prev),
    db.from("activities").select("type_key, distance_m, duration_s").eq("user_id", userId).eq("local_date", prev),
  ]);
  const band = (key: "sleepScore" | "hrv" | "restingHr") => {
    const p = recoveryCurve(nightSeries(days, key), date, date).at(0);
    return { low: p?.low ?? null, high: p?.high ?? null };
  };
  const tz = snap.timezone;
  const items = snap.entries.flatMap((e) => e.items);
  const timeKnown = snap.entries.every((e) => localDate(tz, new Date(e.logged_at)) === prev);
  return {
    date,
    night: n
      ? {
          sleepS: n.sleep_s,
          deepS: n.deep_s,
          lightS: n.light_s,
          remS: n.rem_s,
          awakeS: n.awake_s,
          sleepScore: n.sleep_score,
          hrv: n.hrv_avg,
          restingHr: n.resting_hr,
          hrvLow: n.hrv_baseline_low,
          hrvHigh: n.hrv_baseline_high,
        }
      : null,
    normal: { sleepScore: band("sleepScore"), hrv: band("hrv"), restingHr: band("restingHr") },
    before: {
      date: prev,
      kcal: Math.round(snap.intake.kcal),
      targetKcal: snap.target.kcal,
      carbsG: Math.round(snap.intake.carbsG),
      proteinG: Math.round(snap.intake.proteinG),
      alcoholG: Math.round(items.reduce((s, i) => s + Number(i.alcohol_g ?? 0), 0)),
      lateKcal: timeKnown
        ? Math.round(sumItems(snap.entries.filter((e) => localHour(tz, new Date(e.logged_at)) >= 20).flatMap((e) => e.items)).kcal)
        : null,
      meals: snap.entries.length,
      training: (acts ?? []).map((a) => ({
        typeKey: a.type_key,
        km: a.distance_m == null ? null : Math.round(Number(a.distance_m) / 100) / 10,
        minutes: Math.round(Number(a.duration_s ?? 0) / 60),
      })),
    },
  };
}
