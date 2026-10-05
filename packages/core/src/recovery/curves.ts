import { addDays, type ISODate } from "../dates";

export interface CurvePoint {
  date: ISODate;
  value: number;
  /** The user's normal range for that day: 25th–75th percentile of the previous `lookback` days. */
  low: number | null;
  high: number | null;
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Points for [from, to] with a normal band from each day's own history (null band until enough history). */
export function recoveryCurve(series: ReadonlyMap<ISODate, number>, from: ISODate, to: ISODate, lookback = 28, minValues = 14): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const value = series.get(date);
    if (value == null) continue;
    const prev: number[] = [];
    for (let i = 1; i <= lookback; i++) {
      const p = series.get(addDays(date, -i));
      if (p != null) prev.push(p);
    }
    const sorted = prev.sort((a, b) => a - b);
    const enough = sorted.length >= minValues;
    out.push({ date, value, low: enough ? quantile(sorted, 0.25) : null, high: enough ? quantile(sorted, 0.75) : null });
  }
  return out;
}
