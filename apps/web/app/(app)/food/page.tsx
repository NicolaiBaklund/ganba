import { KCAL_PER_KG } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { getDaySnapshot } from "@/lib/db/today";
import { loadWeekStrip } from "@/lib/db/week";
import { WeekStrip } from "@/components/today/WeekStrip";
import { KcalBlock } from "@/components/today/KcalBlock";
import { DayFoodList } from "@/components/food/DayFoodList";

export default async function FoodPage({ searchParams }: PageProps<"/food">) {
  const { date } = await searchParams;
  const { supabase, user } = await requireUser();
  const snap = await getDaySnapshot(supabase, user.id, typeof date === "string" ? date : undefined);

  const paths = snap.entries.flatMap((e) => e.photos.map((p) => p.storage_path));
  const [signed, week] = await Promise.all([
    paths.length ? supabase.storage.from("food").createSignedUrls(paths, 3600).then((r) => r.data ?? []) : [],
    loadWeekStrip(supabase, user.id, snap.date),
  ]);
  const urls = Object.fromEntries(paths.map((p, i) => [p, signed[i]?.signedUrl ?? null]));
  const activity = snap.activity && !snap.manualTarget && !snap.target.floored ? snap.activity.total : null;
  const goalKcal = Math.round((snap.goal.rateKgPerWeek * KCAL_PER_KG) / 7);

  return (
    <main className="flex flex-col px-[18px] pb-4">
      <WeekStrip days={week} date={snap.date} today={snap.today} basePath="/food" />
      <KcalBlock
        intake={snap.intake}
        target={snap.macrosTarget}
        floored={snap.target.floored}
        activityKcal={activity}
        breakdown={activity != null ? { base: snap.baseKcal, activity, goal: goalKcal } : null}
      />
      <DayFoodList entries={snap.entries} photoUrls={urls} />
    </main>
  );
}
