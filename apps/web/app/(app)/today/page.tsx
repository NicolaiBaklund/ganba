import { requireUser } from "@/lib/supabase/server";
import { getDaySnapshot } from "@/lib/db/today";
import { DateNav } from "@/components/today/DateNav";
import { KcalCard } from "@/components/today/KcalCard";
import { MealsList } from "@/components/today/MealsList";
import { WeightCard } from "@/components/today/WeightCard";

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { date } = await searchParams;
  const { supabase, user } = await requireUser();
  const snap = await getDaySnapshot(supabase, user.id, typeof date === "string" ? date : undefined);

  return (
    <main className="flex flex-col gap-3 px-4">
      <DateNav date={snap.date} today={snap.today} basePath="/today" />
      {/* Weekly check-in card slot (Task 16) */}
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
