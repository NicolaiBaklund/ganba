import { getTranslations } from "next-intl/server";
import { localDate, rateLimits } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { currentRow, getProfile } from "@/lib/db/current";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { ApiKeyCard } from "@/components/profile/ApiKeyCard";
import { GarminCard } from "@/components/profile/GarminCard";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { ProfileCards } from "@/components/profile/ProfileCards";

export default async function ProfilePage() {
  const t = await getTranslations("profile");
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  const today = localDate(profile.timezone);

  const [keyStatus, garmin, goal, baseline, plan, lastWeight] = await Promise.all([
    getApiKeyStatus(user.id),
    getGarminStatus(user.id),
    currentRow(supabase, "goals", user.id, today),
    currentRow(supabase, "activity_baselines", user.id, today),
    currentRow(supabase, "energy_plans", user.id, today),
    supabase
      .from("weight_entries")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const kg = Number(lastWeight.data?.weight_kg ?? 70);

  return (
    <main className="flex flex-col gap-4 px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      <GarminCard status={garmin ? { status: garmin.status, lastSyncedAt: garmin.lastSyncedAt } : null} />
      <ApiKeyCard status={keyStatus} />
      <ProfileCards
        v={{
          targetWeightKg: Number(goal?.target_weight_kg ?? kg),
          rateKgPerWeek: Number(goal?.rate_kg_per_week ?? 0),
          maxLoss: rateLimits(kg).maxLossPerWeek,
          stepsPerDay: Number(baseline?.steps_per_day ?? 8000),
          runKmPerWeek: Number(baseline?.run_km_per_week ?? 0),
          otherTrainingHoursPerWeek: Number(baseline?.other_training_hours_per_week ?? 0),
          proteinGPerKg: Number(plan?.protein_g_per_kg ?? 1.8),
          fatPct: Number(plan?.fat_pct ?? 0.25),
          manualKcalOverride: plan?.manual_kcal_override == null ? null : Number(plan.manual_kcal_override),
          checkinWeekday: profile.checkin_weekday,
          email: user.email ?? "",
          garmin: !!garmin,
        }}
      />
    </main>
  );
}
