"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Check, Watch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMinutes, typeColor } from "@/lib/training/format";
import type { WorkoutListItem } from "@/lib/training/view";

export function WorkoutRow({ w, today }: { w: WorkoutListItem; today: string }) {
  const t = useTranslations("workout");
  const format = useFormatter();
  const isToday = w.date === today;
  return (
    <Link
      href={`/training/workout/${w.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors active:bg-muted",
        isToday && "bg-primary/10 ring-1 ring-primary/40",
        w.status === "missed" && "opacity-50",
      )}
    >
      <div className="w-10 shrink-0 text-center">
        <p className="text-[11px] uppercase text-muted-foreground">{format.dateTime(new Date(`${w.date}T00:00:00Z`), { weekday: "short" })}</p>
        <p className="num text-lg font-semibold leading-tight">{Number(w.date.slice(8))}</p>
      </div>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: typeColor(w.type) }} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{w.title}</p>
        <p className="text-xs text-muted-foreground">
          <span style={{ color: typeColor(w.type) }}>{t(`types.${w.type}`)}</span> · {w.plannedKm} km · {fmtMinutes(w.plannedDurationS)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {w.status === "done" ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <Check className="size-4" />
            {w.actualKm != null && <span className="num">{w.actualKm}</span>}
          </span>
        ) : w.status === "missed" ? (
          <X className="size-4 text-muted-foreground" />
        ) : (
          w.push === "pushed" && <Watch className="size-4 text-muted-foreground" aria-label={t("onWatch")} />
        )}
      </div>
    </Link>
  );
}
