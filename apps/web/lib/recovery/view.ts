import "server-only";
import { addDays, localDate, nightSeries, recoveryCurve, recoveryRunForm, type CurvePoint, type ISODate, type RecoveryFactor, type RecoveryGroup, type RecoveryOutcome } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { getAiHealthConsent } from "./consent";
import { backfillProgress } from "./fetch";
import { loadRecoveryDays } from "./load";

export const CURVE_DAYS = 30;
const MAX_FINDINGS = 5;

export interface FindingRow {
  questionId: string;
  factor: RecoveryFactor;
  outcome: RecoveryOutcome;
  lag: number;
  kind: "finding" | "no_effect" | "needs_data";
  reason: "few_days" | "unclear" | "training" | null;
  high: RecoveryGroup;
  low: RecoveryGroup;
  needed: number;
  effectSd: number | null;
  qValue: number | null;
  controlOk: boolean | null;
  rank: number | null;
  source: "engine" | "ai";
}

export interface RecoveryView {
  garmin: "none" | "active" | "reauth_required";
  consent: boolean;
  hasKey: boolean;
  historyDays: number;
  findings: FindingRow[];
  noEffect: FindingRow[];
  needsData: FindingRow[];
  curves: Record<"sleepScore" | "hrv" | "restingHr" | "runForm", CurvePoint[]>;
  today: ISODate;
}

type Groups = { high: RecoveryGroup; low: RecoveryGroup; needed: number };

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
  if (!garmin) return { garmin: "none", consent, hasKey: !!key, historyDays: 0, findings: [], noEffect: [], needsData: [], curves: empty, today };

  const [{ data: acct }, { data: rows }, days] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    db.from("recovery_findings").select("*").eq("user_id", userId),
    loadRecoveryDays(userId, today),
  ]);
  const all: FindingRow[] = (rows ?? []).map((r) => {
    const g = r.groups as unknown as Groups;
    return {
      questionId: r.question_id,
      factor: r.factor as RecoveryFactor,
      outcome: r.outcome as RecoveryOutcome,
      lag: r.lag,
      kind: r.kind as FindingRow["kind"],
      reason: r.reason as FindingRow["reason"],
      high: g.high,
      low: g.low,
      needed: g.needed,
      effectSd: r.effect_sd == null ? null : Number(r.effect_sd),
      qValue: r.q_value == null ? null : Number(r.q_value),
      controlOk: r.control_ok,
      rank: r.rank,
      source: r.source as FindingRow["source"],
    };
  });
  const from = addDays(today, -(CURVE_DAYS - 1));
  return {
    garmin: garmin.status,
    consent,
    hasKey: !!key,
    historyDays: backfillProgress(today, acct?.recovery_backfilled_until ?? null),
    findings: all
      .filter((f) => f.kind === "finding")
      .sort((a, b) => Math.abs(b.effectSd ?? 0) - Math.abs(a.effectSd ?? 0))
      .slice(0, MAX_FINDINGS),
    noEffect: all.filter((f) => f.kind === "no_effect" && f.source === "engine"),
    // AI questions that have not passed stay out of sight (spec §7.4: only passing ones are shown).
    needsData: all
      .filter((f) => f.kind === "needs_data" && f.source === "engine")
      .sort((a, b) => Math.min(b.high.n, b.low.n) / b.needed - Math.min(a.high.n, a.low.n) / a.needed),
    curves: {
      sleepScore: recoveryCurve(nightSeries(days, "sleepScore"), from, today),
      hrv: recoveryCurve(nightSeries(days, "hrv"), from, today),
      restingHr: recoveryCurve(nightSeries(days, "restingHr"), from, today),
      runForm: recoveryCurve(recoveryRunForm(days), from, today, 30, 5),
    },
    today,
  };
}
