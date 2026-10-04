import "server-only";
import { addDays, isRun, mondayOf, type ISODate, type WorkoutType } from "@loop/core";
import type { DB } from "./current";

export interface WeekDay {
  date: ISODate;
  logged: boolean;
  sessions: { type: WorkoutType | "other"; state: "done" | "planned" | "missed" }[];
}

/** Mon–Sun around `date`: which days have food logged and which sessions were planned or run. */
export async function loadWeekStrip(supabase: DB, userId: string, date: ISODate): Promise<WeekDay[]> {
  const monday = mondayOf(date);
  const sunday = addDays(monday, 6);
  const [food, planned, acts] = await Promise.all([
    supabase.from("food_entries").select("local_date").eq("user_id", userId).gte("local_date", monday).lte("local_date", sunday),
    supabase
      .from("planned_workouts")
      .select("date, type, status, activity_id, plan:training_plans!inner(status)")
      .eq("user_id", userId)
      .gte("date", monday)
      .lte("date", sunday)
      .neq("status", "removed")
      .eq("plan.status", "active"),
    supabase.from("activities").select("id, local_date, type_key").eq("user_id", userId).gte("local_date", monday).lte("local_date", sunday),
  ]);
  const logged = new Set((food.data ?? []).map((r) => r.local_date));
  const linked = new Set((planned.data ?? []).map((w) => w.activity_id).filter(Boolean));
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const sessions: WeekDay["sessions"] = (planned.data ?? [])
      .filter((w) => w.date === d)
      .map((w) => ({ type: w.type as WorkoutType, state: w.status === "done" ? "done" : w.status === "missed" ? "missed" : "planned" }));
    for (const a of acts.data ?? []) {
      if (a.local_date === d && isRun(a.type_key) && !linked.has(a.id)) sessions.push({ type: "other", state: "done" });
    }
    return { date: d, logged: logged.has(d), sessions };
  });
}
