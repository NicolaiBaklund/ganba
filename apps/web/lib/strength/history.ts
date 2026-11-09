import "server-only";
import { exerciseByKey, topSet, type Exercise, type ExerciseLog, type ISODate, type Measure, type MuscleGroup, type SetRow } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";

const db = () => createAdminSupabase();

/** The user's own exercises and their favourites (built-in or own). */
export async function userExercises(userId: string): Promise<{ custom: Exercise[]; favourites: Set<string> }> {
  const { data, error } = await db().from("user_exercises").select("key, name, muscle_group, measure, favorite").eq("user_id", userId);
  if (error) throw error;
  const rows = data ?? [];
  return {
    custom: rows.filter((r) => r.name).map((r) => ({ key: r.key, name: r.name!, group: r.muscle_group as MuscleGroup, measure: r.measure as Measure, equipment: null })),
    favourites: new Set(rows.filter((r) => r.favorite).map((r) => r.key)),
  };
}

export interface LoggedSession {
  id: string;
  date: ISODate;
  activityId: string | null;
  /** Exercises in the order they were done, each with its sets and when it was saved. */
  exercises: { key: string; position: number; sets: SetRow[]; savedAt: string }[];
}

/** Every session with its sets, oldest first (paged: a set per row adds up). */
export async function loggedSessions(userId: string, opts: { from?: ISODate; to?: ISODate } = {}): Promise<LoggedSession[]> {
  let q = db().from("strength_sessions").select("id, local_date, activity_id").eq("user_id", userId).order("local_date");
  if (opts.from) q = q.gte("local_date", opts.from);
  if (opts.to) q = q.lte("local_date", opts.to);
  const { data: sessions, error } = await q;
  if (error) throw error;
  if (!sessions?.length) return [];
  const sets: { session_id: string; exercise_key: string; position: number; set_no: number; reps: number | null; kg: number | null; seconds: number | null; created_at: string }[] = [];
  // Filtered through the session's date (a join), not a list of ids that grows with every session.
  for (let page = 0; ; page += 1000) {
    let sq = db()
      .from("strength_sets")
      .select("session_id, exercise_key, position, set_no, reps, kg, seconds, created_at, strength_sessions!inner(local_date)")
      .eq("user_id", userId);
    if (opts.from) sq = sq.gte("strength_sessions.local_date", opts.from);
    if (opts.to) sq = sq.lte("strength_sessions.local_date", opts.to);
    const { data, error: e } = await sq.order("id").range(page, page + 999);
    if (e) throw e;
    sets.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return sessions.map((s) => {
    const mine = sets.filter((x) => x.session_id === s.id);
    const keys = [...new Set(mine.map((x) => x.exercise_key))];
    const exercises = keys
      .map((key) => {
        const rows = mine.filter((x) => x.exercise_key === key).sort((a, b) => a.set_no - b.set_no);
        return {
          key,
          position: rows[0]!.position,
          sets: rows.map((r) => ({ setNo: r.set_no, reps: r.reps, kg: r.kg == null ? null : Number(r.kg), seconds: r.seconds })),
          savedAt: rows.map((r) => r.created_at).sort().at(-1)!,
        };
      })
      .sort((a, b) => a.position - b.position);
    return { id: s.id, date: s.local_date, activityId: s.activity_id, exercises };
  });
}

/** Per exercise, its logs oldest first (sessions without it are skipped). */
export function logsByExercise(sessions: readonly LoggedSession[]): Map<string, ExerciseLog[]> {
  const out = new Map<string, ExerciseLog[]>();
  for (const s of sessions) for (const e of s.exercises) out.set(e.key, [...(out.get(e.key) ?? []), { date: s.date, sets: e.sets }]);
  return out;
}

/** Input for strength stamps: each session's top kg per kg exercise. */
export function stampSessions(sessions: readonly LoggedSession[], custom: readonly Exercise[]) {
  return sessions
    .filter((s) => s.exercises.length)
    .map((s) => ({
      date: s.date,
      tops: s.exercises.filter((e) => exerciseByKey(e.key, custom)?.measure === "kg").map((e) => ({ key: e.key, kg: topSet(e.sets, "kg") })),
    }));
}
