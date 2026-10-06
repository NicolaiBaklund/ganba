import "server-only";
import type { ISODate, WorkoutType } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { todaysWorkout } from "@/lib/training/view";

/** Today's session as Form talks about it: still to do, or already done. */
export interface FormSession {
  /** The planned workout, when there is one (the coach needs it). */
  id: string | null;
  /** Null for an activity outside the plan. */
  type: WorkoutType | null;
  title: string;
  status: "planned" | "done";
}

/**
 * The one rule for "today's session" (spec §5): the active plan's session for today (planned or done), else any
 * activity already recorded today, so a run outside the plan, or without a plan at all, never reads as a rest day.
 */
export async function formSession(userId: string, today: ISODate): Promise<FormSession | null> {
  const { workout: w } = await todaysWorkout(userId, today);
  if (w && (w.status === "planned" || w.status === "done")) return { id: w.id, type: w.type, title: w.title, status: w.status };
  const { data } = await createAdminSupabase().from("activities").select("name, type_key").eq("user_id", userId).eq("local_date", today).order("start_time", { ascending: false }).limit(1);
  const a = data?.[0];
  return a ? { id: null, type: null, title: a.name ?? a.type_key, status: "done" } : null;
}
