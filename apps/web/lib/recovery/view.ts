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
  type RecoveryFactor,
  type RecoveryGroup,
  type RecoveryOutcome,
  type WeekBalance,
} from "@loop/core";
import { todaysWorkout, type WorkoutListItem } from "@/lib/training/view";
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

export interface FormView {
  /** Today's Form, null without a night. */
  today: { score: number; band: FormBand; parts: FormPart[] } | null;
  workout: Pick<WorkoutListItem, "id" | "type" | "title" | "status"> | null;
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
  findings: FindingRow[];
  noEffect: FindingRow[];
  needsData: FindingRow[];
  curves: Record<"sleepScore" | "hrv" | "restingHr" | "runForm", CurvePoint[]>;
  form: FormView | null;
  today: ISODate;
}

export const FORM_LOW_ACTION = 40;

const PART_IDS = new Set<string>(FORM_PART_IDS);
/** Stored parts, minus any id an older engine wrote that this version no longer knows (e.g. "rest"). */
export const knownParts = (parts: unknown): FormPart[] => ((parts ?? []) as FormPart[]).filter((p) => PART_IDS.has(p.id));

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
  if (!garmin) return { garmin: "none", consent, hasKey: !!key, historyDays: 0, findings: [], noEffect: [], needsData: [], curves: empty, form: null, today };

  const [{ data: acct }, { data: rows }, days, { data: formRows }, session] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    db.from("recovery_findings").select("*").eq("user_id", userId),
    // Curves need 30 days shown + 30 for the normal band; the self-check needs the whole window plus run-form history.
    loadRecoveryDays(userId, today),
    db.from("form_days").select("local_date, score").eq("user_id", userId).gte("local_date", addDays(today, -89)).order("local_date"),
    todaysWorkout(userId, today),
  ]);
  // The parts are only needed for today.
  const { data: todayRow } = await db.from("form_days").select("score, band, parts").eq("user_id", userId).eq("local_date", today).maybeSingle();
  // AI-suggested findings are part of the AI layer: hidden while the switch is off (spec §7.1).
  const all: FindingRow[] = (rows ?? []).filter((r) => consent || r.source !== "ai").map((r) => {
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
  const scores = new Map((formRows ?? []).flatMap((r) => (r.score == null ? [] : [[r.local_date, r.score] as const])));
  const w = session.workout;
  const form: FormView = {
    today: todayRow?.score != null ? { score: todayRow.score, band: todayRow.band as FormBand, parts: knownParts(todayRow.parts) } : null,
    workout: w ? { id: w.id, type: w.type, title: w.title, status: w.status } : null,
    action: todayRow?.score != null && todayRow.score < FORM_LOW_ACTION && !!w && w.status === "planned" && HARD_TYPES.has(w.type),
    week: weekBalance(days, today),
    curve: recoveryCurve(scores, from, today, 28, 14),
    selfCheck: formSelfCheck(scores, recoveryRunForm(days)),
  };
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
    form,
    today,
  };
}
