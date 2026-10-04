"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Sash } from "@/components/tasuki/Sash";
import { cn } from "@/lib/utils";
import type { WorkoutListItem } from "@/lib/training/view";

export function WorkoutRow({ w, today }: { w: WorkoutListItem; today: string }) {
  const t = useTranslations("workout");
  const format = useFormatter();
  // Tall row stripes stay solid; stripes for "planned" are for the small week-strip marks.
  const state = w.status === "missed" ? "missed" : "done";
  const sub =
    w.status === "done" && w.actualKm != null
      ? t("doneKm", { km: w.actualKm })
      : w.status === "missed"
        ? t("missed")
        : w.push === "pushed"
          ? t("onWatch")
          : null;
  return (
    <Link
      href={`/training/workout/${w.id}`}
      className={cn("grid grid-cols-[42px_6px_1fr_auto] items-center gap-2.5 border-b border-border py-2.5 active:bg-muted/60", w.status === "missed" && "opacity-60")}
    >
      <span className="text-[11px] leading-tight text-muted-foreground">
        {format.dateTime(new Date(`${w.date}T00:00:00Z`), { weekday: "short", timeZone: "UTC" })}
        <b className={cn("num block text-lg font-extrabold", w.date === today ? "text-primary" : "text-foreground")}>{Number(w.date.slice(8))}</b>
      </span>
      <Sash type={w.type} state={state} className="h-[30px] w-1.5" />
      <span className="min-w-0">
        <span className="block truncate font-bold">{w.title}</span>
        {sub && <span className={cn("block text-xs", w.status === "done" ? "text-success" : "text-muted-foreground")}>{sub}</span>}
      </span>
      <span className="num font-extrabold">{w.plannedKm}</span>
    </Link>
  );
}
