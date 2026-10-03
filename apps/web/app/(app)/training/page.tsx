import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronDown, Plus, Watch } from "lucide-react";
import { formatPace } from "@loop/core";
import { requireUser } from "@/lib/supabase/server";
import { loadTrainingView } from "@/lib/training/view";
import { fmtClock } from "@/lib/training/format";
import { WorkoutRow } from "@/components/training/WorkoutRow";
import { ProposalCard } from "@/components/training/ProposalCard";
import { PlanActions } from "@/components/training/PlanActions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function TrainingPage() {
  const t = await getTranslations("training");
  const format = await getFormatter();
  const { user } = await requireUser();
  const v = await loadTrainingView(user.id);

  if (!v.garmin) {
    return (
      <main className="flex flex-col gap-4 px-4 pt-4">
        <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        <section className="flex flex-col items-start gap-3 rounded-3xl bg-card p-6">
          <Watch className="size-8 text-primary" />
          <h2 className="font-heading text-lg font-semibold">{t("garminRequired")}</h2>
          <p className="text-sm text-muted-foreground">{t("garminRequiredHint")}</p>
          <Link href="/profile#garmin" className={cn(buttonVariants(), "mt-2 h-11 rounded-xl px-5")}>
            {t("connect")}
          </Link>
        </section>
      </main>
    );
  }

  if (!v.plan) {
    return (
      <main className="flex flex-col gap-4 px-4 pt-4">
        <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        <section className="flex flex-col items-start gap-3 rounded-3xl bg-gradient-to-br from-primary/25 to-card p-6">
          <h2 className="font-heading text-xl font-bold">{t("noPlan")}</h2>
          <p className="text-sm text-muted-foreground">{t("noPlanHint")}</p>
          <Link href="/training/new" className={cn(buttonVariants(), "mt-2 h-12 rounded-xl px-5")}>
            <Plus className="size-4" />
            {t("create")}
          </Link>
        </section>
      </main>
    );
  }

  const p = v.plan;
  const heading =
    p.goal === "race" && p.distance && p.raceDate
      ? `${t(`distance.${p.distance}`)} · ${format.dateTime(new Date(`${p.raceDate}T00:00:00Z`), { day: "numeric", month: "short" })}`
      : t("build");
  const paces = [
    ["easy", `${formatPace(p.paces.easy.min)}–${formatPace(p.paces.easy.max)}`],
    ["marathon", formatPace(p.paces.marathon)],
    ["threshold", formatPace(p.paces.threshold)],
    ["interval", formatPace(p.paces.interval)],
  ] as const;

  return (
    <main className="flex flex-col gap-4 px-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>

      <section className="rounded-3xl bg-gradient-to-br from-primary/25 via-card to-card p-5">
        <p className="font-heading text-xl font-bold">{heading}</p>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          {p.weeksLeft != null && (
            <div>
              <p className="text-muted-foreground">{t("weeksLeftLabel")}</p>
              <p className="num text-xl font-semibold">{p.weeksLeft}</p>
            </div>
          )}
          {p.predictedTimeS != null && (
            <div>
              <p className="text-muted-foreground">{p.targetTimeS ? t("target") : t("predicted")}</p>
              <p className="num text-xl font-semibold">{fmtClock(p.targetTimeS ?? p.predictedTimeS)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">{t("vdot")}</p>
            <p className="num text-xl font-semibold">{p.vdot}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3 text-xs">
          {paces.map(([zone, pace]) => (
            <div key={zone}>
              <p className="text-muted-foreground">{t(`paceZones.${zone}`)}</p>
              <p className="num font-semibold">{pace}</p>
            </div>
          ))}
        </div>
      </section>

      {v.proposals.map((pr) => (
        <ProposalCard key={pr.id} p={pr} />
      ))}

      {v.thisWeek && (
        <section className="rounded-3xl bg-card p-3">
          <div className="flex items-baseline justify-between px-2 pb-1 pt-2">
            <h2 className="font-heading font-semibold">{t("thisWeek")}</h2>
            <p className="num text-sm text-muted-foreground">
              {v.thisWeek.doneKm} / {v.thisWeek.plannedKm} km
            </p>
          </div>
          {v.thisWeek.workouts.map((w) => (
            <WorkoutRow key={w.id} w={w} today={v.today} />
          ))}
        </section>
      )}

      {v.upcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-heading font-semibold">{t("upcoming")}</h2>
          {v.upcoming.map((w) => (
            <details key={w.monday} className="group rounded-3xl bg-card p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1">
                <span>
                  <span className="font-medium">{t("week", { n: w.week })}</span>{" "}
                  <span className="text-xs text-muted-foreground">· {t(`phase.${w.phase}`)}</span>
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="num">{w.plannedKm} km</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="mt-1">
                {w.workouts.map((x) => (
                  <WorkoutRow key={x.id} w={x} today={v.today} />
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      <PlanActions />
    </main>
  );
}
