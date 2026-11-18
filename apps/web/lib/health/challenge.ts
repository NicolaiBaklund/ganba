import "server-only";
import {
  addDays,
  currentParams,
  decideChallenge,
  decideEasyWeek,
  formatPace,
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
import { fmtClock } from "@/lib/training/format";
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

type Row = { id: string; week_start: string; workout_id: string | null; kind: string; params: unknown; result: string | null; result_value: unknown; created_at: string };
const ROW_COLS = "id, week_start, workout_id, kind, params, result, result_value, created_at";
type WorkoutBits = { id: string; plan_id: string; date: string; type: string; title: string; status: string; activity_id: string | null; blocks: unknown };

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

/**
 * A stored challenge as shown; null when its session was removed, swapped to another type, not run in its week, or run
 * a day ago without being decided.
 */
function viewOf(row: Row, w: WorkoutBits | null, today: ISODate): ChallengeView | null {
  if (row.kind === "none") return null;
  const kind = row.kind as ChallengeKind;
  const stored = row.params as Record<string, number>;
  const params = w ? currentParams({ kind, params: stored }, w.blocks as Block[]) : stored;
  const base = { kind, params, result: (row.result as "won" | "lost" | null) ?? null, value: row.result_value == null ? null : Number(row.result_value) };
  if (!row.workout_id) return kind === "easy_hr_week" ? { ...base, workoutDate: null, workoutTitle: null } : null;
  if (!w || w.status === "removed" || !FOR_TYPES[kind]?.has(w.type)) return null;
  const weekEnd = addDays(row.week_start, 6);
  if (w.date < row.week_start || w.date > weekEnd) return null;
  // Not run in time, or run but not tellable (no heart rate, no laps): gone from the day after.
  if (!base.result && w.date < today) return null;
  return { ...base, workoutDate: w.date, workoutTitle: w.title };
}

/**
 * This week's challenge (spec 2026-11-18 §7): picked once per Monday–Sunday week from the sessions not run yet and
 * stored, so it doesn't change during the week. Running plans with Garmin only (the caller checks Garmin).
 */
export async function ensureChallenge(userId: string, today: ISODate): Promise<ChallengeView | null> {
  const weekStart = weekStartOn(today, 1);
  const read = async () => (await db().from("weekly_challenges").select(ROW_COLS).eq("user_id", userId).eq("week_start", weekStart).maybeSingle()).data as Row | null;
  const plan = await activePlan(userId);
  const workoutOf = async (row: Row) =>
    (row.workout_id ? (await db().from("planned_workouts").select("id, plan_id, date, type, title, status, activity_id, blocks").eq("id", row.workout_id).maybeSingle()).data : null) as WorkoutBits | null;
  const existing = await read();
  if (existing) {
    const w = await workoutOf(existing);
    // Made from a plan that has since been replaced (or nothing to pick before a new plan came): drop it while open
    // and pick from the new plan.
    const stale = w ? w.plan_id !== plan?.id : existing.kind === "none" && !!plan && plan.created_at > existing.created_at;
    if (stale && !existing.result) await db().from("weekly_challenges").delete().eq("id", existing.id).is("result", null);
    else return viewOf(existing, w, today);
  }
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
  // Garmin's estimate, else the plan's (`garmin` says which, for the words under the challenge).
  const preds = new Map<number, { s: number | null; garmin: boolean }>();
  for (const w of workouts.filter((x) => x.type === "test")) {
    const km = runSteps(w.blocks).reduce((s, x) => s + (x.duration.kind === "distance" ? x.duration.m / 1000 : 0), 0);
    const d = distanceFor(km);
    const g = await predictionOn(userId, today, km);
    preds.set(km, { s: g ?? (d ? predictionSeconds(planPrediction(Number(plan.vdot)), d) : null), garmin: g != null });
  }
  const pick = pickChallenge({ workouts, lastKind: (last?.kind as ChallengeKind | undefined) ?? null, lastSameTypeInZone: (t) => inZone.get(t) ?? null, predictionS: (km) => preds.get(km)?.s ?? null, normalHr });
  const params = pick?.kind === "test_beat" ? { ...pick.params, garmin: preds.get(pick.params.km!)?.garmin ? 1 : 0 } : (pick?.params ?? {});
  // Two loads at once: the unique week keeps one row; both read the same one back. Nothing to pick is stored too.
  await db()
    .from("weekly_challenges")
    .upsert({ user_id: userId, week_start: weekStart, workout_id: pick?.workoutId ?? null, kind: pick?.kind ?? "none", params }, { onConflict: "user_id,week_start", ignoreDuplicates: true });
  const row = await read();
  return row ? viewOf(row, await workoutOf(row), today) : null;
}

/** Decides open challenges of this week and last week from synced runs (spec §7.4). */
export async function decideChallenges(userId: string, today: ISODate): Promise<void> {
  const { data: rows } = await db().from("weekly_challenges").select(ROW_COLS).eq("user_id", userId).is("result", null).neq("kind", "none").gte("week_start", addDays(weekStartOn(today, 1), -7));
  if (!rows?.length) return;
  const plan = await activePlan(userId);
  const easyMin = plan && plan.sport !== "ride" ? pacesFor(Number(plan.vdot)).easy.min : null;
  for (const row of rows as Row[]) {
    const pick: ChallengePick = { kind: row.kind as ChallengeKind, workoutId: row.workout_id, params: row.params as Record<string, number> };
    let res: { result: "won" | "lost"; value: number } | null = null;
    let by: string | null = null;
    if (pick.kind === "easy_hr_week") {
      const sunday = addDays(row.week_start, 6);
      const [{ data: acts }, { data: planned }] = await Promise.all([
        // Only runs after the challenge was made count: a hard Monday can't lose a challenge made on Wednesday.
        db().from("activities").select("id, local_date, start_time, type_key, distance_m, duration_s, moving_s, avg_hr, te_anaerobic").eq("user_id", userId).gte("local_date", row.week_start).lte("local_date", sunday).gte("start_time", row.created_at),
        db().from("planned_workouts").select("type, activity_id").eq("user_id", userId).eq("status", "done").gte("date", row.week_start).lte("date", sunday),
      ]);
      const quality = new Set((planned ?? []).filter((p) => QUALITY_TYPES.has(p.type) && p.activity_id).map((p) => p.activity_id!));
      const easy = (acts ?? []).filter((a) => isEasyRun(a, quality)).sort((a, b) => a.start_time.localeCompare(b.start_time));
      res = decideEasyWeek(pick.params.bpm!, easy.map((a) => Number(a.avg_hr)), today > sunday);
      // The run that lost it, or the last one when the week is won.
      if (res) by = (res.result === "lost" ? easy.find((a) => Number(a.avg_hr) > pick.params.bpm!) : easy.at(-1))?.id ?? null;
    } else if (row.workout_id) {
      const { data: w } = await db().from("planned_workouts").select("type, status, activity_id, blocks").eq("id", row.workout_id).maybeSingle();
      if (!w || w.status !== "done" || !w.activity_id || !FOR_TYPES[pick.kind]?.has(w.type)) continue;
      const { data: a } = await db().from("activities").select("splits, avg_hr").eq("id", w.activity_id).single();
      pick.params = currentParams(pick, w.blocks as unknown as Block[]);
      res = decideChallenge(pick, { laps: lapsFrom(a?.splits), blocks: w.blocks as unknown as Block[], avgHr: a?.avg_hr == null ? null : Number(a.avg_hr), easyMinSecPerKm: easyMin });
      by = w.activity_id;
    }
    if (res) await db().from("weekly_challenges").update({ result: res.result, result_value: res.value, decided_activity_id: by, decided_at: new Date().toISOString() }).eq("id", row.id).is("result", null);
  }
}

/** The challenge in one English sentence, as the app shows it ("Beat 20:36 in the 5K test"). */
export function challengeSentence(c: Pick<ChallengeView, "kind" | "params">): string {
  const p = c.params;
  switch (c.kind) {
    case "test_beat": {
      const d = distanceFor(p.km!);
      return `Beat ${fmtClock(p.targetS!)} in the ${d ? { "5k": "5K", "10k": "10K", half: "half marathon", marathon: "marathon" }[d] : `${p.km} km`} test`;
    }
    case "reps_in_zone":
      return `Every rep in ${formatPace(p.min!)}–${formatPace(p.max!)}`;
    case "last_rep_fastest":
      return "Make the last rep the fastest";
    case "finish_fast":
      return `Last ${p.km} km at ${formatPace(p.maxSecPerKm!)} or faster`;
    case "long_hr":
      return `Long run under ${p.bpm} bpm`;
    default:
      return `Every easy run under ${p.bpm} bpm`;
  }
}

/** This week's challenge as the person sees it, in one line for the coach; null when none is shown. */
export async function challengeForCoach(userId: string, today: ISODate): Promise<string | null> {
  const { data: row } = await db().from("weekly_challenges").select(ROW_COLS).eq("user_id", userId).eq("week_start", weekStartOn(today, 1)).maybeSingle();
  if (!row) return null;
  const { data: w } = row.workout_id ? await db().from("planned_workouts").select("id, plan_id, date, type, title, status, activity_id, blocks").eq("id", row.workout_id).maybeSingle() : { data: null };
  const v = viewOf(row as Row, w as WorkoutBits | null, today);
  if (!v) return null;
  const on = v.workoutTitle ? ` (${v.workoutTitle}, ${v.workoutDate})` : "";
  const status = v.result ? (v.result === "won" ? "won" : "missed") : "open";
  return `This week's challenge shown to them: "${challengeSentence(v)}"${on}, ${status}.`;
}
