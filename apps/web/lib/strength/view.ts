import "server-only";
import {
  addDays,
  EXERCISES,
  exerciseByKey,
  increaseHint,
  prefillSets,
  sessionDurationS,
  topSet,
  weekday,
  type Exercise,
  type ExerciseLog,
  type ISODate,
  type Measure,
  type MuscleGroup,
  type SetRow,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { logsByExercise, loggedSessions, userExercises, type LoggedSession } from "./history";

const db = () => createAdminSupabase();
const STRENGTH_TYPE = "strength_training";

export interface PickRow {
  key: string;
  name: string;
  group: MuscleGroup;
  measure: Measure;
  favorite: boolean;
  /** Last time's sets, for "Last: 3 × 8 at 60 kg"; null when never logged. */
  last: SetRow[] | null;
  lastDate: ISODate | null;
  /** What the sets start from when added, and the suggested increase. */
  prefill: SetRow[];
  hint: { kg?: number; reps?: number } | null;
}

export interface SessionView {
  id: string;
  date: ISODate;
  finished: boolean;
  /** From the linked Garmin activity. */
  watch: { minutes: number; kcal: number | null } | null;
  /** Saved exercises in order, with their sets. */
  exercises: (PickRow & { sets: SetRow[] })[];
  /** Everything that can be added: built-in and own exercises. */
  catalog: PickRow[];
}

function pickRow(ex: Exercise, logs: ExerciseLog[] | undefined, favourites: Set<string>): PickRow {
  const last = logs?.at(-1) ?? null;
  return {
    key: ex.key,
    name: ex.name,
    group: ex.group,
    measure: ex.measure,
    favorite: favourites.has(ex.key),
    last: last?.sets ?? null,
    lastDate: last?.date ?? null,
    prefill: prefillSets(last?.sets ?? null, ex.measure),
    hint: logs ? increaseHint(logs, ex) : null,
  };
}

/** A session with its exercises, and the list to add from (history before the session's day). */
export async function loadSession(userId: string, id: string): Promise<SessionView | null> {
  const { data: s } = await db().from("strength_sessions").select("id, local_date, finished_at, activity_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!s) return null;
  const [{ custom, favourites }, all, act] = await Promise.all([
    userExercises(userId),
    loggedSessions(userId, { to: s.local_date }),
    s.activity_id ? db().from("activities").select("duration_s, garmin_kcal").eq("id", s.activity_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const before = logsByExercise(all.filter((x) => x.id !== s.id));
  const mine = all.find((x) => x.id === s.id);
  const catalog = [...EXERCISES, ...custom].map((ex) => pickRow(ex, before.get(ex.key), favourites));
  const byKey = new Map(catalog.map((r) => [r.key, r]));
  return {
    id: s.id,
    date: s.local_date,
    finished: !!s.finished_at,
    watch: act.data ? { minutes: Math.round(Number(act.data.duration_s ?? 0) / 60), kcal: act.data.garmin_kcal == null ? null : Math.round(Number(act.data.garmin_kcal)) } : null,
    exercises: (mine?.exercises ?? []).flatMap((e) => {
      const row = byKey.get(e.key);
      return row ? [{ ...row, sets: e.sets }] : [];
    }),
    catalog,
  };
}

export interface StrengthItem {
  date: ISODate;
  state: "done" | "planned" | "missed";
  sessionId: string | null;
  /** A Garmin strength activity with no session: tapping it makes one. */
  activityId: string | null;
  fromWatch: boolean;
  groups: MuscleGroup[];
  minutes: number | null;
}

/** Minutes of a session: the linked Garmin activity's, else Ganba's own estimate (spec §7). */
export const sessionMinutes = (s: LoggedSession, activityS: Map<string, number>): number =>
  Math.round(
    (s.activityId && activityS.has(s.activityId)
      ? activityS.get(s.activityId)!
      : sessionDurationS(
          s.exercises.map((e) => e.savedAt),
          s.exercises.reduce((n, e) => n + e.sets.length, 0),
        )) / 60,
  );

/**
 * Strength for a range of days, one item per day: a logged session, else a Garmin strength activity without one
 * ("From your watch"), else a planned strength day from the plan (spec §4, §7a).
 */
export async function strengthItems(
  userId: string,
  from: ISODate,
  to: ISODate,
  today: ISODate,
  plan: { strength_weekdays: number[]; start_date: ISODate; generated_until: ISODate } | null,
): Promise<StrengthItem[]> {
  const [{ custom }, sessions, { data: acts }, { data: linked }] = await Promise.all([
    userExercises(userId),
    loggedSessions(userId, { from, to }),
    db().from("activities").select("id, local_date, duration_s").eq("user_id", userId).eq("type_key", STRENGTH_TYPE).gte("local_date", from).lte("local_date", to),
    db().from("strength_sessions").select("activity_id").eq("user_id", userId).not("activity_id", "is", null),
  ]);
  const activityS = new Map((acts ?? []).map((a) => [a.id, Number(a.duration_s ?? 0)]));
  const taken = new Set((linked ?? []).map((l) => l.activity_id));
  const out = new Map<ISODate, StrengthItem>();
  for (const s of sessions) {
    if (!s.exercises.length && !s.activityId) continue;
    const groups = [...new Set(s.exercises.flatMap((e) => exerciseByKey(e.key, custom)?.group ?? []))];
    out.set(s.date, { date: s.date, state: "done", sessionId: s.id, activityId: s.activityId, fromWatch: false, groups, minutes: sessionMinutes(s, activityS) });
  }
  for (const a of acts ?? []) {
    if (taken.has(a.id) || out.has(a.local_date)) continue;
    out.set(a.local_date, { date: a.local_date, state: "done", sessionId: null, activityId: a.id, fromWatch: true, groups: [], minutes: Math.round(Number(a.duration_s ?? 0) / 60) });
  }
  if (plan?.strength_weekdays.length) {
    for (let d = from < plan.start_date ? plan.start_date : from; d <= to && d <= plan.generated_until; d = addDays(d, 1)) {
      if (out.has(d) || !plan.strength_weekdays.includes(weekday(d))) continue;
      out.set(d, { date: d, state: d < today ? "missed" : "planned", sessionId: null, activityId: null, fromWatch: false, groups: [], minutes: null });
    }
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface StrengthProgressRow {
  key: string;
  name: string;
  unit: "kg" | "reps" | "s";
  from: number;
  to: number;
  since: ISODate;
  points: number[];
}

/**
 * Progress (spec §8): one row per favourite with two or more logged sessions in the last 6 months, top set first
 * vs now; without favourites, the three most used exercises.
 */
export async function strengthProgress(userId: string, today: ISODate): Promise<{ sessions: number; rows: StrengthProgressRow[] } | null> {
  const [{ custom, favourites }, all] = await Promise.all([userExercises(userId), loggedSessions(userId)]);
  const done = all.filter((s) => s.exercises.length);
  if (!done.length) return null;
  const logs = logsByExercise(done.filter((s) => s.date >= addDays(today, -182)));
  const used = [...logs].sort((a, b) => b[1].length - a[1].length).map(([k]) => k);
  const keys = favourites.size ? used.filter((k) => favourites.has(k)) : used.slice(0, 3);
  const rows = keys.flatMap((key) => {
    const ex = exerciseByKey(key, custom);
    const tops = (logs.get(key) ?? []).map((l) => ({ date: l.date, v: ex ? topSet(l.sets, ex.measure) : null })).filter((t): t is { date: ISODate; v: number } => t.v != null);
    if (!ex || tops.length < 2) return [];
    return [{ key, name: ex.name, unit: ex.measure === "kg" ? "kg" : ex.measure === "bw" ? "reps" : "s", from: tops[0]!.v, to: tops.at(-1)!.v, since: tops[0]!.date, points: tops.map((t) => t.v) } as StrengthProgressRow];
  });
  return { sessions: done.length, rows };
}

/** Coach context: strength in the last 14 days, one line per session. */
export async function strengthForCoach(userId: string, today: ISODate): Promise<string[]> {
  const [{ custom }, sessions] = await Promise.all([userExercises(userId), loggedSessions(userId, { from: addDays(today, -13), to: today })]);
  return sessions
    .filter((s) => s.exercises.length)
    .map((s) => {
      const parts = s.exercises.map((e) => {
        const ex = exerciseByKey(e.key, custom);
        const top = ex ? topSet(e.sets, ex.measure) : null;
        const unit = ex?.measure === "kg" ? " kg" : ex?.measure === "time" ? " s" : " reps";
        return `${ex?.name ?? e.key} ${e.sets.length} sets${top != null ? `, top ${top}${unit}` : ""}`;
      });
      return `${s.date}: ${parts.join("; ")}`;
    });
}
