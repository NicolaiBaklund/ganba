import "server-only";
import type { RecoveryFactor, RecoveryGroup, RecoveryOutcome } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";

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

type Groups = { high: RecoveryGroup; low: RecoveryGroup; needed: number };

/**
 * What the recovery engine has found in the person's own data (the coach reads it). AI-suggested questions are
 * part of the AI layer: left out without consent, and only shown once they pass (spec 2026-10-04 §7.1, §7.4).
 */
export async function loadFindings(userId: string, consent: boolean): Promise<{ findings: FindingRow[]; noEffect: FindingRow[]; needsData: FindingRow[] }> {
  const { data: rows } = await createAdminSupabase().from("recovery_findings").select("*").eq("user_id", userId);
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
  return {
    findings: all.filter((f) => f.kind === "finding").sort((a, b) => Math.abs(b.effectSd ?? 0) - Math.abs(a.effectSd ?? 0)),
    noEffect: all.filter((f) => f.kind === "no_effect" && f.source === "engine"),
    needsData: all
      .filter((f) => f.kind === "needs_data" && f.source === "engine")
      .sort((a, b) => Math.min(b.high.n, b.low.n) / b.needed - Math.min(a.high.n, a.low.n) / a.needed),
  };
}
