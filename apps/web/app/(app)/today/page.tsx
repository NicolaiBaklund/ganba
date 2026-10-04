import { dailyTarget, KCAL_PER_KG } from "@loop/core";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { getDaySnapshot } from "@/lib/db/today";
import { loadWeekStrip } from "@/lib/db/week";
import { ensureWeeklyCheckin, type CheckinRow } from "@/lib/db/checkin";
import { currentRow, getProfile, toEnergyPlan, type DB } from "@/lib/db/current";
import { nextWorkout, todaysWorkout } from "@/lib/training/view";
import { WeekStrip } from "@/components/today/WeekStrip";
import { TodayBib } from "@/components/today/TodayBib";
import { KcalBlock } from "@/components/today/KcalBlock";
import { MealsList } from "@/components/today/MealsList";
import { WeightRow } from "@/components/today/WeightRow";
import { CheckinCard, type CheckinView } from "@/components/today/CheckinCard";

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { date } = await searchParams;
  const { supabase, user } = await requireUser();
  const snap = await getDaySnapshot(supabase, user.id, typeof date === "string" ? date : undefined);
  const [checkinView, session, week, t] = await Promise.all([
    snap.date === snap.today
      ? ensureWeeklyCheckin(supabase, user.id).then((c) => (c ? toCheckinView(supabase, user.id, c, snap) : null))
      : null,
    snap.garmin ? todaysWorkout(user.id, snap.date) : { plan: false, workout: null },
    loadWeekStrip(supabase, user.id, snap.date),
    getTranslations("today"),
  ]);
  const next = session.plan && !session.workout ? await nextWorkout(user.id, snap.date) : null;
  const activity = snap.activity && !snap.manualTarget && !snap.target.floored ? snap.activity.total : null;
  const goalKcal = Math.round((snap.goal.rateKgPerWeek * KCAL_PER_KG) / 7);

  return (
    <main className="flex flex-col px-[18px] pb-4">
      <WeekStrip days={week} date={snap.date} today={snap.today} basePath="/today" profileLink />
      {snap.garmin?.status === "reauth_required" && (
        <Link href="/profile#garmin" className="mt-4 flex items-center justify-between gap-3 rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <span>{t("garminReauth")}</span>
          <span className="shrink-0 font-semibold text-warning">{t("garminReauthCta")}</span>
        </Link>
      )}
      {session.plan && (
        <div className="mt-4">
          <TodayBib workout={session.workout} kg={snap.latestTrendKg ?? 70} next={next} />
        </div>
      )}
      <KcalBlock
        intake={snap.intake}
        target={snap.macrosTarget}
        floored={snap.target.floored}
        activityKcal={activity}
        breakdown={activity != null ? { base: snap.baseKcal, activity, goal: goalKcal } : null}
      />
      <MealsList entries={snap.entries} date={snap.date} today={snap.today} />
      {checkinView && (
        <div className="mt-6">
          <CheckinCard view={checkinView} />
        </div>
      )}
      <WeightRow trendKg={snap.latestTrendKg} weeklyChangeKg={snap.weeklyChangeKg} goalKg={snap.goal.targetWeightKg} etaDate={snap.forecast.etaDate} />
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
