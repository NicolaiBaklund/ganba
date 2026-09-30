"use server";

import { z } from "zod";
import { ageOn, clampRate, DEFAULT_FAT_PCT, defaultProteinGPerKg, localDate, startEstimate } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";

const Input = z.object({
  sex: z.enum(["male", "female"]),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(20).max(400),
  timezone: z.string().min(1),
  stepsPerDay: z.number().int().min(0).max(60000),
  runKmPerWeek: z.number().min(0).max(300),
  otherTrainingHoursPerWeek: z.number().min(0).max(40),
  targetWeightKg: z.number().min(20).max(400),
  rateKgPerWeek: z.number().min(-2).max(1),
});
export type OnboardingInput = z.infer<typeof Input>;

export async function completeOnboarding(raw: OnboardingInput) {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };
  const i = parsed.data;
  const { supabase, user } = await requireUser({ allowUnonboarded: true });
  const today = localDate(i.timezone);
  const rate = clampRate(i.rateKgPerWeek, i.weightKg);
  const est = startEstimate(
    { sex: i.sex, ageYears: ageOn(i.birthDate, today), heightCm: i.heightCm, weightKg: i.weightKg },
    i,
  );
  const uid = user.id;

  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: uid,
    sex: i.sex,
    birth_date: i.birthDate,
    height_cm: i.heightCm,
    timezone: i.timezone,
  });
  if (profileError) return { ok: false as const, error: profileError.message };

  const results = await Promise.all([
    supabase.from("activity_baselines").insert({
      user_id: uid,
      steps_per_day: i.stepsPerDay,
      run_km_per_week: i.runKmPerWeek,
      other_training_hours_per_week: i.otherTrainingHoursPerWeek,
      valid_from: today,
    }),
    supabase.from("goals").insert({
      user_id: uid,
      target_weight_kg: i.targetWeightKg,
      rate_kg_per_week: rate,
      valid_from: today,
    }),
    supabase.from("energy_plans").insert({
      user_id: uid,
      base_expenditure_kcal: est.baseKcal,
      source: "formula",
      protein_g_per_kg: defaultProteinGPerKg(rate),
      fat_pct: DEFAULT_FAT_PCT,
      valid_from: today,
    }),
    supabase.from("weight_entries").insert({
      user_id: uid,
      measured_at: new Date().toISOString(),
      local_date: today,
      weight_kg: i.weightKg,
    }),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false as const, error: failed.error.message };

  // Mark onboarded last, so a partial failure lets the user retry the wizard.
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", uid);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
