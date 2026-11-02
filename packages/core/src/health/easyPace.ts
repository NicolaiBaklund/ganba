import { addDays, type ISODate } from "../dates";
import { median } from "../recovery/stats";

export interface EasyRunPoint {
  date: ISODate;
  km: number;
  /** Moving time over distance. */
  secPerKm: number;
  avgHr: number;
}

export interface EasyPaceAtHr {
  /** The runner's usual easy heart rate: median of the recent easy runs. */
  hr: number;
  /** Easy pace at that heart rate now (last 6 weeks). */
  secPerKm: number;
  /** Seconds per km against the 6 weeks before (negative is faster); null without enough runs then. */
  deltaS: number | null;
  /** Middle of the earlier window, for "since September". */
  since: ISODate | null;
}

export const EASY_PACE = { windowDays: 42, minRuns: 5 } as const;

/**
 * Easy pace at the runner's usual easy heart rate, now and against the 6 weeks before. Each run gives metres per
 * heartbeat (speed over average HR); the median of a window, times the heart rate, is the speed at that heart rate.
 * Null with fewer than 5 easy runs in the last 6 weeks.
 */
export function easyPaceAtHr(runs: readonly EasyRunPoint[], today: ISODate): EasyPaceAtHr | null {
  const W = EASY_PACE.windowDays;
  const inWin = (from: ISODate, to: ISODate) => runs.filter((r) => r.date > from && r.date <= to && r.avgHr > 0 && r.secPerKm > 0);
  const recent = inWin(addDays(today, -W), today);
  if (recent.length < EASY_PACE.minRuns) return null;
  const earlier = inWin(addDays(today, -2 * W), addDays(today, -W));
  const hr = Math.round(median(recent.map((r) => r.avgHr)));
  // Metres per beat = (1000 / secPerKm) m/s × 60 / bpm; pace at hr = 1000 / (perBeat × hr / 60).
  const paceAt = (win: EasyRunPoint[]) => 60_000 / (median(win.map((r) => (1000 / r.secPerKm) * 60 / r.avgHr)) * hr);
  const now = Math.round(paceAt(recent));
  const then = earlier.length >= EASY_PACE.minRuns ? Math.round(paceAt(earlier)) : null;
  return { hr, secPerKm: now, deltaS: then == null ? null : now - then, since: then == null ? null : addDays(today, -Math.round(1.5 * W)) };
}
