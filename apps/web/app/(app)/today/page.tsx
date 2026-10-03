import { dailyTarget } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { getDaySnapshot } from "@/lib/db/today";
import { ensureWeeklyCheckin, type CheckinRow } from "@/lib/db/checkin";
import { currentRow, getProfile, toEnergyPlan, type DB } from "@/lib/db/current";
import { DateNav } from "@/components/today/DateNav";
import { KcalCard } from "@/components/today/KcalCard";
import { MealsList } from "@/components/today/MealsList";
import { WeightCard } from "@/components/today/WeightCard";
import { CheckinCard, type CheckinView } from "@/components/today/CheckinCard";

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { date } = await searchParams;
  const { supabase, user } = await requireUser();
  const snap = await getDaySnapshot(supabase, user.id, typeof date === "string" ? date : undefined);
  const checkin = snap.date === snap.today ? await ensureWeeklyCheckin(supabase, user.id) : null;
  const checkinView = checkin ? await toCheckinView(supabase, user.id, checkin, snap) : null;

  return (
    <main className="flex flex-col gap-3 px-4">
      <DateNav date={snap.date} today={snap.today} basePath="/today" />
      {checkinView && <CheckinCard view={checkinView} />}
      <KcalCard intake={snap.intake} target={snap.macrosTarget} floored={snap.target.floored} />
      <MealsList entries={snap.entries} date={snap.date} />
      <WeightCard
        trendKg={snap.latestTrendKg}
        weeklyChangeKg={snap.weeklyChangeKg}
        goalKg={snap.goal.targetWeightKg}
        trend={snap.trend}
      />
    </main>
  );
}

async function toCheckinView(
  supabase: DB,
  userId: string,
  c: CheckinRow,
  snap: Awaited<ReturnType<typeof getDaySnapshot>>,
): Promise<CheckinView | null> {
  if (c.status === "insufficient_data") return { id: c.id, status: "insufficient_data", reason: c.reason ?? "too_early" };
  if (c.status !== "pending" || c.proposed_base_kcal == null) return null;

  const [profile, plan] = await Promise.all([
    getProfile(supabase, userId),
    currentRow(supabase, "energy_plans", userId, snap.today),
  ]);
  if (!plan) return null;
  const training = snap.trainingKcal;
  const newTarget = dailyTarget({
    plan: { ...toEnergyPlan(plan), baseExpenditureKcal: Number(c.proposed_base_kcal), manualKcalOverride: null },
    trainingKcal: training,
    rateKgPerWeek: snap.goal.rateKgPerWeek,
    sex: profile.sex,
  }).kcal;
  const days = c.window_start && c.window_end ? Math.max(1, (Date.parse(c.window_end) - Date.parse(c.window_start)) / 86_400_000) : 20;
  return {
    id: c.id,
    status: "pending",
    kgPerWeek: Math.round((Number(c.trend_change_kg ?? 0) / days) * 7 * 10) / 10,
    goalRate: snap.goal.rateKgPerWeek,
    expenditure: Number(c.computed_base_kcal ?? 0) + Number(c.avg_training_kcal ?? 0),
    newTarget,
    delta: newTarget - snap.target.kcal,
    loggedDays: c.logged_days ?? 0,
  };
}
