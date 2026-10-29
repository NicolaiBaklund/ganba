import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, MessageCircle, Plus } from "lucide-react";
import type { ISODate } from "@loop/core";
import type { DB } from "@/lib/db/current";
import { loadWeekStrip } from "@/lib/db/week";
import { loadTrainingView, nextWorkout, todaysWorkout } from "@/lib/training/view";
import { WeekStrip } from "@/components/today/WeekStrip";
import { TodayBib } from "@/components/today/TodayBib";
import { WeekCard } from "@/components/today/WeekCard";
import { ManualDone } from "@/components/training/ManualDone";
import { buttonVariants } from "@/components/ui/button";
import { canLogByHand } from "@/lib/training/format";
import { cn } from "@/lib/utils";

/**
 * Today for Training only: the week, the day's session as a bib, and how the week is going. No food, weight or
 * calories anywhere (spec 2026-10-29 §6).
 */
export async function TrainingToday({ supabase, userId, date }: { supabase: DB; userId: string; date?: string }) {
  const t = await getTranslations("today");
  // Plan upkeep without Garmin (done, missed, proposals) happens while loading the view.
  const v = await loadTrainingView(userId);
  const day: ISODate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : v.today;
  const [week, session] = await Promise.all([loadWeekStrip(supabase, userId, day), todaysWorkout(userId, day)]);
  const next = session.plan && !session.workout ? await nextWorkout(userId, day) : null;
  const w = session.workout;
  const canLog = !!w && canLogByHand(w, v.today, !!v.garmin);

  return (
    <main className="flex flex-col px-[18px] pb-4">
      <WeekStrip days={week} date={day} today={v.today} basePath="/today" profileLink />
      {!v.plan ? (
        <div className="mt-6 rounded-md bg-card p-5">
          <h2 className="cond text-2xl leading-tight">{t("noPlanTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("noPlanText")}</p>
          <Link href="/training/new" className={cn(buttonVariants(), "mt-4 h-12 w-full")}>
            <Plus className="size-4" />
            {t("noPlanCta")}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <TodayBib workout={w} kg={70} next={next} fuel={false} />
            {canLog && <ManualDone key={w!.id} workoutId={w!.id} plannedKm={w!.plannedKm} done={w!.status === "done"} manual={!!w!.manual} />}
          </div>
          {v.thisWeek && <WeekCard week={v.thisWeek} sport={v.plan.sport} today={v.today} proposals={v.proposals.length} />}
          <Link href="/coach" className="mt-3 flex items-center gap-3 rounded-md bg-card px-4 py-3 text-sm">
            <MessageCircle className="size-4 shrink-0 text-primary" />
            <span className="flex-1">{t("askCoach")}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </>
      )}
    </main>
  );
}
