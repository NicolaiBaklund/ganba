import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, ChevronRight, Moon, UtensilsCrossed, Watch } from "lucide-react";
import { fuelingFor } from "@loop/core";
import { fmtMinutes, typeColor } from "@/lib/training/format";
import type { WorkoutListItem } from "@/lib/training/view";

/** Today's planned session (or rest day). Only shown when a plan is active. */
export async function WorkoutCard({ workout, kg }: { workout: WorkoutListItem | null; kg: number }) {
  const t = await getTranslations("workout");
  const tf = await getTranslations("fuel");
  if (!workout) {
    return (
      <section className="flex items-center gap-3 rounded-3xl bg-card p-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Moon className="size-5" />
        </span>
        <div>
          <p className="font-medium">{t("rest")}</p>
          <p className="text-xs text-muted-foreground">{t("restHint")}</p>
        </div>
      </section>
    );
  }
  const color = typeColor(workout.type);
  const fuel = fuelingFor({ type: workout.type, plannedDurationS: workout.plannedDurationS }, kg);
  const fuelLine = fuel.before.carbsG
    ? tf("lineCarbs", { g: fuel.before.carbsG, p: fuel.after.proteinG })
    : tf("lineMeal", { p: fuel.after.proteinG });
  return (
    <Link
      href={`/training/workout/${workout.id}`}
      className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-card p-4 transition-colors active:bg-muted"
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <div className="min-w-0 flex-1 pl-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          {t("today")} · {t(`types.${workout.type}`)}
        </p>
        <p className="mt-0.5 truncate font-heading text-lg font-semibold">{workout.title}</p>
        <p className="num text-sm text-muted-foreground">
          {workout.status === "done" && workout.actualKm != null ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <Check className="size-4" />
              {workout.actualKm} km
            </span>
          ) : (
            <>
              {workout.plannedKm} km · {fmtMinutes(workout.plannedDurationS)}
            </>
          )}
        </p>
        {workout.status === "planned" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UtensilsCrossed className="size-3.5 shrink-0" />
            <span className="num truncate">{fuelLine}</span>
          </p>
        )}
      </div>
      {workout.status === "planned" && workout.push === "pushed" && <Watch className="size-4 text-muted-foreground" aria-label={t("onWatch")} />}
      <ChevronRight className="size-5 text-muted-foreground" />
    </Link>
  );
}
