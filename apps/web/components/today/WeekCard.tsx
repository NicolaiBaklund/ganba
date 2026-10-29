import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import type { ISODate, Sport } from "@loop/core";
import type { WeekView } from "@/lib/training/view";

/** How the week is going: distance (or rides) done against planned, sessions done, and a nudge to proposals. */
export async function WeekCard({ week, sport, today, proposals }: { week: WeekView; sport: Sport; today: ISODate; proposals: number }) {
  const t = await getTranslations("today");
  const main = week.workouts.filter((w) => w.sport === sport && w.status !== "removed");
  const done = main.filter((w) => w.status === "done").length;
  const ride = sport === "ride";
  const share = ride ? (main.length ? done / main.length : 0) : week.plannedKm ? Math.min(1, week.doneKm / week.plannedKm) : 0;
  const left = main.filter((w) => w.status === "planned" && w.date >= today).length;

  return (
    <Link href="/training" className="mt-4 block rounded-md bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">{t("weekStrip")}</p>
        <ChevronRight className="size-4 self-center text-muted-foreground" />
      </div>
      <p className="num mt-1 text-[28px] font-extrabold leading-none">
        {ride ? t("ridesDone", { done, total: main.length }) : <>{week.doneKm}<span className="text-base font-bold text-muted-foreground"> / {week.plannedKm} km</span></>}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {ride ? t("sessionsLeft", { n: left }) : t("sessionsDone", { done, total: main.length })}
        {proposals > 0 && <span className="text-primary"> · {t("suggestions", { n: proposals })}</span>}
      </p>
    </Link>
  );
}
