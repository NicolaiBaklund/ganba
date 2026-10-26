import "server-only";
import {
  addDays,
  FORM_PART_IDS,
  formSelfCheck,
  HARD_TYPES,
  localDate,
  nightSeries,
  recoveryCurve,
  recoveryRunForm,
  weekBalance,
  type CurvePoint,
  type FormBand,
  type FormPart,
  type ISODate,
  type WeekBalance,
} from "@loop/core";
import { formSession, type FormSession } from "./form-session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { getAiHealthConsent } from "./consent";
import { backfillProgress } from "./fetch";
import { loadRecoveryDays } from "./load";

export const CURVE_DAYS = 30;

export interface FormView {
  /** Today's Form, null without a night. */
  today: { score: number; band: FormBand; parts: FormPart[] } | null;
  workout: FormSession | null;
  /** Low Form with a hard session still to do today: offer the coach. */
  action: boolean;
  week: WeekBalance;
  curve: CurvePoint[];
  selfCheck: { diffSd: number; nHigh: number; nLow: number } | null;
}

export interface RecoveryView {
  garmin: "none" | "active" | "reauth_required";
  consent: boolean;
  hasKey: boolean;
  historyDays: number;
  curves: Record<"sleepScore" | "hrv" | "restingHr" | "runForm", CurvePoint[]>;
  form: FormView | null;
  today: ISODate;
}

export const FORM_LOW_ACTION = 40;

const PART_IDS = new Set<string>(FORM_PART_IDS);
/** Stored parts, minus any id an older engine wrote that this version no longer knows (e.g. "rest"). */
export const knownParts = (parts: unknown): FormPart[] => ((parts ?? []) as FormPart[]).filter((p) => PART_IDS.has(p.id));

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
  if (!garmin) return { garmin: "none", consent, hasKey: !!key, historyDays: 0, curves: empty, form: null, today };

  const [{ data: acct }, days, { data: formRows }, session] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    // Curves need 30 days shown + 30 for the normal band; the self-check needs the whole window plus run-form history.
    loadRecoveryDays(userId, today),
    db.from("form_days").select("local_date, score").eq("user_id", userId).gte("local_date", addDays(today, -89)).order("local_date"),
    formSession(userId, today),
  ]);
  // The parts are only needed for today.
  const { data: todayRow } = await db.from("form_days").select("score, band, parts").eq("user_id", userId).eq("local_date", today).maybeSingle();
  const from = addDays(today, -(CURVE_DAYS - 1));
  const scores = new Map((formRows ?? []).flatMap((r) => (r.score == null ? [] : [[r.local_date, r.score] as const])));
  const w = session;
  const form: FormView = {
    today: todayRow?.score != null ? { score: todayRow.score, band: todayRow.band as FormBand, parts: knownParts(todayRow.parts) } : null,
    workout: w,
    action: todayRow?.score != null && todayRow.score < FORM_LOW_ACTION && !!w?.id && w.status === "planned" && !!w.type && HARD_TYPES.has(w.type),
    week: weekBalance(days, today),
    curve: recoveryCurve(scores, from, today, 28, 14),
    selfCheck: formSelfCheck(scores, recoveryRunForm(days)),
  };
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
    form,
    today,
  };
}
