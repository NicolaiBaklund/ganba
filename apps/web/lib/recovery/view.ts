import "server-only";
import { addDays, localDate, nightSeries, recoveryCurve, recoveryRunForm, type CurvePoint, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { getAiHealthConsent } from "./consent";
import { backfillProgress } from "./fetch";
import { loadRecoveryDays } from "./load";

export const CURVE_DAYS = 30;

export interface RecoveryView {
  garmin: "none" | "active" | "reauth_required";
  consent: boolean;
  hasKey: boolean;
  historyDays: number;
  curves: Record<"sleepScore" | "hrv" | "restingHr" | "runForm", CurvePoint[]>;
  today: ISODate;
}

export async function loadRecoveryView(userId: string): Promise<RecoveryView> {
  const db = createAdminSupabase();
  const [{ data: profile }, garmin, consent, key] = await Promise.all([
    db.from("profiles").select("timezone").eq("user_id", userId).single(),
    getGarminStatus(userId),
    getAiHealthConsent(userId),
    getApiKeyStatus(userId),
  ]);
  const today = localDate(profile?.timezone ?? "UTC");
  const empty = { sleepScore: [], hrv: [], restingHr: [], runForm: [] };
  if (!garmin) return { garmin: "none", consent, hasKey: !!key, historyDays: 0, curves: empty, today };

  const [{ data: acct }, days] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    // Curves need 30 days shown + 30 for the normal band.
    loadRecoveryDays(userId, today),
  ]);
  const from = addDays(today, -(CURVE_DAYS - 1));
  return {
    garmin: garmin.status,
    consent,
    hasKey: !!key,
    historyDays: backfillProgress(today, acct?.recovery_backfilled_until ?? null),
    curves: {
      sleepScore: recoveryCurve(nightSeries(days, "sleepScore"), from, today),
      hrv: recoveryCurve(nightSeries(days, "hrv"), from, today),
      restingHr: recoveryCurve(nightSeries(days, "restingHr"), from, today),
      runForm: recoveryCurve(recoveryRunForm(days), from, today, 30, 5),
    },
    today,
  };
}
