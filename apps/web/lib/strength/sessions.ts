import "server-only";
import { exerciseByKey, type ISODate, type Measure, type MuscleGroup, type SetRow } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { todayFor } from "@/lib/training/service";
import { refreshStamps } from "@/lib/health/stamps";
import { userExercises } from "./history";
import { linkStrength } from "./link";

const db = () => createAdminSupabase();
const STRENGTH_TYPE = "strength_training";

export class StrengthError extends Error {
  constructor(readonly code: "not_found" | "invalid_input") {
    super(code);
  }
}

async function ownSession(userId: string, sessionId: string) {
  const { data } = await db().from("strength_sessions").select("id, local_date, activity_id").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (!data) throw new StrengthError("not_found");
  return data;
}

/** The day's session (one per day), made when there is none. Never for a day after today. */
export async function openSession(userId: string, date: ISODate): Promise<string> {
  if (date > (await todayFor(userId))) throw new StrengthError("invalid_input");
  await db().from("strength_sessions").upsert({ user_id: userId, local_date: date }, { onConflict: "user_id,local_date", ignoreDuplicates: true });
  const { data, error } = await db().from("strength_sessions").select("id").eq("user_id", userId).eq("local_date", date).single();
  if (error) throw error;
  return data.id;
}

/** One exercise's sets (replacing what was saved for it), then the Garmin link (spec §6.3, §7). */
export async function saveExercise(userId: string, sessionId: string, x: { key: string; position: number; sets: SetRow[] }): Promise<void> {
  await ownSession(userId, sessionId);
  const { custom } = await userExercises(userId);
  if (!exerciseByKey(x.key, custom) || !x.sets.length) throw new StrengthError("invalid_input");
  const { error: delErr } = await db().from("strength_sets").delete().eq("session_id", sessionId).eq("exercise_key", x.key);
  if (delErr) throw delErr;
  const { error } = await db()
    .from("strength_sets")
    .insert(x.sets.map((s, i) => ({ user_id: userId, session_id: sessionId, exercise_key: x.key, position: x.position, set_no: i + 1, reps: s.reps, kg: s.kg, seconds: s.seconds })));
  if (error) throw error;
  await linkStrength(userId);
}

export async function removeExercise(userId: string, sessionId: string, key: string): Promise<void> {
  await ownSession(userId, sessionId);
  const { error } = await db().from("strength_sets").delete().eq("session_id", sessionId).eq("exercise_key", key);
  if (error) throw error;
}

/** Done: a session without any saved exercise is removed; otherwise it is finished and stamps are checked. */
export async function finishSession(userId: string, sessionId: string): Promise<"finished" | "removed"> {
  await ownSession(userId, sessionId);
  const { count } = await db().from("strength_sets").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  if (!count) {
    await db().from("strength_sessions").delete().eq("id", sessionId);
    return "removed";
  }
  await db().from("strength_sessions").update({ finished_at: new Date().toISOString() }).eq("id", sessionId);
  try {
    await refreshStamps(userId, await todayFor(userId));
  } catch (e) {
    console.error("stamps after strength failed", userId, e instanceof Error ? e.message : e);
  }
  return "finished";
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await ownSession(userId, sessionId);
  const { error } = await db().from("strength_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

/** A session for a Garmin strength activity that has none yet ("From your watch" in This week). */
export async function sessionForActivity(userId: string, activityId: string): Promise<string> {
  const { data: act } = await db().from("activities").select("id, local_date, type_key").eq("id", activityId).eq("user_id", userId).maybeSingle();
  if (!act || act.type_key !== STRENGTH_TYPE) throw new StrengthError("not_found");
  const id = await openSession(userId, act.local_date);
  await db().from("strength_sessions").update({ activity_id: act.id }).eq("id", id).is("activity_id", null);
  return id;
}

export async function createExercise(userId: string, x: { name: string; group: MuscleGroup; measure: Measure }): Promise<string> {
  const key = `custom-${crypto.randomUUID()}`;
  const { error } = await db().from("user_exercises").insert({ user_id: userId, key, name: x.name.trim(), muscle_group: x.group, measure: x.measure });
  if (error) throw error;
  return key;
}

export async function setFavourite(userId: string, key: string, on: boolean): Promise<void> {
  const { custom } = await userExercises(userId);
  const ex = exerciseByKey(key, custom);
  if (!ex) throw new StrengthError("invalid_input");
  const { error } = await db()
    .from("user_exercises")
    .upsert({ user_id: userId, key, muscle_group: ex.group, measure: ex.measure, favorite: on, ...(ex.equipment == null ? { name: ex.name } : {}) }, { onConflict: "user_id,key" });
  if (error) throw error;
}
