import "server-only";
import {
  addDays,
  decideChallenge,
  decideEasyWeek,
  judgedPace,
  lapsFrom,
  pacesFor,
  paceZone,
  pickChallenge,
  planPrediction,
  predictionSeconds,
  REP_TYPES,
  runSteps,
  weekStartOn,
  workLaps,
  type Block,
  type ChallengeKind,
  type ChallengePick,
  type ChallengeWorkout,
  type ISODate,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isEasyRun, QUALITY_TYPES } from "@/lib/recovery/load";
import { activePlan } from "@/lib/training/service";
import { distanceFor, normalEasyHr, predictionOn } from "./runs";

const db = () => createAdminSupabase();

export interface ChallengeView {
  kind: ChallengeKind;
  params: Record<string, number>;
  workoutDate: ISODate | null;
  workoutTitle: string | null;
  result: "won" | "lost" | null;
  value: number | null;
}

/** The session types each template is made for: a session swapped to another type no longer carries it. */
const FOR_TYPES: Record<ChallengeKind, ReadonlySet<string> | null> = {
  test_beat: new Set(["test"]),
  finish_fast: new Set(["long"]),
  long_hr: new Set(["long"]),
  reps_in_zone: REP_TYPES,
  last_rep_fastest: REP_TYPES,
  easy_hr_week: null,
};

type Row = { id: string; week_start: string; workout_id: string | null; kind: string; params: unknown; result: string | null; result_value: unknown };
type WorkoutBits = { id: string; date: string; type: string; title: string; status: string; activity_id: string | null; blocks: unknown };

/** Whether every rep of the last done session of a type was in its zone; null when there is none. */
async function lastInZone(userId: string, type: string, before: ISODate, easyMin: number): Promise<boolean | null> {
  const { data: w } = await db().from("planned_workouts").select("blocks, activity_id").eq("user_id", userId).eq("type", type as never).eq("status", "done").lt("date", before).not("activity_id", "is", null).order("date", { ascending: false }).limit(1).maybeSingle();
  if (!w?.activity_id) return null;
  const { data: a } = await db().from("activities").select("splits").eq("id", w.activity_id).single();
  const { pairs } = workLaps(lapsFrom(a?.splits), runSteps(w.blocks as unknown as Block[]), easyMin);
  const zoned = pairs.filter((p) => paceZone(p.step));
  if (!zoned.length) return null;
  return zoned.every((p) => {
    const z = paceZone(p.step)!, pace = judgedPace(p.lap);
    return pace >= z.min && pace <= z.max;
  });
}

/** A stored challenge as shown; null when its session was removed, swapped to another type, or not run in its week. */
function viewOf(row: Row, w: WorkoutBits | null, today: ISODate): ChallengeView | null {
  const kind = row.kind as ChallengeKind;
  const base = { kind, params: row.params as Record<string, number>, result: (row.result as "won" | "lost" | null) ?? null, value: row.result_value == null ? null : Number(row.result_value) };
  if (!row.workout_id) return kind === "easy_hr_week" ? { ...base, workoutDate: null, workoutTitle: null } : null;
  if (!w || w.status === "removed" || !FOR_TYPES[kind]?.has(w.type)) return null;
  const weekEnd = addDays(row.week_start, 6);
  if (w.date < row.week_start || w.date > weekEnd) return null;
  if (!base.result && w.status !== "done" && w.date < today) return null;
  return { ...base, workoutDate: w.date, workoutTitle: w.title };
}

/**
 * This week's challenge (spec 2026-11-18 §7): picked once per Monday–Sunday week from the sessions not run yet and
 * stored, so it doesn't change during the week. Running plans with Garmin only (the caller checks Garmin).
 */
export async function ensureChallenge(userId: string, today: ISODate): Promise<ChallengeView | null> {
  const weekStart = weekStartOn(today, 1);
  const read = async () => (await db().from("weekly_challenges").select("id, week_start, workout_id, kind, params, result, result_value").eq("user_id", userId).eq("week_start", weekStart).maybeSingle()).data as Row | null;
  const show = async (row: Row) => {
    const { data: w } = row.workout_id ? await db().from("planned_workouts").select("id, date, type, title, status, activity_id, blocks").eq("id", row.workout_id).maybeSingle() : { data: null };
    return viewOf(row, w as WorkoutBits | null, today);
  };
  const existing = await read();
  if (existing) return show(existing);

  const plan = await activePlan(userId);
  if (!plan || plan.sport === "ride") return null;
  const easyMin = pacesFor(Number(plan.vdot)).easy.min;
  const [{ data: ws }, { data: last }, normalHr] = await Promise.all([
    db().from("planned_workouts").select("id, date, type, blocks, sport").eq("plan_id", plan.id).eq("status", "planned").gte("date", today).lte("date", addDays(weekStart, 6)),
    db().from("weekly_challenges").select("kind").eq("user_id", userId).eq("week_start", addDays(weekStart, -7)).maybeSingle(),
    normalEasyHr(userId, today),
  ]);
  const workouts: ChallengeWorkout[] = (ws ?? []).filter((w) => w.sport !== "ride").map((w) => ({ id: w.id, date: w.date, type: w.type, blocks: w.blocks as unknown as Block[] }));
  const repTypes = [...new Set(workouts.filter((w) => REP_TYPES.has(w.type)).map((w) => w.type))];
  const inZone = new Map(await Promise.all(repTypes.map(async (t) => [t, await lastInZone(userId, t, today, easyMin)] as const)));
  const preds = new Map<number, number | null>();
  for (const w of workouts.filter((x) => x.type === "test")) {
    const km = runSteps(w.blocks).reduce((s, x) => s + (x.duration.kind === "distance" ? x.duration.m / 1000 : 0), 0);
    const d = distanceFor(km);
    preds.set(km, (await predictionOn(userId, today, km)) ?? (d ? predictionSeconds(planPrediction(Number(plan.vdot)), d) : null));
  }
  const pick = pickChallenge({ workouts, lastKind: (last?.kind as ChallengeKind | undefined) ?? null, lastSameTypeInZone: (t) => inZone.get(t) ?? null, predictionS: (km) => preds.get(km) ?? null, normalHr });
  if (!pick) return null;
  // Two loads at once: the unique week keeps one row; both read the same one back.
  await db()
    .from("weekly_challenges")
    .upsert({ user_id: userId, week_start: weekStart, workout_id: pick.workoutId, kind: pick.kind, params: pick.params }, { onConflict: "user_id,week_start", ignoreDuplicates: true });
  const row = await read();
  return row ? show(row) : null;
}

/** Decides open challenges of this week and last week from synced runs (spec §7.4). */
export async function decideChallenges(userId: string, today: ISODate): Promise<void> {
  const { data: rows } = await db().from("weekly_challenges").select("id, week_start, workout_id, kind, params, result, result_value").eq("user_id", userId).is("result", null).gte("week_start", addDays(weekStartOn(today, 1), -7));
  if (!rows?.length) return;
  const plan = await activePlan(userId);
  const easyMin = plan && plan.sport !== "ride" ? pacesFor(Number(plan.vdot)).easy.min : null;
  for (const row of rows as Row[]) {
    const pick: ChallengePick = { kind: row.kind as ChallengeKind, workoutId: row.workout_id, params: row.params as Record<string, number> };
    let res: { result: "won" | "lost"; value: number } | null = null;
    if (pick.kind === "easy_hr_week") {
      const sunday = addDays(row.week_start, 6);
      const [{ data: acts }, { data: planned }] = await Promise.all([
        db().from("activities").select("id, local_date, type_key, distance_m, duration_s, moving_s, avg_hr, te_anaerobic").eq("user_id", userId).gte("local_date", row.week_start).lte("local_date", sunday),
        db().from("planned_workouts").select("type, activity_id").eq("user_id", userId).eq("status", "done").gte("date", row.week_start).lte("date", sunday),
      ]);
      const quality = new Set((planned ?? []).filter((p) => QUALITY_TYPES.has(p.type) && p.activity_id).map((p) => p.activity_id!));
      const hrs = (acts ?? []).filter((a) => isEasyRun(a, quality)).sort((a, b) => a.local_date.localeCompare(b.local_date)).map((a) => Number(a.avg_hr));
      res = decideEasyWeek(pick.params.bpm!, hrs, today > sunday);
    } else if (row.workout_id) {
      const { data: w } = await db().from("planned_workouts").select("type, status, activity_id, blocks").eq("id", row.workout_id).maybeSingle();
      if (!w || w.status !== "done" || !w.activity_id || !FOR_TYPES[pick.kind]?.has(w.type)) continue;
      const { data: a } = await db().from("activities").select("splits, avg_hr").eq("id", w.activity_id).single();
      res = decideChallenge(pick, { laps: lapsFrom(a?.splits), blocks: w.blocks as unknown as Block[], avgHr: a?.avg_hr == null ? null : Number(a.avg_hr), easyMinSecPerKm: easyMin });
    }
    if (res) await db().from("weekly_challenges").update({ result: res.result, result_value: res.value, decided_at: new Date().toISOString() }).eq("id", row.id).is("result", null);
  }
}
