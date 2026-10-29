import "server-only";
import { withStatedStart,
  addDays,
  crossSessions,
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
  pacesFor,
  predictTimeS,
  RACE_KM,
  retargetRide,
  rideContext,
  type Block,
  type GeneratedPlan,
  type Goal,
  type ISODate,
  type PlanContext,
  type PlanWorkout,
  type ProposalChange,
  type RaceDistance,
  type RideGoal,
  type RideFitness,
  type RideRecord,
  type RideTestRun,
  type RideThresholds,
  type Sport,
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
    sport: r.sport as Sport,
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
  /** Rides with power targets (needs a known FTP; default: on when recent rides had power). */
  power?: boolean;
  /** Days for easy sessions of the other sport (rides in a running plan, runs in a cycling plan). */
  crossWeekdays?: number[];
  /** Optional recent race result that overrides the Garmin estimate. */
  recentRace?: { distanceM: number; timeS: number } | null;
  /** Running lately as the runner states it; used only when no runs are logged (no Garmin). */
  start?: { kmPerWeek: number; longestKm: number } | null;
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
  sport: w.sport,
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
    .select("local_date, type_key, distance_m, moving_s, duration_s, max_hr, avgPower:raw->avgPower, best20W:raw->maxAvgPower_1200, best60W:raw->maxAvgPower_3600")
    .eq("user_id", userId)
    .gte("local_date", addDays(today, -90))
    .lt("local_date", today);
  const num = (x: unknown) => (typeof x === "number" ? x : null);
  return (data ?? [])
    .filter((a) => isRide(a.type_key))
    .map((a) => ({
      date: a.local_date,
      distanceM: Number(a.distance_m ?? 0),
      timeS: Number(a.moving_s ?? a.duration_s ?? 0),
      indoor: /indoor|virtual/.test(a.type_key),
      avgPower: num(a.avgPower),
      best20W: num(a.best20W),
      best60W: num(a.best60W),
      maxHr: a.max_hr,
    }));
}

/** Garmin's threshold heart rates and cycling FTP; empty when unavailable (zones then come from rides or a default). */
async function thresholdsFor(userId: string, source: GarminSource): Promise<RideThresholds> {
  // Once a day is plenty: previews (every toggle) and creation then agree on the same zones.
  const { data: acct } = await db()
    .from("garmin_accounts")
    .select("lthr_running, lthr_cycling, ftp_cycling, ftp_cycling_at, thresholds_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (acct?.thresholds_at && Date.now() - Date.parse(acct.thresholds_at) < 86_400_000)
    return { lthrCycling: acct.lthr_cycling, lthrRunning: acct.lthr_running, ftp: acct.ftp_cycling, ftpDate: acct.ftp_cycling_at };
  const tokens = await loadTokens(userId);
  if (!tokens) return {};
  try {
    const r = await source.fetchThresholds(tokens);
    if (r.tokens) await updateTokens(userId, r.tokens);
    await db()
      .from("garmin_accounts")
      .update({ lthr_running: r.lthrRunning, lthr_cycling: r.lthrCycling, ftp_cycling: r.ftp, ftp_cycling_at: r.ftpDate, thresholds_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { lthrCycling: r.lthrCycling, lthrRunning: r.lthrRunning, ftp: r.ftp, ftpDate: r.ftpDate };
  } catch {
    return {};
  }
}

/** Cycling fitness: rides plus Garmin's thresholds. */
async function rideSetup(userId: string, today: ISODate, source: GarminSource): Promise<RideFitness> {
  const [rides, thresholds] = await Promise.all([recentRides(userId, today), thresholdsFor(userId, source)]);
  return rideFitnessFrom(rides, today, thresholds);
}

/** Power targets: the rider's choice (default: on when recent rides had power), and only with a known FTP. */
const usePower = (fitness: RideFitness, choice?: boolean) => !!fitness.ftp && (choice ?? fitness.powerSeen);

type PlanInsert = Tables["training_plans"]["Insert"];

/** The ride columns of a plan (a cycling plan, or a running plan with rides on cross days). */
const rideColumns = (fitness: RideFitness, power: boolean, indoor: boolean): Partial<PlanInsert> => ({
  lthr: fitness.lthr,
  ftp: fitness.ftp,
  power,
  ride_speed_kmh: fitness.speedKmh,
  power_seen: fitness.powerSeen,
  start_min_per_week: fitness.baseMinPerWeek,
  recent_longest_min: fitness.longestMin,
  ride_experienced: fitness.experienced,
  indoor,
});

/** Cross sessions for a generated main plan, from the stored (or about to be stored) plan columns. */
interface CrossSource {
  sport: string;
  goal_kind: string;
  race_date: string | null;
  start_date: string;
  vdot: number;
  lthr: number | null;
  ftp: number | null;
  power: boolean;
  ride_speed_kmh: number | null;
  ride_experienced: boolean;
}
const crossSource = (r: PlanInsert): CrossSource => ({
  sport: r.sport ?? "run",
  goal_kind: r.goal_kind,
  race_date: r.race_date ?? null,
  start_date: r.start_date,
  vdot: Number(r.vdot),
  lthr: r.lthr ?? null,
  ftp: r.ftp ?? null,
  power: !!r.power,
  ride_speed_kmh: r.ride_speed_kmh ?? null,
  ride_experienced: !!r.ride_experienced,
});

function crossOf(
  plan: CrossSource,
  main: GeneratedPlan,
  days: readonly number[],
  indoor: boolean,
): WorkoutSpec[] {
  if (!days.length) return [];
  const base = { weekdays: days, startDate: plan.start_date, eventDate: plan.goal_kind === "race" ? plan.race_date : null };
  return plan.sport === "ride"
    ? crossSessions(main.weeks, { ...base, sport: "run", run: { ctx: { paces: pacesFor(Number(plan.vdot)) } } })
    : crossSessions(main.weeks, {
        ...base,
        sport: "ride",
        ride: { ctx: rideCtxOf(plan), indoor, experienced: plan.ride_experienced },
      });
}
const rideCtxOf = (plan: Pick<CrossSource, "lthr" | "ftp" | "power" | "ride_speed_kmh">) =>
  rideContext(plan.lthr ?? 165, Number(plan.ride_speed_kmh ?? 25), plan.power ? plan.ftp : null);
const byDate = (a: WorkoutSpec, b: WorkoutSpec) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Cycling preview: fitness from rides and Garmin's thresholds, then the ride plan (and runs on cross days). */
export async function previewRidePlan(userId: string, input: CreatePlanInput, source: GarminSource = httpGarmin(), opts: { create?: boolean } = {}) {
  const today = await todayFor(userId);
  const cross = input.crossWeekdays ?? [];
  const [fitness, deficit, run] = await Promise.all([
    rideSetup(userId, today, source),
    deficitKcal(userId, today),
    // The runner's VDOT: paces for runs on cross days, and kept for a later switch back (only at creation otherwise).
    cross.length || opts.create ? currentFitness(userId, today) : Promise.resolve(null),
  ]);
  const power = usePower(fitness, input.power);
  const indoor = !!input.indoor;
  const plan = generateRidePlan({
    goal: input.ride!.goal,
    startDate: today,
    weekdays: input.weekdays,
    longRideWeekday: input.longRunWeekday,
    ridesPerWeek: input.runsPerWeek,
    lthr: fitness.lthr,
    ftp: power ? fitness.ftp : null,
    speedKmh: fitness.speedKmh,
    startMinPerWeek: fitness.baseMinPerWeek,
    deficitKcal: deficit,
    recentLongestMin: fitness.longestMin,
    hills: !!input.hills,
    indoor,
    experienced: fitness.experienced,
  });
  const goal = input.ride!.goal;
  const row: PlanInsert = {
    user_id: userId,
    sport: "ride",
    goal_kind: goal.kind === "event" ? "race" : "build",
    race_date: goal.kind === "event" ? goal.date : null,
    event_km: goal.kind === "event" ? goal.km : null,
    event_elevation_m: goal.kind === "event" ? (goal.elevationM ?? null) : null,
    runs_per_week: input.runsPerWeek,
    weekdays: input.weekdays,
    cross_weekdays: cross,
    long_run_weekday: input.longRunWeekday,
    vdot: run?.vdot ?? 0,
    ...rideColumns(fitness, power, indoor),
    start_km_per_week: Math.round((fitness.baseMinPerWeek / 60) * fitness.speedKmh * 10) / 10,
    experienced: fitness.experienced,
    did_quality: false,
    hills: !!input.hills,
    start_date: today,
    generated_until: today,
  };
  const crossWorkouts = crossOf(crossSource(row), plan, cross, indoor);
  return { today, fitness, plan, indoor, power, cross: crossWorkouts, row };
}

/** Preview without saving (wizard summary): the running plan, and rides on cross days. */
export async function previewPlan(userId: string, input: CreatePlanInput, source: GarminSource = httpGarmin()) {
  const today = await todayFor(userId);
  const cross = input.crossWeekdays ?? [];
  const [fit, deficit, ride] = await Promise.all([
    currentFitness(userId, today).then((f) => withStatedStart(f, input.start)),
    deficitKcal(userId, today),
    // Only a plan with rides needs the cycling side (and its Garmin call).
    cross.length ? rideSetup(userId, today, source) : Promise.resolve(null),
  ]);
  const vdot = input.recentRace ? Math.round(vdotFrom(input.recentRace.distanceM, input.recentRace.timeS) * 10) / 10 : fit.vdot;
  const plan = generatePlan({
    goal: input.goal,
    startDate: today,
    weekdays: input.weekdays,
    longRunWeekday: input.longRunWeekday,
    runsPerWeek: input.runsPerWeek,
    vdot,
    startKmPerWeek: fit.baseKmPerWeek,
    deficitKcal: deficit,
    experienced: fit.experienced,
    didQuality: fit.didQuality,
    recentLongestKm: fit.longestKm,
    hills: !!input.hills,
  });
  const goal = input.goal;
  const power = ride ? usePower(ride, input.power) : false;
  const row: PlanInsert = {
    user_id: userId,
    sport: "run",
    goal_kind: goal.kind,
    // Build plans keep their focus distance here (null = General).
    distance_km: goal.kind === "race" ? RACE_KM[goal.distance] : goal.focus ? RACE_KM[goal.focus] : null,
    hills: !!input.hills,
    race_date: goal.kind === "race" ? goal.raceDate : null,
    target_time_s: goal.kind === "race" ? (goal.targetTimeS ?? null) : null,
    runs_per_week: input.runsPerWeek,
    weekdays: input.weekdays,
    cross_weekdays: cross,
    long_run_weekday: input.longRunWeekday,
    vdot,
    start_km_per_week: fit.baseKmPerWeek,
    experienced: fit.experienced,
    did_quality: fit.didQuality,
    recent_longest_km: fit.longestKm,
    ...(ride ? rideColumns(ride, power, !!input.indoor) : {}),
    start_date: today,
    generated_until: today,
  };
  const crossWorkouts = crossOf(crossSource(row), plan, cross, !!input.indoor);
  return {
    today,
    fitness: {
      ...fit,
      vdot,
      source: input.recentRace ? ({ kind: "manual" } as const) : input.start && fit.runCount === 0 ? ({ kind: "stated" } as const) : fit.source,
    },
    ride,
    power,
    plan,
    cross: crossWorkouts,
    row,
  };
}

/** Creates the plan (replacing any active one) and returns its id. */
export async function createPlan(userId: string, input: CreatePlanInput, source: GarminSource = httpGarmin()): Promise<string> {
  const { today, plan, cross, row } = input.sport === "ride" ? await previewRidePlan(userId, input, source, { create: true }) : await previewPlan(userId, input, source);
  const d = db();
  await d.from("training_plans").update({ status: "cancelled" }).eq("user_id", userId).eq("status", "active");
  const workouts = [...plan.workouts, ...cross].sort(byDate);
  const lastDate = workouts.at(-1)?.date ?? today;
  const buildUntil = addDays(today, BUILD_EXTEND_WEEKS * 7 - 1);
  const { data: inserted, error } = await d
    .from("training_plans")
    .insert({ ...row, generated_until: row.goal_kind === "race" ? row.race_date! : buildUntil > lastDate ? buildUntil : lastDate })
    .select("id")
    .single();
  if (error) throw error;
  if (workouts.length) {
    const { error: wErr } = await d.from("planned_workouts").insert(workouts.map((w) => workoutRow(userId, inserted.id, w)));
    if (wErr) throw wErr;
  }
  return inserted.id;
}

/** The plan's schedule regenerated from what was stored (same dates, goal and start): main sport plus cross sessions. */
async function generateFromPlan(
  userId: string,
  plan: PlanRow,
  today: ISODate,
  o: { indoor?: boolean; crossWeekdays?: number[]; until?: ISODate } = {},
): Promise<WorkoutSpec[]> {
  const indoor = o.indoor ?? plan.indoor;
  const deficit = await deficitKcal(userId, today);
  const untilDate = plan.goal_kind === "build" ? (o.until ?? plan.generated_until) : undefined;
  const main =
    plan.sport === "ride"
      ? generateRidePlan({
          goal:
            plan.goal_kind === "race" && plan.race_date && plan.event_km != null
              ? { kind: "event", date: plan.race_date, km: Number(plan.event_km), elevationM: plan.event_elevation_m }
              : { kind: "build" },
          startDate: plan.start_date,
          weekdays: plan.weekdays,
          longRideWeekday: plan.long_run_weekday,
          ridesPerWeek: plan.runs_per_week,
          lthr: plan.lthr ?? 165,
          ftp: plan.power ? plan.ftp : null,
          speedKmh: Number(plan.ride_speed_kmh ?? 25),
          startMinPerWeek: plan.start_min_per_week ?? 180,
          deficitKcal: deficit,
          recentLongestMin: plan.recent_longest_min ?? undefined,
          hills: plan.hills,
          indoor,
          experienced: plan.experienced,
          untilDate,
        })
      : generatePlan({
          // Same focus and hills as when the plan was made, so new weeks continue the same rotation.
          goal: goalOf(plan),
          hills: plan.hills,
          startDate: plan.start_date,
          weekdays: plan.weekdays,
          longRunWeekday: plan.long_run_weekday,
          runsPerWeek: plan.runs_per_week,
          vdot: Number(plan.vdot),
          startKmPerWeek: Number(plan.start_km_per_week),
          deficitKcal: deficit,
          untilDate,
          experienced: plan.experienced,
          didQuality: plan.did_quality,
          recentLongestKm: plan.recent_longest_km == null ? undefined : Number(plan.recent_longest_km),
        });
  return [...main.workouts, ...crossOf(plan, main, o.crossWeekdays ?? plan.cross_weekdays, indoor)].sort(byDate);
}

/**
 * Replaces the upcoming planned sessions of one sport with freshly generated ones on their own dates, in one
 * transaction. Done sessions and the user's own changes (coach or suggestion, `edited`) stay, and no fresh
 * session of that sport lands on their day; the old copies leave the watch on the next push, and pending
 * suggestions about them go stale.
 */
async function rebuildUpcoming(userId: string, plan: PlanRow, sport: Sport, fresh: WorkoutSpec[], today: ISODate) {
  const rows = await planWorkouts(plan.id);
  const kept = new Set(rows.filter((w) => w.sport === sport && (w.status === "done" || (w.edited && w.status === "planned"))).map((w) => w.date));
  const old = rows.filter((w) => w.status === "planned" && w.sport === sport && !w.edited && w.date >= today);
  const add = fresh.filter((w) => w.sport === sport && w.date >= today && !kept.has(w.date));
  const fields = (w: WorkoutSpec, status: string) => ({
    date: w.date,
    status,
    type: w.type,
    title: w.title,
    blocks: w.blocks,
    planned_km: w.plannedKm,
    planned_duration_s: w.plannedDurationS,
  });
  const { error } = await db().rpc("save_plan_changes", {
    p_user: userId,
    p_plan: plan.id,
    p_vdot: null as unknown as number,
    p_updates: old.map((w) => ({ id: w.id, ...fields(toPlanWorkout(w), "removed") })) as unknown as Json,
    p_inserts: add.map((w) => ({ ...fields(w, "planned"), week: w.week, phase: w.phase, sport: w.sport })) as unknown as Json,
  });
  if (error) throw error;
  await db().from("plan_proposals").update({ status: "stale" }).eq("plan_id", plan.id).eq("status", "pending");
}

/** A running plan's first ride (cross days or a coach-added ride) learns the rider's zones from Garmin and rides first. */
async function withRideColumns(userId: string, plan: PlanRow, today: ISODate, source: GarminSource): Promise<PlanRow> {
  if (plan.sport === "ride" || plan.lthr != null) return plan;
  const fitness = await rideSetup(userId, today, source);
  const cols = rideColumns(fitness, usePower(fitness), plan.indoor);
  await db().from("training_plans").update(cols).eq("id", plan.id);
  return { ...plan, ...cols } as PlanRow;
}

const hasRides = (plan: PlanRow) => plan.sport === "ride" || plan.cross_weekdays.length > 0;

/** Indoor season on or off: upcoming planned rides are rebuilt for the trainer (or the road) on the same dates. */
export async function setRideIndoor(userId: string, indoor: boolean): Promise<boolean> {
  const plan = await activePlan(userId);
  if (!plan || !hasRides(plan)) return false;
  const today = await todayFor(userId);
  await rebuildUpcoming(userId, plan, "ride", await generateFromPlan(userId, plan, today, { indoor }), today);
  await db().from("training_plans").update({ indoor }).eq("id", plan.id);
  return true;
}

/**
 * Power targets on or off: upcoming rides keep their structure, lengths and coach edits; only the targets
 * change (watts ↔ heart rate). Needs a known FTP.
 */
export async function setRidePower(userId: string, power: boolean): Promise<boolean> {
  const plan = await activePlan(userId);
  if (!plan || !hasRides(plan) || (power && !plan.ftp)) return false;
  const today = await todayFor(userId);
  const ctx = rideCtxOf({ ...plan, power });
  const upcoming = (await planWorkouts(plan.id)).filter((w) => w.status === "planned" && w.sport === "ride" && w.date >= today);
  const { error } = await db().rpc("save_plan_changes", {
    p_user: userId,
    p_plan: plan.id,
    p_vdot: null as unknown as number,
    p_updates: upcoming.map((w) => {
      const pw = toPlanWorkout(w);
      return {
        id: w.id,
        date: pw.date,
        status: pw.status,
        type: pw.type,
        title: pw.title,
        blocks: retargetRide(pw.blocks, ctx),
        planned_km: pw.plannedKm,
        planned_duration_s: pw.plannedDurationS,
      };
    }) as unknown as Json,
    p_inserts: [] as unknown as Json,
  });
  if (error) throw error;
  await db().from("training_plans").update({ power }).eq("id", plan.id);
  return true;
}

/**
 * Cross-training days changed: the other sport's upcoming sessions are rebuilt on the new days. A running plan
 * that gets rides for the first time learns the rider's zones now.
 */
export async function setCrossDays(userId: string, days: number[], source: GarminSource = httpGarmin()): Promise<boolean> {
  const active = await activePlan(userId);
  if (!active) return false;
  const clean = [...new Set(days)].filter((d) => !active.weekdays.includes(d)).sort();
  const today = await todayFor(userId);
  const plan = clean.length ? await withRideColumns(userId, active, today, source) : active;
  const other: Sport = plan.sport === "ride" ? "run" : "ride";
  await rebuildUpcoming(userId, plan, other, await generateFromPlan(userId, plan, today, { crossWeekdays: clean }), today);
  await db().from("training_plans").update({ cross_weekdays: clean }).eq("id", plan.id);
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
    // Each session matches the day's longest activity of its own sport.
    const longest = new Map<string, { id: string; km: number }>();
    for (const a of acts ?? []) {
      const sport: Sport | null = isRide(a.type_key) ? "ride" : isRun(a.type_key) ? "run" : null;
      if (!sport) continue;
      const km = Number(a.distance_m ?? 0) / 1000;
      const key = `${sport}|${a.local_date}`;
      const prev = longest.get(key);
      if (!prev || km > prev.km) longest.set(key, { id: a.id, km });
    }
    const usedActivities = new Set(workouts.filter((w) => w.activity_id).map((w) => w.activity_id));
    for (const w of open) {
      const run = longest.get(`${w.sport}|${w.date}`);
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
    const full = await generateFromPlan(userId, plan, today, { until });
    const fresh = full.filter((w) => w.date > plan.generated_until && w.date >= today);
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
    sport: plan.sport as Sport,
    crossWeekdays: plan.cross_weekdays,
    lthr: plan.lthr,
    ftp: plan.ftp,
    power: plan.power,
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

/** The ride linked to a done ride test: each lap's time, average heart rate and average power. */
async function rideTestRunFor(planId: string, workoutId: string, date: string): Promise<RideTestRun | null> {
  const { data: w } = await db().from("planned_workouts").select("activity_id").eq("id", workoutId).eq("plan_id", planId).maybeSingle();
  if (!w?.activity_id) return null;
  const { data: a } = await db().from("activities").select("splits").eq("id", w.activity_id).maybeSingle();
  type Lap = { duration?: number | null; movingDuration?: number | null; averageHR?: number | null; averagePower?: number | null };
  const laps = ((a?.splits as { lapDTOs?: Lap[] } | null)?.lapDTOs ?? []).map((l) => ({
    timeS: Number(l.movingDuration ?? l.duration ?? 0),
    avgHr: l.averageHR ?? null,
    avgPower: l.averagePower ?? null,
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
      run && plan.lthr ? rideTestProposal({ lthr: plan.lthr, ftp: plan.ftp }, run) : null,
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
export async function savePlanChanges(
  userId: string,
  initial: PlanRow,
  changes: ProposalChange[],
  today: ISODate,
  source: GarminSource = httpGarmin(),
): Promise<string[]> {
  const plan = changes.some((c) => c.op === "add" && c.sport === "ride") ? await withRideColumns(userId, initial, today, source) : initial;
  const before = await planWorkoutsWithKm(plan);
  const result = applyChanges(before, changes, planContext(plan, today));
  const changed = result.workouts.filter((x) => result.changedIds.has(x.id));
  // Changes to single sessions are the user's choice: later rebuilds keep them. Plan-wide ones (paces, zones, volume) are not.
  const own = new Set(changes.flatMap((c) => ("workoutId" in c ? [c.workoutId] : [])));
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
    p_updates: changed.filter((w) => !w.id.startsWith("new:")).map((w) => ({ id: w.id, ...fields(w), ...(own.has(w.id) ? { edited: true } : {}) })) as unknown as Json,
    p_inserts: changed.filter((w) => w.id.startsWith("new:")).map((w) => ({ ...fields(w), week: w.week, phase: w.phase, sport: w.sport, edited: true })) as unknown as Json,
  });
  if (error) throw error;
  const zones = {
    ...(result.lthr != null && result.lthr !== plan.lthr ? { lthr: result.lthr } : {}),
    ...(result.ftp != null && result.ftp !== plan.ftp ? { ftp: result.ftp } : {}),
  };
  if (Object.keys(zones).length) await db().from("training_plans").update(zones).eq("id", plan.id);
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
        const r = await source.pushWorkout(tokens!, toGarminWorkout(toPlanWorkout(w)), w.date);
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

/**
 * Without Garmin no sync runs: the plan's upkeep (done/missed, extending, proposals) happens on the first page load
 * of the day, and after every run logged by hand (`force`). The day is claimed in one update, so two loads at once
 * never both extend the plan or add the same proposal.
 */
export async function upkeepWithoutGarmin(userId: string, today: ISODate, opts: { force?: boolean } = {}): Promise<void> {
  const plan = await activePlan(userId);
  if (!plan) return;
  if (!opts.force) {
    const { data } = await db().from("training_plans").update({ upkept_on: today }).eq("id", plan.id).or(`upkept_on.is.null,upkept_on.lt.${today}`).select("id");
    if (!data?.length) return;
  }
  await reconcilePlan(userId, today);
  await refreshProposals(userId, today);
}

export type ManualRunError = "not_found" | "not_open" | "not_manual";

/**
 * "Done" without Garmin: the session's run (or ride) is stored as a manual activity, so everything that reads
 * activities (start volume, missed sessions, the coach, the week strip) sees it (spec 2026-10-29 §7).
 */
export async function logManualRun(userId: string, workoutId: string, input: { km: number; timeS: number | null }) {
  const d = db();
  const today = await todayFor(userId);
  const { data: w } = await d.from("planned_workouts").select("id, date, title, sport, status").eq("id", workoutId).eq("user_id", userId).maybeSingle();
  if (!w) return { ok: false as const, error: "not_found" as ManualRunError };
  if ((w.status !== "planned" && w.status !== "missed") || w.date > today) return { ok: false as const, error: "not_open" as ManualRunError };
  // Claimed in one update: of two submits at once, only one logs a run.
  const { data: claimed } = await d.from("planned_workouts").update({ status: "done" }).eq("id", w.id).in("status", ["planned", "missed"]).select("id");
  if (!claimed?.length) return { ok: false as const, error: "not_open" as ManualRunError };
  const { data: a, error } = await d
    .from("activities")
    .insert({
      user_id: userId,
      source: "manual",
      local_date: w.date,
      start_time: `${w.date}T12:00:00Z`,
      type_key: w.sport === "ride" ? "cycling" : "running",
      name: w.title,
      distance_m: Math.round(input.km * 1000),
      duration_s: input.timeS,
      moving_s: input.timeS,
    })
    .select("id")
    .single();
  if (error) {
    await d.from("planned_workouts").update({ status: w.status }).eq("id", w.id);
    throw error;
  }
  await d.from("planned_workouts").update({ activity_id: a.id }).eq("id", w.id);
  await upkeepWithoutGarmin(userId, today, { force: true });
  return { ok: true as const };
}

/** "Undo" on a session done by hand: the manual activity goes, the session is open again. */
export async function undoManualRun(userId: string, workoutId: string) {
  const d = db();
  const today = await todayFor(userId);
  const { data: w } = await d.from("planned_workouts").select("id, date, activity_id").eq("id", workoutId).eq("user_id", userId).maybeSingle();
  if (!w) return { ok: false as const, error: "not_found" as ManualRunError };
  const { data: a } = w.activity_id ? await d.from("activities").select("id, source").eq("id", w.activity_id).maybeSingle() : { data: null };
  if (!a || a.source !== "manual") return { ok: false as const, error: "not_manual" as ManualRunError };
  await d.from("planned_workouts").update({ status: w.date < today ? "missed" : "planned", activity_id: null }).eq("id", w.id);
  await d.from("activities").delete().eq("id", a.id);
  await upkeepWithoutGarmin(userId, today, { force: true });
  return { ok: true as const };
}
