import "server-only";
import {
  addDays,
  easyPart,
  formatPace,
  ghostFor,
  isRun,
  lapsAverage,
  lapsFrom,
  lastSunday,
  localHour,
  pacesFor,
  pickSpot,
  REP_TYPES,
  runSteps,
  verdictFor,
  weekBought,
  weekday,
  GHOST,
  type Block,
  type ChallengeKind,
  type Ghost,
  type ISODate,
  type RaceDistance,
  type SpotMain,
  type Verdict,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { INDOOR, isEasyRun } from "@/lib/recovery/load";
import { activePlan, currentFitness } from "@/lib/training/service";
import { dailyNote, type DailyNote } from "./note";
import { loadClock } from "./view";
import { decideChallenges, ensureChallenge, type ChallengeView } from "./challenge";
import { ACT_COLS, movingOf, normalEasyHr, num, PRED_COL, predictionOn, qualityIds, timezone, type ActRow } from "./runs";

const db = () => createAdminSupabase();

export type SpotVerdict = Verdict & {
  ghost: Ghost | null;
  /** This week's challenge, decided by this run. */
  challenge: { kind: ChallengeKind; params: Record<string, number>; result: "won" | "lost"; value: number } | null;
};

export interface SpotWeek {
  distance: RaceDistance;
  weeks: { sunday: ISODate; deltaS: number }[];
  runs: number;
  km: number;
}

export interface SpotView {
  /** An alert not dealt with yet (or `waiting` for last night's sleep). */
  alert: DailyNote | null;
  verdict: SpotVerdict | null;
  week: SpotWeek | null;
  /** This week's challenge while it is open. */
  challenge: ChallengeView | null;
  main: SpotMain | null;
  challengeLine: boolean;
}

/** The easy zone: the plan's VDOT, else the fitness from synced runs. */
async function easyZone(userId: string, today: ISODate) {
  const plan = await activePlan(userId);
  if (plan?.sport === "ride") return null;
  const vdot = plan ? Number(plan.vdot) : (await currentFitness(userId, today)).vdot;
  return pacesFor(vdot).easy;
}

/** The newest similar easy run (spec §6), with its strides left out like today's. */
async function ghostOf(userId: string, run: ActRow & { secPerKm: number }, quality: ReadonlySet<string>): Promise<Ghost | null> {
  const dist = num(run.distance_m);
  const { data: cands } = await db()
    .from("activities")
    .select(ACT_COLS)
    .eq("user_id", userId)
    .lte("local_date", addDays(run.local_date, -GHOST.minDaysOld))
    .gte("local_date", addDays(run.local_date, -GHOST.maxDaysOld))
    .gte("distance_m", dist * (1 - GHOST.distanceShare))
    .lte("distance_m", dist * (1 + GHOST.distanceShare))
    .order("local_date", { ascending: false })
    .limit(20);
  const pick = (cands ?? []).find((c) => isEasyRun(c, quality));
  if (!pick) return null;
  const { data: full } = await db().from("activities").select("splits").eq("id", pick.id).single();
  const avg = lapsAverage(easyPart(lapsFrom(full?.splits))) ?? { secPerKm: movingOf(pick) / (num(pick.distance_m) / 1000), hr: num(pick.avg_hr) };
  return ghostFor(
    { date: run.local_date, distanceM: dist, secPerKm: run.secPerKm, avgHr: num(run.avg_hr) },
    [{ date: pick.local_date, distanceM: num(pick.distance_m), secPerKm: avg.secPerKm, avgHr: avg.hr ?? num(pick.avg_hr) }],
  );
}

/** The verdict on the latest run of today or yesterday (spec §5), with the ghost and the challenge it decided. */
export async function latestVerdict(userId: string, today: ISODate): Promise<SpotVerdict | null> {
  const { data: acts } = await db()
    .from("activities")
    .select(`${ACT_COLS}, splits`)
    .eq("user_id", userId)
    .gte("local_date", addDays(today, -1))
    .lte("local_date", today)
    .order("start_time", { ascending: false });
  const act = (acts ?? []).find((a) => isRun(a.type_key) && num(a.distance_m) > 0 && movingOf(a) > 0);
  if (!act) return null;
  const [{ data: wo }, zone, normalHr, quality] = await Promise.all([
    db().from("planned_workouts").select("id, type, title, blocks, sport").eq("user_id", userId).eq("activity_id", act.id).neq("status", "removed").limit(1).maybeSingle(),
    easyZone(userId, today),
    normalEasyHr(userId, today),
    qualityIds(userId, addDays(today, -GHOST.maxDaysOld - 1)),
  ]);
  const workout = wo && wo.sport !== "ride" ? { type: wo.type, title: wo.title, blocks: wo.blocks as unknown as Block[] } : null;
  const laps = lapsFrom(act.splits);
  const easy = isEasyRun(act, quality);

  let testPredictionS: number | null = null, proposal = false, raceClockS: number | null = null;
  if (workout?.type === "test") {
    const testKm = runSteps(workout.blocks).reduce((s, x) => s + (x.duration.kind === "distance" ? x.duration.m / 1000 : 0), 0) || num(act.distance_m) / 1000;
    testPredictionS = await predictionOn(userId, act.local_date, testKm);
    const { count } = await db().from("plan_proposals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "paces").eq("status", "pending").gte("created_at", `${act.local_date}T00:00:00Z`);
    proposal = (count ?? 0) > 0;
  }
  if (workout?.type === "race") raceClockS = (await loadClock(userId, addDays(act.local_date, -1)).catch(() => null))?.seconds ?? null;

  const v = verdictFor({
    run: { id: act.id, date: act.local_date, distanceM: num(act.distance_m), movingS: movingOf(act), elapsedS: num(act.duration_s), avgHr: act.avg_hr == null ? null : num(act.avg_hr), indoor: INDOOR.test(act.type_key), easy },
    laps,
    workout,
    easyZone: zone,
    normalHr,
    testPredictionS,
    proposal,
    raceClockS,
  });

  const ghostable = v.easy && !v.finish && easy && !INDOOR.test(act.type_key) && (!workout || !(REP_TYPES.has(workout.type) || workout.type === "test" || workout.type === "race"));
  const ghost = ghostable && act.avg_hr ? await ghostOf(userId, { ...act, secPerKm: v.easy!.secPerKm, avg_hr: v.easy!.hr ?? act.avg_hr }, quality) : null;

  let challenge: SpotVerdict["challenge"] = null;
  {
    const { data: c } = await db().from("weekly_challenges").select("kind, params, result, result_value").eq("user_id", userId).eq("decided_activity_id", act.id).not("result", "is", null).limit(1).maybeSingle();
    if (c) challenge = { kind: c.kind as ChallengeKind, params: c.params as Record<string, number>, result: c.result as "won" | "lost", value: Number(c.result_value) };
  }
  return { ...v, ghost, challenge };
}

/** What the week bought (spec §8): Sunday from 18:00 and Monday until its first run has synced. */
async function weekView(userId: string, today: ISODate, tz: string, now: Date): Promise<SpotWeek | null> {
  const wd = weekday(today);
  if (wd === 0 ? localHour(tz, now) < 18 : wd !== 1) return null;
  const sunday = lastSunday(today);
  const monday = addDays(sunday, -6);
  const { data: acts } = await db().from("activities").select("local_date, type_key, distance_m").eq("user_id", userId).gte("local_date", monday).lte("local_date", today);
  const runs = (acts ?? []).filter((a) => isRun(a.type_key));
  if (wd === 1 && runs.some((a) => a.local_date === today)) return null;
  const clock = await loadClock(userId, today).catch(() => null);
  if (!clock) return null;
  const col = PRED_COL[clock.race.distance];
  const { data: preds } = await db().from("prediction_days").select(`local_date, ${col}`).eq("user_id", userId).gte("local_date", addDays(sunday, -3 * 7 - 3)).lte("local_date", sunday);
  const w = weekBought(
    (preds ?? []).map((p) => ({ date: (p as { local_date: string }).local_date, s: Number((p as Record<string, unknown>)[col] ?? 0) })),
    today,
  );
  if (!w) return null;
  const week = runs.filter((a) => a.local_date <= sunday);
  return { distance: clock.race.distance, weeks: w.weeks, runs: week.length, km: Math.round(week.reduce((s, a) => s + num(a.distance_m), 0) / 100) / 10 };
}

/** The place under the race clock (spec §4): alert, verdict, what the week bought, the challenge. */
export async function loadSpot(userId: string, today: ISODate, opts: { now?: Date } = {}): Promise<SpotView> {
  const now = opts.now ?? new Date();
  // The alert is the slow part (recovery days): read it alongside the rest. No part may take the others down: the
  // alert especially must show even when the new parts fail.
  const safe = <T,>(what: string, p: Promise<T>) =>
    p.catch((e) => {
      console.error(`spot ${what} failed`, userId, e instanceof Error ? e.message : e);
      return null;
    });
  const notePromise = safe("alert", dailyNote(userId, today));
  const [garmin, tz] = await Promise.all([getGarminStatus(userId), timezone(userId)]);
  let verdict: SpotVerdict | null = null, week: SpotWeek | null = null, challenge: ChallengeView | null = null;
  if (garmin) {
    await decideChallenges(userId, today).catch((e) => console.error("challenge decide failed", userId, e instanceof Error ? e.message : e));
    [verdict, week, challenge] = await Promise.all([safe("verdict", latestVerdict(userId, today)), safe("week", weekView(userId, today, tz, now)), safe("challenge", ensureChallenge(userId, today))]);
  }
  const note = await notePromise;
  const alert = note && (note.waiting || (note.alert && !note.alertDone)) ? note : null;
  const open = challenge && !challenge.result ? challenge : null;
  const { main, challengeLine } = pickSpot({ alert: !!alert && !alert.waiting, verdict: !!verdict, week: !!week, challengeOpen: !!open });
  return { alert, verdict, week, challenge: open, main, challengeLine };
}

/** The verdict in one plain line for the coach. */
export function verdictForCoach(v: SpotVerdict): string {
  const pace = (s: number) => formatPace(s);
  const parts = [`Last run ${v.date}${v.title ? ` (${v.title})` : ""}: verdict ${v.word ?? "none"}`];
  if (v.reps?.length) parts.push(`reps ${v.reps.map((r) => pace(r.secPerKm)).join(", ")}${v.zone ? ` vs zone ${pace(v.zone.min)}–${pace(v.zone.max)}` : ""}${v.repsDone != null && v.repsPlanned != null && v.repsDone < v.repsPlanned ? `, ${v.repsDone} of ${v.repsPlanned} reps` : ""}`);
  if (v.easy) parts.push(`pace ${pace(v.easy.secPerKm)}${v.easy.hr != null ? `, HR ${v.easy.hr}` : ""}${v.easy.hrVsNormal != null ? ` (${v.easy.hrVsNormal >= 0 ? "+" : ""}${v.easy.hrVsNormal} vs usual easy HR)` : ""}`);
  if (v.test) parts.push(`test ${v.test.km} km in ${v.test.timeS} s${v.test.beat != null ? (v.test.beat ? ", beat Garmin's estimate" : ", slower than Garmin's estimate") : ""}`);
  if (v.race) parts.push(`race ${v.race.km} km in ${v.race.timeS} s`);
  if (v.ghost) parts.push(`vs a similar ${v.ghost.km} km easy run on ${v.ghost.date}: ${v.ghost.deltaS} s/km, ${v.ghost.deltaHr} bpm`);
  return `${parts.join("; ")}.`;
}
