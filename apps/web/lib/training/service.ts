import "server-only";
import {
  addDays,
  fitnessFrom,
  generatePlan,
  generateRidePlan,
  isRide,
  rideFitnessFrom,
  rideTestProposal,
  isRun,
  KCAL_PER_KG,
  localDate,
  missedProposal,
  pacesProposal,
  slowerPacesProposal,
  testProposal,
  volumeProposal,
  applyChanges,
  vdotFrom,
  predictTimeS,
  RACE_KM,
  type Block,
  type Goal,
  type ISODate,
  type PlanContext,
  type PlanWorkout,
  type ProposalChange,
  type RaceDistance,
  type RideGoal,
  type RideRecord,
  type RideTestRun,
  type RunRecord,
  type TestRun,
  type WorkoutSpec,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/db/types";
import { httpGarmin, type GarminSource } from "@/lib/garmin/adapter";
import { loadTokens, updateTokens } from "@/lib/garmin/accounts";
import { toGarminWorkout } from "@/lib/garmin/workout-json";
import { computeRecovery } from "@/lib/recovery/compute";
import { qualityResultsBetween } from "./quality";

type Tables = Database["public"]["Tables"];
export type PlanRow = Tables["training_plans"]["Row"];
export type WorkoutRow = Tables["planned_workouts"]["Row"];
export type ProposalRow = Tables["plan_proposals"]["Row"];

export const PUSH_WINDOW_DAYS = 14;
const BUILD_EXTEND_AHEAD_DAYS = 21;
const BUILD_EXTEND_WEEKS = 4;

const db = () => createAdminSupabase();

/** Stored km (numeric(6,3) rounds 21.0975 → 21.098) back to the race distance. */
export const distanceOf = (p: Pick<PlanRow, "distance_km">): RaceDistance | null => {
  if (p.distance_km == null) return null;
  const km = Number(p.distance_km);
  return (Object.keys(RACE_KM) as RaceDistance[]).find((d) => Math.abs(RACE_KM[d] - km) < 0.01) ?? null;
};

export const goalOf = (p: PlanRow): Goal =>
  p.goal_kind === "race" && p.race_date && distanceOf(p)
    ? { kind: "race", distance: distanceOf(p)!, raceDate: p.race_date, targetTimeS: p.target_time_s }
    : { kind: "build", focus: distanceOf(p) };

export function toPlanWorkout(r: WorkoutRow, activityKm?: number | null): PlanWorkout {
  return {
    id: r.id,
    date: r.date,
    type: r.type,
    title: r.title,
    blocks: r.blocks as unknown as Block[],
    plannedKm: Number(r.planned_km),
    plannedDurationS: r.planned_duration_s,
    week: r.week,
    phase: r.phase as PlanWorkout["phase"],
    status: r.status,
    activityKm: activityKm ?? null,
  };
}

/** Race-day pace: the target time if set, else the time predicted from the plan's fitness. */
function racePaceOf(p: PlanRow): number | null {
  const d = distanceOf(p);
  if (!d) return null;
  const timeS = p.target_time_s ?? predictTimeS(RACE_KM[d] * 1000, Number(p.vdot));
  return Math.round(timeS / RACE_KM[d]);
}

async function timezoneOf(userId: string): Promise<string> {
  const { data } = await db().from("profiles").select("timezone").eq("user_id", userId).single();
  return data?.timezone ?? "UTC";
}

export async function todayFor(userId: string): Promise<ISODate> {
  return localDate(await timezoneOf(userId));
}

export async function activePlan(userId: string): Promise<PlanRow | null> {
  const { data } = await db().from("training_plans").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
  return data;
}

export async function planWorkouts(planId: string): Promise<WorkoutRow[]> {
  const { data, error } = await db().from("planned_workouts").select("*").eq("plan_id", planId).order("date");
  if (error) throw error;
  return data;
}

/** Runs from synced activities, for fitness estimates. */
export async function recentRuns(userId: string, today: ISODate): Promise<RunRecord[]> {
  const { data } = await db()
    .from("activities")
    .select("local_date, type_key, distance_m, moving_s, duration_s, splits")
    .eq("user_id", userId)
    .gte("local_date", addDays(today, -56))
    .lt("local_date", today);
  return (data ?? [])
    .filter((a) => isRun(a.type_key) && a.distance_m != null)
    .map((a) => ({
      date: a.local_date,
      distanceM: Number(a.distance_m),
      timeS: Number(a.moving_s ?? a.duration_s ?? 0),
      indoor: /treadmill|indoor|virtual/.test(a.type_key),
      laps: ((a.splits as { lapDTOs?: { distance?: number | null; duration?: number | null }[] } | null)?.lapDTOs ?? []).map((l) => ({
        distanceM: Number(l.distance ?? 0),
        timeS: Number(l.duration ?? 0),
      })),
    }));
}

export interface CreatePlanInput {
  goal: Goal;
  weekdays: number[];
  longRunWeekday: number;
  runsPerWeek: number;
  /** Hills nearby: hill repeats take the place of fartlek. */
  hills?: boolean;
  /** Running (default) or cycling. */
  sport?: "run" | "ride";
  /** Cycling plans: the goal (event or build fitness). */
  ride?: { goal: RideGoal };
  /** Cycling: on a trainer right now (the rider says so; outdoors when unset). */
  indoor?: boolean;
  /** Optional recent race result that overrides the Garmin estimate. */
  recentRace?: { distanceM: number; timeS: number } | null;
}

async function deficitKcal(userId: string, today: ISODate): Promise<number> {
  const { data } = await db()
    .from("goals")
    .select("rate_kg_per_week")
    .eq("user_id", userId)
    .lte("valid_from", today)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = Number(data?.rate_kg_per_week ?? 0);
  return rate < 0 ? (-rate * KCAL_PER_KG) / 7 : 0;
}

const workoutRow = (userId: string, planId: string, w: WorkoutSpec) => ({
  plan_id: planId,
  user_id: userId,
  date: w.date,
  week: w.week,
  phase: w.phase,
  type: w.type,
  title: w.title,
  blocks: w.blocks as unknown as Json,
  planned_km: w.plannedKm,
  planned_duration_s: w.plannedDurationS,
  garmin_push_status: "pending" as const,
});

/** Garmin's latest 10K prediction (seconds), if synced. */
export async function garminTenK(userId: string): Promise<number | null> {
  const { data } = await db().from("garmin_accounts").select("race_predictions").eq("user_id", userId).maybeSingle();
  const t = (data?.race_predictions as { time10K?: number | null } | null)?.time10K;
  return typeof t === "number" && t > 0 ? t : null;
}

/** Fitness from synced runs plus Garmin's predictor. */
export async function currentFitness(userId: string, today: ISODate) {
  return fitnessFrom(await recentRuns(userId, today), today, { time10kS: await garminTenK(userId) });
}

/** Rides from synced activities (last 90 days), for cycling fitness. */
export async function recentRides(userId: string, today: ISODate): Promise<RideRecord[]> {
  const { data } = await db()
    .from("activities")
    .select("local_date, type_key, distance_m, moving_s, duration_s, max_hr, avgPower:raw->avgPower")
    .eq("user_id", userId)
    .gte("local_date", addDays(today, -90))
    .lt("local_date", today);
  return (data ?? [])
    .filter((a) => isRide(a.type_key))
    .map((a) => ({
      date: a.local_date,
      distanceM: Number(a.distance_m ?? 0),
      timeS: Number(a.moving_s ?? a.duration_s ?? 0),
      indoor: /indoor|virtual/.test(a.type_key),
      avgPower: typeof a.avgPower === "number" ? a.avgPower : null,
      maxHr: a.max_hr,
    }));
}

/** Garmin's lactate threshold heart rates; empty when unavailable (the zones then come from rides or a default). */
async function thresholdsFor(userId: string, source: GarminSource): Promise<{ lthrCycling?: number | null; lthrRunning?: number | null }> {
  // Once a day is plenty: previews (every toggle) and creation then agree on the same zones.
  const { data: acct } = await db().from("garmin_accounts").select("lthr_running, lthr_cycling, thresholds_at").eq("user_id", userId).maybeSingle();
  if (acct?.thresholds_at && Date.now() - Date.parse(acct.thresholds_at) < 86_400_000) return { lthrCycling: acct.lthr_cycling, lthrRunning: acct.lthr_running };
  const tokens = await loadTokens(userId);
  if (!tokens) return {};
  try {
    const r = await source.fetchThresholds(tokens);
    if (r.tokens) await updateTokens(userId, r.tokens);
    await db().from("garmin_accounts").update({ lthr_running: r.lthrRunning, lthr_cycling: r.lthrCycling, thresholds_at: new Date().toISOString() }).eq("user_id", userId);
    return { lthrCycling: r.lthrCycling, lthrRunning: r.lthrRunning };
  } catch {
    return {};
  }
}

/** Cycling preview: fitness from rides and Garmin's threshold heart rate, then the ride plan. */
export async function previewRidePlan(userId: string, input: CreatePlanInput, source: GarminSource = httpGarmin()) {
  const today = await todayFor(userId);
  const [rides, thresholds, deficit] = await Promise.all([recentRides(userId, today), thresholdsFor(userId, source), deficitKcal(userId, today)]);
  const fitness = rideFitnessFrom(rides, today, thresholds);
  const plan = generateRidePlan({
    goal: input.ride!.goal,
    startDate: today,
    weekdays: input.weekdays,
    longRideWeekday: input.longRunWeekday,
    ridesPerWeek: input.runsPerWeek,
    lthr: fitness.lthr,
    speedKmh: fitness.speedKmh,
    startMinPerWeek: fitness.baseMinPerWeek,
    deficitKcal: deficit,
    recentLongestMin: fitness.longestMin,
    hills: !!input.hills,
    indoor: !!input.indoor,
    experienced: fitness.experienced,
  });
  return { today, fitness, plan, indoor: !!input.indoor };
}

/** Preview without saving (wizard summary). */
export async function previewPlan(userId: string, input: CreatePlanInput) {
  const today = await todayFor(userId);
  const fit = await currentFitness(userId, today);
  const vdot = input.recentRace ? Math.round(vdotFrom(input.recentRace.distanceM, input.recentRace.timeS) * 10) / 10 : fit.vdot;
  const plan = generatePlan({
    goal: input.goal,
    startDate: today,
    weekdays: input.weekdays,
    longRunWeekday: input.longRunWeekday,
    runsPerWeek: input.runsPerWeek,
    vdot,
    startKmPerWeek: fit.baseKmPerWeek,
    deficitKcal: await deficitKcal(userId, today),
    experienced: fit.experienced,
    didQuality: fit.didQuality,
    recentLongestKm: fit.longestKm,
    hills: !!input.hills,
  });
  return { today, fitness: { ...fit, vdot, source: input.recentRace ? ({ kind: "manual" } as const) : fit.source }, plan };
}

/** Creates the plan (replacing any active one) and returns its id. */
export async function createPlan(userId: string, input: CreatePlanInput, source: GarminSource = httpGarmin()): Promise<string> {
  if (input.sport === "ride") return createRidePlan(userId, input, source);
  const { today, fitness, plan } = await previewPlan(userId, input);
  const d = db();
  await d.from("training_plans").update({ status: "cancelled" }).eq("user_id", userId).eq("status", "active");
  const goal = input.goal;
  const lastDate = plan.workouts.at(-1)?.date ?? today;
  const { data: row, error } = await d
    .from("training_plans")
    .insert({
      user_id: userId,
      goal_kind: goal.kind,
      // Build plans keep their focus distance here (null = General).
      distance_km: goal.kind === "race" ? RACE_KM[goal.distance] : goal.focus ? RACE_KM[goal.focus] : null,
      hills: !!input.hills,
      race_date: goal.kind === "race" ? goal.raceDate : null,
      target_time_s: goal.kind === "race" ? (goal.targetTimeS ?? null) : null,
      runs_per_week: input.runsPerWeek,
      weekdays: input.weekdays,
      long_run_weekday: input.longRunWeekday,
      vdot: fitness.vdot,
      start_km_per_week: fitness.baseKmPerWeek,
      experienced: fitness.experienced,
      did_quality: fitness.didQuality,
      recent_longest_km: fitness.longestKm,
      week1_grows: false,
      start_date: today,
      generated_until: goal.kind === "race" ? goal.raceDate : addDays(today, BUILD_EXTEND_WEEKS * 7 - 1) > lastDate ? addDays(today, BUILD_EXTEND_WEEKS * 7 - 1) : lastDate,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (plan.workouts.length) {
    const { error: wErr } = await d.from("planned_workouts").insert(plan.workouts.map((w) => workoutRow(userId, row.id, w)));
    if (wErr) throw wErr;
  }
  return row.id;
}

async function createRidePlan(userId: string, input: CreatePlanInput, source: GarminSource): Promise<string> {
  const { today, fitness, plan, indoor } = await previewRidePlan(userId, input, source);
  const run = await currentFitness(userId, today);
  const d = db();
  await d.from("training_plans").update({ status: "cancelled" }).eq("user_id", userId).eq("status", "active");
  const goal = input.ride!.goal;
  const lastDate = plan.workouts.at(-1)?.date ?? today;
  const { data: row, error } = await d
    .from("training_plans")
    .insert({
      user_id: userId,
      sport: "ride",
      goal_kind: goal.kind === "event" ? "race" : "build",
      race_date: goal.kind === "event" ? goal.date : null,
      event_km: goal.kind === "event" ? goal.km : null,
      event_elevation_m: goal.kind === "event" ? (goal.elevationM ?? null) : null,
      runs_per_week: input.runsPerWeek,
      weekdays: input.weekdays,
      long_run_weekday: input.longRunWeekday,
      // The runner's VDOT is kept for a later switch back; ride sessions use LTHR.
      vdot: run.vdot,
      lthr: fitness.lthr,
      ride_speed_kmh: fitness.speedKmh,
      power_seen: fitness.powerSeen,
      start_km_per_week: Math.round((fitness.baseMinPerWeek / 60) * fitness.speedKmh * 10) / 10,
      start_min_per_week: fitness.baseMinPerWeek,
      recent_longest_min: fitness.longestMin,
      experienced: fitness.experienced,
      did_quality: false,
      hills: !!input.hills,
      indoor,
      week1_grows: false,
      start_date: today,
      generated_until: goal.kind === "event" ? goal.date : addDays(today, BUILD_EXTEND_WEEKS * 7 - 1) > lastDate ? addDays(today, BUILD_EXTEND_WEEKS * 7 - 1) : lastDate,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (plan.workouts.length) {
    const { error: wErr } = await d.from("planned_workouts").insert(plan.workouts.map((w) => workoutRow(userId, row.id, w)));
    if (wErr) throw wErr;
  }
  return row.id;
}

/** The ride plan as stored, regenerated with indoor on or off (same dates, goal and start). */
async function rideFromPlan(userId: string, plan: PlanRow, indoor: boolean, today: ISODate, untilDate?: ISODate) {
  return generateRidePlan({
    goal: plan.goal_kind === "race" && plan.race_date && plan.event_km != null
      ? { kind: "event", date: plan.race_date, km: Number(plan.event_km), elevationM: plan.event_elevation_m }
      : { kind: "build" },
    startDate: plan.start_date,
    weekdays: plan.weekdays,
    longRideWeekday: plan.long_run_weekday,
    ridesPerWeek: plan.runs_per_week,
    lthr: plan.lthr ?? 165,
    speedKmh: Number(plan.ride_speed_kmh ?? 25),
    startMinPerWeek: plan.start_min_per_week ?? 180,
    deficitKcal: await deficitKcal(userId, today),
    recentLongestMin: plan.recent_longest_min ?? undefined,
    hills: plan.hills,
    indoor,
    experienced: plan.experienced,
    untilDate: plan.goal_kind === "build" ? (untilDate ?? plan.generated_until) : undefined,
  });
}

/**
 * Indoor season on or off: upcoming planned rides are rebuilt for the trainer (or the road) on the same dates.
 * Done sessions and today's done ride stay; the old copies leave the watch on the next push.
 */
export async function setRideIndoor(userId: string, indoor: boolean): Promise<boolean> {
  const plan = await activePlan(userId);
  if (!plan || plan.sport !== "ride") return false;
  const d = db();
  const today = await todayFor(userId);
  const full = await rideFromPlan(userId, plan, indoor, today);
  const rows = await planWorkouts(plan.id);
  const doneDays = new Set(rows.filter((w) => w.status === "done").map((w) => w.date));
  const old = rows.filter((w) => w.status === "planned" && w.date >= today);
  const fresh = full.workouts.filter((w) => w.date >= today && !doneDays.has(w.date));
  const fields = (w: WorkoutSpec, status: string) => ({
    date: w.date,
    status,
    type: w.type,
    title: w.title,
    blocks: w.blocks,
    planned_km: w.plannedKm,
    planned_duration_s: w.plannedDurationS,
  });
  // One transaction: the old rides go and the rebuilt ones come, or nothing changes.
  const { error } = await db().rpc("save_plan_changes", {
    p_user: userId,
    p_plan: plan.id,
    p_vdot: null as unknown as number,
    p_updates: old.map((w) => ({ id: w.id, ...fields(toPlanWorkout(w), "removed") })) as unknown as Json,
    p_inserts: fresh.map((w) => ({ ...fields(w, "planned"), week: w.week, phase: w.phase })) as unknown as Json,
  });
  if (error) throw error;
  await d.from("training_plans").update({ indoor }).eq("id", plan.id);
  // Suggestions about sessions that no longer exist are out of date.
  await d.from("plan_proposals").update({ status: "stale" }).eq("plan_id", plan.id).eq("status", "pending");
  return true;
}

/** Cancels the active plan; its sessions are removed from Garmin on the next push. */
export async function cancelPlan(userId: string): Promise<void> {
  const d = db();
  const plan = await activePlan(userId);
  if (!plan) return;
  await d.from("training_plans").update({ status: "cancelled" }).eq("id", plan.id);
  await d.from("plan_proposals").update({ status: "stale" }).eq("plan_id", plan.id).eq("status", "pending");
}

/**
 * Matches runs to planned sessions (done / missed), completes finished race plans and
 * extends rolling build plans. Idempotent; called after every sync and on page load.
 */
export async function reconcilePlan(userId: string, today: ISODate): Promise<void> {
  const plan = await activePlan(userId);
  if (!plan) return;
  const d = db();
  const workouts = await planWorkouts(plan.id);
  const open = workouts.filter((w) => (w.status === "planned" || w.status === "missed") && w.date <= today);
  if (open.length) {
    const { data: acts } = await d
      .from("activities")
      .select("id, local_date, type_key, distance_m")
      .eq("user_id", userId)
      .gte("local_date", open[0]!.date)
      .lte("local_date", today);
    const runsByDate = new Map<ISODate, { id: string; km: number }>();
    const counts = plan.sport === "ride" ? isRide : isRun;
    for (const a of acts ?? []) {
      if (!counts(a.type_key)) continue;
      const km = Number(a.distance_m ?? 0) / 1000;
      const prev = runsByDate.get(a.local_date);
      if (!prev || km > prev.km) runsByDate.set(a.local_date, { id: a.id, km });
    }
    const usedActivities = new Set(workouts.filter((w) => w.activity_id).map((w) => w.activity_id));
    for (const w of open) {
      const run = runsByDate.get(w.date);
      if (run && !usedActivities.has(run.id)) {
        usedActivities.add(run.id);
        await d.from("planned_workouts").update({ status: "done", activity_id: run.id }).eq("id", w.id);
      } else if (w.date < today && w.status === "planned") {
        await d.from("planned_workouts").update({ status: "missed" }).eq("id", w.id);
      }
    }
  }

  if (plan.goal_kind === "race" && plan.race_date && plan.race_date < today) {
    await d.from("training_plans").update({ status: "completed" }).eq("id", plan.id);
    return;
  }

  if (plan.goal_kind === "build" && plan.generated_until < addDays(today, BUILD_EXTEND_AHEAD_DAYS)) {
    const until = addDays(plan.generated_until, BUILD_EXTEND_WEEKS * 7);
    const full = plan.sport === "ride" ? await rideFromPlan(userId, plan, plan.indoor, today, until) : generatePlan({
      // Same focus and hills as when the plan was made, so new weeks continue the same rotation.
      goal: goalOf(plan),
      hills: plan.hills,
      startDate: plan.start_date,
      weekdays: plan.weekdays,
      longRunWeekday: plan.long_run_weekday,
      runsPerWeek: plan.runs_per_week,
      vdot: Number(plan.vdot),
      startKmPerWeek: Number(plan.start_km_per_week),
      deficitKcal: await deficitKcal(userId, today),
      untilDate: until,
      experienced: plan.experienced,
      didQuality: plan.did_quality,
      recentLongestKm: plan.recent_longest_km == null ? undefined : Number(plan.recent_longest_km),
      week1Grows: plan.week1_grows,
    });
    const fresh = full.workouts.filter((w) => w.date > plan.generated_until && w.date >= today);
    if (fresh.length) await d.from("planned_workouts").insert(fresh.map((w) => workoutRow(userId, plan.id, w)));
    await d.from("training_plans").update({ generated_until: until }).eq("id", plan.id);
  }
}

export function planContext(plan: PlanRow, today: ISODate): PlanContext {
  return {
    weekdays: plan.weekdays,
    vdot: Number(plan.vdot),
    racePaceS: plan.sport === "ride" ? null : racePaceOf(plan),
    distance: plan.sport === "ride" ? null : distanceOf(plan),
    today,
    racePaceFromVdot: plan.target_time_s == null,
    sport: plan.sport as "run" | "ride",
    lthr: plan.lthr,
    rideSpeedKmh: plan.ride_speed_kmh == null ? null : Number(plan.ride_speed_kmh),
    indoor: plan.indoor,
  };
}

export async function planWorkoutsWithKm(plan: PlanRow): Promise<PlanWorkout[]> {
  const rows = await planWorkouts(plan.id);
  const ids = rows.map((r) => r.activity_id).filter((x): x is string => !!x);
  const { data: acts } = ids.length ? await db().from("activities").select("id, distance_m").in("id", ids) : { data: [] };
  const km = new Map((acts ?? []).map((a) => [a.id, Number(a.distance_m ?? 0) / 1000]));
  return rows.map((r) => toPlanWorkout(r, r.activity_id ? km.get(r.activity_id) : null));
}

/** The ride linked to a done ride test: each lap's time and average heart rate. */
async function rideTestRunFor(planId: string, workoutId: string, date: string): Promise<RideTestRun | null> {
  const { data: w } = await db().from("planned_workouts").select("activity_id").eq("id", workoutId).eq("plan_id", planId).maybeSingle();
  if (!w?.activity_id) return null;
  const { data: a } = await db().from("activities").select("splits").eq("id", w.activity_id).maybeSingle();
  const laps = ((a?.splits as { lapDTOs?: { duration?: number | null; movingDuration?: number | null; averageHR?: number | null }[] } | null)?.lapDTOs ?? []).map((l) => ({
    timeS: Number(l.movingDuration ?? l.duration ?? 0),
    avgHr: l.averageHR ?? null,
  }));
  return { date, laps };
}

/** The activity linked to a done fitness test, with its Garmin laps. */
async function testRunFor(planId: string, workoutId: string, date: string): Promise<TestRun | null> {
  const { data: w } = await db().from("planned_workouts").select("activity_id").eq("id", workoutId).eq("plan_id", planId).maybeSingle();
  if (!w?.activity_id) return null;
  const { data: a } = await db().from("activities").select("distance_m, moving_s, duration_s, splits").eq("id", w.activity_id).maybeSingle();
  if (!a) return null;
  const laps = ((a.splits as { lapDTOs?: { distance?: number | null; duration?: number | null; movingDuration?: number | null }[] } | null)?.lapDTOs ?? []).map((l) => ({
    distanceM: Number(l.distance ?? 0),
    timeS: Number(l.movingDuration ?? l.duration ?? 0),
  }));
  return { date, distanceM: Number(a.distance_m ?? 0), timeS: Number(a.moving_s ?? a.duration_s ?? 0), laps };
}

/** Engine proposals, created lazily (on page load / after sync). At most one pending per kind. */
export async function refreshProposals(userId: string, today: ISODate): Promise<void> {
  const plan = await activePlan(userId);
  if (!plan) return;
  const d = db();
  const { data: existing } = await d.from("plan_proposals").select("*").eq("plan_id", plan.id);
  const all = existing ?? [];

  // Pending moves into the past are no longer useful.
  for (const p of all.filter((x) => x.status === "pending" && x.kind !== "ai")) {
    const ch = p.changes as unknown as ProposalChange[];
    if (ch.some((c) => c.op === "move" && c.toDate < today)) await d.from("plan_proposals").update({ status: "stale" }).eq("id", p.id);
  }
  const pendingKinds = new Set(all.filter((p) => p.status === "pending").map((p) => p.kind));
  if (plan.sport === "ride") {
    const workouts = await planWorkoutsWithKm(plan);
    const ctx = planContext(plan, today);
    const proposed = new Set(all.filter((p) => p.kind === "missed").flatMap((p) => (p.changes as unknown as ProposalChange[]).map((c) => ("workoutId" in c ? c.workoutId : ""))));
    const test = workouts.filter((w) => w.type === "test" && w.status === "done" && w.date >= addDays(today, -14)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const tested = (date: string) => all.some((p) => p.kind === "paces" && p.summary.startsWith(`Ride test (${date})`));
    const run = test && !pendingKinds.has("paces") && !tested(test.date) ? await rideTestRunFor(plan.id, test.id, test.date) : null;
    const candidates = [
      run && plan.lthr ? rideTestProposal(plan.lthr, run) : null,
      !pendingKinds.has("missed") ? missedProposal(workouts, ctx, proposed) : null,
    ].filter((p) => p != null);
    for (const p of candidates)
      await d.from("plan_proposals").insert({ user_id: userId, plan_id: plan.id, kind: p.kind, summary: p.summary, changes: p.changes as unknown as Json });
    return;
  }
  const recent = (kind: ProposalRow["kind"]) => all.some((p) => p.kind === kind && p.created_at > new Date(Date.now() - 14 * 86_400_000).toISOString());

  const workouts = await planWorkoutsWithKm(plan);
  const ctx = planContext(plan, today);
  const proposed = new Set(
    all.filter((p) => p.kind === "missed").flatMap((p) => (p.changes as unknown as ProposalChange[]).map((c) => ("workoutId" in c ? c.workoutId : ""))),
  );

  // A fitness test done in the last two weeks: its result decides the paces (once per test).
  const test = workouts
    .filter((w) => w.type === "test" && w.status === "done" && w.date >= addDays(today, -14))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const testDone = (date: string) => all.some((p) => p.kind === "paces" && p.summary.startsWith(`Fitness test (${date})`));
  const testRun = test && !pendingKinds.has("paces") && !testDone(test.date) ? await testRunFor(plan.id, test.id, test.date) : null;
  const fromTest = testRun ? testProposal(Number(plan.vdot), testRun) : null;
  // A test in the last two weeks decides the paces: no estimate-based proposal may overrule it.
  const testedRecently = !!test;

  const candidates = [
    fromTest,
    !pendingKinds.has("missed") ? missedProposal(workouts, ctx, proposed) : null,
    !fromTest && !testedRecently && !pendingKinds.has("paces") && !recent("paces")
      ? (pacesProposal(Number(plan.vdot), (await currentFitness(userId, today)).vdot) ??
        slowerPacesProposal(Number(plan.vdot), await qualityResultsBetween(userId, addDays(today, -21), today, plan.id), today))
      : null,
    !pendingKinds.has("volume") && !recent("volume") ? volumeProposal(workouts, ctx) : null,
  ].filter((p) => p != null);

  for (const p of candidates)
    await d.from("plan_proposals").insert({ user_id: userId, plan_id: plan.id, kind: p.kind, summary: p.summary, changes: p.changes as unknown as Json });
}

/** Applies a proposal's changes to the plan. Returns false if it is no longer pending. */
/** Applies engine changes to the stored plan: updates changed sessions, inserts added ones, marks all for Garmin push. */
export async function savePlanChanges(userId: string, plan: PlanRow, changes: ProposalChange[], today: ISODate): Promise<string[]> {
  const before = await planWorkoutsWithKm(plan);
  const result = applyChanges(before, changes, planContext(plan, today));
  const changed = result.workouts.filter((x) => result.changedIds.has(x.id));
  const fields = (w: PlanWorkout) => ({
    date: w.date,
    status: w.status,
    type: w.type,
    title: w.title,
    blocks: w.blocks,
    planned_km: w.plannedKm,
    planned_duration_s: w.plannedDurationS,
  });
  // One transaction: either every session changes or none does.
  const { data, error } = await db().rpc("save_plan_changes", {
    p_user: userId,
    p_plan: plan.id,
    p_vdot: (result.vdot !== Number(plan.vdot) ? result.vdot : null) as number, // null = unchanged (generated types miss nullable args)
    p_updates: changed.filter((w) => !w.id.startsWith("new:")).map((w) => ({ id: w.id, ...fields(w) })) as unknown as Json,
    p_inserts: changed.filter((w) => w.id.startsWith("new:")).map((w) => ({ ...fields(w), week: w.week, phase: w.phase })) as unknown as Json,
  });
  if (error) throw error;
  if (result.lthr != null && result.lthr !== plan.lthr) await db().from("training_plans").update({ lthr: result.lthr }).eq("id", plan.id);
  return (data ?? []) as unknown as string[];
}

export async function acceptProposal(userId: string, proposalId: string): Promise<boolean> {
  const d = db();
  const { data: p } = await d.from("plan_proposals").select("*").eq("id", proposalId).eq("user_id", userId).maybeSingle();
  if (!p || p.status !== "pending") return false;
  const plan = await activePlan(userId);
  if (!plan || plan.id !== p.plan_id) {
    await d.from("plan_proposals").update({ status: "stale" }).eq("id", p.id);
    return false;
  }
  const today = await todayFor(userId);
  await savePlanChanges(userId, plan, p.changes as unknown as ProposalChange[], today);
  await d.from("plan_proposals").update({ status: "accepted" }).eq("id", p.id);
  return true;
}

export async function rejectProposal(userId: string, proposalId: string): Promise<boolean> {
  const { data } = await db()
    .from("plan_proposals")
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id");
  return !!data?.length;
}

/**
 * Keeps Garmin's calendar in step with the plan: the next 14 days of planned sessions are
 * uploaded; changed sessions are replaced; removed/cancelled ones are deleted. Best effort.
 */
export async function pushToGarmin(userId: string, today: ISODate, source: GarminSource = httpGarmin()): Promise<void> {
  let tokens = await loadTokens(userId);
  if (!tokens) return;
  const d = db();
  const remember = async (t: string | null) => {
    if (t) {
      tokens = t;
      await updateTokens(userId, t);
    }
  };

  const plan = await activePlan(userId);
  const { data: stale } = await d
    .from("planned_workouts")
    .select("id, date, garmin_workout_id, garmin_schedule_id, garmin_push_status, status, plan:training_plans!inner(status)")
    .eq("user_id", userId)
    .not("garmin_workout_id", "is", null)
    .gte("date", today);
  const windowEnd = addDays(today, PUSH_WINDOW_DAYS - 1);
  // Removed sessions, sessions of ended plans, and changed sessions now beyond the window (their old copy must go now).
  const movedOut = (w: { date: string; garmin_push_status: string; status: string }) =>
    w.status === "planned" && w.date > windowEnd && (w.garmin_push_status === "pending" || w.garmin_push_status === "failed");
  const toDelete = (stale ?? []).filter((w) => w.status === "removed" || w.plan.status !== "active" || movedOut(w));

  const { data: due } = plan
    ? await d
        .from("planned_workouts")
        .select("*")
        .eq("plan_id", plan.id)
        .eq("status", "planned")
        .gte("date", today)
        .lte("date", windowEnd)
        .in("garmin_push_status", ["pending", "failed"])
        .order("date")
    : { data: [] as WorkoutRow[] };

  try {
    for (const w of toDelete) {
      const r = await source.deleteWorkout(tokens!, w.garmin_workout_id!, w.garmin_schedule_id);
      await remember(r.tokens);
      await d
        .from("planned_workouts")
        .update({ garmin_workout_id: null, garmin_schedule_id: null, garmin_push_status: movedOut(w) ? "pending" : "none" })
        .eq("id", w.id);
    }
    for (const w of due ?? []) {
      if (w.garmin_workout_id) {
        const r = await source.deleteWorkout(tokens!, w.garmin_workout_id, w.garmin_schedule_id);
        await remember(r.tokens);
      }
      try {
        const r = await source.pushWorkout(tokens!, toGarminWorkout(toPlanWorkout(w), plan!.sport === "ride" ? "ride" : "run"), w.date);
        await remember(r.tokens);
        await d
          .from("planned_workouts")
          .update({ garmin_workout_id: r.workoutId, garmin_schedule_id: r.scheduleId, garmin_push_status: "pushed" })
          .eq("id", w.id);
      } catch (e) {
        await d.from("planned_workouts").update({ garmin_workout_id: null, garmin_schedule_id: null, garmin_push_status: "failed" }).eq("id", w.id);
        if ((e as { kind?: string }).kind === "auth") throw e;
      }
    }
  } catch (e) {
    console.error("garmin push stopped", userId, e instanceof Error ? e.message : e);
  }
}

/** Everything that should happen after new Garmin data arrives. */
export async function afterGarminSync(userId: string, today: ISODate, source?: GarminSource): Promise<void> {
  await reconcilePlan(userId, today);
  await refreshProposals(userId, today);
  await pushToGarmin(userId, today, source);
  // Recovery never blocks training upkeep.
  try {
    await computeRecovery(userId, today);
  } catch (e) {
    console.error("recovery compute failed", userId, e instanceof Error ? e.message : e);
  }
}
