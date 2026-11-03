import "server-only";
import {
  addDays,
  isRaceRun,
  isRun,
  nextStamp,
  pickRace,
  planPrediction,
  predictionSeconds,
  STAMP_DISTANCES_KM,
  STAMP_STREAK_WEEKS,
  STAMP_VOLUMES_KM,
  type ClockRace,
  type PredictionTimes,
  type ISODate,
  type RaceDistance,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { activePlan, goalOf, planWorkouts } from "@/lib/training/service";
import { stampText } from "./stamps";

const db = () => createAdminSupabase();
/** How far back the clock line reaches at least (further for an older plan). */
export const CLOCK_LINE_DAYS = 120;
/** Progress lets the runner look back a year. */
export const PROGRESS_LINE_DAYS = 365;

export interface ClockPoint {
  date: ISODate;
  seconds: number;
}

export interface HealthClock {
  race: ClockRace;
  /** Predicted time on the date, or the finish time on race day and the day after. */
  seconds: number | null;
  deltaS: number | null;
  finished: boolean;
  line: ClockPoint[];
  /** Planned fitness tests from the date on. */
  tests: ISODate[];
  /** All four distances on the date, for the progress page. */
  all: Record<RaceDistance, number | null>;
}

export interface StampLine {
  label: string;
  /** Earned yesterday or today; otherwise the date the plan reaches it. */
  earned: boolean;
  date: ISODate;
}

type PredRow = { local_date: string; time_5k_s: number | null; time_10k_s: number | null; time_half_s: number | null; time_marathon_s: number | null };
const toTimes = (r: PredRow) => ({ time5K: r.time_5k_s, time10K: r.time_10k_s, timeHalfMarathon: r.time_half_s, timeMarathon: r.time_marathon_s });

/** A race plan whose race day was yesterday: it is completed today, but its finish time still shows (spec §5.1). */
async function planOfYesterdaysRace(userId: string, date: ISODate) {
  const { data } = await db().from("training_plans").select("*").eq("user_id", userId).eq("status", "completed").eq("race_date", addDays(date, -1)).limit(1).maybeSingle();
  return data;
}

/** A run on the race's day within ±5 % of its distance: the finish time. */
async function finishTime(userId: string, race: ClockRace): Promise<number | null> {
  if (!race.date) return null;
  const { data: acts } = await db().from("activities").select("type_key, distance_m, moving_s, duration_s").eq("user_id", userId).eq("local_date", race.date);
  const run = (acts ?? []).find((a) => isRun(a.type_key) && isRaceRun(Number(a.distance_m) / 1000, race.distance));
  return run ? Math.round(Number(run.moving_s ?? run.duration_s)) : null;
}

/**
 * The race clock for a date (spec §5). Null without Garmin and without a plan, and when there is no prediction to
 * show (no daily predictor, no Garmin estimate, no running plan): never a clock without a time.
 */
export async function loadClock(userId: string, date: ISODate, opts: { lineDays?: number } = {}): Promise<HealthClock | null> {
  const [active, garmin] = await Promise.all([activePlan(userId), getGarminStatus(userId)]);
  const plan = active ?? (await planOfYesterdaysRace(userId, date));
  if (!plan && !garmin) return null;
  const running = plan && plan.sport !== "ride" ? plan : null;
  const workouts = running ? await planWorkouts(running.id) : [];
  const pick = (today: ISODate) =>
    pickRace({
      today,
      workouts: workouts.filter((w) => w.status !== "removed").map((w) => ({ date: w.date, type: w.type, title: w.title, plannedKm: w.planned_km == null ? null : Number(w.planned_km) })),
      goal: running ? goalOf(running) : null,
    });
  let race = pick(date);
  // The day after race day: the finish time if it was run, else on to the next race.
  let finish = race.date && (date === race.date || date === addDays(race.date, 1)) ? await finishTime(userId, race) : null;
  if (race.date && race.date < date && finish == null) {
    race = pick(addDays(date, 1));
    finish = null;
  }

  // The last 120 days (Progress: a year), or the whole plan when it is older: a plan made today still shows where the
  // time came from.
  const back = addDays(date, -(opts.lineDays ?? CLOCK_LINE_DAYS));
  const from = running && running.start_date < back ? running.start_date : back;
  const { data, error } = await db()
    .from("prediction_days")
    .select("local_date, time_5k_s, time_10k_s, time_half_s, time_marathon_s")
    .eq("user_id", userId)
    .gte("local_date", from)
    .lte("local_date", date)
    .order("local_date");
  if (error) throw error;
  const rows = data ?? [];
  const line = rows.flatMap((r) => {
    const s = predictionSeconds(toTimes(r), race.distance);
    return s ? [{ date: r.local_date, seconds: s }] : [];
  });
  const at = (d: ISODate) => line.find((p) => p.date === d)?.seconds ?? null;
  const now = at(date), before = at(addDays(date, -1));

  // No daily predictions: Garmin's latest estimate, then the plan's VDOT.
  let latest: PredictionTimes | null = rows.at(-1) ? toTimes(rows.at(-1)!) : null;
  if (!latest && garmin) {
    const { data: acct } = await db().from("garmin_accounts").select("race_predictions").eq("user_id", userId).maybeSingle();
    const p = acct?.race_predictions as Partial<PredictionTimes> | null;
    if (p) latest = { time5K: p.time5K ?? null, time10K: p.time10K ?? null, timeHalfMarathon: p.timeHalfMarathon ?? null, timeMarathon: p.timeMarathon ?? null };
  }
  if (!latest && running) latest = planPrediction(Number(running.vdot));
  const predicted = line.at(-1)?.seconds ?? (latest ? predictionSeconds(latest, race.distance) : null);
  const seconds = finish ?? predicted;
  if (seconds == null) return null;
  return {
    race,
    seconds,
    deltaS: finish == null && now != null && before != null ? now - before : null,
    finished: finish != null,
    line,
    tests: workouts.filter((w) => w.type === "test" && w.status === "planned" && w.date >= date).map((w) => w.date),
    all: {
      "5k": latest ? predictionSeconds(latest, "5k") : null,
      "10k": latest ? predictionSeconds(latest, "10k") : null,
      half: latest ? predictionSeconds(latest, "half") : null,
      marathon: latest ? predictionSeconds(latest, "marathon") : null,
    },
  };
}

/** A stamp earned yesterday or today, else the one the plan reaches within a week (spec §8.3). */
export async function loadStampLine(userId: string, date: ISODate): Promise<StampLine | null> {
  const [{ data: stamps }, plan] = await Promise.all([db().from("stamps").select("kind, key, value, earned_on").eq("user_id", userId), activePlan(userId)]);
  const all = stamps ?? [];
  const fresh = all.filter((s) => s.earned_on >= addDays(date, -1) && s.earned_on <= date).sort((a, b) => b.earned_on.localeCompare(a.earned_on))[0];
  if (fresh) return { label: `New stamp: ${stampText({ kind: fresh.kind as never, key: fresh.key, value: fresh.value as never }).label}`, earned: true, date: fresh.earned_on };

  const monthStart = `${date.slice(0, 7)}-01`;
  const [{ data: acts }, planned] = await Promise.all([
    db().from("activities").select("type_key, distance_m").eq("user_id", userId).gte("local_date", monthStart).lte("local_date", date),
    plan && plan.sport !== "ride" ? planWorkouts(plan.id) : Promise.resolve([]),
  ]);
  const monthKmSoFar = (acts ?? []).filter((a) => isRun(a.type_key)).reduce((s, a) => s + Number(a.distance_m ?? 0) / 1000, 0);
  const next = nextStamp({
    today: date,
    earned: all.map((s) => ({ kind: s.kind as never, key: s.key })),
    monthKmSoFar,
    plannedRuns: planned.filter((w) => w.status === "planned" && w.sport === "run").map((w) => ({ date: w.date, km: Number(w.planned_km) })),
  });
  return next ? { label: next.label, earned: false, date: next.date } : null;
}

export interface BookStamp {
  kind: string;
  key: string;
  mark: string;
  label: string;
  /** Null for the next one to earn in its group (drawn dashed). */
  earnedOn: ISODate | null;
  /** The run that earned it, for the sheet. */
  run: { date: ISODate; km: number } | null;
}

const NEXT_GROUPS = [
  { kind: "distance", keys: STAMP_DISTANCES_KM.map(String) },
  { kind: "volume", keys: STAMP_VOLUMES_KM.map(String) },
  { kind: "streak", keys: STAMP_STREAK_WEEKS.map(String) },
] as const;

/** Every earned stamp (newest first), plus the next one in each group that can be counted towards. */
export async function loadStampBook(userId: string): Promise<BookStamp[]> {
  const { data, error } = await db().from("stamps").select("kind, key, value, earned_on, activity_id").eq("user_id", userId).order("earned_on", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.flatMap((r) => (r.activity_id ? [r.activity_id] : []));
  const { data: acts } = ids.length ? await db().from("activities").select("id, local_date, distance_m").in("id", ids) : { data: [] };
  const runOf = new Map((acts ?? []).map((a) => [a.id, { date: a.local_date, km: Math.round(Number(a.distance_m ?? 0) / 100) / 10 }]));
  const earned: BookStamp[] = rows.map((r) => ({ kind: r.kind, key: r.key, ...stampText({ kind: r.kind as never, key: r.key, value: r.value as never }), earnedOn: r.earned_on, run: r.activity_id ? (runOf.get(r.activity_id) ?? null) : null }));
  const next: BookStamp[] = NEXT_GROUPS.flatMap((g) => {
    const key = g.keys.find((k) => !rows.some((r) => r.kind === g.kind && r.key === k));
    return key ? [{ kind: g.kind, key, ...stampText({ kind: g.kind, key, value: undefined }), earnedOn: null, run: null }] : [];
  });
  return [...earned, ...next];
}
