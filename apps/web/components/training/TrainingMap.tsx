"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import type { WeekView } from "@/lib/training/view";
import { WorkoutRow } from "./WorkoutRow";
import { cn } from "@/lib/utils";

const EASY = new Set(["recovery", "taper"]);

/** Plan as a line map: one square stop per week, km bar from a shared start line, chequered finish. */
export function TrainingMap({
  thisWeek,
  upcoming,
  today,
  raceLabel,
  raceDateLabel,
}: {
  thisWeek: WeekView | null;
  upcoming: WeekView[];
  today: string;
  raceLabel: string | null;
  raceDateLabel: string | null;
}) {
  const t = useTranslations("training");
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...[thisWeek, ...upcoming].filter(Boolean).map((w) => w!.plannedKm));
  const bar = (km: number) => `${Math.round((km / max) * 124)}px`;

  // A render function, not a component: a nested component would remount on every toggle and drop focus.
  const stop = (w: WeekView, now = false) => {
    const easy = EASY.has(w.phase);
    const isOpen = now || open === w.monday;
    const panel = `week-${w.monday}`;
    return (
      <Fragment key={w.monday}>
        <button
          type="button"
          disabled={now}
          onClick={() => setOpen(isOpen ? null : w.monday)}
          aria-expanded={isOpen}
          aria-controls={panel}
          className="relative grid min-h-[42px] w-full grid-cols-[30px_1fr_auto] items-center gap-2.5 text-left"
        >
          <span aria-hidden className={cn("absolute bottom-0 left-[11px] top-0 w-2", easy ? "bg-[repeating-linear-gradient(180deg,var(--muted-foreground)_0_5px,transparent_5px_9px)]" : "bg-foreground", now && "top-1/2")} />
          <span aria-hidden className={cn("relative justify-self-center", now ? "size-[26px] bg-primary" : cn("size-[18px] border-4 bg-background", easy ? "border-muted-foreground" : "border-foreground"))} />
          <span className={cn("whitespace-nowrap", now && "text-primary")}>
            <span className="cond text-[21px] leading-none">{now ? t("thisWeek") : t("week", { n: w.week })}</span>
            {!now && w.phase !== "build" && <span className="block text-xs text-muted-foreground">{t(`phase.${w.phase}`)}</span>}
          </span>
          <span className="grid grid-cols-[124px_44px] items-center gap-1.5">
            <span
              className={cn("block h-2.5", now ? "bg-primary" : easy ? "bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_5px)] shadow-[inset_0_0_0_1px_var(--muted-foreground)]" : "bg-foreground")}
              style={{ width: bar(w.plannedKm) }}
            />
            <span className={cn("num text-right text-lg font-extrabold", now && "text-primary")}>{w.plannedKm}</span>
          </span>
        </button>
        {isOpen && (
          <div id={panel} className="relative ml-10 pb-2">
            <span aria-hidden className="absolute -left-[29px] bottom-0 top-0 w-2 bg-foreground" />
            {w.workouts.map((x) => (
              <WorkoutRow key={x.id} w={x} today={today} />
            ))}
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <div className="mt-5">
      {thisWeek && stop(thisWeek, true)}
      {upcoming.map((w) => stop(w))}
      {raceLabel && (
        <div className="relative grid grid-cols-[30px_1fr_auto] items-center gap-2.5 pt-1.5">
          <span aria-hidden className="absolute left-[11px] top-0 h-1/2 w-2 bg-foreground" />
          <span aria-hidden className="relative size-[30px] justify-self-center shadow-[0_0_0_3px_var(--foreground)] [background:conic-gradient(var(--foreground)_25%,var(--background)_0_50%,var(--foreground)_0_75%,var(--background)_0)_0_0/15px_15px]" />
          <span className="cond text-2xl leading-none">
            {t("raceDay")}
            <span className="mt-0.5 block text-xs font-medium text-muted-foreground [font-stretch:100%]">{raceDateLabel}</span>
          </span>
          <span className="num text-[34px] font-black leading-none text-primary [font-stretch:62%]">{raceLabel}</span>
        </div>
      )}
    </div>
  );
}
