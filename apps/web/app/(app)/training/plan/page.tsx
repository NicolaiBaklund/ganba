import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, Plus } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { loadTrainingView } from "@/lib/training/view";
import { fmtClock } from "@/lib/training/format";
import { PlanSwitch } from "@/components/training/PlanSwitch";
import { CrossDays } from "@/components/training/CrossDays";
import { StrengthDays } from "@/components/training/StrengthDays";
import { EndPlan } from "@/components/training/EndPlan";
import { TrainingMap } from "@/components/training/TrainingMap";
import { StatRow } from "@/components/tasuki/StatRow";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Big bib-style label for the race distance; long names get their km instead. */
const BIG_DISTANCE = { "5k": "5K", "10k": "10K", half: "21.1K", marathon: "42.2K" } as const;

/** The whole plan (opened from Training): the goal, the switches, the week map and ending the plan. */
export default async function PlanPage() {
  const t = await getTranslations("training");
  const format = await getFormatter();
  const { user } = await requireUser();
  const v = await loadTrainingView(user.id);

  // No Garmin needed: without it the runner logs what was done (spec 2026-10-29).
  if (!v.plan) {
    return (
      <main className="flex flex-col px-[18px] pt-5">
        <h1 className="cond text-[34px] leading-none">{t("plan")}</h1>
        <h2 className="cond mt-8 text-2xl leading-tight">{t("noPlan")}</h2>
        <Link href="/training/new" className={cn(buttonVariants(), "mt-4 h-12 self-start px-5")}>
          <Plus className="size-4" />
          {t("create")}
        </Link>
      </main>
    );
  }

  const p = v.plan;
  const ride = p.ride;
  const rides = p.rides;
  const race = p.goal === "race" && (ride ? true : !!p.distance) && p.raceDate;
  const raceDate = race ? new Date(`${p.raceDate}T00:00:00Z`) : null;
  const stats = ride
    ? [
        ...(p.weeksLeft != null ? [{ value: p.weeksLeft, label: t("weeksLeftLabel") }] : []),
        ...(ride.expectedS != null ? [{ value: fmtClock(ride.expectedS), label: t("expected") }] : []),
        rides!.power ? { value: `${rides!.ftp} W`, label: t("ftp") } : { value: rides!.lthr, label: t("lthr") },
      ]
    : [
        ...(p.weeksLeft != null ? [{ value: p.weeksLeft, label: t("weeksLeftLabel") }] : []),
        // The predicted time is Training's race clock; only a target the runner set shows here.
        ...(p.targetTimeS != null ? [{ value: fmtClock(p.targetTimeS), label: t("target") }] : []),
        { value: p.vdot, label: t("vdot") },
      ];
  const bigLabel = ride ? (ride.eventKm != null ? `${Math.round(ride.eventKm)}K` : t("buildShort")) : p.distance ? BIG_DISTANCE[p.distance] : t("buildShort");

  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <Link href="/training" className="-ml-1 flex items-center gap-1 self-start text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        {t("title")}
      </Link>
      <h1 className="cond mt-2 text-[34px] leading-none">{t("plan")}</h1>

      <div className="mb-4 mt-4 flex items-end gap-3">
        <p className="num text-[84px] font-black leading-[.82] [font-stretch:62%]">{bigLabel}</p>
        <p className="pb-1 text-sm leading-tight">
          {raceDate ? (
            <>
              <b className="num block text-lg font-extrabold">{format.dateTime(raceDate, { day: "numeric", month: "long", timeZone: "UTC" })}</b>
              {ride ? t("eventDay") : t("raceDay")}
            </>
          ) : ride ? (
            t("rideBuild")
          ) : (
            t("build")
          )}
        </p>
      </div>
      <StatRow items={stats} />
      {rides && (
        <div className="mt-5">
          <PlanSwitch field="indoor" on={rides.indoor} label={t("indoor")} hint={t("indoorHint")} />
          {rides.ftp != null && <PlanSwitch field="power" on={rides.power} label={t("power")} hint={t("powerHint", { ftp: rides.ftp })} />}
        </div>
      )}
      <CrossDays sport={p.sport} weekdays={p.weekdays} cross={p.crossWeekdays} />
      <StrengthDays days={p.strengthWeekdays} />

      <TrainingMap
        thisWeek={v.thisWeek}
        upcoming={v.upcoming}
        today={v.today}
        raceLabel={race ? bigLabel : null}
        hours={!!ride}
        strength={v.strength}
        raceDateLabel={raceDate ? format.dateTime(raceDate, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : null}
      />

      <EndPlan />
    </main>
  );
}
