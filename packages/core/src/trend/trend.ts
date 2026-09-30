import { addDays, daysBetween, type ISODate } from "../dates";

export interface WeightPoint {
  localDate: ISODate;
  measuredAt: string;
  weightKg: number;
}

export interface TrendPoint {
  date: ISODate;
  weightKg: number;
  trendKg: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One point per weighed day (first weigh-in that day), exponentially smoothed. Unweighed days don't move the trend. */
export function trendSeries(points: WeightPoint[], alpha = 0.1): TrendPoint[] {
  const firstPerDay = new Map<ISODate, WeightPoint>();
  for (const p of points) {
    const cur = firstPerDay.get(p.localDate);
    if (!cur || p.measuredAt < cur.measuredAt) firstPerDay.set(p.localDate, p);
  }
  const days = [...firstPerDay.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  for (const d of days) {
    trend = trend == null ? d.weightKg : trend + alpha * (d.weightKg - trend);
    out.push({ date: d.localDate, weightKg: d.weightKg, trendKg: round2(trend) });
  }
  return out;
}

/** Last trend value on or before `date`. */
export function trendAt(series: TrendPoint[], date: ISODate): number | null {
  let v: number | null = null;
  for (const p of series) {
    if (p.date > date) break;
    v = p.trendKg;
  }
  return v;
}

export function weeklyChange(series: TrendPoint[], today: ISODate): number | null {
  const now = trendAt(series, today);
  const before = trendAt(series, addDays(today, -7));
  return now == null || before == null ? null : round2(now - before);
}

export function forecast(
  series: TrendPoint[],
  today: ISODate,
  targetKg: number,
): { kgPerWeek: number | null; etaDate: ISODate | null } {
  const recent = series.filter((p) => p.date >= addDays(today, -14) && p.date <= today);
  if (recent.length < 2) return { kgPerWeek: null, etaDate: null };
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const days = daysBetween(first.date, last.date);
  if (days === 0) return { kgPerWeek: null, etaDate: null };
  const perDay = (last.trendKg - first.trendKg) / days;
  const remaining = targetKg - last.trendKg;
  const movingToward = perDay !== 0 && Math.sign(perDay) === Math.sign(remaining);
  return {
    kgPerWeek: round2(perDay * 7),
    etaDate: movingToward ? addDays(last.date, Math.ceil(remaining / perDay)) : null,
  };
}
