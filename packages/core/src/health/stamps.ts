import { addDays, type ISODate } from "../dates";

/** Stamps (spec docs/specs/2026-11-02-health.md §8): milestones, all derived, each earned once. */
export type StampKind = "country" | "distance" | "pr" | "volume" | "streak" | "test" | "race";

export interface Stamp {
  kind: StampKind;
  key: string;
  earnedOn: ISODate;
  activityId?: string;
  value?: Record<string, unknown>;
}

export const STAMP_DISTANCES_KM = [10, 15, 21.1, 25, 30, 42.2] as const;
export const STAMP_VOLUMES_KM = [50, 100, 150, 200] as const;
export const STAMP_STREAK_WEEKS = [4, 8, 12, 26] as const;
/** Garmin record types that are times: 1 km, mile, 5K, 10K, half, marathon. */
export const PR_TYPES: Record<number, string> = { 1: "1 km", 2: "Mile", 3: "5K", 4: "10K", 5: "Half", 6: "Marathon" };
/** GPS runs a little short of a round distance still count. */
const DISTANCE_SLACK = 0.99;
const DONE_SHARE = 0.8;

export interface StampRun {
  id: string;
  date: ISODate;
  km: number;
  /** ISO alpha-3 from where the run started; null when unknown. */
  country: string | null;
}

export interface StampInput {
  runs: readonly StampRun[];
  records: readonly { typeId: number; value: number; date: ISODate | null }[];
  /** Finished plan weeks: planned and done sessions. */
  weeks: readonly { start: ISODate; planned: number; done: number }[];
  tests: readonly { date: ISODate; activityId: string }[];
  races: readonly { date: ISODate; activityId: string; timeS: number }[];
}

export function earnedStamps(input: StampInput): Stamp[] {
  const out: Stamp[] = [];
  const runs = [...input.runs].sort((a, b) => a.date.localeCompare(b.date));

  const countries = new Set<string>();
  for (const r of runs) {
    if (!r.country || countries.has(r.country)) continue;
    countries.add(r.country);
    out.push({ kind: "country", key: r.country, earnedOn: r.date, activityId: r.id });
  }

  for (const km of STAMP_DISTANCES_KM) {
    const r = runs.find((x) => x.km >= km * DISTANCE_SLACK);
    if (r) out.push({ kind: "distance", key: String(km), earnedOn: r.date, activityId: r.id, value: { km: Math.round(r.km * 10) / 10 } });
  }

  // Each volume once: the day a calendar month first crossed it.
  const volumes = new Map<number, Stamp>();
  const month = { key: "", km: 0 };
  for (const r of runs) {
    const m = r.date.slice(0, 7);
    if (m !== month.key) Object.assign(month, { key: m, km: 0 });
    month.km += r.km;
    for (const v of STAMP_VOLUMES_KM) {
      if (!volumes.has(v) && month.km >= v) volumes.set(v, { kind: "volume", key: String(v), earnedOn: r.date, value: { month: m } });
    }
  }
  out.push(...volumes.values());

  for (const rec of input.records) {
    if (!PR_TYPES[rec.typeId] || !rec.date) continue;
    const s = Math.round(rec.value);
    out.push({ kind: "pr", key: `pr-${rec.typeId}-${s}`, earnedOn: rec.date, value: { typeId: rec.typeId, seconds: s } });
  }

  // Weeks in a row with most sessions done; weeks without sessions (holidays) neither count nor break it.
  let streak = 0;
  for (const w of [...input.weeks].sort((a, b) => a.start.localeCompare(b.start))) {
    if (w.planned === 0) continue;
    streak = w.done / w.planned >= DONE_SHARE ? streak + 1 : 0;
    for (const n of STAMP_STREAK_WEEKS) {
      if (streak === n && !out.some((s) => s.kind === "streak" && s.key === String(n))) out.push({ kind: "streak", key: String(n), earnedOn: addDays(w.start, 6) });
    }
  }

  for (const t of input.tests) out.push({ kind: "test", key: t.date, earnedOn: t.date, activityId: t.activityId });
  for (const r of input.races) out.push({ kind: "race", key: r.date, earnedOn: r.date, activityId: r.activityId, value: { seconds: r.timeS } });
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const NEXT_STAMP_DAYS = 7;

/** The stamp the plan reaches first within a week (volume or distance; countries can't be foreseen). */
export function nextStamp(input: {
  today: ISODate;
  earned: readonly Pick<Stamp, "kind" | "key">[];
  /** Run km so far this calendar month, today's done runs included. */
  monthKmSoFar: number;
  /** Planned runs not done yet, from today. */
  plannedRuns: readonly { date: ISODate; km: number }[];
}): { kind: StampKind; key: string; label: string; date: ISODate } | null {
  const has = (kind: StampKind, key: string) => input.earned.some((s) => s.kind === kind && s.key === key);
  const until = addDays(input.today, NEXT_STAMP_DAYS);
  const month = input.today.slice(0, 7);
  const runs = [...input.plannedRuns].filter((r) => r.date >= input.today && r.date <= until).sort((a, b) => a.date.localeCompare(b.date));
  const found: { kind: StampKind; key: string; label: string; date: ISODate }[] = [];

  let km = input.monthKmSoFar;
  for (const r of runs) {
    if (r.date.slice(0, 7) !== month) break;
    km += r.km;
    const v = STAMP_VOLUMES_KM.find((x) => !has("volume", String(x)) && input.monthKmSoFar < x && km >= x);
    if (v) {
      found.push({ kind: "volume", key: String(v), label: `${v} km in ${MONTHS[Number(month.slice(5)) - 1]}`, date: r.date });
      break;
    }
  }
  for (const r of runs) {
    const d = [...STAMP_DISTANCES_KM].reverse().find((x) => !has("distance", String(x)) && r.km >= x * DISTANCE_SLACK);
    if (d) {
      found.push({ kind: "distance", key: String(d), label: `${d} km run`, date: r.date });
      break;
    }
  }
  return found.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}
