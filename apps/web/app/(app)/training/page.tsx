import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, Plus } from "lucide-react";
import { addDays, formatPace, mondayOf } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadTrainingView, type TrainingView } from "@/lib/training/view";
import { hrZoneLabel } from "@/lib/training/format";
import { loadClock } from "@/lib/health/view";
import { RaceRoad } from "@/components/health/RaceRoad";
import { MorningNote } from "@/components/health/MorningNote";
import { ProposalCard } from "@/components/training/ProposalCard";
import { WorkoutRow } from "@/components/training/WorkoutRow";
import { StrengthRow } from "@/components/strength/StrengthRow";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { StatRow } from "@/components/tasuki/StatRow";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Training: the race and the road there, the coach's morning note, this week, the paces, and a way into the whole
 * plan (spec 2026-11-02 §4). The plan itself lives on /training/plan.
 */
export default async function TrainingPage() {
  const t = await getTranslations("training");
  const { user } = await requireUser();
  const v = await loadTrainingView(user.id);
  const clock = await loadClock(user.id, v.today);

  // No Garmin needed: without it the runner logs what was done (spec 2026-10-29).
  if (!v.plan) {
    return (
      <main className="flex flex-col px-[18px] pt-5">
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
        {clock && <RaceRoad clock={clock} today={v.today} />}
        <MorningNote />
        {v.strength.length > 0 && (
          <section className="mt-2">
            <SectionHead title={t("thisWeek")} />
            {thisWeekRows(v).map((r) => r.el)}
          </section>
        )}
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
  const week = v.thisWeek;
  const weekRows = thisWeekRows(v);
  // Rides: the zones the sessions use, in watts with power targets on (no watts mentioned otherwise).
  const KEY_ZONES = ["z2", "ss", "z4", "z5"];
  const zones = !rides
    ? []
    : rides.power
      ? rides.powerZones.filter((z) => KEY_ZONES.includes(z.zone)).map((z) => ({ value: `${z.minW}–${z.maxW}`, label: hrZoneLabel(z.zone) }))
      : rides.zones.filter((z) => KEY_ZONES.includes(z.zone)).map((z) => ({ value: `${z.minBpm}–${z.maxBpm}`, label: hrZoneLabel(z.zone) }));
  const paces = [
    { value: `${formatPace(p.paces.easy.min)}–${formatPace(p.paces.easy.max)}`, label: t("paceZones.easy") },
    { value: formatPace(p.paces.marathon), label: t("paceZones.marathon") },
    { value: formatPace(p.paces.threshold), label: t("paceZones.threshold") },
    { value: formatPace(p.paces.interval), label: t("paceZones.interval") },
  ];

  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      {clock && <RaceRoad clock={clock} today={v.today} />}
      <MorningNote />

      {v.proposals.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {v.proposals.map((pr) => (
            <ProposalCard key={pr.id} p={pr} />
          ))}
        </div>
      )}

      {weekRows.length > 0 && (
        <section className="mt-2">
          <SectionHead title={t("thisWeek")}>
            {week && !ride && t.rich("weekKm", { done: Math.round(week.doneKm), planned: Math.round(week.plannedKm), b: (c) => <b className="text-foreground">{c}</b> })}
          </SectionHead>
          {weekRows.map((r) => r.el)}
        </section>
      )}

      <Link href="/training/plan" className="flex items-center justify-between py-4 text-[15px] font-bold">
        {t("plan")}
        <ChevronRight className="size-5 text-primary" strokeWidth={2.6} />
      </Link>

      <SectionHead title={ride ? (rides?.power ? t("powerZones") : t("zones")) : t("paces")} />
      <div className="mt-2">
        <StatRow items={ride ? zones : paces} ruled={false} />
      </div>
      {!ride && rides && (
        <>
          <SectionHead title={rides.power ? t("ridePowerZones") : t("rideHrZones")} />
          <div className="mt-2">
            <StatRow items={zones} ruled={false} />
          </div>
        </>
      )}
    </main>
  );
}

/** This week's sessions and strength days in date order (strength after a run on the same day). */
function thisWeekRows(v: TrainingView) {
  const monday = mondayOf(v.today), sunday = addDays(monday, 6);
  return [
    ...(v.thisWeek?.workouts ?? []).map((w) => ({ date: w.date, n: 0, el: <WorkoutRow key={w.id} w={w} today={v.today} /> })),
    ...v.strength.filter((s) => s.date >= monday && s.date <= sunday).map((s) => ({ date: s.date, n: 1, el: <StrengthRow key={`s-${s.date}`} s={s} today={v.today} /> })),
  ].sort((a, b) => (a.date === b.date ? a.n - b.n : a.date < b.date ? -1 : 1));
}
