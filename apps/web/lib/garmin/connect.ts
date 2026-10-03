import "server-only";
import { after } from "next/server";
import { localDate, trendAt, trendSeries, walkingAddonKcal } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { currentRow, toActivityBaseline, type DB } from "@/lib/db/current";
import { afterGarminSync } from "@/lib/training/service";
import { saveTokens } from "./accounts";
import { syncGarmin } from "./sync";

/**
 * First Garmin connection: from today the base expenditure is passive only, because daily
 * walking now comes from the watch. Removes the onboarding walking add-on once (never on reconnect).
 */
export async function makeBasePassive(userId: string): Promise<void> {
  const db = createAdminSupabase();
  const { data: done } = await db.from("energy_plans").select("id").eq("user_id", userId).eq("source", "garmin_connect").limit(1);
  if (done?.length) return;

  const { data: profile } = await db.from("profiles").select("timezone").eq("user_id", userId).single();
  const today = localDate(profile?.timezone ?? "UTC");
  const [plan, baseline, weights] = await Promise.all([
    currentRow(db as DB, "energy_plans", userId, today),
    currentRow(db as DB, "activity_baselines", userId, today),
    db.from("weight_entries").select("local_date, measured_at, weight_kg").eq("user_id", userId).order("local_date"),
  ]);
  if (!plan || !baseline) return;
  const points = (weights.data ?? []).map((w) => ({ localDate: w.local_date, measuredAt: w.measured_at, weightKg: Number(w.weight_kg) }));
  const kg = trendAt(trendSeries(points), today) ?? points.at(-1)?.weightKg ?? 70;
  const walking = walkingAddonKcal(toActivityBaseline(baseline), kg);

  await db.from("energy_plans").insert({
    user_id: userId,
    base_expenditure_kcal: Math.round(Number(plan.base_expenditure_kcal) - walking),
    source: "garmin_connect",
    protein_g_per_kg: plan.protein_g_per_kg,
    fat_pct: plan.fat_pct,
    manual_kcal_override: plan.manual_kcal_override,
    valid_from: today,
  });
}

/** Finishes a successful login: store tokens, make the base passive (first time), import history in the background. */
export async function completeConnection(userId: string, tokens: string) {
  const isNew = await saveTokens(userId, tokens);
  if (isNew) await makeBasePassive(userId);
  after(() => syncGarmin(userId, { afterSync: afterGarminSync }));
}

