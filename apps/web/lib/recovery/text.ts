import type { RecoveryFactor, RecoveryOutcome } from "@loop/core";
import type { FindingRow } from "./view";

/** A number with its sign and a true minus ("+3", "−1.5", "0"). */
export const signed = (x: number, digits = 0) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("en", { maximumFractionDigits: digits })}`;

const fmt = (v: number | null, digits = 0) => (v == null ? "" : v.toLocaleString("en", { maximumFractionDigits: digits }));
const UNIT: Record<RecoveryFactor, { digits: number; unit: string }> = {
  deficit: { digits: 0, unit: "kcal" },
  deficit3: { digits: 0, unit: "kcal" },
  carbs: { digits: 1, unit: "g/kg" },
  protein: { digits: 1, unit: "g/kg" },
  steps: { digits: 0, unit: "steps" },
  sleepScore: { digits: 0, unit: "" },
  hrv: { digits: 0, unit: "ms" },
  daysSinceHard: { digits: 0, unit: "days" },
  alcohol: { digits: 0, unit: "" },
  late: { digits: 0, unit: "" },
  hard: { digits: 0, unit: "" },
  long: { digits: 0, unit: "" },
};
const OUT_UNIT: Record<RecoveryOutcome, string> = { sleepScore: "", hrv: " ms", restingHr: " bpm", runForm: " SD" };
/** Higher is better for these outcomes; resting HR is better lower. */
const HIGHER_IS_BETTER: Record<RecoveryOutcome, boolean> = { sleepScore: true, hrv: true, restingHr: false, runForm: true };

/** Numbers for the i18n templates: bounds in the factor's unit, the outcome difference with sign and unit. */
export function findingParams(f: FindingRow) {
  const u = UNIT[f.factor];
  const diff = f.high.mean != null && f.low.mean != null ? f.high.mean - f.low.mean : 0;
  const shown = f.outcome === "runForm" ? Math.round(diff * 10) / 10 : Math.round(diff);
  return {
    high: `${fmt(f.high.bound, u.digits)}${u.unit ? ` ${u.unit}` : ""}`,
    low: `${fmt(f.low.bound, u.digits)}${u.unit ? ` ${u.unit}` : ""}`,
    diff: `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown)}${OUT_UNIT[f.outcome]}`,
    better: diff === 0 ? true : (diff > 0) === HIGHER_IS_BETTER[f.outcome],
    nHigh: f.high.n,
    nLow: f.low.n,
    have: Math.min(f.high.n, f.low.n),
    needed: f.needed,
  };
}
