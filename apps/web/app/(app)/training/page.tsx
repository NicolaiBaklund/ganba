import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { formatPace } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadTrainingView } from "@/lib/training/view";
import { fmtClock, hrZoneLabel } from "@/lib/training/format";
import { PlanSwitch } from "@/components/training/PlanSwitch";
import { CrossDays } from "@/components/training/CrossDays";
import { EndPlan } from "@/components/training/EndPlan";
import { ProposalCard } from "@/components/training/ProposalCard";
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
        ...(p.predictedTimeS != null ? [{ value: fmtClock(p.targetTimeS ?? p.predictedTimeS), label: p.targetTimeS ? t("target") : t("predicted") }] : []),
        { value: p.vdot, label: t("vdot") },
      ];
  // Rides: the zones the sessions use, in watts with power targets on (no watts mentioned otherwise).
  const KEY_ZONES = ["z2", "ss", "z4", "z5"];
  const zones = !rides
    ? []
    : rides.power
      ? rides.powerZones.filter((z) => KEY_ZONES.includes(z.zone)).map((z) => ({ value: `${z.minW}–${z.maxW}`, label: hrZoneLabel(z.zone) }))
      : rides.zones.filter((z) => KEY_ZONES.includes(z.zone)).map((z) => ({ value: `${z.minBpm}–${z.maxBpm}`, label: hrZoneLabel(z.zone) }));
  const zonesTitle = rides?.power ? t("powerZones") : t("zones");
  const crossZonesTitle = rides?.power ? t("ridePowerZones") : t("rideHrZones");
  const bigLabel = ride ? (ride.eventKm != null ? `${Math.round(ride.eventKm)}K` : t("buildShort")) : p.distance ? BIG_DISTANCE[p.distance] : t("buildShort");
  const paces = [
    { value: `${formatPace(p.paces.easy.min)}–${formatPace(p.paces.easy.max)}`, label: t("paceZones.easy") },
    { value: formatPace(p.paces.marathon), label: t("paceZones.marathon") },
    { value: formatPace(p.paces.threshold), label: t("paceZones.threshold") },
    { value: formatPace(p.paces.interval), label: t("paceZones.interval") },
  ];

  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>

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
        raceLabel={race ? bigLabel : null}
        hours={!!ride}
        raceDateLabel={raceDate ? format.dateTime(raceDate, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : null}
      />

      <SectionHead title={ride ? zonesTitle : t("paces")} />
      <div className="mt-2">
        <StatRow items={ride ? zones : paces} ruled={false} />
      </div>
      {!ride && rides && (
        <>
          <SectionHead title={crossZonesTitle} />
          <div className="mt-2">
            <StatRow items={zones} ruled={false} />
          </div>
        </>
      )}
      <EndPlan />
    </main>
  );
}
