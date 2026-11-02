import "server-only";
import { planPrediction, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { activePlan } from "@/lib/training/service";
import { refreshStamps } from "./stamps";

/**
 * After a sync (or the first page load of the day without Garmin): stamps, and without Garmin today's predicted
 * times from the plan's VDOT, so the clock has a value and a line.
 */
export async function computeHealth(userId: string, today: ISODate): Promise<void> {
  await refreshStamps(userId, today);
  if (await getGarminStatus(userId)) return;
  const plan = await activePlan(userId);
  if (!plan || plan.sport === "ride") return;
  const p = planPrediction(Number(plan.vdot));
  const { error } = await createAdminSupabase()
    .from("prediction_days")
    .upsert(
      { user_id: userId, local_date: today, time_5k_s: p.time5K, time_10k_s: p.time10K, time_half_s: p.timeHalfMarathon, time_marathon_s: p.timeMarathon, source: "plan" },
      { onConflict: "user_id,local_date" },
    );
  if (error) throw error;
}
