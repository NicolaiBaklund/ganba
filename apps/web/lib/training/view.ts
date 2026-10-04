import "server-only";
import { addDays, mondayOf, pacesFor, predictTimeS, RACE_KM, trendSeries, type Block, type FuelAdvice, type ISODate, type Paces, type WorkoutType } from "@loop/core";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { activePlan, distanceOf, planWorkouts, todayFor } from "./service";

export interface WorkoutListItem {
  id: string;
  date: ISODate;
  type: WorkoutType;
  title: string;
  plannedKm: number;
  plannedDurationS: number;
  status: "planned" | "done" | "missed" | "removed";
  push: "none" | "pending" | "pushed" | "failed";
  actualKm: number | null;
}

export interface WeekView {
  week: number;
  monday: ISODate;
  phase: string;
  plannedKm: number;
  doneKm: number;
  workouts: WorkoutListItem[];
}

export interface ProposalView {
  id: string;
  kind: "missed" | "paces" | "volume" | "ai";
  summary: string;
}

export interface TrainingView {
  today: ISODate;
  garmin: "active" | "reauth_required" | null;
  plan: null | {
    goal: "race" | "build";
    distance: "5k" | "10k" | "half" | "marathon" | null;
    raceDate: ISODate | null;
    targetTimeS: number | null;
    predictedTimeS: number | null;
    vdot: number;
    paces: Paces;
    weeksLeft: number | null;
  };
  thisWeek: WeekView | null;
  upcoming: WeekView[];
  proposals: ProposalView[];
}

/**
 * Everything the Training tab shows. Plan upkeep (done/missed, proposals, extending build plans)
 * runs after each Garmin sync, which the app triggers on open, so viewing stays fast.
 */
export async function loadTrainingView(userId: string): Promise<TrainingView> {
  const [today, garmin, plan] = await Promise.all([todayFor(userId), getGarminStatus(userId), activePlan(userId)]);
  if (!plan) return { today, garmin: garmin?.status ?? null, plan: null, thisWeek: null, upcoming: [], proposals: [] };

  const db = createAdminSupabase();
  const [rows, props] = await Promise.all([
    planWorkouts(plan.id),
    db.from("plan_proposals").select("id, kind, summary").eq("plan_id", plan.id).eq("status", "pending").order("created_at"),
  ]);
  const actIds = rows.map((r) => r.activity_id).filter((x): x is string => !!x);
  const { data: acts } = actIds.length ? await db.from("activities").select("id, distance_m").in("id", actIds) : { data: [] };
  const km = new Map((acts ?? []).map((a) => [a.id, Math.round(Number(a.distance_m ?? 0) / 100) / 10]));

  const weeks = new Map<ISODate, WeekView>();
  for (const r of rows) {
    if (r.status === "removed") continue;
    const monday = mondayOf(r.date);
    const w = weeks.get(monday) ?? { week: r.week, monday, phase: r.phase, plannedKm: 0, doneKm: 0, workouts: [] };
    const item: WorkoutListItem = {
      id: r.id,
      date: r.date,
      type: r.type,
      title: r.title,
      plannedKm: Number(r.planned_km),
      plannedDurationS: r.planned_duration_s,
      status: r.status,
      push: r.garmin_push_status,
      actualKm: r.activity_id ? (km.get(r.activity_id) ?? null) : null,
    };
    w.workouts.push(item);
    w.plannedKm = Math.round((w.plannedKm + item.plannedKm) * 10) / 10;
    if (item.status === "done") w.doneKm = Math.round((w.doneKm + (item.actualKm ?? item.plannedKm)) * 10) / 10;
    weeks.set(monday, w);
  }
  const thisMonday = mondayOf(today);
  const thisWeek = weeks.get(thisMonday) ?? null;
  const upcoming = [...weeks.values()].filter((w) => w.monday > thisMonday).sort((a, b) => (a.monday < b.monday ? -1 : 1));

  const distance = distanceOf(plan);
  const vdot = Number(plan.vdot);
  return {
    today,
    garmin: garmin?.status ?? null,
    plan: {
      goal: plan.goal_kind,
      distance,
      raceDate: plan.race_date,
      targetTimeS: plan.target_time_s,
      predictedTimeS: distance ? predictTimeS(RACE_KM[distance] * 1000, vdot) : null,
      vdot,
      paces: pacesFor(vdot),
      weeksLeft: plan.race_date ? Math.max(0, Math.ceil((Date.parse(plan.race_date) - Date.parse(addDays(today, 0))) / (7 * 86_400_000))) : null,
    },
    thisWeek,
    upcoming,
    proposals: (props.data ?? []).map((p) => ({ id: p.id, kind: p.kind, summary: p.summary })),
  };
}

export interface WorkoutDetail extends WorkoutListItem {
  blocks: Block[];
  kg: number;
  fuelAdvice: FuelAdvice | null;
  upcoming: boolean;
  activity: null | {
    distanceKm: number;
    durationS: number;
    movingS: number | null;
    avgHr: number | null;
    laps: { distanceM: number; durationS: number; avgSpeed: number | null; avgHr: number | null }[];
  };
}

/** One planned session with its matched run (laps from Garmin splits). */
export async function loadWorkout(userId: string, id: string): Promise<WorkoutDetail | null> {
  const db = createAdminSupabase();
  const { data: r } = await db.from("planned_workouts").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!r) return null;
  let activity: WorkoutDetail["activity"] = null;
  if (r.activity_id) {
    const { data: a } = await db.from("activities").select("distance_m, duration_s, moving_s, avg_hr, splits").eq("id", r.activity_id).maybeSingle();
    if (a) {
      const laps = ((a.splits as { lapDTOs?: Record<string, number | null>[] } | null)?.lapDTOs ?? []).map((l) => ({
        distanceM: Number(l.distance ?? 0),
        durationS: Number(l.duration ?? 0),
        avgSpeed: l.averageSpeed ?? null,
        avgHr: l.averageHR ?? null,
      }));
      activity = {
        distanceKm: Math.round(Number(a.distance_m ?? 0) / 10) / 100,
        durationS: Number(a.duration_s ?? 0),
        movingS: a.moving_s == null ? null : Number(a.moving_s),
        avgHr: a.avg_hr,
        laps,
      };
    }
  }
  return {
    id: r.id,
    date: r.date,
    type: r.type,
    title: r.title,
    plannedKm: Number(r.planned_km),
    plannedDurationS: r.planned_duration_s,
    status: r.status,
    push: r.garmin_push_status,
    actualKm: activity?.distanceKm ?? null,
    blocks: r.blocks as unknown as Block[],
    kg: await latestKg(userId),
    fuelAdvice: (r.fuel_advice as { advice?: FuelAdvice } | null)?.advice ?? null,
    upcoming: r.status === "planned" && r.date >= (await todayFor(userId)),
    activity,
  };
}

/** Trend weight today (fueling amounts scale with it). */
export async function latestKg(userId: string): Promise<number> {
  const { data } = await createAdminSupabase().from("weight_entries").select("local_date, measured_at, weight_kg").eq("user_id", userId).order("local_date");
  const points = (data ?? []).map((w) => ({ localDate: w.local_date, measuredAt: w.measured_at, weightKg: Number(w.weight_kg) }));
  const series = trendSeries(points);
  return series.at(-1)?.trendKg ?? points.at(-1)?.weightKg ?? 70;
}

/** Today's session for the Today screen (null = no active plan). */
export async function todaysWorkout(userId: string, today: ISODate): Promise<{ plan: boolean; workout: WorkoutListItem | null }> {
  const plan = await activePlan(userId);
  if (!plan) return { plan: false, workout: null };
  const { data } = await createAdminSupabase()
    .from("planned_workouts")
    .select("id, date, type, title, planned_km, planned_duration_s, status, garmin_push_status, activity_id")
    .eq("plan_id", plan.id)
    .eq("date", today)
    .neq("status", "removed")
    .limit(1)
    .maybeSingle();
  if (!data) return { plan: true, workout: null };
  let actualKm: number | null = null;
  if (data.activity_id) {
    const { data: a } = await createAdminSupabase().from("activities").select("distance_m").eq("id", data.activity_id).maybeSingle();
    actualKm = a ? Math.round(Number(a.distance_m ?? 0) / 100) / 10 : null;
  }
  return {
    plan: true,
    workout: {
      id: data.id,
      date: data.date,
      type: data.type,
      title: data.title,
      plannedKm: Number(data.planned_km),
      plannedDurationS: data.planned_duration_s,
      status: data.status,
      push: data.garmin_push_status,
      actualKm,
    },
  };
}

/** First planned session after `after` in the active plan (for the rest-day bib). */
export async function nextWorkout(userId: string, after: ISODate): Promise<{ date: ISODate; type: WorkoutType; title: string; plannedKm: number } | null> {
  const plan = await activePlan(userId);
  if (!plan) return null;
  const { data } = await createAdminSupabase()
    .from("planned_workouts")
    .select("date, type, title, planned_km")
    .eq("plan_id", plan.id)
    .gt("date", after)
    .eq("status", "planned")
    .order("date")
    .limit(1)
    .maybeSingle();
  return data ? { date: data.date, type: data.type, title: data.title, plannedKm: Number(data.planned_km) } : null;
}
