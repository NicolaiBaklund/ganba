"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clampRate, localDate } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { currentRow, getProfile } from "@/lib/db/current";

type Result = { ok: true } | { ok: false; error: string };

async function ctx() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  return { supabase, uid: user.id, today: localDate(profile.timezone) };
}

const done = (error?: { message: string } | null): Result => {
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
};

// Every change inserts a new row valid from today, so history stays correct.

export async function updateGoal(raw: { targetWeightKg: number; rateKgPerWeek: number }): Promise<Result> {
  const i = z.object({ targetWeightKg: z.number().min(20).max(400), rateKgPerWeek: z.number().min(-2).max(1) }).safeParse(raw);
  if (!i.success) return { ok: false, error: "invalid_input" };
  const { supabase, uid, today } = await ctx();
  const { data: w } = await supabase
    .from("weight_entries")
    .select("weight_kg")
    .eq("user_id", uid)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = clampRate(i.data.rateKgPerWeek, Number(w?.weight_kg ?? i.data.targetWeightKg));
  const { error } = await supabase
    .from("goals")
    .insert({ user_id: uid, target_weight_kg: i.data.targetWeightKg, rate_kg_per_week: rate, valid_from: today });
  return done(error);
}

export async function updateActivity(raw: {
  stepsPerDay: number;
  runKmPerWeek: number;
  otherTrainingHoursPerWeek: number;
}): Promise<Result> {
  const i = z
    .object({
      stepsPerDay: z.number().int().min(0).max(60000),
      runKmPerWeek: z.number().min(0).max(300),
      otherTrainingHoursPerWeek: z.number().min(0).max(40),
    })
    .safeParse(raw);
  if (!i.success) return { ok: false, error: "invalid_input" };
  const { supabase, uid, today } = await ctx();
  const { error } = await supabase.from("activity_baselines").insert({
    user_id: uid,
    steps_per_day: i.data.stepsPerDay,
    run_km_per_week: i.data.runKmPerWeek,
    other_training_hours_per_week: i.data.otherTrainingHoursPerWeek,
    valid_from: today,
  });
  return done(error);
}

export async function updateMacros(raw: {
  proteinGPerKg: number;
  fatPct: number;
  manualKcalOverride: number | null;
}): Promise<Result> {
  const i = z
    .object({
      proteinGPerKg: z.number().min(0.8).max(3.5),
      fatPct: z.number().min(0.15).max(0.5),
      manualKcalOverride: z.number().min(1000).max(8000).nullable(),
    })
    .safeParse(raw);
  if (!i.success) return { ok: false, error: "invalid_input" };
  const { supabase, uid, today } = await ctx();
  const plan = await currentRow(supabase, "energy_plans", uid, today);
  if (!plan) return { ok: false, error: "no_plan" };
  const { error } = await supabase.from("energy_plans").insert({
    user_id: uid,
    base_expenditure_kcal: plan.base_expenditure_kcal,
    source: i.data.manualKcalOverride != null ? "manual" : plan.source,
    protein_g_per_kg: i.data.proteinGPerKg,
    fat_pct: i.data.fatPct,
    manual_kcal_override: i.data.manualKcalOverride,
    valid_from: today,
  });
  return done(error);
}

export async function updateCheckinWeekday(weekday: number): Promise<Result> {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { ok: false, error: "invalid_input" };
  const { supabase, uid } = await ctx();
  const { error } = await supabase.from("profiles").update({ checkin_weekday: weekday }).eq("user_id", uid);
  return done(error);
}
