import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { formatPace } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadTrainingView } from "@/lib/training/view";
import { fmtClock } from "@/lib/training/format";
import { ProposalCard } from "@/components/training/ProposalCard";
import { AdjustPlanButton } from "@/components/training/AdjustPlanButton";
import { TrainingMap } from "@/components/training/TrainingMap";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { StatRow } from "@/components/tasuki/StatRow";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Big bib-style label for the race distance; long names get their km instead. */
const BIG_DISTANCE = { "5k": "5K", "10k": "10K", half: "21.1K", marathon: "42.2K" } as const;

export default async function TrainingPage() {
  const t = await getTranslations("training");
  const format = await getFormatter();
  const { user } = await requireUser();
  const v = await loadTrainingView(user.id);

  if (!v.garmin || !v.plan) {
    const garmin = !!v.garmin;
    return (
      <main className="flex flex-col px-[18px] pt-5">
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
        <h2 className="cond mt-8 text-2xl leading-tight">{garmin ? t("noPlan") : t("garminRequired")}</h2>
        <Link href={garmin ? "/training/new" : "/profile#garmin"} className={cn(buttonVariants(), "mt-4 h-12 self-start px-5")}>
          {garmin && <Plus className="size-4" />}
          {garmin ? t("create") : t("connect")}
        </Link>
      </main>
    );
  }

  const p = v.plan;
  const race = p.goal === "race" && p.distance && p.raceDate;
  const raceDate = race ? new Date(`${p.raceDate}T00:00:00Z`) : null;
  const stats = [
    ...(p.weeksLeft != null ? [{ value: p.weeksLeft, label: t("weeksLeftLabel") }] : []),
    ...(p.predictedTimeS != null ? [{ value: fmtClock(p.targetTimeS ?? p.predictedTimeS), label: p.targetTimeS ? t("target") : t("predicted") }] : []),
    { value: p.vdot, label: t("vdot") },
  ];
  const paces = [
    { value: `${formatPace(p.paces.easy.min)}–${formatPace(p.paces.easy.max)}`, label: t("paceZones.easy") },
    { value: formatPace(p.paces.marathon), label: t("paceZones.marathon") },
    { value: formatPace(p.paces.threshold), label: t("paceZones.threshold") },
    { value: formatPace(p.paces.interval), label: t("paceZones.interval") },
  ];

  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
        <AdjustPlanButton />
      </div>

      <div className="mb-4 mt-4 flex items-end gap-3">
        <p className="num text-[84px] font-black leading-[.82] [font-stretch:62%]">{race ? BIG_DISTANCE[p.distance!] : t("buildShort")}</p>
        <p className="pb-1 text-sm leading-tight">
          {raceDate ? (
            <>
              <b className="num block text-lg font-extrabold">{format.dateTime(raceDate, { day: "numeric", month: "long", timeZone: "UTC" })}</b>
              {t("raceDay")}
            </>
          ) : (
            t("build")
          )}
        </p>
      </div>
      <StatRow items={stats} />

      {v.proposals.length > 0 && (
        <div className="mt-5 flex flex-col gap-3">
          {v.proposals.map((pr) => (
            <ProposalCard key={pr.id} p={pr} />
          ))}
        </div>
      )}

      <TrainingMap
        thisWeek={v.thisWeek}
        upcoming={v.upcoming}
        today={v.today}
        raceLabel={race ? BIG_DISTANCE[p.distance!] : null}
        raceDateLabel={raceDate ? format.dateTime(raceDate, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : null}
      />

      <SectionHead title={t("paces")} />
      <div className="mt-2">
        <StatRow items={paces} ruled={false} />
      </div>
    </main>
  );
}
