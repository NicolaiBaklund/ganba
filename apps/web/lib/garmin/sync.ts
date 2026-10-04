import "server-only";
import { addDays, localDate, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { GarminError, httpGarmin, type GarminActivityRaw, type GarminSource } from "./adapter";
import { loadTokens, markReauth, updateTokens } from "./accounts";
import { syncRecovery } from "@/lib/recovery/fetch";

export const FIRST_SYNC_DAYS = 90;
export const MAX_BACKFILL_DAYS = 30;
const LOCK_MS = 2 * 60_000;

export type SyncOutcome =
  | { status: "ok"; from: ISODate; to: ISODate; days: number; activities: number; nights: number | null; firstSync: boolean }
  | { status: "not_connected" | "reauth_required" | "busy" }
  | { status: "error"; error: string };

export interface SyncOptions {
  source?: GarminSource;
  /** Called after data is stored (plan reconciliation, workout push). */
  afterSync?: (userId: string, today: ISODate) => Promise<void>;
}

/** "2026-10-01 06:30:00" (GMT) → ISO timestamp. */
const gmtToIso = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toISOString();

const toActivityRow = (userId: string, a: GarminActivityRaw) => ({
  user_id: userId,
  garmin_activity_id: a.activityId,
  local_date: a.startTimeLocal.slice(0, 10),
  start_time: gmtToIso(a.startTimeGMT),
  type_key: a.activityType?.typeKey ?? "other",
  name: a.activityName ?? null,
  distance_m: a.distance ?? null,
  duration_s: a.duration ?? null,
  moving_s: a.movingDuration ?? null,
  avg_hr: a.averageHR != null ? Math.round(a.averageHR) : null,
  max_hr: a.maxHR != null ? Math.round(a.maxHR) : null,
  steps: a.steps ?? null,
  elevation_gain_m: a.elevationGain ?? null,
  garmin_kcal: a.calories != null ? Math.round(a.calories) : null,
  te_aerobic: a.aerobicTrainingEffect ?? null,
  te_anaerobic: a.anaerobicTrainingEffect ?? null,
  raw: a as unknown as Json,
});

/**
 * Pulls steps and activities from Garmin into the database for one user.
 * Range: from the day before the last synced day (max 30 days back) to today; first sync 90 days.
 * Safe to call often: a 2-minute lock prevents overlapping runs.
 */
export async function syncGarmin(userId: string, opts: SyncOptions = {}): Promise<SyncOutcome> {
  const db = createAdminSupabase();
  const source = opts.source ?? httpGarmin();

  const { data: acct } = await db
    .from("garmin_accounts")
    .select("status, last_synced_date, history_imported_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!acct) return { status: "not_connected" };
  if (acct.status !== "active") return { status: "reauth_required" };

  const lockedBefore = new Date(Date.now() - LOCK_MS).toISOString();
  const { data: locked } = await db
    .from("garmin_accounts")
    .update({ sync_started_at: new Date().toISOString() })
    .eq("user_id", userId)
    .or(`sync_started_at.is.null,sync_started_at.lt.${lockedBefore}`)
    .select("user_id");
  if (!locked?.length) return { status: "busy" };
  const release = () => db.from("garmin_accounts").update({ sync_started_at: null }).eq("user_id", userId);

  try {
    const tokens = await loadTokens(userId);
    if (!tokens) {
      await markReauth(userId);
      return { status: "reauth_required" };
    }
    const { data: profile } = await db.from("profiles").select("timezone").eq("user_id", userId).single();
    const today = localDate(profile?.timezone ?? "UTC");
    const firstSync = !acct.history_imported_at;
    const earliest = addDays(today, -(firstSync ? FIRST_SYNC_DAYS - 1 : MAX_BACKFILL_DAYS));
    const from = !firstSync && acct.last_synced_date && addDays(acct.last_synced_date, -1) > earliest ? addDays(acct.last_synced_date, -1) : earliest;

    const { data: known } = await db
      .from("activities")
      .select("garmin_activity_id")
      .eq("user_id", userId)
      .gte("local_date", addDays(from, -1))
      .not("splits", "is", null);
    const res = await source.fetch(
      tokens,
      from,
      today,
      (known ?? []).map((k) => k.garmin_activity_id),
    );
    if (res.tokens) await updateTokens(userId, res.tokens);

    const dayRows = res.days
      .filter((d) => d.calendarDate >= from && d.calendarDate <= today)
      .map((d) => ({
        user_id: userId,
        local_date: d.calendarDate,
        steps: d.totalSteps ?? null,
        raw: d as unknown as Json,
        final: d.calendarDate < today,
        synced_at: new Date().toISOString(),
      }));
    if (dayRows.length) {
      const { error } = await db.from("garmin_days").upsert(dayRows, { onConflict: "user_id,local_date" });
      if (error) throw error;
    }

    const actRows = res.activities.filter((a) => a.activityId && a.startTimeLocal).map((a) => toActivityRow(userId, a));
    if (actRows.length) {
      const { error } = await db.from("activities").upsert(actRows, { onConflict: "user_id,garmin_activity_id" });
      if (error) throw error;
    }
    for (const [id, d] of Object.entries(res.details)) {
      if (!d) continue;
      await db
        .from("activities")
        .update({ splits: d.splits as Json, hr_zones: d.hrZones as Json })
        .eq("user_id", userId)
        .eq("garmin_activity_id", Number(id));
    }

    // Activities deleted in Garmin within the synced range disappear here too.
    const ids = new Set(actRows.map((a) => a.garmin_activity_id));
    const { data: stored } = await db
      .from("activities")
      .select("id, garmin_activity_id")
      .eq("user_id", userId)
      .gte("local_date", from)
      .lte("local_date", today);
    const gone = (stored ?? []).filter((s) => !ids.has(s.garmin_activity_id)).map((s) => s.id);
    if (gone.length) await db.from("activities").delete().in("id", gone);

    await db
      .from("garmin_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_synced_date: today,
        ...(res.racePredictions?.time10K ? { race_predictions: res.racePredictions as unknown as Json, race_predictions_at: new Date().toISOString() } : {}),
        ...(firstSync ? { history_imported_at: new Date().toISOString() } : {}),
      })
      .eq("user_id", userId);

    // Sleep/HRV after the sync is recorded, so a slow fetch can never undo the import above. A failure here
    // never fails the sync (e.g. an adapter without fetch_recovery); only auth does. No history on the first sync.
    let nights: number | null = null;
    try {
      const r = await syncRecovery(userId, res.tokens ?? tokens, today, source, { backfill: !firstSync });
      if (r.tokens) await updateTokens(userId, r.tokens);
      nights = r.nights;
    } catch (e) {
      if (e instanceof GarminError && e.kind === "auth") throw e;
      console.error("garmin recovery fetch failed", userId, e instanceof Error ? e.message : e);
    }

    if (opts.afterSync) await opts.afterSync(userId, today);
    return { status: "ok", from, to: today, days: dayRows.length, activities: actRows.length, nights, firstSync };
  } catch (e) {
    if (e instanceof GarminError) {
      if (e.kind === "auth") {
        await markReauth(userId);
        return { status: "reauth_required" };
      }
      return { status: "error", error: e.kind };
    }
    console.error("garmin sync failed", userId, e instanceof Error ? e.message : e);
    return { status: "error", error: "internal" };
  } finally {
    await release();
  }
}
