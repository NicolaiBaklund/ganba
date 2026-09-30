import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnergyPlan, ActivityBaseline, ISODate } from "@loop/core";
import type { Database } from "./types";

export type DB = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];
type Versioned = "goals" | "energy_plans" | "activity_baselines";

export async function getProfile(supabase: DB, userId: string) {
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
  if (error) throw error;
  return data;
}

/** Latest row with valid_from <= date. */
export async function currentRow<T extends Versioned>(
  supabase: DB,
  table: T,
  userId: string,
  date: ISODate,
): Promise<Tables[T]["Row"] | null> {
  // Generic table name defeats supabase-js column inference; result is re-typed below.
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .lte("valid_from", date)
    .order("valid_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Tables[T]["Row"] | null;
}

/** Row for a date; for dates before the first row (e.g. browsing back past onboarding) the earliest row. */
export async function rowForDate<T extends Versioned>(
  supabase: DB,
  table: T,
  userId: string,
  date: ISODate,
): Promise<Tables[T]["Row"] | null> {
  const row = await currentRow(supabase, table, userId, date);
  if (row) return row;
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .order("valid_from", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Tables[T]["Row"] | null;
}

export const toEnergyPlan = (r: Tables["energy_plans"]["Row"]): EnergyPlan => ({
  baseExpenditureKcal: Number(r.base_expenditure_kcal),
  proteinGPerKg: Number(r.protein_g_per_kg),
  fatPct: Number(r.fat_pct),
  manualKcalOverride: r.manual_kcal_override == null ? null : Number(r.manual_kcal_override),
});

export const toActivityBaseline = (r: Tables["activity_baselines"]["Row"]): ActivityBaseline => ({
  stepsPerDay: Number(r.steps_per_day),
  runKmPerWeek: Number(r.run_km_per_week),
  otherTrainingHoursPerWeek: Number(r.other_training_hours_per_week),
});
