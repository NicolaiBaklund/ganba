import "server-only";
import { addDays, daysBetween, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { GarminSource } from "@/lib/garmin/adapter";
import { toRecoveryRow } from "./parse";

export const RECOVERY_HISTORY_DAYS = 90;
export const BACKFILL_PER_SYNC = 10;
const RECENT_DAYS = 3;
const MAX_RECENT_DAYS = 10;

/**
 * Mornings to fetch this sync: the recent ones (at least 3, back to the day before the last stored
 * night so a pause leaves no gap, at most 10) plus the next 10 older ones until 90 days are covered.
 * `cursor` = oldest morning fetched so far (stored as recovery_backfilled_until).
 */
export function recoveryDates(today: ISODate, lastNight: ISODate | null, backfilledUntil: ISODate | null): { dates: ISODate[]; cursor: ISODate } {
  const minRecent = addDays(today, -(RECENT_DAYS - 1));
  const maxRecent = addDays(today, -(MAX_RECENT_DAYS - 1));
  const gapFrom = lastNight ? addDays(lastNight, -1) : minRecent;
  const recentFrom = gapFrom < minRecent ? (gapFrom > maxRecent ? gapFrom : maxRecent) : minRecent;
  const recent: ISODate[] = [];
  for (let d = today; d >= recentFrom; d = addDays(d, -1)) recent.push(d);

  const oldest = addDays(today, -(RECOVERY_HISTORY_DAYS - 1));
  let cursor = backfilledUntil && backfilledUntil < recentFrom ? backfilledUntil : recentFrom;
  const batch: ISODate[] = [];
  for (let d = addDays(cursor, -1); d >= oldest && batch.length < BACKFILL_PER_SYNC; d = addDays(d, -1)) batch.push(d);
  if (batch.length) cursor = batch.at(-1)!;
  return { dates: [...recent, ...batch], cursor };
}

/** Days of history covered so far, for "Fetching sleep data: 40 of 90 days". */
export const backfillProgress = (today: ISODate, backfilledUntil: ISODate | null): number =>
  backfilledUntil ? Math.min(RECOVERY_HISTORY_DAYS, daysBetween(backfilledUntil, today) + 1) : 0;

export async function syncRecovery(userId: string, tokens: string, today: ISODate, source: GarminSource): Promise<{ nights: number; tokens: string | null }> {
  const db = createAdminSupabase();
  const [{ data: acct }, { data: last }] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    db.from("recovery_days").select("local_date").eq("user_id", userId).order("local_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { dates, cursor } = recoveryDates(today, last?.local_date ?? null, acct?.recovery_backfilled_until ?? null);
  const res = await source.fetchRecovery(tokens, dates);
  const rows = res.nights
    .map((n) => toRecoveryRow(userId, n))
    .filter((r): r is NonNullable<typeof r> => !!r && r.local_date <= today);
  const unique = [...new Map(rows.map((r) => [r.local_date, r])).values()];
  if (unique.length) {
    const { error } = await db.from("recovery_days").upsert(unique, { onConflict: "user_id,local_date" });
    if (error) throw error;
  }
  await db.from("garmin_accounts").update({ recovery_backfilled_until: cursor }).eq("user_id", userId);
  return { nights: unique.length, tokens: res.tokens };
}
