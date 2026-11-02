import { addDays, type ISODate } from "../dates";
import { mean, median } from "../recovery/stats";
import type { RecoveryDayInput } from "../recovery/types";

/** Alerts (spec docs/specs/2026-11-02-health.md §6): only when several signals have been off for days. */
export type HealthAlertKind = "sick" | "easy_fast" | "sleep";

export interface HealthAlert {
  kind: HealthAlertKind;
  /** The numbers behind it, for the note. */
  facts: Record<string, number>;
}

export const ALERT_RULES = {
  normalDays: 28,
  minNormal: 14,
  /** Resting HR at least this much over normal (bpm), or 2 robust SDs if that is more. */
  rhrMinUp: 3,
  rhrSds: 2,
  easyRuns: 4,
  easyFastCount: 3,
  /** Faster than the fast end of the easy range by more than this (s/km). */
  easyFastS: 10,
  sleepNights: 10,
  sleepMinNights: 7,
  sleepShortH: 1,
} as const;

const R = ALERT_RULES;
const robustSd = (xs: readonly number[]) => {
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
};

type Index = ReadonlyMap<ISODate, RecoveryDayInput>;

function normalOf(ix: Index, date: ISODate, pick: (d: RecoveryDayInput) => number | null | undefined): { median: number; sd: number } | null {
  const xs: number[] = [];
  for (let i = 1; i <= R.normalDays; i++) {
    const v = pick(ix.get(addDays(date, -i)) ?? ({} as RecoveryDayInput));
    if (v != null) xs.push(v);
  }
  return xs.length >= R.minNormal ? { median: median(xs), sd: robustSd(xs) } : null;
}

/** One morning off: resting HR up and HRV low against the person's own normal. */
function offMorning(ix: Index, date: ISODate): { rhrUp: number; hrv: number } | null {
  const d = ix.get(date);
  if (d?.restingHr == null || d.hrv == null) return null;
  const rhr = normalOf(ix, date, (x) => x.restingHr);
  if (!rhr) return null;
  const up = d.restingHr - rhr.median;
  if (up < Math.max(R.rhrMinUp, R.rhrSds * rhr.sd)) return null;
  let low: number | null = d.hrvLow ?? null;
  if (low == null) {
    const hrv = normalOf(ix, date, (x) => x.hrv);
    if (!hrv) return null;
    low = hrv.median - hrv.sd;
  }
  return d.hrv < low ? { rhrUp: Math.round(up), hrv: Math.round(d.hrv) } : null;
}

export function alertFor(input: {
  days: readonly RecoveryDayInput[];
  today: ISODate;
  /** Easy and recovery runs, any order; only the latest four in the last 28 days count. */
  easyRuns: readonly { date: ISODate; secPerKm: number }[];
  /** The fast end of the plan's easy range (s/km); null without a plan. */
  easyFastSecPerKm: number | null;
}): HealthAlert | null {
  const ix: Index = new Map(input.days.map((d) => [d.date, d]));

  const today = offMorning(ix, input.today);
  if (today && offMorning(ix, addDays(input.today, -1))) return { kind: "sick", facts: today };

  if (input.easyFastSecPerKm != null) {
    const from = addDays(input.today, -R.normalDays);
    const last = input.easyRuns
      .filter((r) => r.date >= from && r.date <= input.today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-R.easyRuns);
    const limit = input.easyFastSecPerKm - R.easyFastS;
    if (last.length === R.easyRuns && last.filter((r) => r.secPerKm < limit).length >= R.easyFastCount) {
      return { kind: "easy_fast", facts: { avgSecPerKm: Math.round(mean(last.map((r) => r.secPerKm))), easyFastSecPerKm: input.easyFastSecPerKm } };
    }
  }

  const short: number[] = [];
  for (let i = 0; i < R.sleepNights; i++) {
    const d = ix.get(addDays(input.today, -i));
    if (d?.sleepS != null && d.sleepNeedS != null) short.push((d.sleepS - d.sleepNeedS) / 3600);
  }
  if (short.length >= R.sleepMinNights && mean(short) <= -R.sleepShortH) {
    return { kind: "sleep", facts: { avgShortH: Math.round(-mean(short) * 10) / 10, nights: short.length } };
  }
  return null;
}
