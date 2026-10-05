import { addDays, type ISODate } from "../dates";
import { mean, median, sd } from "./stats";
import type { RecoveryDayInput } from "./types";

export const RECOVERY_FACTORS = ["deficit", "carbs", "protein", "alcohol", "late", "hard", "long", "steps", "sleepScore", "hrv", "deficit3", "daysSinceHard"] as const;
export type RecoveryFactor = (typeof RECOVERY_FACTORS)[number];
export const RECOVERY_OUTCOMES = ["sleepScore", "hrv", "restingHr", "runForm"] as const;
export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number];

/** Factors of day D (binary as 1/0) and outcomes measured on D, detrended. */
export interface RecoveryRow {
  date: ISODate;
  factors: Record<RecoveryFactor, number | null>;
  outcomes: Record<RecoveryOutcome, number | null>;
}

export const RECOVERY_DETREND = { days: 28, runDays: 30, minValues: 14, minRunValues: 5 } as const;
export const LATE_MEAL_KCAL = 300;
const REST_CAP_DAYS = 14;

/** Value minus the median of the previous `lookback` days; null with too little history. */
function residual(series: Map<ISODate, number>, date: ISODate, lookback: number, min: number): number | null {
  const v = series.get(date);
  if (v == null) return null;
  const prev: number[] = [];
  for (let i = 1; i <= lookback; i++) {
    const p = series.get(addDays(date, -i));
    if (p != null) prev.push(p);
  }
  return prev.length >= min ? v - median(prev) : null;
}

function seriesOf(days: readonly RecoveryDayInput[], pick: (d: RecoveryDayInput) => number | null): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const d of days) {
    const v = pick(d);
    if (v != null) m.set(d.date, v);
  }
  return m;
}

/** Run form per day: each measure against its own recent median, scaled by its own spread, higher = better; then averaged. */
export function recoveryRunForm(days: readonly RecoveryDayInput[]): Map<ISODate, number> {
  const parts = [
    { s: seriesOf(days, (d) => d.easyMetersPerBeat), sign: 1 },
    { s: seriesOf(days, (d) => d.qualityPaceRatio), sign: -1 },
  ].map(({ s, sign }) => {
    const res = new Map<ISODate, number>();
    for (const date of s.keys()) {
      const r = residual(s, date, RECOVERY_DETREND.runDays, RECOVERY_DETREND.minRunValues);
      if (r != null) res.set(date, r);
    }
    const spread = sd([...res.values()]);
    return new Map([...res].map(([d, r]) => [d, spread > 0 ? (sign * r) / spread : 0] as const));
  });
  const out = new Map<ISODate, number>();
  for (const date of new Set(parts.flatMap((p) => [...p.keys()]))) {
    out.set(date, mean(parts.flatMap((p) => (p.has(date) ? [p.get(date)!] : []))));
  }
  return out;
}

/** Rows for every date in [from, to]; `days` should reach ~30 days further back for the normals. */
export function buildRecoveryRows(days: readonly RecoveryDayInput[], from: ISODate, to: ISODate): RecoveryRow[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const sleep = seriesOf(days, (d) => d.sleepScore);
  const hrv = seriesOf(days, (d) => d.hrv);
  const rhr = seriesOf(days, (d) => d.restingHr);
  const form = recoveryRunForm(days);
  const D = RECOVERY_DETREND;

  const rows: RecoveryRow[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const d = byDate.get(date);
    const food = d?.food ?? null;
    const last3 = [-2, -1, 0].map((i) => byDate.get(addDays(date, i))?.food?.deficitKcal ?? null);
    let since = REST_CAP_DAYS;
    for (let i = 1; i < REST_CAP_DAYS; i++) {
      if (byDate.get(addDays(date, -i))?.hard) {
        since = i;
        break;
      }
    }
    rows.push({
      date,
      factors: {
        deficit: food?.deficitKcal ?? null,
        carbs: food?.carbsPerKg ?? null,
        protein: food?.proteinPerKg ?? null,
        alcohol: food ? (food.alcoholG > 0 ? 1 : 0) : null,
        late: food && food.lateKcal != null ? (food.lateKcal >= LATE_MEAL_KCAL ? 1 : 0) : null,
        hard: d ? (d.hard ? 1 : 0) : null,
        long: d ? (d.long ? 1 : 0) : null,
        steps: d?.steps ?? null,
        sleepScore: d?.sleepScore ?? null,
        hrv: d?.hrv ?? null,
        deficit3: last3.every((x) => x != null) ? mean(last3 as number[]) : null,
        daysSinceHard: d ? since : null,
      },
      outcomes: {
        sleepScore: residual(sleep, date, D.days, D.minValues),
        hrv: residual(hrv, date, D.days, D.minValues),
        restingHr: residual(rhr, date, D.days, D.minValues),
        runForm: form.get(date) ?? null,
      },
    });
  }
  return rows;
}

/** Raw nightly values (morning of each date) for one night metric. */
export const nightSeries = (days: readonly RecoveryDayInput[], key: "sleepScore" | "hrv" | "restingHr"): Map<ISODate, number> =>
  seriesOf(days, (d) => d[key]);
